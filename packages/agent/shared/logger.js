'use strict';

/**
 * Logger facade — central logging for all main/renderer code.
 *
 * Usage:
 *   const logger = require('../shared/logger').createLogger('codex:skills')
 *   logger.debug('installing', { name })
 *   logger.error('failed', err)
 *
 * Level control:
 *   - LOG_LEVEL=debug → debug + info + warn + error
 *   - LOG_LEVEL=info  → info + warn + error (default)
 *   - LOG_LEVEL=warn  → warn + error
 *   - LOG_LEVEL=error → error only
 *   - diagnosticsEnabled=true  → raises level to 'debug'
 *
 * Sensitive-field sanitisation is always on for keys named:
 *   apiKey, key, token, authorization, password, secret, bearer.
 *
 * Rules:
 *   - New code MUST use logger instead of raw console.log.
 *   - Existing console.log calls migrate gradually — no forced mass rewrite.
 *   - console.error/warn in pre-existing code is tolerated; new code uses logger.error/warn.
 */

const SENSITIVE_KEYS = /\b(apiKey|key|token|authorization|password|secret|bearer)\b/i;
const SENSITIVE_HEADER = /\b(sk-ant-api03|sk-[a-zA-Z0-9]+|eyJ[a-zA-Z0-9_-]+)\b/g;

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

function resolveLevel() {
  const env = (process.env.LOG_LEVEL || '').toLowerCase();
  if (env === 'debug') return LEVELS.DEBUG;
  if (env === 'info') return LEVELS.INFO;
  if (env === 'warn') return LEVELS.WARN;
  if (env === 'error') return LEVELS.ERROR;

  // Diagnostics enabled forces debug-level output
  if (process.env.MINDCRAFT_DIAGNOSTICS === '1') return LEVELS.DEBUG;

  return LEVELS.INFO; // default
}

function sanitize(obj) {
  if (typeof obj === 'string') return obj.replace(SENSITIVE_HEADER, '[REDACTED]');
  if (typeof obj !== 'object' || obj === null) return obj;
  if (obj instanceof Error) {
    return { message: obj.message, stack: obj.stack };
  }
  try {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = '[REDACTED]';
      } else if (typeof v === 'object' && v !== null) {
        out[k] = sanitize(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return '[unserializable]';
  }
}

function formatParts(scope, level, args) {
  const ts = new Date().toISOString();
  const sanitized = args.map(a => sanitize(a));
  return [`[${ts}]`, `[${scope}]`, `[${level}]`, ...sanitized];
}

function createLogger(scope) {
  const currentLevel = resolveLevel();

  return {
    debug(...args) {
      if (currentLevel <= LEVELS.DEBUG) {
        console.debug(...formatParts(scope, 'DEBUG', args));
      }
    },
    info(...args) {
      if (currentLevel <= LEVELS.INFO) {
        console.info(...formatParts(scope, 'INFO', args));
      }
    },
    warn(...args) {
      if (currentLevel <= LEVELS.WARN) {
        console.warn(...formatParts(scope, 'WARN', args));
      }
    },
    error(...args) {
      // Errors always output regardless of level
      console.error(...formatParts(scope, 'ERROR', args));
    },
  };
}

module.exports = { createLogger };
