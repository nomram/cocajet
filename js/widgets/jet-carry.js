// What can a jet engine carry? Straight up (thrust against weight) versus sideways (thrust against drag, lift from a wing), and how both change with height.
import { h, shell, slider, select, button, readout, legend } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

const G = 9.80665, P0 = 101325, RHO0 = isa(0).rho;
/* Engine presets.  Jets: F = F0 (ρ/ρ0)^n (1 − a·M)   (rule of thumb: thrust follows air density, and falls as flight speed rises); fuel flow = TSFC·F with TSFC = c0 (T/T0)^th (1 + kM·M).
   Rocket: F = F_vac − p·A_e (no dependence on density or speed); fuel flow = F / (Isp g0).  Airframe values are typical for the class. */
const ENG = {
  cj1: { nm: 'CJ-1 turbojet (this guide)', sh: 'CJ-1 turbojet', F0: 58, m: 1.1, c0: 2.86e-3 / 58, n: 0.9, a: 0.7, kM: 0.68, th: 0, jet: true, S: 1.1, AR: 5.5, CD0: 0.030, e: 0.8, CLmax: 1.4, Mcrit: 0.65, mass: 25, alt: 0, str: 25, fuel: 15, ac: 'a model-aircraft airframe' },
  hobby: { nm: 'Larger hobby turbojet (220 N class)', sh: 'Hobby turbojet, 220 N', F0: 220, m: 3.5, c0: 0.14 / 3600, n: 0.9, a: 0.7, kM: 0.6, th: 0, jet: true, S: 3, AR: 6, CD0: 0.028, e: 0.8, CLmax: 1.4, Mcrit: 0.65, mass: 90, alt: 0, str: 25, fuel: 15, ac: 'a large model or ultralight' },
  fan: { nm: 'Airliner: two CFM56-class turbofans', sh: 'Airliner, 2 turbofans', F0: 240e3, m: 4730, c0: 0.0388 / 3600, n: 0.8, a: 0.62, kM: 1.21, th: 0.5, jet: true, S: 125, AR: 9.5, CD0: 0.022, e: 0.85, CLmax: 1.4, Mcrit: 0.78, mass: 70000, alt: 11, str: 28, fuel: 25, ac: 'a 70 t narrow-body airliner' },
  rocket: { nm: 'Rocket for contrast: Merlin-class, 845 kN', sh: 'Rocket, Merlin class', F0: 845e3, Fvac: 914e3, m: 470, c0: 1 / (282 * G), IspSl: 282, IspVac: 311, jet: false, S: 60, AR: 4, CD0: 0.04, e: 0.8, CLmax: 1.2, Mcrit: 0.8, mass: 20000, alt: 0, str: 15, fuel: 45, ac: 'a winged rocket-plane' },
};
const KEYS = ['cj1', 'hobby', 'fan', 'rocket'];

