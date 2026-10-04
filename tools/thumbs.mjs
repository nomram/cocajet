// Render a PNG thumbnail of every STL part (headless Chromium + the site's own viewer code) into ../img/parts.
//   node thumbs.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'img', 'parts');
fs.mkdirSync(out, { recursive: true });
let pw;
try { pw = await import('playwright'); } catch { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
const port = 8900 + Math.floor(Math.random() * 90);
const server = spawn('/opt/node22/bin/http-server', [root, '-p', String(port), '-s', '-c-1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(`http://localhost:${port}/models.html#thumbs`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__thumbs, null, { timeout: 60000 });
  const thumbs = await page.evaluate(() => window.__thumbs);
  for (const [id, url] of Object.entries(thumbs)) {
    fs.writeFileSync(path.join(out, id + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', id + '.png');
  }
} finally { await browser.close(); server.kill(); }
