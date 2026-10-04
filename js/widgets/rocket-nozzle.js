// The de Laval ("venturi") rocket nozzle: chamber -> throat -> bell, with thrust, Isp and altitude.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { PROPS, nozzle, machFromArea, areaMach, pRatio, tRatio, epsForPe, G0 } from '../rocket-model.js';

const atm = (alt) => 101325 * Math.exp(-alt / 7200);                // crude exponential atmosphere, fine for 0-60 km

export default function init(el) {
  const { body } = shell(el, { title: 'The rocket nozzle: converge, choke at the throat, then expand', note: 'Hot gas from the chamber accelerates through the converging part until it reaches Mach 1 <b>exactly at the throat</b> (the “choke”). Past the throat the gas keeps expanding in the diverging bell, and, counter-intuitively, <i>speeds up as the passage widens</i>, because supersonic flow behaves opposite to subsonic. The pressure and temperature drop as the speed rises: the heat energy of the gas is being converted into directed kinetic energy. The thrust is F = ṁ·V<sub>e</sub> + (P<sub>e</sub> − P<sub>a</sub>)·A<sub>e</sub>: the same equation as the jet engine’s.' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sel = select({ label: 'Propellant', options: Object.entries(PROPS).map(([k, v]) => [k, v.n]), value: 'kerolox', onChange: () => { upd(); } });
  const sPc = slider({ label: 'Chamber pressure', min: 0.5, max: 25, step: 0.1, value: 7, unit: 'MPa', fmt: v => v.toFixed(1), onInput: upd });
  const sEps = slider({ label: 'Expansion ratio ε (exit area ÷ throat area)', min: 1.5, max: 150, step: 0.5, value: 12, log: true, fmt: v => v.toFixed(v < 10 ? 1 : 0), onInput: upd });
  const sAlt = slider({ label: 'Altitude', min: 0, max: 60, step: 0.5, value: 0, unit: 'km', fmt: v => v.toFixed(1), onInput: upd });
  const sAt = slider({ label: 'Throat diameter', min: 5, max: 200, step: 1, value: 30, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { F: readout('Thrust', 'N', 'hot'), isp: readout('Specific impulse here', 's', 'good'), ve: readout('Exhaust speed', 'm/s', 'cool'), md: readout('Propellant flow', 'kg/s', 'fuel'), me: readout('Exit Mach number', '', 'cool'), pe: readout('Exit pressure vs ambient', '', ''), st: readout('Nozzle state', '', '') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sel.el, sPc.el, sEps.el, sAlt.el, sAt.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv, { xmin: -1.2, xmax: 2.2, ymin: 0, ymax: 6.5, aspect: 1.6, xlabel: 'position along the nozzle (throat = 0)', ylabel: 'Mach number', title: 'Speed along the nozzle', margin: { l: 46, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cv2, { xmin: 0, xmax: 60, ymin: 0, ymax: 1, aspect: 1.6, xlabel: 'altitude (km)', ylabel: 'thrust ÷ sea-level thrust', title: 'Thrust as you climb', margin: { l: 50, r: 12, t: 28, b: 40 } });
  function upd() {
    const pr = PROPS[sel.get()], Pc = sPc.get() * 1e6, eps = sEps.get(), Pa = atm(sAlt.get() * 1000), At = Math.PI / 4 * (sAt.get() / 1000) ** 2;
    const n = nozzle({ Pc, Tc: pr.Tc, Mw: pr.Mw, g: pr.g, eps, Pa }), md = Pc * At / n.cstar, F = n.CF * Pc * At;
    const Fsl = nozzle({ Pc, Tc: pr.Tc, Mw: pr.Mw, g: pr.g, eps, Pa: 101325 }).CF;
    ro.F.set(F >= 1e4 ? (F / 1000).toFixed(1) + ' k' : F.toFixed(0)); ro.isp.set(n.Isp.toFixed(0)); ro.ve.set(n.Ve.toFixed(0)); ro.md.set(md.toFixed(md < 1 ? 3 : 2)); ro.me.set(n.Me.toFixed(2));
    const ratio = n.Pe / Pa; ro.pe.set(Pa < 1 ? '∞ (vacuum)' : ratio.toFixed(2) + '×');
    const state = n.separated ? 'flow SEPARATES' : ratio > 1.15 ? 'under-expanded' : ratio < 0.85 ? 'over-expanded' : 'well matched';
    ro.st.set(state, n.separated ? 'bad' : state === 'well matched' ? 'good' : 'fuel');
    // Mach profile: contour of area ratio vs x (converging 3 throat radii, bell parabolic), Mach from area ratio
    let c = p1.begin().col; p1.axes();
    const xs = [], ms = [], rs = [];
    for (let x = -1.2; x <= 2.2; x += 0.02) { const ar = x < 0 ? 1 + 2.4 * x * x : 1 + (eps - 1) * Math.pow(x / 2.2, 0.62); const M = x < 0 ? machFromArea(Math.max(1.0001, ar), pr.g, false) : machFromArea(Math.max(1.0001, ar), pr.g, true); xs.push(x); ms.push(x === 0 ? 1 : M); rs.push(Math.sqrt(ar)); }
    p1.set({ ymax: Math.max(3, Math.ceil(n.Me + 0.5)) });
    p1.line(xs, ms, { color: c.fire, width: 3.2 }); p1.hline(1, { color: c.muted, label: 'Mach 1 (sound)', align: 'right' }); p1.vline(0, { color: c.air, label: 'throat' });
    // the nozzle contour, drawn in the upper part of the chart
    const top = p1.o.ymax, yc = top * 0.83, sc = top * 0.15 / Math.sqrt(eps), ctx = p1.ctx;
    ctx.save(); ctx.fillStyle = c.air; ctx.globalAlpha = 0.18; ctx.strokeStyle = c.air; ctx.lineWidth = 2.2; ctx.beginPath();
    rs.forEach((r, i) => { const X = p1.X(xs[i]), Y = p1.Y(yc + r * sc); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    for (let i = rs.length - 1; i >= 0; i--) ctx.lineTo(p1.X(xs[i]), p1.Y(yc - rs[i] * sc));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.stroke(); ctx.restore();
    p1.dot(0, 1, { color: c.air }); p1.dot(2.2, n.Me, { color: c.fire }); p1.text(2.15, n.Me - top * 0.06, 'exit M = ' + n.Me.toFixed(2), { color: c.fire, align: 'right', size: 11, weight: 700 });
    // thrust vs altitude
    c = p2.begin().col; p2.axes();
    const ax = [], ay = [], ay2 = []; for (let a = 0; a <= 60; a += 1) { const n2 = nozzle({ Pc, Tc: pr.Tc, Mw: pr.Mw, g: pr.g, eps, Pa: atm(a * 1000) }); ax.push(a); ay.push(n2.CF / Fsl); }
    p2.set({ ymax: Math.max(1.1, Math.ceil(Math.max(...ay) * 10) / 10) });
    // the optimum-expansion curve: a nozzle matched at every altitude (ideal "altitude compensating")
    for (let a = 0; a <= 60; a += 1) { const Pa2 = atm(a * 1000), e2 = Math.min(1500, epsForPe(Pc, Math.max(Pa2, 300), pr.g)); ay2.push(nozzle({ Pc, Tc: pr.Tc, Mw: pr.Mw, g: pr.g, eps: e2, Pa: Pa2 }).CF / Fsl); }
    p2.line(ax, ay2, { color: c.muted, width: 2, dash: [6, 5] }); p2.line(ax, ay, { color: c.fire, width: 3.2 }); p2.vline(sAlt.get(), { color: c.air }); p2.dot(sAlt.get(), n.CF / Fsl, { color: c.fire });
    p2.text(59, ay2[59] - 0.05, 'a nozzle re-shaped at every height', { color: c.muted, align: 'right', size: 11 }); p2.text(59, ay[59] - 0.09, 'this fixed nozzle', { color: c.fire, align: 'right', size: 11, weight: 700 });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
