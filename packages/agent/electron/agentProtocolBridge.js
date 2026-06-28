'use strict';

/**
 * Agent Protocol Bridge — lazy-loaded ESM import bridge shared by
 * claudeAgent.js and codexAgent.js.
 *
 * Both used duplicate `_getAgentProtocol()` implementations.  This
 * single helper preserves the lazy-import behaviour so that agent main
 * files don't import the ESM module at require-time (which would fail
 * in CJS context).
 */

let _agentProtocolMod = null;

async function getAgentProtocol() {
  _agentProtocolMod =
    _agentProtocolMod ||
    (await import('../src/components/agentCommon/runtime/agentProtocol.mjs'));
  return _agentProtocolMod;
}

module.exports = { getAgentProtocol };
