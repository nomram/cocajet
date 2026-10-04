/* ==========================================================================
   site.js — page chrome (top bar, chapter nav, prev/next), theme, math, lazy widget loader
   Every page just contains its content + <div data-widget="name"> placeholders.
   ========================================================================== */

export const PAGES = [
  { file: 'index.html',       n: '⌂',  title: 'Start here',                      group: 'Start' },
  { file: 'safety.html',      n: '!',  title: 'Safety first',                    group: 'Start' },
  { file: '01-air.html',      n: '1',  title: 'Air, gases & chemistry',          group: 'I · The science' },
  { file: '02-forces.html',   n: '2',  title: 'Forces, thrust & energy',         group: 'I · The science' },
  { file: '03-thermo.html',   n: '3',  title: 'Pressure, heat & the Brayton cycle', group: 'I · The science' },
  { file: '04-blades.html',   n: '4',  title: 'Wings, fans & turbines',          group: 'I · The science' },
  { file: '05-engine.html',   n: '5',  title: 'The whole engine on one page',    group: 'II · The engine' },
  { file: '06-build.html',    n: '6',  title: 'Build it, layer by layer (3D)',   group: 'II · The engine' },
  { file: '07-run.html',      n: '7',  title: 'Run it: the simulator',           group: 'II · The engine' },
  { file: '08-improve.html',  n: '8',  title: 'Make it better, cheaply',         group: 'III · Level up' },
  { file: '09-materials.html',n: '9',  title: 'Materials science',               group: 'III · Level up' },
  { file: '10-chemistry.html',n: '10', title: 'The chemistry of heat',           group: 'IV · Fire & ignition' },
  { file: '11-ignition.html', n: '11', title: 'Ignition & spark plugs',          group: 'IV · Fire & ignition' },
  { file: '12-rockets.html',  n: '12', title: 'Rockets: the other way to push',  group: 'V · Rockets' },
  { file: '13-solid.html',    n: '13', title: 'Solid rockets & propellants',     group: 'V · Rockets' },
  { file: '14-hybrid.html',   n: '14', title: 'Hybrid, liquid & air-breathing',  group: 'V · Rockets' },
  { file: '15-electric.html', n: '15', title: 'Electric propulsion',             group: 'V · Rockets' },
  { file: 'models.html',      n: '⬇',  title: 'STL files & 3D gallery',          group: 'Resources' },
  { file: 'reference.html',   n: '≡',  title: 'Formulas, glossary & sources',    group: 'Resources' },
];

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4cc9f0"/><stop offset="1" stop-color="#ff6b35"/></linearGradient></defs>
<circle cx="16" cy="16" r="14" fill="none" stroke="url(#lg)" stroke-width="2"/>
<g fill="url(#lg)">${[0,1,2,3,4,5].map(i => `<path transform="rotate(${i*60} 16 16)" d="M16 16 C 17 10 21 6.5 24 7.5 C 22 11 20 14 16 16Z"/>`).join('')}</g>
<circle cx="16" cy="16" r="2.4" fill="#0a0e13" stroke="url(#lg)" stroke-width="1.2"/></svg>`;

const here = location.pathname.split('/').pop() || 'index.html';
const current = PAGES.find(p => p.file === here) || PAGES[0];

/* ---------- theme ---------- */
function getStoredTheme() { try { return localStorage.getItem('cj-theme'); } catch (e) { return null; } }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
}
export function theme() { return document.documentElement.getAttribute('data-theme') || 'dark'; }
(function initTheme() {
  const stored = getStoredTheme();
  const pref = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', stored || pref);
})();

/* ---------- chrome ---------- */
function buildTopbar() {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  bar.className = 'topbar';
  bar.innerHTML = `
    <button class="icon-btn" id="menu-btn" aria-label="Chapters">☰</button>
    <a class="brand" href="index.html">${LOGO}<span>Jet Engines for Dummies<small>Build the Coke-can turbojet</small></span></a>
    <nav class="top-links">
      <a href="06-build.html" class="hide-sm">3D build</a>
      <a href="07-run.html" class="hide-sm">Simulator</a>
      <a href="models.html" class="hot">STL files</a>
      <button class="icon-btn" id="theme-btn" aria-label="Toggle theme" title="Toggle light / dark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg></button>
    </nav>
    <div class="progress" id="progress"></div>`;
  document.getElementById('theme-btn').addEventListener('click', () => {
    const t = theme() === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    try { localStorage.setItem('cj-theme', t); } catch (e) { /* private mode */ }
  });
  document.getElementById('menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  const prog = document.getElementById('progress');
  const onScroll = () => {
    const h = document.documentElement;
    const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
    prog.style.width = (p * 100).toFixed(1) + '%';
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}

function buildSidenav() {
  const nav = document.getElementById('sidenav');
  if (!nav) return;
  let html = '', group = '';
  for (const p of PAGES) {
    if (p.group !== group) { group = p.group; html += `<h6>${group}</h6>`; }
    const cur = p.file === current.file;
    html += `<a class="nav-item${cur ? ' current' : ''}" href="${p.file}"><span class="n">${p.n}</span><span>${p.title}</span></a>`;
    if (cur) html += `<div class="sub" id="subnav"></div>`;
  }
  nav.innerHTML = html;
  // in-page sections
  const heads = [...document.querySelectorAll('main h2[id]')];
  const sub = document.getElementById('subnav');
  if (sub && heads.length) {
    sub.innerHTML = heads.map(h => `<a href="#${h.id}" data-for="${h.id}">${h.dataset.short || h.textContent}</a>`).join('');
    const links = new Map([...sub.querySelectorAll('a')].map(a => [a.dataset.for, a]));
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        links.forEach(a => a.classList.remove('active'));
        const a = links.get(e.target.id); if (a) a.classList.add('active');
      }
    }, { rootMargin: '-20% 0px -70% 0px' });
    heads.forEach(h => io.observe(h));
  }
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });
}

function buildPrevNext() {
  const main = document.querySelector('main');
  if (!main) return;
  const i = PAGES.indexOf(current);
  const prev = PAGES[i - 1], next = PAGES[i + 1];
  const pn = document.createElement('div');
  pn.className = 'pn';
  pn.innerHTML = (prev ? `<a class="prev" href="${prev.file}"><small>← Previous</small>${prev.title}</a>` : '<span></span>')
               + (next ? `<a class="next" href="${next.file}"><small>Next →</small>${next.title}</a>` : '<span></span>');
  main.appendChild(pn);
  const foot = document.createElement('footer');
  foot.className = 'site-foot';
  foot.innerHTML = `<b>Educational use only.</b> Gas turbines spin at 100 000+ rpm and burn at 800 °C+. This guide explains the physics and shows one design; it is not a substitute for experience, supervision, local regulations or a proper test cell. See <a href="safety.html">Safety first</a>. · Built with plain HTML/CSS/JS, three.js and KaTeX · <a href="reference.html#sources">Sources</a>`;
  main.appendChild(foot);
}

/* ---------- math (KaTeX, loaded lazily) ---------- */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
let mathReady = null;
export function renderMath(root = document.body) {
  if (!document.querySelector('[data-needs-math], .eq, .katex-src') && !root.querySelector?.('.eq, .m')) { /* still try, cheap */ }
  if (!mathReady) {
    mathReady = (async () => {
      await loadScript('vendor/katex/katex.min.js');
      await loadScript('vendor/katex/auto-render.min.js');
    })();
  }
  return mathReady.then(() => {
    window.renderMathInElement(root, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false, ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'canvas'],
    });
  }).catch(() => { /* offline math: leave source text */ });
}
window.renderMath = renderMath;

/* ---------- lazy widgets ---------- */
async function bootWidget(el) {
  const name = el.dataset.widget;
  try {
    const mod = await import(`./widgets/${name}.js`);
    await mod.default(el, { theme, renderMath });
    renderMath(el);
  } catch (err) {
    console.error('widget failed:', name, err);
    el.innerHTML = `<div class="callout danger"><span class="ct">Widget error</span>Could not start “${name}”: ${String(err.message || err)}</div>`;
  }
}
function initWidgets() {
  const els = [...document.querySelectorAll('[data-widget]')];
  if (!('IntersectionObserver' in window)) { els.forEach(bootWidget); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); bootWidget(e.target); }
  }, { rootMargin: '500px 0px' });
  els.forEach(el => io.observe(el));
}

/* ---------- boot ---------- */
function boot() {
  buildTopbar();
  buildSidenav();
  buildPrevNext();
  import('./thread.js').then(m => m.buildThread({ pages: PAGES, current })).then(() => renderMath(document.querySelector('main'))).catch(e => console.error('thread', e));
  renderMath(document.querySelector('main') || document.body);
  initWidgets();
  if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 50);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
