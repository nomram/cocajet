// Flow around an airfoil: exact potential flow (Joukowski transform) + a simple stall model for the "real world".
import { h, shell, slider, toggle, readout } from '../ui.js';
import { Plot } from '../plot.js';

const c = 1;                                           // Joukowski parameter; chord ≈ 4c
// ---- tiny complex helpers (re, im arrays) ----
const cx = (a, b = 0) => [a, b];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]], sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const mul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
const div = (p, q) => { const d = q[0] * q[0] + q[1] * q[1]; return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d]; };
const abs = (p) => Math.hypot(p[0], p[1]);
const sqrtc = (p) => { const r = Math.sqrt(abs(p)), th = Math.atan2(p[1], p[0]) / 2; return [r * Math.cos(th), r * Math.sin(th)]; };
const expi = (t) => [Math.cos(t), Math.sin(t)];

export default function init(el) {
  const { body } = shell(el, { title: 'How a wing makes lift: flow around an airfoil', note: 'Exact inviscid flow (Joukowski airfoil with the Kutta condition: the flow leaves the sharp trailing edge smoothly). Colours show speed: <span style="color:var(--air)">slow</span> to <span style="color:var(--fire)">fast</span>. Fast air = low pressure on top. Past the stall angle, real air can’t follow the curve and the flow separates. Turn on “real-world stall” to see it.' });
  const flowCv = h('canvas', { class: 'plot', style: { aspectRatio: '1.75', height: 'auto' } });
  const cpCv = h('canvas', { class: 'plot' }), polCv = h('canvas', { class: 'plot' });
  const sA = slider({ label: 'Angle of attack  α', min: -6, max: 22, step: 0.5, value: 5, unit: '°', fmt: v => v.toFixed(1), onInput: setup });
  const sC = slider({ label: 'Camber (curvature)', min: 0, max: 8, step: 0.5, value: 3, unit: '%', fmt: v => v.toFixed(1), onInput: setup });
  const sT = slider({ label: 'Thickness', min: 4, max: 24, step: 1, value: 12, unit: '%', fmt: v => v.toFixed(0), onInput: setup });
  const real = toggle({ label: 'Real-world stall (flow separation)', checked: true, onChange: setup });
  const ro = { CL: readout('Lift coefficient CL', '', 'cool'), CD: readout('Drag coefficient CD', '', 'hot'), LD: readout('Lift ÷ drag', '', 'good'), state: readout('Flow', '', 'fuel') };
  body.append(h('div', {}, flowCv), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sA.el, sC.el, sT.el, real.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))), h('div', {}, cpCv)), h('div', { style: { marginTop: '12px' } }, polCv));

  let zeta0, a, Gam, alpha, beta, chordLen, stalled = false, CLpot = 0, CLreal = 0;
  const NPART = 1100; let parts = [];
  const view = { x0: -4.6, x1: 4.6, y0: -2.55, y1: 2.55 };

  function setup() {
    alpha = sA.get() * Math.PI / 180;
    const eps = sT.get() / 100 / 1.3, y0 = 2 * sC.get() / 100 * c, x0 = -eps * c;
    zeta0 = [x0, y0]; a = Math.hypot(c - x0, y0); beta = Math.asin(y0 / a);
    Gam = 4 * Math.PI * a * Math.sin(alpha + beta);                         // Kutta condition (U = 1)
    // chord length from the profile
    let xmin = 1e9, xmax = -1e9;
    for (let i = 0; i < 200; i++) { const z = jou(add(zeta0, [a * Math.cos(i / 200 * 6.2832), a * Math.sin(i / 200 * 6.2832)])); xmin = Math.min(xmin, z[0]); xmax = Math.max(xmax, z[0]); }
    chordLen = xmax - xmin;
    CLpot = 2 * Gam / chordLen;
    // simple real-world stall model: lift peaks near alpha_stall, then collapses; drag grows
    const aDeg = sA.get(), aS = 13 + 120 * sC.get() / 100 * 0.45 + (sT.get() - 12) * 0.12;
    stalled = real.get() && aDeg > aS;
    const CL0 = CLpot, post = stalled ? Math.max(0.55, 1 - 0.07 * (aDeg - aS)) : 1;
    CLreal = real.get() ? (stalled ? (2 * Math.PI * (aS * Math.PI / 180 + beta) * 8 * a / (2 * chordLen) * 2 / 2 * 1) * 0 + CL0 * post * (aS / aDeg) ** 0.0 : CL0) : CL0;
    if (stalled) CLreal = polarCL(aS) * (1 - 0.09 * (aDeg - aS));
    const CD = 0.008 + 0.0045 * CLreal * CLreal + (stalled ? 0.05 + 0.045 * (aDeg - aS) : 0) + (real.get() ? 0 : -0.008);
    ro.CL.set((real.get() ? CLreal : CLpot).toFixed(2)); ro.CD.set(Math.max(0, CD).toFixed(3)); ro.LD.set(CD > 0.001 ? ((real.get() ? CLreal : CLpot) / CD).toFixed(0) : '∞');
    ro.state.set(stalled ? 'STALLED' : 'attached', stalled ? 'bad' : 'good');
    state.aS = aS; state.CD = CD;
    seed(); drawCp(); drawPolar();
  }
  const state = {};
  function polarCL(aDeg) { // potential CL at a given alpha with the current shape
    const al = aDeg * Math.PI / 180; return 2 * 4 * Math.PI * a * Math.sin(al + beta) / chordLen;
  }
  function jou(zeta) { return add(zeta, div(cx(c * c), zeta)); }
  // velocity at physical point z (returns [u, v] or null if inside body)
  function vel(z) {
    const s = sqrtc(sub(mul(z, z), cx(4 * c * c)));
    let zeta = [(z[0] + s[0]) / 2, (z[1] + s[1]) / 2];
    if (abs(zeta) < c) zeta = [(z[0] - s[0]) / 2, (z[1] - s[1]) / 2];
    const d = sub(zeta, zeta0), r = abs(d);
    if (r < a * 1.0005) return null;
    const dwdz_num = add(sub(expi(-alpha), mul(div(cx(a * a), mul(d, d)), expi(alpha))), div([0, Gam / (2 * Math.PI)], d));
    const dzdzeta = sub(cx(1), div(cx(c * c), mul(zeta, zeta)));
    const w = div(dwdz_num, dzdzeta);
    return [w[0], -w[1]];
  }
  function seed() { parts = []; for (let i = 0; i < NPART; i++) parts.push(respawn({}, true)); }
  function respawn(p, scatter) {
    p.x = scatter ? view.x0 + Math.random() * (view.x1 - view.x0) : view.x0 - Math.random() * 0.4;
    p.y = view.y0 + Math.random() * (view.y1 - view.y0); p.px = p.x; p.py = p.y; p.sp = 1; p.age = Math.random(); return p;
  }
  const fctx = flowCv.getContext('2d');
  function surfacePoints(n = 240) {
    const pts = [];
    for (let i = 0; i < n; i++) { const th = i / n * Math.PI * 2; const z = jou(add(zeta0, [a * Math.cos(th), a * Math.sin(th)])); pts.push({ z, th }); }
    return pts;
  }
  function surfaceCp(n = 260) {
    const up = [], lo = [];
    const thTE = Math.atan2(-zeta0[1], c - zeta0[0]), thLE = Math.atan2(-zeta0[1], -c - zeta0[0]);
    const TWO = Math.PI * 2, span = ((thLE - thTE) % TWO + TWO) % TWO;            // upper surface: theta from TE counter-clockwise to LE
    for (let i = 1; i < n; i++) {
      const th = i / n * TWO, zeta = add(zeta0, [a * Math.cos(th), a * Math.sin(th)]);
      const dzdz = sub(cx(1), div(cx(c * c), mul(zeta, zeta)));
      if (abs(dzdz) < 0.05) continue;
      const d = sub(zeta, zeta0);
      const num = add(sub(expi(-alpha), mul(div(cx(a * a), mul(d, d)), expi(alpha))), div([0, Gam / (2 * Math.PI)], d));
      const V = abs(num) / abs(dzdz), z = jou(zeta), Cp = 1 - V * V;
      const rel = ((th - thTE) % TWO + TWO) % TWO;
      (rel < span ? up : lo).push([0, Cp, z[0], z[1]]);
    }
    return { up, lo };
  }
  let tPrev = performance.now(), vis = true; new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(flowCv);
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(0.04, (now - tPrev) / 1000); tPrev = now; if (!vis) return;
    const w = flowCv.clientWidth, hh = flowCv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (flowCv.width !== Math.round(w * dpr)) { flowCv.width = Math.round(w * dpr); flowCv.height = Math.round(hh * dpr); }
    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue('--bg-2').trim();
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.fillStyle = bg; fctx.globalAlpha = 0.16; fctx.fillRect(0, 0, w, hh); fctx.globalAlpha = 1;
    const X = (x) => (x - view.x0) / (view.x1 - view.x0) * w, Y = (y) => hh - (y - view.y0) / (view.y1 - view.y0) * hh;
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    fctx.lineWidth = 1.6; fctx.lineCap = 'round';
    for (const p of parts) {
      const v = vel([p.x, p.y]);
      if (!v) { respawn(p); continue; }
      let [u, vv] = v;
      // separation: behind the stall point on the upper surface the flow becomes slow and chaotic
      if (stalled && p.y > 0.05 && p.x > -0.4 && p.y < 1.1 + 0.5 * (p.x + 0.4)) { u *= 0.25; vv += (Math.random() - 0.5) * 1.2; }
      const sp = Math.hypot(u, vv), step = 1.9 * dt;
      p.px = p.x; p.py = p.y; p.x += u * step; p.y += vv * step; p.sp = sp;
      if (p.x > view.x1 || p.y > view.y1 + 0.2 || p.y < view.y0 - 0.2 || !isFinite(p.x)) { respawn(p); continue; }
      const t = Math.min(1, Math.max(0, (sp - 0.4) / 1.4));
      const r = Math.round(60 + 195 * t), g = Math.round(180 - 60 * t), b = Math.round(240 - 190 * t);
      fctx.strokeStyle = light ? `rgb(${Math.round(r * .8)},${Math.round(g * .8)},${Math.round(b * .8)})` : `rgb(${r},${g},${b})`;
      fctx.beginPath(); fctx.moveTo(X(p.px), Y(p.py)); fctx.lineTo(X(p.x), Y(p.y)); fctx.stroke();
    }
    // airfoil body
    const pts = surfacePoints(); fctx.beginPath();
    pts.forEach((q, i) => { const x = X(q.z[0]), y = Y(q.z[1]); i ? fctx.lineTo(x, y) : fctx.moveTo(x, y); }); fctx.closePath();
    fctx.fillStyle = light ? '#8a98a8' : '#9aa4ad'; fctx.fill(); fctx.strokeStyle = light ? '#2c3a49' : '#e7edf3'; fctx.lineWidth = 2; fctx.stroke();
    // lift arrow at the quarter chord
    const CLv = real.get() ? CLreal : CLpot, qx = X(-chordLen * 0.25 + 0.0), qy = Y(0);
    fctx.strokeStyle = '#3ddc97'; fctx.fillStyle = '#3ddc97'; fctx.lineWidth = 3.5; fctx.beginPath(); fctx.moveTo(qx, qy); fctx.lineTo(qx, qy - CLv * 52); fctx.stroke();
    fctx.beginPath(); const ty = qy - CLv * 52, sg = Math.sign(CLv) || 1; fctx.moveTo(qx, ty - 9 * sg); fctx.lineTo(qx - 6, ty); fctx.lineTo(qx + 6, ty); fctx.closePath(); fctx.fill();
    fctx.font = '700 12px sans-serif'; fctx.fillStyle = '#3ddc97'; fctx.fillText('lift', qx + 8, qy - CLv * 52 * 0.6);
    fctx.fillStyle = light ? '#2c3a49' : '#cfd9e4'; fctx.fillText('wind →', 12, 20);
    if (stalled) { fctx.fillStyle = '#ff5d5d'; fctx.font = '800 14px sans-serif'; fctx.fillText('STALL: flow separated', X(-0.4), Y(1.5)); }
  }
  // pressure distribution
  const pCp = new Plot(cpCv, { xmin: 0, xmax: 1, ymin: 3, ymax: -4, xlabel: 'position along the chord', ylabel: 'pressure coefficient Cp (suction up)', aspect: 1.25, title: 'Pressure distribution (inviscid)' });
  function drawCp() {
    const col = pCp.begin().col, { up, lo } = surfaceCp();
    pCp.set({ ymin: 1.5, ymax: -Math.max(3, Math.min(8, Math.max(...up.map(q => -q[1])) * 1.1)) });
    pCp.axes();
    const xm = (q) => (q[2] + chordLen / 2) / chordLen;
    // x position normalised: leading edge at min x
    const xs = [...up, ...lo].map(q => q[2]); const xmin = Math.min(...xs), xmax = Math.max(...xs), nx = (x) => (x - xmin) / (xmax - xmin);
    const U = up.slice().sort((p, q) => p[2] - q[2]), Lw = lo.slice().sort((p, q) => p[2] - q[2]);
    pCp.line(U.map(q => nx(q[2])), U.map(q => q[1]), { color: col.air, width: 2.4 });
    pCp.line(Lw.map(q => nx(q[2])), Lw.map(q => q[1]), { color: col.fire, width: 2.4 });
    pCp.hline(0, { color: col.muted });
    pCp.legend([[col.air, 'top surface'], [col.fire, 'bottom surface']], { pos: 'br' });
    pCp.text(0.5, pCp.o.ymax * 0.55, 'area between the curves = lift', { color: col.text, align: 'center', size: 11, bg: true });
  }
  const pPol = new Plot(polCv, { xmin: -6, xmax: 22, ymin: -0.8, ymax: 2.2, xlabel: 'angle of attack α (degrees)', ylabel: 'lift coefficient CL', aspect: 2.8, title: 'CL vs angle of attack: linear, then stall' });
  function drawPolar() {
    const col = pPol.begin().col; pPol.axes();
    const aSt = state.aS, xs = [], pot = [], rl = [];
    for (let d = -6; d <= 22; d += 0.5) { xs.push(d); pot.push(polarCL(d)); rl.push(d <= aSt ? polarCL(d) : polarCL(aSt) * (1 - 0.09 * (d - aSt))); }
    pPol.hline(0, { color: col.muted });
    pPol.line(xs, pot, { color: col.air, width: 2, dash: [5, 4] }); if (real.get()) pPol.line(xs, rl, { color: col.fire, width: 3 });
    pPol.vline(aSt, { color: col.bad, label: 'stall angle ≈ ' + aSt.toFixed(0) + '°' }); pPol.dot(sA.get(), real.get() ? CLreal : CLpot, { color: col.fuel, r: 6 });
    pPol.legend([[col.air, 'ideal flow (never stalls)', [5, 4]], [col.fire, 'real wing']], { pos: 'br' });
  }
  [pCp, pPol].forEach(p => p.onDraw(() => { drawCp(); drawPolar(); }));
  setup(); requestAnimationFrame(frame);
}
