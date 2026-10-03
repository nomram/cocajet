// Headless QA: serves the site, opens pages in Chromium (software WebGL), reports console errors,
// failed requests and writes screenshots.
//   node tools/qa.mjs index.html 01-air.html --shots /tmp/shots --wait 2500 [--full] [--w 1280 --h 800] [--eval "js"]
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf('--' + k); if (i < 0) return false; args.splice(i, 1); return true; };
const shots = opt('shots', path.join(root, '.qa-shots'));
const wait = +opt('wait', 2500);
const W = +opt('w', 1280), H = +opt('h', 800);
const full = flag('full');
const evalJs = opt('eval', null);
const scrollTo = opt('scroll', null);
const pages = args.length ? args : ['index.html'];
fs.mkdirSync(shots, { recursive: true });

let pw;
try { pw = await import('playwright'); } catch { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
const port = 8100 + Math.floor(Math.random() * 800);
const server = spawn('/opt/node22/bin/http-server', [root, '-p', String(port), '-s', '-c-1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
let bad = 0;
for (const pg of pages) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) errs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => /\.stl$/.test(r.url()) && /ERR_ABORTED/.test(r.failure()?.errorText || '') ? null : errs.push('[requestfailed] ' + r.url() + ' ' + (r.failure()?.errorText || '')));
  page.on('response', r => { if (r.status() >= 400) errs.push(`[http ${r.status()}] ${r.url()}`); });
  await page.goto(`http://localhost:${port}/${pg}`, { waitUntil: 'load' });
  await page.waitForTimeout(wait);
  if (scrollTo) { await page.evaluate((sel) => { const e = document.querySelector(sel); if (e) e.scrollIntoView({ block: 'center' }); }, scrollTo); await page.waitForTimeout(wait); }
  let extra = '';
  if (evalJs) { try { extra = JSON.stringify(await page.evaluate(evalJs)); } catch (e) { extra = 'EVAL ERROR ' + e.message; } await page.waitForTimeout(600); }
  const out = path.join(shots, pg.replace(/[^\w.-]/g, '_').replace(/\.html$/, '') + '.png');
  await page.screenshot({ path: out, fullPage: full });
  const un = [...new Set(errs)];
  if (un.length) bad++;
  console.log(`${un.length ? '✗' : '✓'} ${pg}  -> ${out}${extra ? '\n   eval: ' + extra : ''}`);
  un.slice(0, 12).forEach(e => console.log('    ' + e.slice(0, 300)));
  await ctx.close();
}
await browser.close(); server.kill();
process.exit(bad ? 1 : 0);
