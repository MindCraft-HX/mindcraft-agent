'use strict';

const { CORE_CHANNELS } = require('../packages/agent/shared/ipcChannels');

/**
 * Window drag/rezise performance optimization.
 *
 * During drag/resize, notifies the renderer to pause CSS animations
 * and reduces frame rate to lower GPU contention with the OS compositor.
 *
 * Extracted from electron/main.js (Phase 7 main.js split).
 */

function setupDragOptimization(win) {
  let dragTimer = null;
  let dragSafetyTimer = null;
  let isDragging = false;
  const DRAG_END_DELAY = 150;    // 150ms of no movement → drag ended
  const DRAG_MAX_DURATION = 3000; // safety net: force-reset after 3s

  function buildWindowPerformanceState(active) {
    return active
      ? {
          active: true,
          reason: 'drag',
          frameRate: 30,
          effectsReduced: true,
          since: Date.now(),
        }
      : {
          active: false,
          reason: '',
          frameRate: 60,
          effectsReduced: false,
          since: 0,
        };
  }

  function setDragState(state) {
    if (isDragging === state) return;
    isDragging = state;
    clearTimeout(dragSafetyTimer);
    if (win && !win.isDestroyed()) {
      win.webContents.setFrameRate(state ? 30 : 60);
      win.webContents.send(CORE_CHANNELS.WINDOW_PERFORMANCE_STATE, buildWindowPerformanceState(state));
    }
    if (state) {
      dragSafetyTimer = setTimeout(() => setDragState(false), DRAG_MAX_DURATION);
    }
  }

  function clearDragState() {
    clearTimeout(dragTimer);
    clearTimeout(dragSafetyTimer);
    dragTimer = null;
    dragSafetyTimer = null;
    setDragState(false);
  }

  win.on('move', () => {
    if (!isDragging) setDragState(true);
    clearTimeout(dragTimer);
    dragTimer = setTimeout(() => setDragState(false), DRAG_END_DELAY);
  });

  // resize treated as drag (edge-drag resize causes similar stutter)
  win.on('resize', () => {
    if (!isDragging) setDragState(true);
    clearTimeout(dragTimer);
    dragTimer = setTimeout(() => setDragState(false), DRAG_END_DELAY);
  });

  win.on('blur', clearDragState);
  win.on('unresponsive', clearDragState);

  return { clearDragState };
}

module.exports = { setupDragOptimization };
