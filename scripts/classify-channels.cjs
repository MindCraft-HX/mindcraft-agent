'use strict';

const baseline = require('../tests/ipc-channel-baseline.json');
const registry = require('../packages/agent/shared/ipcChannels');

const regSet = new Set([
  ...Object.values(registry.CLAUDE_CHANNELS),
  ...Object.values(registry.CODEX_CHANNELS),
  ...Object.values(registry.CORE_CHANNELS),
]);

const unreg = baseline.filter(ch => !regSet.has(ch));

const groups = {
  '1-provider-claude': [],
  '2-provider-codex': [],
  '3-streaming': [],
  '4-settings': [],
  '5-session': [],
  '6-doc-search-window': [],
  '7-plugin-skills': [],
  '8-system-crosscut': [],
};

for (const ch of unreg) {
  if (ch.startsWith('claude-stream-') || ch.startsWith('codex-stream-')) {
    groups['3-streaming'].push(ch);
  } else if (
    ch.match(/^claude-(agent-|ask-|permission-|plan-|chat$|chat-continue|check-|install-|validate-|browse-|list-files|list-slash|select-|write-clipboard|get-file-stat|get-executable|set-executable|get-language|set-language|get-last|get-auto|set-auto|get-effort|get-skip|set-skip)/)
  ) {
    groups['1-provider-claude'].push(ch);
  } else if (
    ch.match(/^codex-(agent-|chat$|check-|install-|validate-|run-|select-|get-api|set-api|get-base|set-base|get-default|set-default|get-last|get-model|set-model|get-providers|set-providers|get-reasoning|list-available|get-project|set-project|read-config|write-config|write-auth|repair-config|import-legacy|list-slash)/)
  ) {
    groups['2-provider-codex'].push(ch);
  } else if (
    ch.match(/^(claude-(activate|add-model|remove-model|get-base|set-base|get-model|set-model|get-models|set-models|get-providers|set-providers|get-selected|set-selected|get-tier|set-tier|get-permission|set-permission|get-thinking|set-thinking|patch-|read-settings|repair-|import-|memory-|freeze-))|^(codex-(get-api|set-api|get-base|set-base|get-model|set-model|get-providers|set-providers|get-reasoning))|^(load-locale|save-locale|load-theme|save-theme|get-app-version|get-diagnostics|set-diagnostics|get-login-item|set-login-item)/)
  ) {
    groups['4-settings'].push(ch);
  } else if (
    ch.match(/^(claude-(delete-session|read-session|write-session|register-|scan-|scanner-|load-code-panel|save-code-panel|list-local))|^(codex-(delete-session|read-session|register-|unregister-|list-sessions|load-code-panel|save-code-panel|list-local|skills-get-catalog))/)
  ) {
    groups['5-session'].push(ch);
  } else if (
    ch.match(/^(md-|open-md-|resolve-doc|local-search-|search-page|close-search|stop-search|found-in-|open-external|open-file-|open-folder|open-system|open-tab-|openEmail|window-|flash-taskbar|read-file-by|select-and-|copy-file|exists-file|read-file-sync|write-file-sync|mkdir-|rmdir-|read-dir-|rename-file|unlink-file|unCompress|exec-cmd|open-document)/)
  ) {
    groups['6-doc-search-window'].push(ch);
  } else if (
    ch.match(/^(plugin-|plugins-|skills-)/)
  ) {
    groups['7-plugin-skills'].push(ch);
  } else {
    groups['8-system-crosscut'].push(ch);
  }
}

let total = 0;
for (const [key, arr] of Object.entries(groups)) {
  console.log(`${key}: ${arr.length}`);
  total += arr.length;
}
console.log(`\nTOTAL classified: ${total} / ${unreg.length}`);

const classified = new Set(Object.values(groups).flat());
const missing = unreg.filter(ch => !classified.has(ch));
if (missing.length) {
  console.log(`\nUNCLASSIFIED (${missing.length}):`);
  missing.forEach(ch => console.log(`  ${ch}`));
}

console.log('\n--- Group 8 (system/crosscut) ---');
groups['8-system-crosscut'].forEach(ch => console.log(`  ${ch}`));
