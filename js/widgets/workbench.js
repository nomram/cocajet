// The design workbench: pick a casing donor, swap any part, set what you want to optimise for, and the optimiser
// re-ranks every combination (378 designs) from a table of real engine-model runs.
import { h, shell, slider, toggle, button, readout, legend, rafThrottle } from '../ui.js';
import { Plot, palette } from '../plot.js';
import { CASINGS, COMPRESSORS, TURBINES, BEARINGS, FUELSYS, GOALS, PRESETS, SKILL } from '../catalog.js';
import { loadTable, evaluate, universe, scored, bestFor, swapSuggestions } from '../design-model.js';

const SLOTS = [
  ['casing', 'Can / flame-tube donor', CASINGS], ['comp', 'Compressor wheel', COMPRESSORS], ['turb', 'Turbine wheel', TURBINES],
  ['bear', 'Bearings', BEARINGS], ['fuel', 'Fuel system', FUELSYS],
];
const CJ1_SEL = { casing: 'can', comp: 'billet', turb: 'inconel', bear: 'steel', fuel: 'propane' };
const T_CJ1 = 793;      // °C

const METRICS = {
  price:   { label: 'Price ($)',                           get: d => d.price,   log: true,  dir: -1, fmt: v => '$' + v.toFixed(0) },
  hours:   { label: 'Build time (hours)',                  get: d => d.hours,   log: true,  dir: -1, fmt: v => v.toFixed(0) + ' h' },
  F:       { label: 'Thrust (N)',                          get: d => d.F,       log: false, dir: +1, fmt: v => v.toFixed(0) + ' N' },
  density: { label: 'Thrust per litre of engine (N/L)',    get: d => d.density, log: false, dir: +1, fmt: v => v.toFixed(0) + ' N/L' },
  perMass: { label: 'Thrust per kilogram (N/kg)',          get: d => d.perMass, log: false, dir: +1, fmt: v => v.toFixed(0) + ' N/kg' },
  vmax:    { label: 'Top speed of the reference jet (m/s)', get: d => d.vmax,   log: false, dir: +1, fmt: v => v.toFixed(0) + ' m/s' },
  range:   { label: 'Range of the reference jet (km)',     get: d => d.range,   log: false, dir: +1, fmt: v => v.toFixed(0) + ' km' },
  life:    { label: 'Life at full power (minutes)',        get: d => d.life,    log: true,  dir: +1, fmt: v => fmtLife(v) },
  mass:    { label: 'Engine mass (kg)',                    get: d => d.mass,    log: false, dir: -1, fmt: v => v.toFixed(1) + ' kg' },
};
function fmtLife(m) { return m < 100 ? m.toFixed(m < 10 ? 1 : 0) + ' min' : m < 1440 ? (m / 60).toFixed(1) + ' h' : (m / 60).toFixed(0) + ' h'; }
const tag = (slot, key) => (SLOTS.find(s => s[0] === slot)[2][key]).tag;
const partsText = sel => SLOTS.map(([s]) => tag(s, sel[s])).join(' + ');
const sameSel = (a, b) => SLOTS.every(([s]) => a[s] === b[s]);
const sgn = (v, d = 0) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);

export default function init(el) {
  const { body } = shell(el, {
    title: 'Design workbench: swap the parts, re-optimise',
    note: 'Prices are typical 2020s hobby-market dollars and build hours are honest guesses; both are in <code>js/catalog.js</code> so you can replace them with your own. Performance is read from 378 runs of the same engine model that drives the simulator, scaled to each wheel size (see the notes below the widget). Picking a part locks it, so the optimiser designs the <i>rest</i> around your choice; untick the padlock to hand that slot back.',
  });
  body.append(h('p', { class: 'widget-note', style: { padding: 0 } }, 'Loading the engine table…'));
  loadTable('data/design-table.json').then(() => build(body)).catch(e => { body.innerHTML = ''; body.append(h('p', {}, 'Could not load data/design-table.json (' + e.message + '). Serve the site over http, not file://.')); });
}