/* ---------- the physics (exported so the numbers can be checked without the page) ---------- */
export function thrust(E, hm, V) {
  const A = isa(hm);
  if (!E.jet) return E.Fvac - A.P * (E.Fvac - E.F0) / P0;
  return E.F0 * Math.pow(A.rho / RHO0, E.n) * Math.max(0, 1 - E.a * V / A.a);
}
export function tsfc(E, hm, V) {                                  // kg of fuel per newton per second
  const A = isa(hm);
  if (!E.jet) return 1 / ((E.IspVac - (E.IspVac - E.IspSl) * A.P / P0) * G);
  return E.c0 * Math.pow(A.T / 288.15, E.th) * (1 + E.kM * V / A.a);
}
const wave = (M, Mc) => 20 * Math.pow(Math.max(0, M - Mc), 4);                  // drag rise above the critical Mach number
export const LDmax = (E) => 0.5 * Math.sqrt(Math.PI * E.AR * E.e / E.CD0);
export function drag(E, hm, V, W) {
  const A = isa(hm), q = 0.5 * A.rho * V * V, CL = W / (q * E.S), CD = E.CD0 + CL * CL / (Math.PI * E.AR * E.e) + wave(V / A.a, E.Mcrit);
  return { D: q * E.S * CD, CL, CD };
}
/* heaviest aircraft that can hold level flight at speed V and height hm: lift = weight, thrust = drag, CL ≤ CLmax */
function wmax(E, hm, V) {
  const A = isa(hm), q = 0.5 * A.rho * V * V, qS = q * E.S, k = 1 / (Math.PI * E.AR * E.e), spare = thrust(E, hm, V) - qS * (E.CD0 + wave(V / A.a, E.Mcrit));
  return Math.min(spare > 0 ? Math.sqrt(qS / k * spare) : 0, qS * E.CLmax);
}
export function massSide(E, hm) {                                                // heaviest aircraft (kg) wing-borne at this height, and the speed it needs
  const a = isa(hm).a; let best = 0, bv = 0;
  for (let i = 0; i <= 150; i++) { const V = 3 * Math.pow(a * 0.95 / 3, i / 150), w = wmax(E, hm, V); if (w > best) { best = w; bv = V; } }
  return { m: best / G, V: bv };
}
const keyOf = (E) => [E.F0, E.Fvac, E.n, E.a, E.S, E.AR, E.CD0, E.e, E.CLmax, E.Mcrit, E.jet].join('|');
let curve = { key: '', hs: [], ms: [] };
export function sideCurve(E) {                                                   // wing-borne max mass against height, 0-20 km in 200 m steps
  const k = keyOf(E); if (curve.key === k) return curve;
  const hs = [], ms = []; for (let hm = 0; hm <= 20000; hm += 200) { hs.push(hm); ms.push(massSide(E, hm).m); }
  return (curve = { key: k, hs, ms });
}
export function ceilingOf(hs, f, m) {                                          // first height where the max mass falls below m; null = cannot fly even at sea level, Infinity = above 20 km
  if (f[0] < m) return null;
  for (let i = 1; i < f.length; i++) if (f[i] < m) return hs[i - 1] + (f[i - 1] - m) / (f[i - 1] - f[i]) * (hs[i] - hs[i - 1]);
  return Infinity;
}
export function level(E, hm, W) {                                                // everything about level flight at a height and weight
  const A = isa(hm), Vs = Math.sqrt(2 * W / (A.rho * E.S * E.CLmax)), Vtop = A.a * 0.95, n = 220, V = [], Ta = [], D = [], ok = [];
  const v0 = Math.max(0.5, 0.35 * Vs), v1 = Math.max(Vtop, Vs * 1.05);
  let Vmax = null, Vmin = null, bi = -1, bd = Infinity, br = -1, brv = 0;
  for (let i = 0; i <= n; i++) {
    const v = v0 * Math.pow(v1 / v0, i / n), t = thrust(E, hm, v), d = drag(E, hm, v, W).D, fly = v >= Vs && t >= d;
    V.push(v); Ta.push(t); D.push(d); ok.push(fly);
    if (fly) { Vmax = v; if (Vmin == null) Vmin = v; if (v >= Vs && d < bd) { bd = d; bi = i; } const r = v / (tsfc(E, hm, v) * d); if (r > brv) { brv = r; br = i; } }
  }
  return { Vs, V, Ta, D, ok, feasible: Vmax != null, Vmax, Vmin, Vbe: bi >= 0 ? V[bi] : null, Dmin: bi >= 0 ? D[bi] : null, Vbr: br >= 0 ? V[br] : null, M: (v) => v / A.a, a: A.a };
}

/* ---------- formatting ---------- */
const NB = ' ';
const grp = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
const num = (v, d = 3) => { if (!Number.isFinite(v)) return '–'; if (v === 0) return '0'; const x = +v.toPrecision(d); return Math.abs(x) >= 1000 ? grp(x) : String(x); };
const fmtM = (kg, d = 3) => (kg >= 1e6 ? num(kg / 1e6, d) + ' kt' : kg >= 1000 ? num(kg / 1000, d) + ' t' : kg >= 10 ? num(kg, d) + ' kg' : num(kg, Math.min(d, 2)) + ' kg');
const fmtN = (N, d = 3) => (N >= 1e6 ? num(N / 1e6, d) + ' MN' : N >= 1000 ? num(N / 1000, d) + ' kN' : num(N, d) + ' N');
const fmtT = (s) => (!Number.isFinite(s) ? '–' : s >= 7200 ? num(s / 3600, 2) + ' h' : s >= 120 ? Math.round(s / 60) + ' min' : Math.round(s) + ' s');
const fmtH = (m) => (m === null ? 'none' : m === Infinity ? '> 20 km' : (m / 1000).toFixed(1) + ' km');

