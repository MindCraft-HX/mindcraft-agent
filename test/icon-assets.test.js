const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function readPngHeader(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    size: buffer.length,
  };
}

test('app icon svg keeps the white logo on a neutral dark tile', () => {
  const svgPath = path.join(root, 'public/logos/v3/white-app-icon.svg');
  const svg = fs.readFileSync(svgPath, 'utf8');

  assert.match(svg, /viewBox="0 0 256 256"/);
  assert.match(svg, /fill="#0D1117"/);
  assert.match(svg, /\.a1\{fill:#F4F4F1;\}\.a2\{fill:#E9E9E4;\}\.a3\{fill:#DCDCD5;\}\.a4\{fill:#CECEC6;\}/);
  assert.match(svg, /\.logo-cuts \{ fill: none; stroke: #ACACA4; stroke-width: 0\.13px;/);
  assert.match(svg, /<g class="logo-cuts" aria-hidden="true">/);
  assert.match(svg, /M4\.6 14\.4 L9\.3 6\.2 L18\.7 6\.2 L23\.4 14\.4 L17\.9 23\.9/);
  assert.doesNotMatch(svg, /\.logo-mark \*/);
  assert.match(svg, /points="24,13\.4 17\.9,13\.4 18\.6,14\.6 23\.3,14\.6"/);
  assert.doesNotMatch(svg, /#00D1B7|#44ECD6|#005DE1|#2F89FF/i);
});

test('generated app icon pngs have expected square dimensions', () => {
  const icon256 = readPngHeader(path.join(root, 'public/logo-white.png'));
  const icon64 = readPngHeader(path.join(root, 'public/logo-white-64.png'));

  assert.equal(icon256.width, 256);
  assert.equal(icon256.height, 256);
  assert.ok(icon256.size > 3000);

  assert.equal(icon64.width, 64);
  assert.equal(icon64.height, 64);
  assert.ok(icon64.size > 800);
});
