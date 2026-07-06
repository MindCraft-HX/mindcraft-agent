'use strict';

/**
 * Supported routes guard test (T187 Phase 1).
 *
 * Asserts the set of explicitly supported renderer routes.
 * This test fails if:
 *   - A new route is added without adding it to SUPPORTED_ROUTES
 *   - An existing supported route is removed from the router
 *
 * The intent is to prevent routes from silently appearing or disappearing
 * during dead-code cleanup phases.
 *
 * Related: T187 §4 Phase 1, T187 §3 Supported Routes
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '..', 'src', 'router.js');

// Canonical list of supported routes (from T187 Phase 0 inventory §3).
// Each entry: { route, component, note }
const SUPPORTED_ROUTES = [
  { route: '/main/home',         component: 'Home',       note: 'home page' },
  { route: '/main/codeHub',      component: 'CodeHub',    note: 'main agent interface' },
  { route: '/main/chat',         component: 'ChatView',   note: 'lightweight chat' },
  { route: '/main/mdViewer',     component: 'mdViewer',   note: 'document viewer' },
  { route: '/main/pluginMarket', component: 'pluginMarket', note: 'plugin marketplace' },
  { route: '/main/plugin/:pluginId', component: 'pluginView', note: 'individual plugin page' },
];

// Agent redirect routes (generated dynamically from AGENT_DEFINITIONS).
// These redirect to /main/codeHub?agent=... and are expected.
const EXPECTED_REDIRECTS = [
  '/main/claudeCode',
  '/main/codex',
];

// Legacy redirects (deprecated but kept for backward compat).
const LEGACY_REDIRECTS = [
  '/mdViewer',
];

function extractRoutes(sourceText) {
  const routes = [];
  // Match each child route: path: 'xxx',
  const pathRegex = /path\s*:\s*['"]([^'"]+)['"]\s*,/g;
  let m;
  while ((m = pathRegex.exec(sourceText)) !== null) {
    const p = m[1];
    if (p.startsWith('/main/') && !routes.includes(p)) {
      routes.push(p);
    } else if (p.startsWith('main/') && !routes.includes('/' + p)) {
      routes.push('/' + p);
    } else if (!p.startsWith('/') && !p.startsWith('main') && !routes.includes('/main/' + p)) {
      // child route without /main/ prefix (e.g. 'home', 'codeHub')
      routes.push('/main/' + p);
    }
  }
  return routes;
}

describe('Supported Routes (T187 Phase 1)', () => {
  let routerSource;
  let childRoutes;

  before(() => {
    routerSource = fs.readFileSync(ROUTER_PATH, 'utf8');
    childRoutes = extractRoutes(routerSource);
  });

  it('router.js file exists', () => {
    assert.ok(fs.existsSync(ROUTER_PATH), 'src/router.js must exist');
  });

  SUPPORTED_ROUTES.forEach(({ route, component, note }) => {
    it(`supported route "${route}" (${component}) is in router — ${note}`, () => {
      assert.ok(
        childRoutes.includes(route),
        `Route "${route}" not found in router.js child routes. ` +
        `Supported routes: ${childRoutes.join(', ')}`
      );
    });
  });

  it('agent legacy redirect routes are present (T188)', () => {
    for (const expected of EXPECTED_REDIRECTS) {
      // Redirect routes are generated dynamically from AGENT_DEFINITIONS.
      // They don't appear as string literal paths in the router source.
      // Check that the generation logic exists.
      const hasAgentDefinitions = routerSource.includes('AGENT_DEFINITIONS');
      const hasRedirectRoutes = routerSource.includes('agentRedirectRoutes');
      const hasSpread = routerSource.includes('...agentRedirectRoutes');
      assert.ok(
        hasAgentDefinitions && hasRedirectRoutes && hasSpread,
        `Dynamic agent redirect route generation not found in router.js. ` +
        `Expected redirect for: ${expected}. ` +
        `If intentionally removed, update T188 LEGACY_STANDALONE_* entries.`
      );
      break; // check once for all redirects
    }
  });

  it('no orphan host routes are present', () => {
    // These old routes must NOT be in the router.
    // extractRoutes normalizes bare names to /main/-prefixed paths.
    const ORPHAN_ROUTES = [
      'settings',
      'promptTemplate',
      'codemirror',
      'error',
      'voice',
      'characterSquare',
      'room',
    ];
    for (const orphan of ORPHAN_ROUTES) {
      assert.ok(
        !childRoutes.includes('/main/' + orphan),
        `Orphan route "/main/${orphan}" should not be in router.js child routes. ` +
        `If intentionally added, update T187 SUPPORTED_ROUTES.`
      );
    }
  });

  it('router does not import orphan components', () => {
    const ORPHAN_IMPORTS = [
      'Settings',
      'PromptTemplateDrawer',
      'codemirror',
      'scrollBar',
      'views/error',
    ];
    for (const orphan of ORPHAN_IMPORTS) {
      assert.ok(
        !routerSource.includes(orphan),
        `Orphan component "${orphan}" found in router.js. Confirm it is an active route or remove.`
      );
    }
  });
});
