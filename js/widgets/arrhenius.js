// Activation energy: why a match needs a spark, and why every 10 K matters.
import { h, shell, slider, toggle, button, readout } from '../ui.js';
import { Plot } from '../plot.js';

const R = 8.314;
const PRESETS = [['Propane flame', 130, -410], ['Hydrogen flame', 140, -242], ['Hand warmer (iron rusting)', 55, -550], ['H₂O₂ decomposing', 75, -196], ['Air burning to NO', 320, 181]];

export default function init(el) {
  const { body } = shell(el, { title: 'Activation energy: the hill every reaction has to climb', note: 'A reaction can be very exothermic and still not start by itself: the molecules must first climb an energy hill of height E<sub>a</sub>. At temperature T only a fraction e<sup>−E<sub>a</sub>/RT</sup> of the molecules have enough energy, so the rate grows <i>exponentially</i> with temperature. A catalyst does not change ΔH: it only lowers the hill.' });
  const cv1 = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sE = slider({ label: 'Activation energy Eₐ', min: 20, max: 350, step: 1, value: 130, unit: 'kJ/mol', fmt: v => v.toFixed(0), onInput: upd });
  const sH = slider({ label: 'Heat of reaction ΔH (per mole of O₂ used)', min: -600, max: 300, step: 5, value: -410, unit: 'kJ/mol', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Temperature', min: 250, max: 2500, step: 10, value: 900, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const cat = toggle({ label: 'Add a catalyst (lowers the hill by 35 %)', onChange: upd });
  const pre = h('div', { class: 'btn-row' }, ...PRESETS.map(([n, e, d]) => button(n, () => { sE.set(e); sH.set(d); upd(); }, 'small')));
  const ro = { f: readout('Molecules with enough energy', '', 'cool'), q: readout('Rate doubles every', 'K', 'hot'), r: readout('Rate vs. 300 K', '×', 'fuel'), t: readout('Type', '') };
  body.append(h('div', { class: 'wgrid even' }, cv1, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, pre, sE.el, sH.el, sT.el, cat.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv1, { xmin: 0, xmax: 1, ymin: -600, ymax: 400, aspect: 1.5, xticks: [], xlabel: 'progress of the reaction →', ylabel: 'energy (kJ/mol)', margin: { l: 56, r: 12, t: 14, b: 32 } });
  const p2 = new Plot(cv2, { xmin: 250, xmax: 2500, ymin: 1e-45, ymax: 1, ylog: true, aspect: 1.5, xlabel: 'temperature (K)', ylabel: 'fraction of molecules above the hill', margin: { l: 62, r: 12, t: 14, b: 40 } });
  function upd() {
    const Ea0 = Math.max(sE.get(), sH.get() > 0 ? sH.get() + 5 : 0), dH = sH.get(), Ea = Ea0 * (cat.get() ? 0.65 : 1), T = sT.get();
    const f = Math.exp(-Ea * 1000 / (R * T)), q10 = Math.exp(Ea * 1000 * 10 / (R * T * T)), ratio = Math.exp(-Ea * 1000 / R * (1 / T - 1 / 300));
    ro.f.set(f > 1e-3 ? (f * 100).toFixed(1) + ' %' : f.toExponential(0).replace('e', '×10^')); ro.q.set((10 * Math.log(2) / Math.log(q10)).toFixed(0)); ro.r.set(ratio > 1e6 ? ratio.toExponential(0).replace('e+', '×10^') : ratio.toFixed(ratio > 100 ? 0 : 1)); ro.t.set(dH < 0 ? 'EXOTHERMIC' : 'ENDOTHERMIC', dH < 0 ? 'hot' : 'cool');
    // --- energy profile: reactants at 0, a hill of height Ea, products at dH ---
    p1.set({ ymin: Math.min(-60, dH - 70), ymax: Math.max(Ea0, dH) + 70 });
    let c = p1.begin().col; p1.axes();
    const prof = (x, E) => { const sm = x < 0.5 ? 0 : x > 0.86 ? 1 : (u => u * u * (3 - 2 * u))((x - 0.5) / 0.36); return dH * sm + E * Math.exp(-Math.pow((x - 0.42) / 0.11, 2)) * (1 - 0.0 * sm); };
    const xs = [], ys = [], ys0 = [];
    for (let x = 0; x <= 1.0001; x += 0.01) { xs.push(x); ys.push(prof(x, Ea)); ys0.push(prof(x, Ea0)); }
    if (cat.get()) p1.line(xs, ys0, { color: c.muted, width: 2, dash: [6, 5] });
    p1.line(xs, ys, { color: dH < 0 ? c.fire : c.air, width: 3.2 });
    p1.hline(0, { color: c.muted, alpha: .5, dash: [2, 4] });
    p1.arrow(0.42, 0, 0.42, Ea - 4, { color: c.fuel, width: 2 }); p1.text(0.28, Ea * 0.5, 'Eₐ = ' + Ea.toFixed(0), { color: c.fuel, weight: 800, align: 'right' });
    p1.arrow(0.93, 0, 0.93, dH + (dH < 0 ? 4 : -4), { color: dH < 0 ? c.fire : c.air, width: 2 }); p1.text(0.91, dH / 2, 'ΔH = ' + dH.toFixed(0), { color: dH < 0 ? c.fire : c.air, weight: 800, align: 'right' });
    p1.text(0.03, 14, 'reactants', { color: c.text, size: 11 }); p1.text(0.98, dH + (dH < 0 ? -16 : 16), 'products', { color: c.text, size: 11, align: 'right' });
    // --- Boltzmann factor ---
    c = p2.begin().col; p2.axes();
    const tx = [], ty = []; for (let t = 250; t <= 2500; t += 25) { tx.push(t); ty.push(Math.max(1e-45, Math.exp(-Ea * 1000 / (R * t)))); }
    p2.line(tx, ty, { color: c.fire, width: 3 });
    p2.vline(300, { color: c.muted, label: 'room' }); p2.vline(T, { color: c.air, label: T + ' K' });
    p2.dot(T, Math.max(1e-45, f), { color: c.fire });
    p2.text(2480, 3e-44, 'a flame is ~2000 K, a match head sits at 300 K', { color: c.muted, align: 'right', size: 11 });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
