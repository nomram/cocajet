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
const widgets = flag('widgets');
const only = opt('only', null);
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
  if (full) {   // scroll through so lazy widgets start, then return to top
    const hgt = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < hgt; y += 500) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(220); }
    await page.waitForTimeout(1800); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  }
  let extra = '';
  if (evalJs) { try { extra = JSON.stringify(await page.evaluate(evalJs)); } catch (e) { extra = 'EVAL ERROR ' + e.message; } await page.waitForTimeout(600); }
  if (widgets) {
    const els = await page.$$('[data-widget]');
    let i = 0;
    for (const e of els) {
      const name = await e.getAttribute('data-widget'); i++;
      if (only && !only.split(',').includes(name)) continue;
      await e.scrollIntoViewIfNeeded(); await page.waitForTimeout(1400);
      const f = path.join(shots, pg.replace(/\.html$/, '') + `-w${String(i).padStart(2, '0')}-${name}.png`);
      try { await e.screenshot({ path: f }); console.log('   widget', name, '->', f); } catch (err) { console.log('   widget', name, 'screenshot failed', err.message.slice(0, 80)); }
    }
  }
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