/* a label next to a point, kept inside the plot and on a faint backing so it stays legible over lines */
function tag(p, px, py, str, { align = 'left', color, size = 10.5, dx = 9, dy = 0 } = {}) {
  const ctx = p.ctx; ctx.save(); ctx.font = '700 ' + size + 'px ui-sans-serif, system-ui, sans-serif'; const w = ctx.measureText(str).width; ctx.restore();
  const lo = p.m.l + 4, hi = p.W - p.m.r - 4; let al = align, x = al === 'left' ? px + dx : px - dx;
  if (al === 'left' && x + w > hi) { al = 'right'; x = px - dx; } else if (al === 'right' && x - w < lo) { al = 'left'; x = px + dx; }
  let x0 = al === 'left' ? x : x - w; x0 = Math.max(lo, Math.min(hi - w, x0));
  const y = Math.max(p.m.t + size, Math.min(p.m.t + p.ih - size, py + dy));
  ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = p.col.bg; ctx.fillRect(x0 - 3, y - size / 2 - 2, w + 6, size + 4); ctx.restore();
  p.ptext(x0, y, str, { color: color || p.col.strong, size, weight: 700, base: 'middle' });
}

export default function init(el) {
  const { body } = shell(el, { title: 'What can a jet engine carry? Up versus sideways', badge: 'Interactive',
    note: 'Rules of thumb used here: a jet’s thrust follows the air density, <b>F ≈ F₀·(ρ/ρ₀)<sup>n</sup>·(1 − a·M)</b> with n ≈ 0.7–0.9 (the CJ-1 dots come from this guide’s own engine model), while a rocket’s thrust does not depend on the air at all (it even rises a little in vacuum). Level flight needs lift = weight and thrust = drag, with the parabolic polar C<sub>D</sub> = C<sub>D0</sub> + C<sub>L</sub>²/(π·AR·e) and extra drag above the critical Mach number; the wing stalls below the speed where C<sub>L</sub> would exceed C<sub>L,max</sub>. The heaviest aircraft that holds level flight at each height is found by scanning every speed. The upward case counts only thrust against weight (no drag). A real take-off also needs thrust to spare to accelerate, and a runway or catapult; the fuel figures are Breguet-style estimates. All masses and airframes are typical, rounded values.' });
  const cv1 = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  let mode = 'side', pre = 'cj1';
  const st = { F0: 58, me: 1.1, m: 25, S: 1.1 };                          // exact values (the log sliders only land on a grid)
  const eng = select({ label: 'Engine', options: [...KEYS.map(k => [k, ENG[k].nm]), ['custom', 'Custom (set thrust and mass below)']], value: 'cj1', onChange: (k) => { if (k !== 'custom') load(k); else upd(); } });
  const mem = { side: 25, up: 4.7 }, setMode = (md) => { if (md === mode) return; mem[mode] = st.m; mode = md; st.m = mem[md]; sM.set(st.m); upd(); };
  const bUp = button('Straight up (hover / climb)', () => setMode('up'), 'small'), bSide = button('Sideways (wing-borne level flight)', () => setMode('side'), 'small');
  const sF = slider({ label: 'Engine thrust (sea level, static)', min: 10, max: 1.2e6, step: 1, value: 58, log: true, fmt: v => fmtN(v, 2), onInput: (v) => { st.F0 = v; custom(); } });
  const sMe = slider({ label: 'Engine mass', min: 0.2, max: 6000, step: 0.1, value: 1.1, log: true, fmt: v => fmtM(v, 2), onInput: (v) => { st.me = v; custom(); } });
  const sAlt = slider({ label: 'Height', min: 0, max: 20, step: 0.1, value: 0, unit: 'km', fmt: v => v.toFixed(1), onInput: upd });
  const sM = slider({ label: 'Your aircraft: total mass', min: 0.5, max: 1e6, step: 1, value: 25, log: true, fmt: v => fmtM(v, 2), onInput: (v) => { st.m = v; upd(); } });
  const sStr = slider({ label: 'Structure (airframe, tanks, gear) share of the mass', min: 5, max: 60, step: 1, value: 25, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const sFu = slider({ label: 'Fuel share of the mass', min: 2, max: 60, step: 1, value: 15, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const sAcc = slider({ label: 'Climb acceleration (0 = hover)', min: 0, max: 3, step: 0.05, value: 0, unit: 'g', fmt: v => v.toFixed(2), onInput: upd });
  const sS = slider({ label: 'Wing area S', min: 0.05, max: 1000, step: 0.01, value: 1.1, log: true, unit: 'm²', fmt: v => num(v, 2), onInput: (v) => { st.S = v; upd(); } });
  const sAR = slider({ label: 'Aspect ratio AR (span² ÷ area)', min: 2, max: 20, step: 0.5, value: 5.5, fmt: v => v.toFixed(1), onInput: upd });
  const sCD = slider({ label: 'Zero-lift drag coefficient C_D0', min: 0.01, max: 0.08, step: 0.001, value: 0.03, fmt: v => v.toFixed(3), onInput: upd });
  const sCL = slider({ label: 'Maximum lift coefficient C_L,max', min: 0.8, max: 2.5, step: 0.05, value: 1.4, fmt: v => v.toFixed(2), onInput: upd });
  const ctlUp = h('div', { class: 'ctls' }, sAcc.el), ctlSide = h('div', { class: 'ctls' }, sS.el, sAR.el, sCD.el, sCL.el), ldVal = h('b'), ldOut = h('div', { class: 'widget-note', style: { padding: '2px 0 0' } }, 'Best lift-to-drag ratio of this airframe, $L/D_{max}=\\tfrac12\\sqrt{\\pi\\,AR\\,e/C_{D0}}$: ', ldVal, ' ', h('span'));
  const R = {}; const mk = (k, l, u, c) => (R[k] = readout(l, u, c));
  mk('a', 'Max mass, sideways', '', 'hot'); mk('b', 'Max mass, straight up', '', 'cool'); mk('c', 'Beyond the engine itself', '', 'fuel'); mk('d', 'Payload at that max', '', 'good');
  mk('e', 'Ceiling, your mass', '', 'cool'); mk('f', 'Stall speed', 'm/s', 'cool'); mk('g', 'Top speed', 'm/s', 'cool'); mk('i', 'Best-range speed', 'm/s', 'fuel'); mk('j', 'Endurance on your fuel', '', 'good');
  const ro = h('div', { class: 'readouts' }), css = h('style', {}, '.jc-tab th,.jc-tab td{padding:6px 7px}.jc-tab td:first-child,.jc-tab th:first-child{min-width:128px;position:sticky;left:0;background:var(--panel);z-index:1}');
  const says = h('div', { class: 'callout tip', style: { margin: '14px 0 0' } });
  const tab = h('div', { class: 'table-wrap', style: { marginTop: '14px' } });
  const leg1 = h('div', {}), leg2 = legend([['var(--fire)', 'heaviest aircraft wing-borne (level flight)'], ['var(--air)', 'heaviest aircraft straight up (hover)'], ['var(--warn)', 'your aircraft']]);
  body.append(css, h('div', { class: 'btn-row', style: { marginBottom: '10px' } }, bSide, bUp), eng.el, h('div', { style: { marginTop: '12px' } }, cv1, leg1), h('div', { style: { marginTop: '12px' } }, cv2, leg2), ro,
    h('div', { class: 'wgrid even', style: { marginTop: '14px' } }, h('div', { class: 'ctls' }, sF.el, sMe.el, sAlt.el, sM.el, sStr.el, sFu.el), h('div', {}, ctlUp, ctlSide, ldOut)), says, tab);
  const p1 = new Plot(cv1, { xmin: 0, xmax: 100, ymin: 0, ymax: 100, aspect: 2.1, minHeight: 270, xlabel: 'airspeed (m/s)', ylabel: 'force (N)', margin: { l: 58, r: 12, t: 26, b: 42 } });
  const p2 = new Plot(cv2, { xmin: 0, xmax: 20, ymin: 0, ymax: 100, aspect: 2.1, minHeight: 270, xlabel: 'height (km)', ylabel: 'heaviest aircraft (kg)', title: 'How much can it hold up at each height?', margin: { l: 58, r: 12, t: 26, b: 42 } });

  function load(k) {
    const P = ENG[k]; pre = k; mem.side = P.mass; mem.up = +(0.8 * (P.jet ? P.F0 : P.F0) / G).toPrecision(2); Object.assign(st, { F0: P.F0, me: P.m, m: mem[mode], S: P.S }); sF.set(P.F0); sMe.set(P.m); sS.set(P.S); sAR.set(P.AR); sCD.set(P.CD0); sCL.set(P.CLmax); sM.set(st.m); sAlt.set(P.alt); sStr.set(P.str); sFu.set(P.fuel); sAcc.set(0); eng.set(k); upd();
  }
  function custom() { eng.set('custom'); upd(); }
  const E_ = () => { const P = ENG[pre], F0 = st.F0; return { ...P, F0, Fvac: P.jet ? 0 : P.Fvac * F0 / P.F0, m: st.me, S: st.S, AR: sAR.get(), CD0: sCD.get(), CLmax: sCL.get() }; };
  const cjMemo = new Map();
  const cjModel = (hm, V) => { const key = hm + '|' + V; if (!cjMemo.has(key)) { let t = null; try { const g = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(hm), { V0: V }); t = Number.isFinite(g.thrust) ? g.thrust : null; } catch (e) { t = null; } cjMemo.set(key, t); } return cjMemo.get(key); };
  const useCJ = () => eng.get() === 'cj1';

  function upd() {
    const E = E_(), side = mode === 'side', hm = sAlt.get() * 1000, m = st.m, W = m * G, acc = side ? 0 : sAcc.get(), str = sStr.get() / 100, fu = sFu.get() / 100, ld = LDmax(E);
    bSide.classList.toggle('on', side); bUp.classList.toggle('on', !side); ctlUp.style.display = side ? 'none' : ''; ctlSide.style.display = side ? '' : 'none';
    const Tv = (hh) => thrust(E, hh, 0), mUp = (hh) => Tv(hh) / (G * (1 + acc));
    const cur = sideCurve(E), ms = massSide(E, hm), mvH = mUp(hm), mvSL = mUp(0);
    const pay = (mm) => mm * (1 - str - fu) - E.m, c0 = tsfc(E, hm, 0);
    const lv = level(E, hm, W), mUpArr = cur.hs.map(x => mUp(x)), cSide = ceilingOf(cur.hs, cur.ms, m), cUp = ceilingOf(cur.hs, mUpArr, m);
    ldVal.textContent = ld.toFixed(1); ldOut.lastChild.textContent = '(Oswald efficiency e = ' + E.e + '; critical Mach number ≈ ' + E.Mcrit + ', above which drag climbs steeply).';
    // ---- readouts
    const lab = (k, t, u = '') => { R[k].el.querySelector('.k').textContent = t; R[k].el.querySelector('.u').textContent = u; };
    if (side) {
      const upM = Tv(hm) / G;
      lab('a', 'Max mass sideways' + (upM > 0 ? ' (' + num(ms.m / upM, 2) + '× up)' : '')); lab('b', 'Max mass, straight up'); lab('d', 'Payload at the sideways max'); lab('e', 'Ceiling for your mass'); lab('f', 'Stall speed (your mass)', 'm/s'); lab('g', 'Top speed (your mass)', 'm/s'); lab('i', 'Best-range speed', 'm/s'); lab('j', 'Endurance on your fuel');
      R.a.set(fmtM(ms.m), 'hot'); R.b.set(fmtM(upM)); R.d.set(pay(ms.m) > 0 ? fmtM(pay(ms.m)) : 'none', pay(ms.m) > 0 ? 'good' : 'bad');
      R.e.set(fmtH(cSide), cSide === null ? 'bad' : 'cool'); R.f.set(num(lv.Vs, 3)); R.g.set(lv.feasible ? num(lv.Vmax, 3) : 'cannot fly', lv.feasible ? 'cool' : 'bad'); if (!lv.feasible) R.g.el.querySelector('.u').textContent = ''; R.i.set(lv.Vbr ? num(lv.Vbr, 3) : '–');
      const LDnow = lv.Dmin ? W / lv.Dmin : ld, cBr = lv.Vbr ? tsfc(E, hm, lv.Vbr) : c0;
      R.j.set(lv.feasible ? fmtT(Math.log(1 / (1 - fu)) * LDnow / (cBr * G)) : '–');
    } else {
      lab('a', 'Max mass, straight up'); lab('b', 'Max mass, sideways'); lab('c', 'Beyond the engine itself'); lab('d', 'Payload after structure and fuel'); lab('e', 'Hover ceiling, your mass'); lab('g', 'Fuel flow, full thrust'); lab('i', 'Hover time on your fuel'); lab('j', 'Same fuel, wing-borne');
      R.a.set(fmtM(mvH), 'cool'); R.b.set(fmtM(ms.m)); R.c.set(mvH > E.m ? fmtM(mvH - E.m) : 'none', mvH > E.m ? 'fuel' : 'bad'); R.d.set(pay(mvH) > 0 ? fmtM(pay(mvH)) : 'none', pay(mvH) > 0 ? 'good' : 'bad');
      R.e.set(cUp === null ? 'cannot hover' : fmtH(cUp), cUp === null ? 'bad' : 'cool'); R.g.set(num(c0 * Tv(hm) * 60, 3) + ' kg/min');
      const hov = W * (1 + acc) <= Tv(hm); R.i.set(hov ? fmtT(Math.log(1 / (1 - fu)) / (c0 * G * (1 + acc))) : 'cannot hover', hov ? 'good' : 'bad');
      R.j.set(lv.feasible && lv.Dmin ? fmtT(Math.log(1 / (1 - fu)) * (W / lv.Dmin) / (tsfc(E, hm, lv.Vbe) * G)) : '–');
    }
    ro.replaceChildren(...(side ? ['a', 'b', 'd', 'e', 'f', 'g', 'i', 'j'] : ['a', 'b', 'c', 'd', 'e', 'g', 'i', 'j']).map(k => R[k].el));
    // ---- plot 1
    let c;
    if (side) {
      const xmax = lv.feasible ? Math.min(lv.a * 0.97, Math.max(lv.Vmax * 1.3, lv.Vs * 2.2)) : Math.min(lv.a * 0.97, lv.Vs * 3), T0 = thrust(E, hm, 0);
      const step = xmax > 400 ? 100 : xmax > 160 ? 50 : xmax > 70 ? 20 : xmax > 30 ? 10 : 5, xm = Math.ceil(xmax / step) * step;
      const idx = lv.V.map((v, i) => i).filter(i => lv.V[i] <= xm), Vs = idx.map(i => lv.V[i]), Ta = idx.map(i => lv.Ta[i]), D = idx.map(i => lv.D[i]);
      const dmin = lv.Dmin || Math.min(...D), ymax = 1.12 * Math.max(T0, 1.45 * dmin, ...Ta.slice(0, 1));
      p1.set({ xmin: 0, xmax: xm, ymin: 0, ymax, title: p1.W < 480 ? 'Thrust vs speed, ' + (hm / 1000).toFixed(0) + ' km, ' + fmtM(m, 2) : 'Thrust available and thrust required at ' + (hm / 1000).toFixed(1) + ' km, ' + fmtM(m, 2), xlabel: 'airspeed (m/s)', ylabel: 'force (N)' });
      c = p1.begin().col; p1.axes(); p1.clip(true);
      p1.band(0, lv.Vs, { color: c.bad, alpha: 0.12 });
      const fx = [], fa = [], fd = []; idx.forEach(i => { if (lv.ok[i]) { fx.push(lv.V[i]); fa.push(lv.Ta[i]); fd.push(lv.D[i]); } });
      if (fx.length > 1) p1.area(fx, fd, fa, { color: c.ok, alpha: 0.22 });
      const dx = Vs.filter((v) => v >= lv.Vs), dd = D.slice(Vs.length - dx.length), dlo = Vs.filter(v => v <= lv.Vs * 1.02), dlD = D.slice(0, dlo.length);
      p1.line(dlo, dlD, { color: c.air, width: 2, dash: [4, 4], alpha: 0.8 }); p1.line(dx, dd, { color: c.air, width: 3.2 });
      p1.line(Vs, Ta, { color: c.fire, width: 3.2 });
      p1.clip(false);
      p1.ptext(p1.X(0) + 6, p1.m.t + 4, 'below stall speed', { color: c.bad, size: 10.5, weight: 700 });
      p1.vline(lv.Vs, { color: c.bad, dash: [4, 3], width: 1.2 });
      if (lv.feasible) {
        p1.dot(lv.Vmax, thrust(E, hm, lv.Vmax), { color: c.fire, r: 5 }); tag(p1, p1.X(lv.Vmax), p1.Y(thrust(E, hm, lv.Vmax)), 'top speed ' + num(lv.Vmax, 3) + ' m/s', { align: 'right', dy: -15 });
        p1.dot(lv.Vbe, lv.Dmin, { color: c.air, r: 5 }); tag(p1, p1.X(lv.Vbe), p1.Y(lv.Dmin), 'min. drag ' + fmtN(lv.Dmin) + ' = weight ÷ ' + num(W / lv.Dmin, 3), { align: 'left', dy: 17 });
      } else p1.ptext(p1.m.l + p1.iw / 2, p1.m.t + p1.ih * 0.35, 'No level flight possible: the engine never makes enough thrust', { color: c.bad, size: 11.5, weight: 800, align: 'center' });
      if (useCJ()) { const xs = [], ys = []; for (let v = 0; v <= Math.min(xm, 100); v += 20) { const t = cjModel(Math.round(hm / 100) * 100, v); if (t != null) { xs.push(v); ys.push(t); } } if (xs.length) p1.points(xs, ys, { color: c.warn, r: 3.5, stroke: c.strong }); }
      leg1.replaceChildren(legend([['var(--fire)', 'thrust available'], ['var(--air)', 'thrust required (drag in level flight)'], ['var(--ok)', 'speeds where it can fly'], ['var(--bad)', 'below stall speed'], ...(useCJ() ? [['var(--warn)', 'dots: the guide’s engine model']] : [])]));
    } else {
      const xs = [], ys = []; for (let a = 0; a <= 20; a += 0.5) { xs.push(a); ys.push(Tv(a * 1000)); }
      const Wn = W * (1 + acc), ymax = 1.15 * Math.max(Tv(0), Wn);
      p1.set({ xmin: 0, xmax: 20, ymin: 0, ymax, title: p1.W < 480 ? 'Thrust vs weight, straight up' : 'Thrust against weight, straight up', xlabel: 'height (km)', ylabel: 'force (N)' });
      c = p1.begin().col; p1.axes(); p1.clip(true);
      p1.area(xs.filter((x, i) => ys[i] >= Wn), xs.filter((x, i) => ys[i] >= Wn).map(() => Wn), ys.filter(y => y >= Wn), { color: c.ok, alpha: 0.2 });
      p1.line(xs, ys, { color: c.fire, width: 3.2 }); p1.clip(false);
      p1.hline(Wn, { color: c.warn, width: 2, dash: [6, 4] });
      tag(p1, p1.X(20), p1.Y(Wn), 'weight to hold up ' + fmtN(Wn), { align: 'right', color: c.warn, dx: 4, dy: -12 });
      p1.dot(hm / 1000, Tv(hm), { color: c.fire, r: 5 });
      if (cUp != null && cUp !== Infinity) { p1.dot(cUp / 1000, Wn, { color: c.strong, r: 5 }); tag(p1, p1.X(cUp / 1000), p1.Y(Wn), 'hover ceiling ' + (cUp / 1000).toFixed(1) + ' km', { align: 'left', dy: 16 }); }
      if (Wn > Tv(0)) p1.ptext(p1.m.l + p1.iw / 2, p1.m.t + p1.ih * 0.45, 'Too heavy: the engine cannot lift it off the ground', { color: c.bad, size: 11.5, weight: 800, align: 'center' });
      if (useCJ()) { const px = [], py = []; for (let a = 0; a <= 12; a += 2) { const t = cjModel(a * 1000, 0); if (t != null) { px.push(a); py.push(t); } } if (px.length) p1.points(px, py, { color: c.warn, r: 3.5, stroke: c.strong }); }
      leg1.replaceChildren(legend([['var(--fire)', 'thrust available'], ['var(--warn)', 'weight to hold up (+ climb)'], ['var(--ok)', 'thrust to spare'], ...(useCJ() ? [['var(--warn)', 'dots: the guide’s engine model']] : [])]));
    }
    // ---- plot 2
    const hsK = cur.hs.map(x => x / 1000), ymax2 = 1.12 * Math.max(...cur.ms, ...mUpArr, m * 1.05);
    p2.set({ ymax: ymax2, title: p2.W < 480 ? 'Max mass at each height' : 'How much can it hold up at each height?' }); c = p2.begin().col; p2.axes(); p2.clip(true);
    p2.area(hsK, cur.hs.map(() => 0), mUpArr, { color: c.air, alpha: 0.12 }); p2.area(hsK, mUpArr, cur.ms.map((v, i) => Math.max(v, mUpArr[i])), { color: c.fire, alpha: 0.1 });
    p2.line(hsK, mUpArr, { color: c.air, width: 3 }); p2.line(hsK, cur.ms, { color: c.fire, width: 3.2 }); p2.hline(m, { color: c.warn, width: 2, dash: [6, 4] }); p2.clip(false);
    p2.vline(hm / 1000, { color: c.muted, dash: [3, 4] }); p2.dot(hm / 1000, ms.m, { color: c.fire, r: 5 }); p2.dot(hm / 1000, mUp(hm), { color: c.air, r: 5 });
    tag(p2, p2.X(0), p2.Y(m), 'your aircraft ' + fmtM(m, 2), { align: 'left', color: c.warn, dx: 6, dy: -11 });
    if (cSide != null && cSide !== Infinity) { p2.dot(cSide / 1000, m, { color: c.fire, r: 6 }); tag(p2, p2.X(cSide / 1000), p2.Y(m), 'sideways ceiling ' + (cSide / 1000).toFixed(1) + ' km', { align: 'left', dy: 17 }); }
    if (cUp != null && cUp !== Infinity && cUp / 1000 > 0.2) { p2.dot(cUp / 1000, m, { color: c.air, r: 6 }); tag(p2, p2.X(cUp / 1000), p2.Y(m), 'hover ceiling ' + (cUp / 1000).toFixed(1) + ' km', { align: 'left', dy: -15 }); }
    // ---- the sentence about the CJ-1, and the comparison table (presets are fixed, so it is computed once)
    if (!says.firstChild) {
      const cj = ENG.cj1, cjUp = thrust(cj, 0, 0) / G, cjSide = massSide(cj, 0).m, fr = (km) => thrust(cj, km * 1000, 0) / thrust(cj, 0, 0), cc = sideCurve(cj), c25 = ceilingOf(cc.hs, cc.ms, 25);
      says.innerHTML = '<span class="ct">What this means for the CJ-1</span>The same 58 N engine holds up only <b>≈ ' + num(cjUp, 2) + ' kg</b> straight up (about ' + num(cjUp - cj.m, 2) + ' kg beyond its own 1.1 kg), but it can keep <b>≈ ' + num(cjSide, 2) + ' kg</b> of well-designed, glider-like aircraft flying level at low height, about ' + num(cjSide / cjUp, 2) + ' times more: sideways the thrust only has to beat the drag, T = W ÷ (L/D), not the whole weight. Height costs it dearly: at 8 km its thrust has fallen to ' + Math.round(fr(8) * 100) + ' % and at 10 km to ' + Math.round(fr(10) * 100) + ' %, a third to a half, so a 25 kg aircraft tops out near ' + (c25 / 1000).toFixed(0) + ' km. A complete model jet of this size usually weighs only a few kilograms, nowhere near these limits, and it needs a runway or a catapult, because level flight needs speed.';
      const rows = KEYS.map(k => { const P = ENG[k], up = thrust(P, 0, 0) / G, sd = massSide(P, 0).m, q = sideCurve(P), cc2 = ceilingOf(q.hs, q.ms, P.mass); return '<tr data-k="' + k + '" style="cursor:pointer"><td><b>' + P.sh + '</b></td><td class="num">' + fmtN(P.F0) + '</td><td class="num">' + fmtM(P.m) + '</td><td class="num">' + num(P.F0 / (P.m * G), 3) + '</td><td class="num">' + fmtM(up) + '</td><td class="num">' + fmtM(sd) + '</td><td class="num">' + num(sd / up, 3) + '</td><td class="num" style="white-space:nowrap">' + fmtM(P.mass) + ' → ' + fmtH(cc2) + '</td></tr>'; }).join('');
      tab.innerHTML = '<table class="data jc-tab" style="font-size:.82rem"><caption style="caption-side:bottom;text-align:left;padding:6px 12px;font-size:.78rem;color:var(--muted)">Sea level, each engine with its own typical airframe. “Up” = F ÷ g; “sideways” = the heaviest aircraft that holds level flight. Tap a row to load that engine. The rocket looks strong on paper, but it burns 7–30 times the propellant per newton of the jets and, carrying that much, is out of propellant in a minute or so.</caption><tr><th>Engine</th><th class="num">Thrust</th><th class="num">Engine mass</th><th class="num">Engine T/W</th><th class="num">Up: max mass</th><th class="num">Sideways: max mass</th><th class="num">Ratio</th><th class="num">Typical aircraft → ceiling</th></tr>' + rows + '</table>';
      tab.querySelectorAll('tr[data-k]').forEach(tr => tr.addEventListener('click', () => load(tr.dataset.k)));
      says.append(''); 
    }
    tab.querySelectorAll('tr[data-k]').forEach(tr => { tr.style.background = tr.dataset.k === eng.get() ? 'color-mix(in srgb,var(--air) 12%,var(--panel))' : ''; });
  }
  p1.onDraw(upd); p2.onDraw(upd);
  load('cj1');
}
