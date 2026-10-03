// The Brayton cycle (the jet engine's cycle): P–V ("curved rectangle") and T–s diagrams, ideal vs real.
import { h, shell, slider, button, readout, toggle } from '../ui.js';
import { Plot } from '../plot.js';

const R = 287.05, g = 1.4, cp = 1005, k = (g - 1) / g, P1 = 101325;

function cyc(r, T1, T3, ec, et) {
  const T2s = T1 * Math.pow(r, k), T2 = T1 + (T2s - T1) / ec;
  const T4s = T3 / Math.pow(r, k), T4 = T3 - et * (T3 - T4s);
  return { r, T1, T3, T2s, T2, T4s, T4, P2: r * P1 };
}
const sOf = (T, P, T1) => cp * Math.log(T / T1) - R * Math.log(P / P1);

export default function init(el) {
  const { body } = shell(el, { title: 'The Brayton cycle: suck, squeeze, bang, blow', note: 'Solid = ideal cycle (perfect compressor and turbine). Dashed = real cycle with the efficiencies you set. The enclosed area is the net work per kg of air. Curved rectangle on the left, “tilted” loop on the right: same cycle, two views.' });
  const cPV = h('canvas', { class: 'plot' }), cTS = h('canvas', { class: 'plot' }), cW = h('canvas', { class: 'plot' }), cE = h('canvas', { class: 'plot' });
  const sR = slider({ label: 'Pressure ratio  r', min: 1.1, max: 40, step: 0.05, value: 1.95, fmt: v => v.toFixed(2), onInput: upd });
  const sT3 = slider({ label: 'Turbine inlet temperature  T₃', min: 700, max: 2000, step: 10, value: 1070, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sEc = slider({ label: 'Compressor efficiency ηc', min: 0.6, max: 1, step: 0.01, value: 0.78, fmt: v => v.toFixed(2), onInput: upd });
  const sEt = slider({ label: 'Turbine efficiency ηt', min: 0.6, max: 1, step: 0.01, value: 0.80, fmt: v => v.toFixed(2), onInput: upd });
  const play = toggle({ label: 'Animate a parcel of air around the loop', checked: true });
  const ro = { Wc: readout('Compressor work', 'kJ/kg', 'cool'), Wt: readout('Turbine work', 'kJ/kg', 'hot'), Wn: readout('Net work', 'kJ/kg', 'good'), Q: readout('Heat added', 'kJ/kg', 'fuel'), ei: readout('Ideal efficiency', '%', 'cool'), er: readout('Real efficiency', '%', 'good'), bwr: readout('Compressor ÷ turbine work', '%', 'bad') };
  const presets = h('div', { class: 'btn-row' },
    button('Our engine (CJ-1)', () => set(1.95, 1070, 0.78, 0.80), 'small fire'),
    button('Hair-dryer + flame (r = 1.2)', () => set(1.2, 1000, 0.7, 0.75), 'small'),
    button('Old turbojet (r = 8)', () => set(8, 1250, 0.82, 0.88), 'small'),
    button('Airliner (r = 40)', () => set(40, 1800, 0.9, 0.92), 'small'));
  body.append(
    h('div', { class: 'wgrid even' }, cPV, cTS),
    h('div', { class: 'wgrid even', style: { marginTop: '12px' } }, cW, cE),
    h('div', { class: 'wgrid', style: { marginTop: '14px' } }, h('div', { class: 'ctls' }, sR.el, sT3.el, sEc.el, sEt.el, play.el, presets), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  function set(r, T3, ec, et) { sR.set(r); sT3.set(T3); sEc.set(ec); sEt.set(et); upd(); }

  const mk = (c, o) => new Plot(c, Object.assign({ aspect: 1.45, margin: { l: 58, r: 12, t: 28, b: 42 } }, o));
  const pPV = mk(cPV, { xlabel: 'specific volume v (m³/kg)', ylabel: 'pressure P (kPa)', title: 'P–V diagram' });
  const pTS = mk(cTS, { xlabel: 'entropy s (J/kg·K, relative)', ylabel: 'temperature T (K)', title: 'T–s diagram' });
  const pW = mk(cW, { xmin: 1, xmax: 40, ymin: 0, ymax: 450, xlabel: 'pressure ratio r', ylabel: 'net work (kJ/kg)', title: 'Net work: best r depends on T₃', margin: { l: 58, r: 12, t: 28, b: 42 } });
  const pE = mk(cE, { xmin: 1, xmax: 40, ymin: 0, ymax: 70, xlabel: 'pressure ratio r', ylabel: 'thermal efficiency (%)', title: 'Efficiency keeps rising with r', margin: { l: 58, r: 12, t: 28, b: 42 } });

  let tracer = 0, path = null, labels = ['1 → 2  SQUEEZE (compressor)', '2 → 3  BANG (burn fuel)', '3 → 4  BLOW (turbine + nozzle)', '4 → 1  exhaust cools in air'];
  function build(c) {
    const T1 = c.T1, v = (T, P) => R * T / P, pv = [], ts = [], N = 40;
    const push = (arrPV, arrTS, T, P) => { arrPV.push([v(T, P), P / 1000]); arrTS.push([sOf(T, P, T1), T]); };
    // ideal loop in 4 equal-parameter stages
    for (let i = 0; i <= N; i++) { const P = P1 * Math.pow(c.r, i / N); const T = T1 * Math.pow(P / P1, k); push(pv, ts, T, P); }
    for (let i = 1; i <= N; i++) push(pv, ts, c.T2s + (c.T3 - c.T2s) * i / N, c.P2);
    for (let i = 1; i <= N; i++) { const P = c.P2 * Math.pow(1 / c.r, i / N); const T = c.T3 * Math.pow(P / c.P2, k); push(pv, ts, T, P); }
    for (let i = 1; i <= N; i++) push(pv, ts, c.T4s + (T1 - c.T4s) * i / N, P1);
    return { pv, ts };
  }
  function draw() {
    const T1 = 288.15, c = cyc(sR.get(), T1, sT3.get(), sEc.get(), sEt.get());
    const Wc = cp * (c.T2 - T1), Wt = cp * (c.T3 - c.T4), Wn = Wt - Wc, Q = cp * (c.T3 - c.T2);
    const Wci = cp * (c.T2s - T1), Wti = cp * (c.T3 - c.T4s), Wni = Wti - Wci, Qi = cp * (c.T3 - c.T2s);
    ro.Wc.set((Wc / 1000).toFixed(0)); ro.Wt.set((Wt / 1000).toFixed(0)); ro.Wn.set((Wn / 1000).toFixed(0), Wn > 0 ? 'good' : 'bad'); ro.Q.set((Q / 1000).toFixed(0));
    ro.ei.set(((Wni / Qi) * 100).toFixed(1)); ro.er.set(Wn > 0 ? ((Wn / Q) * 100).toFixed(1) : '0', Wn > 0 ? 'good' : 'bad'); ro.bwr.set((Wc / Wt * 100).toFixed(0), Wc / Wt > 0.9 ? 'bad' : 'cool');
    const loops = build(c);
    // ---- P-V ----
    let col = pPV.begin().col;
    const vmax = Math.max(...loops.pv.map(a => a[0])) * 1.1, pmax = c.P2 / 1000 * 1.18;
    pPV.set({ xmin: 0, xmax: vmax, ymin: 0, ymax: pmax }); pPV.axes();
    const px = loops.pv.map(a => a[0]), py = loops.pv.map(a => a[1]);
    // fill ideal loop
    pPV.ctx.save(); pPV.ctx.fillStyle = col.fuel; pPV.ctx.globalAlpha = .22; pPV.ctx.beginPath(); loops.pv.forEach((a, i) => { const X = pPV.X(a[0]), Y = pPV.Y(a[1]); i ? pPV.ctx.lineTo(X, Y) : pPV.ctx.moveTo(X, Y); }); pPV.ctx.closePath(); pPV.ctx.fill(); pPV.ctx.restore();
    pPV.line(px, py, { color: col.air, width: 2.6 });
    // real loop (polytropic through the real end states)
    const v1 = R * T1 / P1, v2 = R * c.T2 / c.P2, v3 = R * c.T3 / c.P2, v4 = R * c.T4 / P1;
    const nC = Math.log(c.r) / Math.log(v1 / v2), nT = Math.log(c.r) / Math.log(v4 / v3);
    const rx = [], ry = [];
    for (let i = 0; i <= 30; i++) { const P = P1 * Math.pow(c.r, i / 30); rx.push(v1 * Math.pow(P1 / P, 1 / nC)); ry.push(P / 1000); }
    for (let i = 1; i <= 30; i++) { rx.push(v2 + (v3 - v2) * i / 30); ry.push(c.P2 / 1000); }
    for (let i = 1; i <= 30; i++) { const P = c.P2 * Math.pow(1 / c.r, i / 30); rx.push(v3 * Math.pow(c.P2 / P, 1 / nT)); ry.push(P / 1000); }
    for (let i = 1; i <= 30; i++) { rx.push(v4 + (v1 - v4) * i / 30); ry.push(P1 / 1000); }
    pPV.line(rx, ry, { color: col.fire, width: 2.2, dash: [6, 4] });
    [['1', v1, P1 / 1000], ['2', v2, c.P2 / 1000], ['3', v3, c.P2 / 1000], ['4', v4, P1 / 1000]].forEach(([n, X, Y]) => pPV.text(X, Y + (n === '1' || n === '4' ? -pmax * 0.05 : pmax * 0.04), n, { color: col.strong, align: 'center', weight: 800 }));
    pPV.legend([[col.air, 'ideal cycle'], [col.fire, 'real cycle', [6, 4]]], { pos: 'tr' });
    // ---- T-s ----
    col = pTS.begin().col;
    const sAll = [...loops.ts.map(a => a[0]), sOf(c.T2, P1, T1) - 0, sOf(c.T4, P1, T1)];
    const smin = Math.min(...sAll) - 60, smax = Math.max(...sAll) + 60, Tmax = Math.max(c.T3, c.T2, c.T4) * 1.1;
    pTS.set({ xmin: smin, xmax: smax, ymin: 200, ymax: Tmax }); pTS.axes();
    pTS.ctx.save(); pTS.ctx.fillStyle = col.fuel; pTS.ctx.globalAlpha = .22; pTS.ctx.beginPath(); loops.ts.forEach((a, i) => { const X = pTS.X(a[0]), Y = pTS.Y(a[1]); i ? pTS.ctx.lineTo(X, Y) : pTS.ctx.moveTo(X, Y); }); pTS.ctx.closePath(); pTS.ctx.fill(); pTS.ctx.restore();
    pTS.line(loops.ts.map(a => a[0]), loops.ts.map(a => a[1]), { color: col.air, width: 2.6 });
    const s2 = sOf(c.T2, c.P2, T1), s3 = sOf(c.T3, c.P2, T1), s4 = sOf(c.T4, P1, T1);
    const tsx = [0], tsy = [T1];
    tsx.push(s2); tsy.push(c.T2);
    for (let i = 1; i <= 30; i++) { const T = c.T2 + (c.T3 - c.T2) * i / 30; tsx.push(sOf(T, c.P2, T1)); tsy.push(T); }
    tsx.push(s4); tsy.push(c.T4);
    for (let i = 1; i <= 30; i++) { const T = c.T4 + (T1 - c.T4) * i / 30; tsx.push(sOf(T, P1, T1)); tsy.push(T); }
    pTS.line(tsx, tsy, { color: col.fire, width: 2.2, dash: [6, 4] });
    [['1', 0, T1 - 20], ['2', s2, c.T2 + 25], ['3', s3, c.T3 + 25], ['4', s4, c.T4 - 25]].forEach(([n, X, Y]) => pTS.text(X, Y, n, { color: col.strong, align: 'center', weight: 800 }));
    pTS.text(smin + (smax - smin) * .03, Tmax * 0.97, 'heat in (burner) ↑', { color: col.fuel, size: 11, base: 'top' });
    // ---- net work and efficiency vs r ----
    col = pW.begin().col; pW.set({ ymax: Math.max(150, Math.ceil(c.T3 / 4 / 50) * 50 + 150) });
    pW.axes();
    const rs = [], wi = [], wr = [], ei = [], er = []; let best = [0, 0];
    for (let q = 1.05; q <= 40; q += 0.25) {
      const cc = cyc(q, T1, c.T3, sEc.get(), sEt.get());
      const w1 = cp * ((cc.T3 - cc.T4s) - (cc.T2s - T1)), w2 = cp * ((cc.T3 - cc.T4) - (cc.T2 - T1)), e1 = w1 / (cp * (cc.T3 - cc.T2s)), e2 = w2 / (cp * (cc.T3 - cc.T2));
      rs.push(q); wi.push(w1 / 1000); wr.push(Math.max(0, w2 / 1000)); ei.push(e1 * 100); er.push(Math.max(0, e2 * 100)); if (w2 > best[1]) best = [q, w2];
    }
    pW.line(rs, wi, { color: col.air, width: 2.4 }); pW.line(rs, wr, { color: col.fire, width: 2.4, dash: [6, 4] });
    pW.vline(c.r, { color: col.strong, dash: [3, 3] }); pW.dot(c.r, Wn / 1000, { color: col.fire });
    pW.text(best[0] + 0.8, best[1] / 1000 + 14, 'most work', { color: col.fuel, align: 'left', size: 11, base: 'bottom' });
    pW.legend([[col.air, 'ideal'], [col.fire, 'real', [6, 4]]], { pos: 'tr' });
    col = pE.begin().col; pE.axes();
    pE.line(rs, ei, { color: col.air, width: 2.4 }); pE.line(rs, er, { color: col.fire, width: 2.4, dash: [6, 4] });
    pE.vline(c.r, { color: col.strong, dash: [3, 3] }); pE.dot(c.r, Wn > 0 ? Wn / Q * 100 : 0, { color: col.fire });
    pE.text(1.8, 62, 'cheap engines live here: r ≈ 2', { color: col.fuel, size: 11, base: 'top' });
    state = { loops, c };
  }
  let state = null;
  function upd() { draw(); }
  [pPV, pTS, pW, pE].forEach(p => p.onDraw(upd));
  upd();
  // tracer animation
  let last = performance.now(), vis = true; new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(cPV);
  function anim(now) {
    requestAnimationFrame(anim); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!vis || !play.get() || !state) return;
    tracer = (tracer + dt * 0.12) % 1;
    draw();
    const n = state.loops.pv.length - 1, i = Math.min(n, Math.floor(tracer * n)), stage = Math.min(3, Math.floor(tracer * 4));
    const a = state.loops.pv[i], b = state.loops.ts[i];
    pPV.dot(a[0], a[1], { color: '#fff', r: 7 }); pTS.dot(b[0], b[1], { color: '#fff', r: 7 });
    pPV.ptext(pPV.m.l + 10, pPV.m.t + 8, labels[stage], { color: pPV.col.fuel, size: 12, weight: 800 });
  }
  requestAnimationFrame(anim);
}