function build(body) {
  body.innerHTML = '';
  const st = { sel: { ...CJ1_SEL }, locks: { casing: true }, w: { ...PRESETS.balanced.w }, preset: 'balanced', T: T_CJ1, ax: 'price', ay: 'F', hover: -1 };
  let U = null, cur = null, ranked = [], locksMap = {};

  /* ---------------- 1. goals ---------------- */
  const presetBtns = {};
  const goalRow = h('div', { class: 'btn-row' }, Object.entries(PRESETS).map(([k, p]) => (presetBtns[k] = button(p.label, () => { st.w = { ...p.w }; st.preset = k; syncWeights(); render(); }, 'small'))));
  const wSl = {};
  const weights = h('div', { class: 'wb-weights' }, Object.entries(GOALS).map(([k, g]) => {
    const s = slider({ label: g.name, min: 0, max: 1, step: 0.05, value: st.w[k], fmt: v => v === 0 ? 'ignore' : v >= 0.95 ? 'maximum' : (v * 100).toFixed(0) + ' %', onInput: v => { st.w[k] = v; st.preset = null; render(); } });
    s.el.title = g.blurb; wSl[k] = s; return s.el;
  }));
  const tSl = slider({ label: 'Turbine-inlet temperature you run at', min: 700, max: 900, step: 5, value: st.T, unit: '°C', fmt: v => v.toFixed(0), onInput: v => { st.T = v; render(); } });
  tSl.el.title = 'Hotter = more thrust and fuel flow, much shorter life: every +25 K cuts the life of the hot parts to a quarter. The CJ-1 runs at 793 °C.';
  const syncWeights = () => { for (const k of Object.keys(GOALS)) wSl[k].set(st.w[k] ?? 0); };

  /* ---------------- 2. slots ---------------- */
  const slotUI = {};
  const slotEls = SLOTS.map(([slot, label, cat]) => {
    const sel = h('select', {}, Object.entries(cat).map(([k, v]) => h('option', { value: k }, v.name)));
    sel.value = st.sel[slot];
    const lock = toggle({ label: 'keep', checked: !!st.locks[slot], onChange: v => { st.locks[slot] = v; render(); } });
    lock.el.title = 'Keep this part when the optimiser fills the other slots';
    const info = h('div', { class: 'info' }), box = h('div', { class: 'wb-slot' }, h('div', { class: 'k' }, label), sel, lock.el, info);
    sel.addEventListener('change', () => { st.sel[slot] = sel.value; st.locks[slot] = true; render(); });
    slotUI[slot] = { sel, lock, info, box };
    return box;
  });
  const optBtn = button('Fill the unlocked slots with the best parts', () => { if (ranked.length) { Object.assign(st.sel, ranked[0].d.sel); render(); } }, 'primary');
  const resetBtn = button('Back to the CJ-1', () => { st.sel = { ...CJ1_SEL }; st.locks = { casing: true }; st.w = { ...PRESETS.balanced.w }; st.preset = 'balanced'; st.T = T_CJ1; tSl.set(st.T); syncWeights(); render(); }, 'small');

  /* ---------------- 3. readouts + drawing ---------------- */
  const ro = {
    F: readout('Thrust', 'N', 'hot'), mf: readout('Fuel flow', 'g/s', 'fuel'), N: readout('Shaft speed', 'krpm', 'cool'), T: readout('Turbine inlet', '°C', 'fuel'),
    price: readout('Price', '$', 'cool'), hours: readout('Build time', 'h'), skill: readout('Skill needed', '/ 3'), life: readout('Life (weak link)', ''),
    mass: readout('Engine mass', 'kg'), vol: readout('Envelope', 'L'), dens: readout('Thrust per litre', 'N/L', 'good'), vmax: readout('Top speed*', 'm/s'), range: readout('Range*', 'km'), score: readout('Score for your goals', '/ 100', 'good'),
  };
  const cvSide = h('canvas', { class: 'plot' });
  const verdict = h('div', { class: 'wb-verdict' });

  /* ---------------- 4. tables ---------------- */
  const bestBox = h('div', { class: 'wb-scroll' }), swapBox = h('div', { class: 'wb-scroll' }), rankBox = h('div', { class: 'wb-scroll' });

  /* ---------------- 5. trade-off scatter ---------------- */
  const mopts = (v) => Object.entries(METRICS).map(([k, m]) => h('option', { value: k }, m.label));
  const xSel = h('select', {}, mopts()), ySel = h('select', {}, mopts());
  xSel.value = st.ax; ySel.value = st.ay;
  xSel.addEventListener('change', () => { st.ax = xSel.value; drawScatter(); }); ySel.addEventListener('change', () => { st.ay = ySel.value; drawScatter(); });
  const cvSc = h('canvas', { class: 'plot', style: { cursor: 'crosshair' } });

  body.append(
    h('div', { class: 'wb-h', style: { marginTop: 0 } }, '1 · What are you optimising for?'),
    goalRow, h('details', { class: 'plain', style: { margin: '10px 0 0' } }, h('summary', { style: { cursor: 'pointer', fontSize: '.86rem', color: 'var(--text-2)' } }, 'Fine-tune the mix of goals and the running temperature'), weights, h('div', { style: { maxWidth: '420px', marginTop: '8px' } }, tSl.el)),
    h('div', { class: 'wb-h' }, '2 · Pick the parts (start with the can or tin you can get)'),
    h('div', { class: 'wb-slots' }, ...slotEls),
    h('div', { class: 'btn-row', style: { margin: '10px 0 0' } }, optBtn, resetBtn),
    h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), h('div', { style: { height: '10px' } }), cvSide,
    verdict,
    h('div', { class: 'wb-h' }, '3 · Best design for each goal (with your locked parts)'), bestBox,
    h('div', { class: 'wb-h' }, '4 · Single swaps that would change your score'), swapBox,
    h('div', { class: 'wb-h' }, '5 · The ten best designs for your mix of goals'), rankBox,
    h('div', { class: 'wb-h' }, '6 · Every design on two axes (click a dot to load it)'),
    h('div', { class: 'wgrid even', style: { marginBottom: '8px' } }, h('div', { class: 'ctl' }, h('label', {}, 'Horizontal axis'), h('span'), xSel), h('div', { class: 'ctl' }, h('label', {}, 'Vertical axis'), h('span'), ySel)),
    cvSc, legend([['var(--ok)', 'frontier: no design with your locked parts beats these on both axes'], ['var(--fire)', 'your design'], ['#7a5cff', 'best for your goals']]),
    h('p', { class: 'widget-note', style: { padding: 0, marginTop: '10px' } }, '* The reference jet is a 2.5 kg airframe with a 0.5 m² wing (aspect ratio 7), carrying 1.2 litres of fuel; top speed is where thrust equals drag, range is at 70 % of top speed.'),
  );

  const pSide = new Plot(cvSide, { aspect: 3.0, minHeight: 235, grid: false, margin: { l: 0, r: 0, t: 0, b: 0 } });
  const pSc = new Plot(cvSc, { aspect: 1.9, minHeight: 300, margin: { l: 56, r: 14, t: 12, b: 44 } });

  /* ---------------- side view ---------------- */
  function geom(D2, Dt, C) {
    const inl = 0.3 * D2, comp = 0.36 * D2, Dh = D2 + 0.22 * D2 + 6, tur = 0.18 * Dt, noz = 0.5 * Dt;
    const cx0 = inl + comp, cx1 = cx0 + C.L, tx1 = cx1 + tur;
    return { inl, comp, Dh, cx0, cx1, tx1, total: tx1 + noz, Dt, OD: C.OD, noz, D2 };
  }
    function drawSide() {
    const p = pSide, c = p.begin().col, ctx = p.ctx, W = p.W, H = p.H;
    const ref = geom(56, 51, CASINGS.can), showGhost = !sameSel(st.sel, CJ1_SEL);
    const gg = cur && cur.valid ? geom(cur.D2, cur.Dt, CASINGS[st.sel.casing]) : ref;
    const needL = Math.max(gg.total, showGhost ? ref.total : 0), needH = Math.max(gg.OD, gg.Dh, gg.Dt * 1.1, showGhost ? ref.OD : 0);
    const k = Math.min((W - 24) / needL, (H - 58) / needH), x0 = (W - needL * k) / 2, cy = (H - 22) / 2 + 4;
    const X = mm => x0 + mm * k, Y = mm => cy + mm * k;
    const rect = (a, b, w, hh) => [X(a), Y(-hh / 2), w * k, hh * k];
    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
    const ghost = (g) => { ctx.strokeRect(...rect(g.inl, 0, g.comp, g.Dh)); ctx.strokeRect(...rect(g.cx0, 0, g.cx1 - g.cx0, g.OD)); ctx.strokeRect(...rect(g.cx1, 0, g.tx1 - g.cx1, g.Dt * 1.1)); };
    if (showGhost) ghost(ref);
    ctx.restore();
    if (!cur || !cur.valid) { p.ptext(W / 2, H / 2, cur ? 'no engine can be built from this combination' : '', { align: 'center', base: 'middle', color: c.bad }); return; }
    const C = CASINGS[st.sel.casing], g = geom(cur.D2, cur.Dt, C), wall = Math.max(C.wall * k, 2.4);
    // flow arrows
    p.arrow(X(0) - 2, cy - 0, X(0) + 22, cy, { px: true, color: c.air, width: 2.5, head: 8 });
    p.arrow(X(g.total) - 20, cy, X(g.total) + 0.1, cy, { px: true, color: c.fire, width: 3, head: 9 });
    // compressor housing + wheel
    ctx.fillStyle = c.air; ctx.globalAlpha = .22; ctx.fillRect(...rect(g.inl, 0, g.comp, g.Dh)); ctx.globalAlpha = 1;
    ctx.strokeStyle = c.air; ctx.lineWidth = 1.6; ctx.strokeRect(...rect(g.inl, 0, g.comp, g.Dh));
    ctx.fillStyle = c.air; ctx.beginPath(); ctx.moveTo(X(g.inl + 0.1 * g.comp), Y(-0.1 * g.D2)); ctx.lineTo(X(g.inl + 0.9 * g.comp), Y(-0.5 * g.D2)); ctx.lineTo(X(g.inl + 0.9 * g.comp), Y(0.5 * g.D2)); ctx.lineTo(X(g.inl + 0.1 * g.comp), Y(0.1 * g.D2)); ctx.closePath(); ctx.fill();
    // casing (hollow tube) and liner
    ctx.fillStyle = c.metal; ctx.fillRect(...rect(g.cx0, 0, g.cx1 - g.cx0, g.OD));
    const ix = X(g.cx0), iw = (g.cx1 - g.cx0) * k, iy = Y(-g.OD / 2) + wall, ih = g.OD * k - 2 * wall;
    ctx.fillStyle = c.bg; ctx.fillRect(ix, iy, iw, ih);
    const lx = ix + iw * 0.1, lw = iw * 0.8, ly = Y(-0.36 * g.OD), lh = 0.72 * g.OD * k;
    const grad = ctx.createLinearGradient(lx, 0, lx + lw, 0); grad.addColorStop(0, 'rgba(255,183,3,0)'); grad.addColorStop(0.4, 'rgba(255,183,3,.35)'); grad.addColorStop(1, 'rgba(255,107,53,.8)');
    ctx.fillStyle = grad; ctx.fillRect(lx, ly, lw, lh);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = c.fuel; ctx.lineWidth = 1.2; ctx.strokeRect(lx, ly, lw, lh); ctx.setLineDash([]);
    // turbine housing, nozzle
    ctx.fillStyle = c.bad; ctx.globalAlpha = .3; ctx.fillRect(...rect(g.cx1, 0, g.tx1 - g.cx1, g.Dt * 1.1)); ctx.globalAlpha = 1;
    ctx.fillStyle = c.fire; ctx.beginPath(); ctx.moveTo(X(g.cx1 + 0.15 * (g.tx1 - g.cx1)), Y(-0.5 * g.Dt)); ctx.lineTo(X(g.tx1 - 0.15 * (g.tx1 - g.cx1)), Y(-0.38 * g.Dt)); ctx.lineTo(X(g.tx1 - 0.15 * (g.tx1 - g.cx1)), Y(0.38 * g.Dt)); ctx.lineTo(X(g.cx1 + 0.15 * (g.tx1 - g.cx1)), Y(0.5 * g.Dt)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c.metal; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(g.tx1), Y(-0.55 * g.Dt)); ctx.lineTo(X(g.total), Y(-0.31 * g.Dt)); ctx.moveTo(X(g.tx1), Y(0.55 * g.Dt)); ctx.lineTo(X(g.total), Y(0.31 * g.Dt)); ctx.stroke();
    // shaft
    ctx.strokeStyle = c.strong; ctx.lineWidth = Math.max(2, Math.min(0.05 * g.D2 * k, 7)); ctx.beginPath(); ctx.moveTo(X(g.inl + 0.5 * g.comp), cy); ctx.lineTo(X(g.cx1 + 0.4 * (g.tx1 - g.cx1)), cy); ctx.stroke();
    // labels
    const top = Y(-Math.max(g.OD, g.Dh) / 2) - 5, bot = Y(Math.max(g.OD, g.Dt * 1.1, g.Dh) / 2) + 6;
    p.ptext(X(g.cx0 + (g.cx1 - g.cx0) / 2), top, `${C.tag}: Ø${C.OD} × ${C.L} mm`, { align: 'center', base: 'bottom', color: c.text, size: 11.5 });
    p.ptext(X(g.inl), bot, `wheel Ø${cur.D2.toFixed(0)} mm`, { align: 'left', base: 'top', color: c.air, size: 11.5 });
    p.ptext(X(g.tx1), bot, `turbine Ø${cur.Dt.toFixed(0)} mm`, { align: 'center', base: 'top', color: c.bad, size: 11.5 });
    // scale bar
    const by = H - 8; ctx.strokeStyle = c.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, by); ctx.lineTo(12 + 50 * k, by); ctx.moveTo(12, by - 4); ctx.lineTo(12, by + 4); ctx.moveTo(12 + 50 * k, by - 4); ctx.lineTo(12 + 50 * k, by + 4); ctx.stroke();
    p.ptext(12 + 50 * k + 8, by, '50 mm', { base: 'middle', color: c.text, size: 11 });
    p.ptext(W - 8, by, `${(g.total).toFixed(0)} mm long${showGhost ? ' · dashed = CJ-1' : ''}`, { align: 'right', base: 'middle', color: c.muted, size: 11 });
  }

  /* ---------------- scatter ---------------- */
  function drawScatter() {
    if (!U) return;
    const p = pSc, mx = METRICS[st.ax], my = METRICS[st.ay], pts = U.valid, c = p.begin().col;
    const ext = (m) => { const v = pts.map(m.get).filter(x => x > 0); let lo = Math.min(...v), hi = Math.max(...v); if (m.log) { lo /= 1.25; hi *= 1.25; } else { const pad = (hi - lo) * 0.08 || 1; lo = Math.max(0, lo - pad); hi += pad; } return [lo, hi]; };
    const [x0, x1] = ext(mx), [y0, y1] = ext(my);
    p.set({ xmin: x0, xmax: x1, ymin: y0, ymax: y1, xlog: mx.log, ylog: my.log, xlabel: mx.label, ylabel: my.label.replace(/ \(.*/, '') });
    p.axes();
    const ok = d => Object.entries(locksMap).every(([s, v]) => d.sel[s] === v);
    const dirX = mx.dir, dirY = my.dir;
    // frontier among the designs that match the locks
    const mine = pts.filter(ok).sort((a, b) => dirX * (mx.get(b) - mx.get(a)));
    const front = []; let bestY = -Infinity;
    for (const d of mine) { const yv = dirY * my.get(d); if (yv > bestY + 1e-12) { front.push(d); bestY = yv; } }
    front.sort((a, b) => mx.get(a) - mx.get(b));
    p.clip(true);
    const sc = new Map(); for (const d of pts) sc.set(d, score(d));
    pts.forEach(d => { const [r, g, b] = palette('viridis', sc.get(d) / 100); p.ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${ok(d) ? 0.95 : 0.22})`; p.ctx.beginPath(); p.ctx.arc(p.X(mx.get(d)), p.Y(my.get(d)), ok(d) ? 4.6 : 3.4, 0, 7); p.ctx.fill(); });
    if (front.length > 1) p.line(front.map(mx.get), front.map(my.get), { color: c.ok, width: 2, dash: [6, 4] });
    p.clip(false);
    const ring = (d, col, lab, side) => { if (!d || !d.valid) return; const px = p.X(mx.get(d)), py = p.Y(my.get(d)); p.ctx.strokeStyle = col; p.ctx.lineWidth = 2.6; p.ctx.beginPath(); p.ctx.arc(px, py, 8.5, 0, 7); p.ctx.stroke(); if (lab) p.ptext(side === 'left' ? px - 12 : px + 12, side === 'left' ? py + 12 : py - 12, lab, { color: col, base: side === 'left' ? 'top' : 'bottom', align: side === 'left' ? 'right' : 'left', size: 11.5 }); };
    ring(ranked[0] && ranked[0].d, '#7a5cff', 'best for your goals', 'left'); ring(cur, c.fire, 'yours', 'right');
    if (st.hover >= 0 && pts[st.hover]) {
      const d = pts[st.hover], px = p.X(mx.get(d)), py = p.Y(my.get(d)), txt = partsText(d.sel), t2 = `${d.F.toFixed(0)} N · $${d.price.toFixed(0)} · ${d.hours.toFixed(0)} h · life ${fmtLife(d.life)}`;
      p.ctx.font = '600 11.5px ui-sans-serif, system-ui, sans-serif'; const w = Math.max(p.ctx.measureText(txt).width, p.ctx.measureText(t2).width) + 14;
      let bx = px + 12, by = py - 44; if (bx + w > p.W - 4) bx = px - w - 12; if (by < 4) by = py + 12;
      p.ctx.fillStyle = c.bg; p.ctx.globalAlpha = .95; p.ctx.fillRect(bx, by, w, 36); p.ctx.globalAlpha = 1; p.ctx.strokeStyle = c.grid2; p.ctx.strokeRect(bx + .5, by + .5, w, 36);
      p.ptext(bx + 7, by + 5, txt, { color: c.strong, size: 11.5 }); p.ptext(bx + 7, by + 20, t2, { color: c.text, weight: 500, size: 11 });
      p.ctx.strokeStyle = c.strong; p.ctx.lineWidth = 2; p.ctx.beginPath(); p.ctx.arc(px, py, 7, 0, 7); p.ctx.stroke();
    }
  }
  const redrawSc = rafThrottle(drawScatter);
  pSc.onDraw(drawScatter); pSide.onDraw(drawSide);
  cvSc.addEventListener('pointermove', e => {
    if (!U) return; const r = cvSc.getBoundingClientRect(), mx = METRICS[st.ax], my = METRICS[st.ay]; let bi = -1, bd = 18 * 18;
    U.valid.forEach((d, i) => { const dx = pSc.X(mx.get(d)) - (e.clientX - r.left), dy = pSc.Y(my.get(d)) - (e.clientY - r.top), q = dx * dx + dy * dy; if (q < bd) { bd = q; bi = i; } });
    if (bi !== st.hover) { st.hover = bi; redrawSc(); }
  });
  cvSc.addEventListener('pointerleave', () => { st.hover = -1; redrawSc(); });
  cvSc.addEventListener('click', e => { if (st.hover >= 0) { Object.assign(st.sel, U.valid[st.hover].sel); render(); } });

  /* ---------------- scoring helpers ---------------- */
  function weights01() { const w = { ...st.w }; if (!Object.values(w).some(v => v > 0)) for (const k of Object.keys(w)) w[k] = 1; return w; }
  const score = d => { let a = 0, b = 0; const w = weights01(); for (const [k, g] of Object.entries(GOALS)) { const wk = w[k] || 0; if (!wk) continue; a += wk * normOf(g, d); b += wk; } return b ? 100 * a / b : 0; };
  function normOf(g, d) { const r = U.ranges[g.metric], v = Math.max(d[g.metric], 0), f = r.log ? (x => Math.log(Math.max(x, 1e-9))) : (x => x), t = r.max === r.min ? 0.5 : (f(v) - f(r.min)) / (f(r.max) - f(r.min)); return Math.min(1, Math.max(0, g.dir > 0 ? t : 1 - t)); }

  /* ---------------- render ---------------- */
  function table(head, rows, cls = []) {
    const t = h('table', { class: 'wb' }, h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { class: cls[i] || '' }, x)))), h('tbody', {}, rows));
    return t;
  }
  function render() {
    U = universe({ T: st.T + 273.15 });
    cur = evaluate(st.sel, U.opts);
    locksMap = {}; for (const [s] of SLOTS) if (st.locks[s]) locksMap[s] = st.sel[s];
    const w = weights01(); ranked = scored(U, w, locksMap);
    for (const [k, b] of Object.entries(presetBtns)) b.classList.toggle('on', st.preset === k);
    // slots
    for (const [slot, , cat] of SLOTS) {
      const u = slotUI[slot], part = cat[st.sel[slot]]; u.sel.value = st.sel[slot]; u.lock.set(!!st.locks[slot]); u.box.classList.toggle('locked', !!st.locks[slot]);
      let cost = '';
      if (cur && cur.valid) {
        const D = slot === 'comp' ? cur.D2 : cur.Dt, pr = typeof part.price === 'function' ? part.price(slot === 'comp' ? cur.D2 : cur.Dt) : part.price, hr = typeof part.hours === 'function' ? part.hours(D) : part.hours;
        cost = `$${pr.toFixed(pr < 10 ? 1 : 0)} · ${hr.toFixed(hr < 10 ? 1 : 0)} h · skill ${part.skill}  ·  `;
      } else cost = `skill ${part.skill}  ·  `;
      let extra = '';
      if (slot === 'comp' && cur && cur.valid) extra = ` Wheel in this casing: Ø${cur.D2.toFixed(0)} mm.`;
      u.info.textContent = cost + part.note + extra;
    }
    // readouts
    if (cur.valid) {
      ro.F.set(cur.F.toFixed(0)); ro.mf.set(cur.mf.toFixed(1)); ro.N.set((cur.N / 1000).toFixed(0)); ro.T.set((cur.T03 - 273.15).toFixed(0), cur.T03 - 273.15 > 830 ? 'bad' : 'fuel');
      ro.price.set(cur.price.toFixed(0)); ro.hours.set(cur.hours.toFixed(0)); ro.skill.set(String(cur.skill)); ro.skill.el.title = SKILL[cur.skill];
      ro.life.set(fmtLife(cur.life), cur.life < 5 ? 'bad' : cur.life < 30 ? 'fuel' : 'good'); ro.mass.set(cur.mass.toFixed(2)); ro.vol.set(cur.vol.toFixed(1)); ro.dens.set(cur.density.toFixed(0));
      ro.vmax.set(cur.vmax ? cur.vmax.toFixed(0) : '–'); ro.range.set(cur.range ? cur.range.toFixed(0) : '–'); ro.score.set(score(cur).toFixed(0));
    } else Object.values(ro).forEach(r => r.set('–'));
    renderVerdict(); renderBest(); renderSwaps(); renderRank();
    pSide.redraw(); drawScatter();
  }

  function renderVerdict() {
    verdict.innerHTML = ''; verdict.className = 'wb-verdict';
    if (!cur.valid) { verdict.classList.add('bad'); verdict.append(cur.why); return; }
    const b = ranked[0], mine = score(cur), items = [];
    if (cur.warn.length) verdict.classList.add('warn');
    if (b) {
      const same = sameSel(b.d.sel, st.sel), gain = b.sc - mine;
      if (same) items.push(h('li', {}, h('b', {}, 'You are at the optimum '), 'for these goals and your locked parts (score ' + mine.toFixed(0) + '/100).'));
      else {
        const diff = SLOTS.filter(([s]) => b.d.sel[s] !== st.sel[s]).map(([s, , cat]) => cat[b.d.sel[s]].tag);
        items.push(h('li', {}, h('b', {}, 'Best for your goals with the parts you kept: '), partsText(b.d.sel), ` (score ${b.sc.toFixed(0)} vs your ${mine.toFixed(0)}). Change: ${diff.join(', ')}. `, button('Use it', () => { Object.assign(st.sel, b.d.sel); render(); }, 'small')));
        if (gain < 0.5) items[items.length - 1].append(' (a tie: your design is just as good on this scale.)');
      }
    }
    const weakHint = { 'casing / liner': 'a thicker or higher-melting casing (steel tin, flask liner, steel pipe) or a cooler running temperature', 'turbine wheel': 'a superalloy or scrap-turbo turbine wheel, or a cooler running temperature', bearings: 'better bearings (ceramic) or a lower shaft speed' };
    items.push(h('li', {}, h('b', {}, 'Weakest link: '), cur.weak + ` (about ${fmtLife(cur.life)} at full power). To last longer you would want ${weakHint[cur.weak]}.`));
    const lim = { 'bearing speed': 'The bearings cap the speed: better ones would let it spin faster for more thrust.', 'wheel tip speed': 'The compressor wheel’s tip-speed limit caps the speed (stronger wheel, or a smaller engine).', 'turbine-inlet temperature setting': 'It is running right at your temperature setting; the speed is set by that, not by a mechanical limit.', 'self-sustaining minimum': 'It runs at the coolest temperature at which it can still turn its own compressor.', 'tabulated range': 'It is at the top of the tabulated speed range.' }[cur.limit];
    if (lim) items.push(h('li', {}, lim));
    for (const wn of cur.warn) items.push(h('li', {}, h('b', { style: { color: 'var(--warn)' } }, 'Warning: '), wn));
    verdict.append(h('ul', { style: { margin: 0, paddingLeft: '1.2em' } }, items));
  }

  function renderBest() {
    const rows = Object.entries(GOALS).map(([k, g]) => {
      const r = bestFor(U, k, locksMap); if (!r) return h('tr', {}, h('td', { colspan: 4 }, g.name + ': nothing fits'));
      const d = r.d, isCur = sameSel(d.sel, st.sel), val = METRICS[{ price: 'price', ease: 'hours', density: 'density', speed: 'vmax', range: 'range', life: 'life' }[k]];
      return h('tr', { class: 'pick' + (isCur ? ' cur' : ''), onclick: () => { Object.assign(st.sel, d.sel); render(); }, title: 'Load this design' },
        h('td', {}, h('b', {}, g.name)), h('td', {}, partsText(d.sel)), h('td', { class: 'num' }, d.F.toFixed(0) + ' N'), h('td', { class: 'num' }, val.fmt(val.get(d))));
    });
    bestBox.innerHTML = ''; bestBox.append(table(['Goal', 'Casing + compressor + turbine + bearings + fuel', 'Thrust', 'Value'], rows, ['', '', 'num', 'num']));
  }

  function renderSwaps() {
    swapBox.innerHTML = '';
    if (!cur.valid) { swapBox.append(h('p', { style: { padding: '8px 10px', margin: 0 } }, 'Fix the combination first.')); return; }
    const sw = swapSuggestions(U, st.sel, weights01()).swaps, pos = sw.filter(s => s.gain > 0.4).slice(0, 5);
    const rows = pos.map(s => {
      const d = s.d, dF = d.F - cur.F, dP = d.price - cur.price, dH = d.hours - cur.hours, dL = d.life / cur.life, cat = SLOTS.find(x => x[0] === s.slot);
      const lifeTxt = dL >= 1.1 ? '×' + (dL >= 10 ? dL.toFixed(0) : dL.toFixed(1)) : dL <= 0.9 ? '×' + dL.toFixed(2) : '≈';
      return h('tr', { class: 'pick', onclick: () => { st.sel[s.slot] = s.key; st.locks[s.slot] = true; render(); }, title: 'Make this swap' },
        h('td', {}, h('b', {}, cat[1] + ' → ' + cat[2][s.key].tag)),
        h('td', { class: 'num pos' }, '+' + s.gain.toFixed(1)),
        h('td', { class: 'num ' + (dF >= 0 ? 'pos' : 'neg') }, sgn(dF) + ' N'), h('td', { class: 'num ' + (dP <= 0 ? 'pos' : 'neg') }, sgn(dP).replace(/(\d)/, '$$$1')),
        h('td', { class: 'num ' + (dH <= 0 ? 'pos' : 'neg') }, sgn(dH) + ' h'), h('td', { class: 'num ' + (dL >= 1 ? 'pos' : 'neg') }, lifeTxt));
    });
    if (!rows.length) swapBox.append(h('p', { style: { padding: '8px 10px', margin: 0, fontSize: '.86rem' } }, 'No single swap raises your score for these goals: any change of one part trades something you value for something you do not. (A change of two parts at once might; use the button above.)'));
    else swapBox.append(table(['Swap one part', 'Score', 'Thrust', 'Price', 'Build', 'Life'], rows, ['', 'num', 'num', 'num', 'num', 'num']));
  }

  function renderRank() {
    const rows = ranked.slice(0, 10).map((r, i) => {
      const d = r.d, isCur = sameSel(d.sel, st.sel);
      return h('tr', { class: 'pick' + (isCur ? ' cur' : ''), onclick: () => { Object.assign(st.sel, d.sel); render(); }, title: 'Load this design' },
        h('td', { class: 'num' }, i + 1), h('td', {}, partsText(d.sel)), h('td', { class: 'num' }, d.F.toFixed(0) + ' N'), h('td', { class: 'num' }, '$' + d.price.toFixed(0)), h('td', { class: 'num' }, d.hours.toFixed(0) + ' h'),
        h('td', { class: 'num' }, fmtLife(d.life)), h('td', { class: 'num' }, d.vmax + ' m/s'), h('td', { class: 'num' }, d.range.toFixed(0) + ' km'), h('td', { class: 'num' }, r.sc.toFixed(0)));
    });
    rankBox.innerHTML = '';
    if (!rows.length) rankBox.append(h('p', { style: { padding: '8px 10px', margin: 0 } }, 'No viable design with these locked parts at this temperature: unlock a slot or raise the temperature.'));
    else rankBox.append(table(['#', 'Casing + compressor + turbine + bearings + fuel', 'Thrust', 'Price', 'Build', 'Life', 'Speed*', 'Range*', 'Score'], rows, ['num', '', 'num', 'num', 'num', 'num', 'num', 'num', 'num']));
  }

  syncWeights(); render();
}
