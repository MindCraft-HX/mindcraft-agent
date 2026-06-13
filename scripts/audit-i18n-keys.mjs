import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Read locale files
const zh = JSON.parse(readFileSync(resolve(root, 'src/locales/zh-CN.json'), 'utf8'));
const en = JSON.parse(readFileSync(resolve(root, 'src/locales/en.json'), 'utf8'));

// Flatten all keys (dot notation)
function flatten(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(result, flatten(v, full));
    } else {
      result[full] = v;
    }
  }
  return result;
}

const zhFlat = flatten(zh);
const enFlat = flatten(en);

// Find all t('...') and $t('...') in source files
const glob = execSync(
  `rg "(t\\(|\\\\$t\\()" --include "*.vue" --include "*.js" --no-heading -n`,
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, cwd: root }
);

const usedKeys = new Set();
const keySource = new Map(); // key -> first file:line
for (const line of glob.split('\n')) {
  const m1 = line.match(/t\('([^']+)'/g);
  const m2 = line.match(/\$t\('([^']+)'/g);
  const matches = [...(m1 || []), ...(m2 || [])];
  for (const m of matches) {
    const keyMatch = m.match(/'([^']+)'/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (!keySource.has(key)) {
        const parts = line.split(':');
        keySource.set(key, `${parts[0]}:${parts[1]}`);
      }
      usedKeys.add(key);
    }
  }
}

let missingZh = 0, missingEn = 0;
const sortedKeys = [...usedKeys].sort();
for (const key of sortedKeys) {
  if (!zhFlat[key]) { console.log(`MISSING_ZH: ${key}  (${keySource.get(key)})`); missingZh++; }
  if (!enFlat[key]) { console.log(`MISSING_EN: ${key}  (${keySource.get(key)})`); missingEn++; }
}

console.log('---');
console.log(`Total unique keys used: ${usedKeys.size}`);
console.log(`Missing in zh-CN: ${missingZh}`);
console.log(`Missing in en: ${missingEn}`);
