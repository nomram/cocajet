// Hybrid rocket: solid fuel grain + a flowing oxidiser. The fuel burns in a boundary layer over the port wall, so its flow follows the OXIDISER flux.
import { h, shell, slider, select, toggle, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { G0 } from '../rocket-model.js';

const OXI = {
  n2o:  { n: 'nitrous oxide (self-pressurising liquid)', OFopt: 7.0, cs: 1580, tank: 0.80 },
  lox:  { n: 'liquid oxygen (cryogenic)',                 OFopt: 2.3, cs: 1800, tank: 1.14 },
};
const FUEL = {
  slow: { n: 'polymer fuel (slow regression)',   a: 0.028, n_: 0.65, rho: 920 },
  fast: { n: 'wax-like fuel (liquefying, ~3× faster)', a: 0.075, n_: 0.70, rho: 900 },
};
const CF = 1.55, DGRAIN = 0.090;                                   // nozzle thrust coefficient and grain outer diameter (m)

export function fireHybrid({ mox, d0, L, ox, fuel, At, load, thr = 1, blow = false, abort = null }) {
  const O = OXI[ox], F = FUEL[fuel];
  let t = 0, d = d0, used = 0; const dt = 0.01, out = { t: [], d: [], OF: [], mf: [], mo: [], P: [], F: [], Isp: [], cs: [] };
  while (t < 120) {
    const web = (DGRAIN - d) / 2; if (web <= 0.0015) break;
    let mo = mox * thr * (blow ? Math.max(0.35, 1 - 0.35 * used / load) : 1); if (abort != null && t >= abort) mo = 0;
    if (used >= load) break;
    const Gox = mo / (Math.PI / 4 * d * d), rdot = F.a / 1000 * Math.pow(Math.max(Gox, 1), F.n_), mf = F.rho * Math.PI * d * L * rdot, OF = mf > 0 ? mo / mf : 99;
    const r = OF / O.OFopt, pen = r >= 1 ? 0.6 * Math.log(r) ** 2 : 0.45 * Math.log(r) ** 2, cs = O.cs * Math.max(0.5, 1 - pen);
    const mt = mo + mf, P = mt * cs / At, thrust = mo > 0 ? CF * P * At : 0;
    if (out.t.length === 0 || t - out.t[out.t.length - 1] >= 0.05) { out.t.push(t); out.d.push(d); out.OF.push(OF); out.mf.push(mf); out.mo.push(mo); out.P.push(P); out.F.push(thrust); out.Isp.push(mt > 0 ? thrust / (mt * G0) : 0); out.cs.push(cs); }
    d += 2 * rdot * dt; used += mo * dt; t += dt;
    if (abort != null && t > abort + 0.3) break;
  }
  const I = out.F.reduce((a, f, i) => a + f * (i ? out.t[i] - out.t[i - 1] : 0), 0);
  return { ...out, tb: t, I, used, fuelUsed: out.mf.reduce((a, m, i) => a + m * (i ? out.t[i] - out.t[i - 1] : 0), 0), O };
}

export default function init(el) {
  const { body } = shell(el, { title: 'Hybrid motor bench: oxidiser flow, port growth and the O/F shift', note: 'A hybrid keeps the solid <i>fuel</i> and the <i>oxidiser</i> apart: the oxidiser flows from a tank down the hole in the fuel grain, and a flame sheet in the boundary layer over the wall evaporates the fuel. The wall regresses at ṙ = a·G<sub>ox</sub><sup>n</sup>, where G<sub>ox</sub> = ṁ<sub>ox</sub>/A<sub>port</sub> is the oxidiser mass flux. As the port widens, the flux falls, the fuel flow falls with it (even though the port area grew), and the oxygen-to-fuel ratio O/F drifts away from its optimum, the <b>O/F shift</b>. Close the oxidiser valve and the burn stops within a fraction of a second: the safety argument for hybrids. Numbers are generic, for teaching.' });
  const cvM = h('canvas', { class: 'plot' }), cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const so = select({ label: 'Oxidiser', options: Object.entries(OXI).map(([k, v]) => [k, v.n]), value: 'n2o', onChange: v => { autoLength(v, sf.get()); sTh.set(Math.round(sizeThroat(v) * 10) / 10); upd(); } });
  const sf = select({ label: 'Fuel grain', options: Object.entries(FUEL).map(([k, v]) => [k, v.n]), value: 'slow', onChange: v => { autoLength(so.get(), v); upd(); } });
  const sM = slider({ label: 'Oxidiser mass flow ṁ_ox', min: 40, max: 500, step: 5, value: 200, unit: 'g/s', fmt: v => v.toFixed(0), onInput: upd });
  const sD = slider({ label: 'Initial port diameter', min: 12, max: 60, step: 1, value: 30, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sL = slider({ label: 'Grain length', min: 100, max: 1600, step: 10, value: 400, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sTh = slider({ label: 'Throat diameter', min: 6, max: 40, step: 0.1, value: 17.5, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const sLoad = slider({ label: 'Oxidiser load', min: 0.5, max: 6, step: 0.1, value: 1.8, unit: 'kg', fmt: v => v.toFixed(1), onInput: upd });
  const sThr = slider({ label: 'Throttle (oxidiser valve opening)', min: 30, max: 100, step: 1, value: 100, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const blow = toggle({ label: 'Oxidiser tank blow-down (flow falls as the tank empties)', onChange: upd });
  const ab = toggle({ label: 'Abort: close the oxidiser valve at 40 % of the burn', onChange: upd });
  const auto = button('Auto-size the grain length', () => { autoLength(so.get(), sf.get()); upd(); }, 'small');
  const play = button('▶ Fire (slow motion)', () => { t0 = performance.now(); playing = true; }, 'small');
  const ro = { OF: readout('O/F: start → end', '', 'cool'), tb: readout('Burn time', 's', 'cool'), F: readout('Average thrust', 'N', 'fuel'), I: readout('Total impulse', 'N·s', 'hot'), isp: readout('Average Isp', 's', 'good'), P: readout('Chamber pressure: start → end', 'MPa', 'cool'), eff: readout('Performance lost to the O/F shift', '%', 'hot'), st: readout('Stop on command?', '', 'good') };
  body.append(h('div', {}, cvM), h('div', { class: 'wgrid even', style: { marginTop: '10px' } }, cvA, cvB),
    h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, so.el, sf.el, sM.el, sD.el, sL.el, sTh.el, sLoad.el, sThr.el, blow.el, ab.el, h('div', { class: 'btn-row' }, auto, play)), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pM = new Plot(cvM, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, aspect: 5.0, minHeight: 190, margin: { l: 4, r: 4, t: 4, b: 4 }, grid: false });
  const pA = new Plot(cvA, { xmin: 0, xmax: 10, ymin: 0, ymax: 20, aspect: 1.55, xlabel: 'time (s)', ylabel: 'O/F (oxidiser mass : fuel mass)', title: 'Oxygen-to-fuel ratio during the burn', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const pB = new Plot(cvB, { xmin: 0, xmax: 10, ymin: 0, ymax: 500, aspect: 1.55, xlabel: 'time (s)', ylabel: 'thrust (N)', title: 'Thrust and port diameter', margin: { l: 52, r: 12, t: 28, b: 40 } });
  let res = null, playing = false, t0 = 0, tNow = 0;
  // a longer grain has more burning surface, so more fuel flow: choose the length that starts the burn 15 % fuel-rich of the optimum
  function autoLength(ox, fuel) { const prm = { mox: sM.get() / 1000, d0: sD.get() / 1000, L: 0.4, ox, fuel, At: 1e-3, load: 0.01 }, r = fireHybrid(prm), want = 0.85 * OXI[ox].OFopt; sL.set(Math.min(1600, Math.max(100, Math.round(400 * r.OF[0] / want / 10) * 10))); }
  function sizeThroat(ox) { return Math.sqrt(4 * (sM.get() / 1000 * (1 + 1 / OXI[ox].OFopt)) * OXI[ox].cs / 3.0e6 / Math.PI) * 1000; }   // throat for ~3 MPa at the optimum
  function upd() {
    const prm = { mox: sM.get() / 1000, d0: sD.get() / 1000, L: sL.get() / 1000, ox: so.get(), fuel: sf.get(), At: Math.PI / 4 * (sTh.get() / 1000) ** 2, load: sLoad.get(), thr: sThr.get() / 100, blow: blow.get() };
    let r = fireHybrid(prm); if (ab.get()) r = fireHybrid({ ...prm, abort: r.tb * 0.4 });
    res = r; const n = r.t.length - 1, O = r.O;
    const base = fireHybrid({ ...prm, blow: false, thr: prm.thr });
    const OFs = r.OF.filter((v, i) => r.mo[i] > 0), good = r.cs.reduce((a, c, i) => a + c * r.mo[i], 0) / Math.max(1e-9, r.mo.reduce((a, b) => a + b, 0)), loss = (1 - good / O.cs) * 100;
    ro.OF.set(OFs[0].toFixed(1) + ' → ' + OFs[OFs.length - 1].toFixed(1)); ro.tb.set(r.tb.toFixed(1)); ro.I.set(r.I.toFixed(0)); ro.F.set((r.I / Math.max(0.1, r.tb)).toFixed(0));
    const isp = r.I / Math.max(1e-6, (r.used + r.fuelUsed) * G0); ro.isp.set(isp.toFixed(0)); ro.P.set((r.P[0] / 1e6).toFixed(1) + ' → ' + (r.P[Math.max(0, r.P.length - 2)] / 1e6).toFixed(1));
    ro.eff.set(loss.toFixed(1), loss > 8 ? 'bad' : 'hot'); ro.st.set(ab.get() ? 'YES: valve closed, thrust gone' : 'yes: close the valve', 'good');
    const tmax = Math.max(1, r.tb * 1.03); pA.set({ xmax: tmax, ymax: Math.max(2 * O.OFopt, Math.ceil(Math.max(...OFs) * 1.1)) }); pB.set({ xmax: tmax, ymax: Math.ceil(Math.max(50, Math.max(...r.F) * 1.12) / 50) * 50 });
    drawPlots(); draw();
  }
  function drawPlots() {
    if (!res) return; const r = res, O = r.O;
    let c = pA.begin().col; pA.axes(); pA.hband(O.OFopt * 0.85, O.OFopt * 1.15, { color: c.ok, alpha: .16 }); pA.text(pA.o.xmax * 0.98, O.OFopt * 1.2, 'best performance (O/F optimum)', { color: c.ok, align: 'right', size: 11 });
    pA.line(r.t, r.OF.map(v => Math.min(v, pA.o.ymax)), { color: c.fire, width: 3 }); pA.vline(tNow, { color: c.air, alpha: .9, dash: [3, 3] });
    c = pB.begin().col; pB.axes(); pB.area(r.t, r.t.map(() => 0), r.F, { color: c.fire, alpha: .18 }); pB.line(r.t, r.F, { color: c.fire, width: 3 });
    pB.line(r.t, r.d.map(v => v * 1000 / DGRAIN / 1000 * pB.o.ymax * 0.9 * (1 / 1)), { color: c.fuel, width: 2, dash: [5, 4] }); pB.text(pB.o.xmax * 0.02, pB.o.ymax * 0.06, 'dashed: port diameter (scaled)', { color: c.fuel, size: 11 }); pB.vline(tNow, { color: c.air, alpha: .9, dash: [3, 3] });
  }
  function draw() {
    if (!res) return; const r = res, p = pM, c = p.begin().col, ctx = p.ctx, W = p.W, H = p.H;
    const idx = Math.min(r.t.length - 1, Math.max(0, r.t.findIndex(v => v >= tNow))), d = r.d[idx] ?? 0.03, F = r.F[idx] ?? 0, mo = r.mo[idx] ?? 0, OF = r.OF[idx] ?? 0;
    const L = sL.get() / 1000, s = Math.min((W * 0.86) / (0.45 + L + 0.3), (H * 0.42) / (DGRAIN / 2 + 0.01)), ox = 0.03 * W, oy = H / 2, X = v => ox + v * s, Y = v => oy - v * s;
    // oxidiser tank
    const tankL = 0.40, tankR = 0.07, usedFrac = Math.min(1, (r.used ? r.t.slice(0, idx + 1).reduce((a, _, i) => a + (i ? r.mo[i] * (r.t[i] - r.t[i - 1]) : 0), 0) / sLoad.get() : 0));
    ctx.fillStyle = c.metal; ctx.globalAlpha = .8; ctx.beginPath(); ctx.roundRect(X(0), Y(tankR), tankL * s, 2 * tankR * s, 14); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(80,170,255,0.85)'; const lvl = 2 * (tankR - 0.008) * (1 - usedFrac); ctx.fillRect(X(0.02), Y(-tankR + 0.008 + lvl), (tankL - 0.04) * s, lvl * s);
    ctx.fillStyle = c.strong; ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(W < 600 ? 'tank' : 'oxidiser tank', X(tankL / 2), Y(tankR) - 16);
    // valve and injector line
    const gx = tankL + 0.08, valve = X(tankL + 0.04), open = mo > 0;
    ctx.strokeStyle = c.strong; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(tankL), oy); ctx.lineTo(X(gx), oy); ctx.stroke();
    ctx.fillStyle = open ? c.ok : c.bad; ctx.beginPath(); ctx.moveTo(valve - 8, oy - 9); ctx.lineTo(valve + 8, oy + 9); ctx.lineTo(valve + 8, oy - 9); ctx.lineTo(valve - 8, oy + 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.muted; if (W >= 600) ctx.fillText('valve', valve, oy + 12);
    // combustion: grain, port, flame sheet
    const R = DGRAIN / 2, port = d / 2, x0 = gx, x1 = gx + L;
    ctx.fillStyle = c.metal; ctx.globalAlpha = .85; ctx.fillRect(X(x0), Y(R + 0.008), L * s, 2 * (R + 0.008) * s); ctx.globalAlpha = 1;
    ctx.fillStyle = '#7b4a2a'; ctx.fillRect(X(x0), Y(R), L * s, (R - port) * s); ctx.fillRect(X(x0), Y(-port), L * s, (R - port) * s);
    const act = open ? 1 : 0; ctx.fillStyle = `rgba(110,190,255,${0.35 * act})`; ctx.fillRect(X(x0), Y(port), L * s, 2 * port * s);
    if (act) { const grd = ctx.createLinearGradient(0, Y(port), 0, Y(0)); grd.addColorStop(0, 'rgba(255,170,60,0.95)'); grd.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = grd; ctx.fillRect(X(x0), Y(port), L * s, port * 0.7 * s); const g2 = ctx.createLinearGradient(0, Y(-port), 0, Y(0)); g2.addColorStop(0, 'rgba(255,170,60,0.95)'); g2.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = g2; ctx.fillRect(X(x0), Y(-port) - port * 0.7 * s + 0 * s, L * s, port * 0.7 * s); }
    // post-combustion chamber + nozzle
    const xc = x1 + 0.07, rt = Math.sqrt(4 * (Math.PI / 4 * (sTh.get() / 1000) ** 2) / Math.PI) / 2, re = rt * 1.9;
    ctx.fillStyle = c.metal; ctx.globalAlpha = .85; ctx.fillRect(X(x1), Y(R + 0.008), 0.07 * s, 2 * (R + 0.008) * s); ctx.globalAlpha = 1; ctx.fillStyle = `rgba(255,150,70,${0.15 + 0.5 * act})`; ctx.fillRect(X(x1), Y(R), 0.07 * s, 2 * R * s);
    ctx.fillStyle = c.metal; ctx.fillRect(X(xc), Y(R + 0.008), 0.09 * s, 2 * (R + 0.008) * s); ctx.fillStyle = `rgba(255,150,70,${0.2 + 0.5 * act})`; ctx.beginPath(); ctx.moveTo(X(xc), Y(R)); ctx.lineTo(X(xc + 0.03), Y(rt)); ctx.lineTo(X(xc + 0.09), Y(re)); ctx.lineTo(X(xc + 0.09), Y(-re)); ctx.lineTo(X(xc + 0.03), Y(-rt)); ctx.lineTo(X(xc), Y(-R)); ctx.closePath(); ctx.fill();
    // plume
    const Fm = Math.max(...r.F, 1), len = act ? (0.12 * W) * (0.3 + 0.7 * F / Fm) * (1 + 0.05 * Math.sin(tNow * 80)) : 0;
    if (len > 3) { const xe = X(xc + 0.09), gr = ctx.createLinearGradient(xe, 0, xe + len, 0); gr.addColorStop(0, 'rgba(255,245,210,0.95)'); gr.addColorStop(0.3, 'rgba(255,170,70,0.8)'); gr.addColorStop(1, 'rgba(200,60,30,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(xe, oy - re * s); ctx.quadraticCurveTo(xe + len * 0.5, oy - re * s * 1.2, xe + len, oy); ctx.quadraticCurveTo(xe + len * 0.5, oy + re * s * 1.2, xe, oy + re * s); ctx.fill(); }
    ctx.fillStyle = c.strong; ctx.textAlign = 'center'; ctx.fillText(W < 600 ? 'fuel grain' : 'fuel grain (port widens as it burns)', X((x0 + x1) / 2), Y(R + 0.008) - 16); if (W >= 600) ctx.fillText('nozzle', X(xc + 0.045), Y(R + 0.008) - 16);
    ctx.textAlign = 'right'; ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(W < 600 ? `t ${tNow.toFixed(1)} s   O/F ${mo > 0 ? OF.toFixed(1) : '–'}   F ${F.toFixed(0)} N` : `t = ${tNow.toFixed(1)} s    O/F = ${mo > 0 ? OF.toFixed(1) : '–'}    port Ø ${(d * 1000).toFixed(0)} mm    thrust = ${F.toFixed(0)} N`, W - 8, 8);
    if (!open && tNow > 0.1) { ctx.fillStyle = c.bad; ctx.textAlign = 'left'; ctx.fillText('valve closed: burn stopped', 10, H - 18); }
  }
  function frame(now) { if (playing && res) { const T = Math.max(3.5, res.tb * 0.6) * 1000, k = (now - t0) / T; tNow = Math.min(1, k) * res.tb; drawPlots(); draw(); if (k >= 1.15) playing = false; } requestAnimationFrame(frame); }
  cvM.addEventListener('pointerdown', () => { t0 = performance.now(); playing = true; });
  [pA, pB].forEach(p => p.onDraw(drawPlots)); pM.onDraw(draw);
  autoLength('n2o', 'slow'); sTh.set(Math.round(sizeThroat('n2o') * 10) / 10); upd(); tNow = res.tb * 0.5; upd(); requestAnimationFrame(frame);
}
