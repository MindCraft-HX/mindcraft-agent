'use strict';

/**
 * Composable for git workspace changes — fetch, diff, and state management.
 *
 * Responsibilities:
 *   - Fetch workspace changes list via IPC
 *   - Load per-file diff on demand with dedup + request guards
 *   - Clear stale state on CWD change
 *
 * Ownership:
 *   - agentCommon/composables/useGitWorkspaceChanges.js
 *   - No provider dependency. Pure composable.
 */

import { ref, shallowRef } from 'vue';

/**
 * @param {Object} onError — optional callback for non-fatal errors
 * @returns {Object} state + actions
 */
export function useGitWorkspaceChanges(onError) {
  // ── State ──

  const loading = ref(false);
  const isGitRepo = ref(true);
  const repoRoot = ref('');
  const branch = ref('');
  const entries = ref([]);
  const summary = ref({ staged: 0, unstaged: 0, untracked: 0, totalFiles: 0 });
  const errorCode = ref('');

  // Diff state: entryId → diff data
  const diffCache = shallowRef({});
  const diffLoading = shallowRef({});
  const diffErrors = shallowRef({});
  const expandedEntryId = ref('');

  // ── Request guards ──

  let listRequestId = 0;
  let diffGeneration = 0;  // increments on refresh, stale diff responses discarded

  /** Dedup in-flight diff requests: identity → { promise, generation } */
  const inflightDiffs = new Map();

  // ── Actions ──

  /**
   * Refresh workspace changes list.
   *
   * @param {string} cwd
   */
  async function refresh(cwd) {
    if (!cwd || typeof cwd !== 'string') {
      isGitRepo.value = false;
      repoRoot.value = '';
      branch.value = '';
      entries.value = [];
      summary.value = { staged: 0, unstaged: 0, untracked: 0, totalFiles: 0 };
      errorCode.value = 'NO_CWD';
      loading.value = false;
      return;
    }

    const reqId = ++listRequestId;
    ++diffGeneration;  // invalidate in-flight diff requests from previous snapshot
    loading.value = true;
    errorCode.value = '';
    expandedEntryId.value = '';
    diffCache.value = {};
    diffLoading.value = {};
    diffErrors.value = {};

    try {
      const api = window.electronAPI;
      if (!api || !api.gitGetWorkspaceChanges) {
        if (onError) onError('gitGetWorkspaceChanges not available');
        errorCode.value = 'GIT_COMMAND_FAILED';
        loading.value = false;
        return;
      }

      const result = await api.gitGetWorkspaceChanges(cwd);

      // Stale request guard
      if (reqId !== listRequestId) return;

      isGitRepo.value = result.isGitRepo;
      repoRoot.value = result.repoRoot;
      branch.value = result.branch;
      entries.value = result.entries || [];
      summary.value = result.summary || { staged: 0, unstaged: 0, untracked: 0, totalFiles: 0 };
      errorCode.value = result.errorCode || '';

      if (!result.isGitRepo && !result.errorCode) {
        errorCode.value = 'NOT_GIT_REPO';
      }
    } catch (err) {
      if (reqId !== listRequestId) return;

      isGitRepo.value = false;
      errorCode.value = 'GIT_COMMAND_FAILED';
      entries.value = [];
      summary.value = { staged: 0, unstaged: 0, untracked: 0, totalFiles: 0 };

      if (onError) onError(err);
    } finally {
      if (reqId === listRequestId) {
        loading.value = false;
      }
    }
  }

  /**
   * Load diff for a file entry.
   *
   * @param {Object} entry — from entries array
   * @param {string} cwd
   */
  async function loadFileDiff(entry, cwd) {
    if (!entry || !cwd) return;

    const identity = `${repoRoot.value}\0${entry.changeKind}\0${entry.relativePath}`;

    // Already loaded successfully
    if (diffCache.value[identity]) {
      expandedEntryId.value = entry.id;
      return;
    }

    // Dedup in-flight
    if (inflightDiffs.has(identity)) {
      try {
        await inflightDiffs.get(identity).promise;
        expandedEntryId.value = entry.id;
      } catch (_) {}
      return;
    }

    // Start loading
    diffLoading.value = { ...diffLoading.value, [identity]: true };
    expandedEntryId.value = entry.id;

    const gen = diffGeneration;

    const promise = (async () => {
      try {
        const api = window.electronAPI;
        if (!api || !api.gitGetFileDiff) {
          throw new Error('gitGetFileDiff not available');
        }

        const result = await api.gitGetFileDiff(cwd, entry.relativePath, entry.changeKind);

        // Stale guard: discard result if generation changed (refresh happened)
        if (gen !== diffGeneration) return;

        if (result.errorCode) {
          // Don't cache error results — allows retry on next toggle
          diffErrors.value = { ...diffErrors.value, [identity]: result.errorCode };
        } else {
          diffCache.value = { ...diffCache.value, [identity]: result };
          // Clear any previous error for this entry
          if (diffErrors.value[identity]) {
            const next = { ...diffErrors.value };
            delete next[identity];
            diffErrors.value = next;
          }
        }
      } catch (err) {
        if (gen !== diffGeneration) return;
        diffErrors.value = { ...diffErrors.value, [identity]: 'GIT_COMMAND_FAILED' };
        if (onError) onError(err);
      } finally {
        diffLoading.value = { ...diffLoading.value, [identity]: false };
        inflightDiffs.delete(identity);
      }
    })();

    inflightDiffs.set(identity, { promise, generation: gen });

    // Timeout cleanup: don't let hung requests block retry forever
    setTimeout(() => {
      const entry = inflightDiffs.get(identity);
      if (entry && entry.generation === gen) {
        inflightDiffs.delete(identity);
      }
    }, 30000);
  }

  /**
   * Toggle file diff expansion.
   *
   * @param {Object} entry
   * @param {string} cwd
   */
  function toggleEntry(entry, cwd) {
    if (!entry) return;

    if (expandedEntryId.value === entry.id) {
      expandedEntryId.value = '';
    } else {
      loadFileDiff(entry, cwd);
    }
  }

  /**
   * Get diff data for an entry.
   *
   * @param {Object} entry
   * @returns {Object|null}
   */
  function getDiff(entry) {
    if (!entry) return null;
    const identity = `${repoRoot.value}\0${entry.changeKind}\0${entry.relativePath}`;
    return diffCache.value[identity] || null;
  }

  /**
   * Check if diff is loading for an entry.
   *
   * @param {Object} entry
   * @returns {boolean}
   */
  function isDiffLoading(entry) {
    if (!entry) return false;
    const identity = `${repoRoot.value}\0${entry.changeKind}\0${entry.relativePath}`;
    return !!diffLoading.value[identity];
  }

  /**
   * Check if diff error for an entry.
   *
   * @param {Object} entry
   * @returns {boolean}
   */
  function isDiffError(entry) {
    if (!entry) return false;
    const identity = `${repoRoot.value}\0${entry.changeKind}\0${entry.relativePath}`;
    return !!diffErrors.value[identity];
  }

  /**
   * Clear all state.
   */
  function clear() {
    loading.value = false;
    isGitRepo.value = true;
    repoRoot.value = '';
    branch.value = '';
    entries.value = [];
    summary.value = { staged: 0, unstaged: 0, untracked: 0, totalFiles: 0 };
    errorCode.value = '';
    diffCache.value = {};
    diffLoading.value = {};
    diffErrors.value = {};
    expandedEntryId.value = '';
    listRequestId++;
    ++diffGeneration;
    inflightDiffs.clear();
  }

  /**
   * Compute grouped entries for display.
   */
  function getGroupedEntries() {
    const grouped = {
      staged: [],
      unstaged: [],
      untracked: [],
    };

    for (const entry of entries.value) {
      if (entry.changeKind === 'staged') grouped.staged.push(entry);
      else if (entry.changeKind === 'unstaged') grouped.unstaged.push(entry);
      else if (entry.changeKind === 'untracked') grouped.untracked.push(entry);
    }

    return grouped;
  }

  return {
    // State
    loading,
    isGitRepo,
    repoRoot,
    branch,
    entries,
    summary,
    errorCode,
    expandedEntryId,
    // Actions
    refresh,
    loadFileDiff,
    toggleEntry,
    getDiff,
    isDiffLoading,
    isDiffError,
    clear,
    getGroupedEntries,
  };
}
