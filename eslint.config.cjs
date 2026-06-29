'use strict';

/**
 * Narrow ESLint config — only no-undef on agent electron main-process files.
 *
 * Purpose: catch the class of bug where a variable is used but the
 * corresponding require() / import is missing (e.g. createCliExecutor).
 * node --check cannot detect this because it only validates syntax,
 * not variable resolution inside function closures.
 *
 * This is NOT a project-wide lint config.  It targets:
 *   packages/agent/electron/** /*.js
 * and enables exactly ONE rule: no-undef.
 */

const path = require('path');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    name: 'mindcraft-agent-no-undef',

    // Only scan agent electron main-process source, not tests
    files: [
      'packages/agent/electron/**/*.js',
    ],
    ignores: [
      '**/*.test.js',
      '**/*.test.cjs',
      '**/*.test.mjs',
      '**/__tests__/**',
      '**/node_modules/**',
    ],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // ---- Node.js ----
        require: 'readonly',
        module: 'readonly',
        exports: 'writable',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        fetch: 'readonly',
        structuredClone: 'readonly',
        queueMicrotask: 'readonly',

        // ---- Electron main process ----
        ipcMain: 'readonly',
        app: 'readonly',
        BrowserWindow: 'readonly',
        BrowserView: 'readonly',
        dialog: 'readonly',
        clipboard: 'readonly',
        nativeTheme: 'readonly',
        shell: 'readonly',
        Menu: 'readonly',
        MenuItem: 'readonly',
        Tray: 'readonly',
        Notification: 'readonly',
        powerMonitor: 'readonly',
        screen: 'readonly',
        globalShortcut: 'readonly',
        autoUpdater: 'readonly',
        webContents: 'readonly',
        session: 'readonly',
        net: 'readonly',
        protocol: 'readonly',
        nativeImage: 'readonly',
        contentTracing: 'readonly',
        crashReporter: 'readonly',
        systemPreferences: 'readonly',
        desktopCapturer: 'readonly',
        MessageChannelMain: 'readonly',
      },
    },

    rules: {
      // The ONE rule we care about.  Everything else is off.
      'no-undef': 'error',
    },

    // Suppress parser errors on template strings that contain JSX-like content
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
];
