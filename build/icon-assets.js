const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_SVG = path.join(ROOT, 'public/logos/v3/white.svg');
const APP_ICON_SVG = path.join(ROOT, 'public/logos/v3/white-app-icon.svg');
const OUTPUTS = [
  { size: 256, path: path.join(ROOT, 'public/logo-white.png') },
  { size: 64, path: path.join(ROOT, 'public/logo-white-64.png') },
];
const DIST_SYNC = [
  ['public/logo-white.png', 'dist/logo-white.png'],
  ['public/logo-white-64.png', 'dist/logo-white-64.png'],
  ['public/logos/v3/white-app-icon.svg', 'dist/logos/v3/white-app-icon.svg'],
];
const APP_ICON_COLORS = {
  a1: '#F4F4F1',
  a2: '#E9E9E4',
  a3: '#DCDCD5',
  a4: '#CECEC6',
  cut: '#ACACA4',
};
const APP_ICON_CUTS = `<g class="logo-cuts" aria-hidden="true">
<path d="M4.6 14.4 L9.3 6.2 L18.7 6.2 L23.4 14.4 L17.9 23.9"/>
</g>`;

function extractLogoParts(svg) {
  const style = svg.match(/<style[^>]*>[\s\S]*?<\/style>/)?.[0];
  const body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/, '')
    .trim();

  if (!style || !body) {
    throw new Error(`Could not extract logo geometry from ${SOURCE_SVG}`);
  }

  return { style, body };
}

function buildAppIconSvg() {
  const source = fs.readFileSync(SOURCE_SVG, 'utf8');
  const { body } = extractLogoParts(source);
  const appIconStyle = `<style>.a1{fill:${APP_ICON_COLORS.a1};}.a2{fill:${APP_ICON_COLORS.a2};}.a3{fill:${APP_ICON_COLORS.a3};}.a4{fill:${APP_ICON_COLORS.a4};}</style>
<style>.logo-cuts { fill: none; stroke: ${APP_ICON_COLORS.cut}; stroke-width: 0.13px; stroke-linejoin: round; stroke-linecap: round; }</style>`;
  const svg = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="MindCraft-Agent">
${appIconStyle}
<rect x="10" y="10" width="236" height="236" rx="48" fill="#0D1117"/>
<rect x="15" y="15" width="226" height="226" rx="43" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="3"/>
<g class="logo-mark" transform="translate(24 38) scale(9.5) translate(-3 -5)">
${body}
${APP_ICON_CUTS}
</g>
</svg>
`;

  if (/#00D1B7|#44ECD6|#005DE1|#2F89FF/i.test(svg)) {
    throw new Error('Generated app icon SVG contains color logo values');
  }

  fs.writeFileSync(APP_ICON_SVG, svg);
}

function readPngHeader(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`${filePath} is not a PNG file`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
  };
}

function validatePngHeaders() {
  for (const output of OUTPUTS) {
    const header = readPngHeader(output.path);
    if (header.width !== output.size || header.height !== output.size) {
      throw new Error(`${output.path} is ${header.width}x${header.height}, expected ${output.size}x${output.size}`);
    }
  }
}

function syncDistCopies() {
  const distDir = path.join(ROOT, 'dist');
  if (!fs.existsSync(distDir)) return;

  for (const [from, to] of DIST_SYNC) {
    const source = path.join(ROOT, from);
    const target = path.join(ROOT, to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function runNodeMode() {
  buildAppIconSvg();

  const electronPath = require('electron');
  const result = spawnSync(electronPath, [__filename, '--render'], {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Electron icon renderer failed with exit code ${result.status}`);
  }

  validatePngHeaders();
  syncDistCopies();
}

async function renderPngWithElectron(size, outputPath) {
  const { BrowserWindow } = require('electron');
  const svg = fs.readFileSync(APP_ICON_SVG, 'utf8');
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const win = new BrowserWindow({
    show: false,
    width: size,
    height: size,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      contextIsolation: false,
      sandbox: false,
    },
  });

  await win.loadURL('data:text/html;charset=utf-8,<html><body></body></html>');
  const result = await win.webContents.executeJavaScript(
    `
      new Promise((resolve, reject) => {
        const size = ${size};
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(image, 0, 0, size, size);
          const pixels = ctx.getImageData(0, 0, size, size).data;
          let opaque = 0;
          let minX = size;
          let minY = size;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
              const alpha = pixels[((y * size + x) * 4) + 3];
              if (alpha > 8) {
                opaque += 1;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }
          resolve({
            png: canvas.toDataURL('image/png').split(',')[1],
            coverage: opaque / (size * size),
            bbox: maxX >= 0 ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null,
          });
        };
        image.onerror = () => reject(new Error('Could not load generated app icon SVG'));
        image.src = ${JSON.stringify(dataUrl)};
      })
    `,
    true,
  );

  win.destroy();

  if (result.coverage < 0.65) {
    throw new Error(`Rendered ${size}px icon coverage is ${(result.coverage * 100).toFixed(2)}%, expected at least 65%`);
  }

  fs.writeFileSync(outputPath, Buffer.from(result.png, 'base64'));
  console.log(`rendered ${path.relative(ROOT, outputPath)} coverage=${(result.coverage * 100).toFixed(2)}% bbox=${result.bbox.join('x')}`);
}

async function runElectronRenderMode() {
  const { app } = require('electron');
  app.on('window-all-closed', () => {});
  app.disableHardwareAcceleration();
  await app.whenReady();

  try {
    for (const output of OUTPUTS) {
      await renderPngWithElectron(output.size, output.path);
    }
    app.quit();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    app.exit(1);
  }
}

if (process.argv.includes('--render')) {
  runElectronRenderMode();
} else {
  runNodeMode();
}
