// How much spark energy lights the mixture? Minimum ignition energy vs mixture, flow, pressure and gap.
import { h, shell, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { mie, pIgnite, FLAM } from '../ignition-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'How big a spark do you need? Minimum ignition energy', note: 'A spark deposits heat in a tiny kernel of gas. If the kernel gets hot enough, flame spreads; if it loses heat faster than the reaction makes it (to the cold electrodes, to the moving gas), it dies. Propane in still air at the best mixture needs just <b>0.25 mJ</b>. Real conditions (a lean or rich mixture, a gas stream sweeping past, a small gap) raise this by 10 to 1000 times. The red curve is the energy needed; a spark above it lights the mixture.' });
  const cv = h('canvas', { class: 'plot' });
  const sPhi = slider({ label: 'Mixture strength at the plug φ', min: 0.3, max: 3, step: 0.01, value: 1.1, fmt: v => v.toFixed(2), onInput: upd });
  const sU = slider({ label: 'Gas speed past the plug', min: 0, max: 100, step: 1, value: 8, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const sP = slider({ label: 'Pressure', min: 0.5, max: 4, step: 0.05, value: 1.05, unit: 'bar', fmt: v => v.toFixed(2), onInput: upd });
  const sT = slider({ label: 'Air temperature', min: 250, max: 700, step: 5, value: 293, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sG = slider({ label: 'Electrode gap', min: 0.3, max: 4, step: 0.1, value: 0.8, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const sE = slider({ label: 'Energy of your spark', min: 0.1, max: 1000, step: 1, value: 25, unit: 'mJ', log: true, fmt: v => v < 10 ? v.toFixed(1) : v.toFixed(0), onInput: upd });
  const pre = h('div', { class: 'btn-row' }, button('Bench, still air, best mixture', () => { sPhi.set(1.15); sU.set(0); sP.set(1.013); sT.set(293); sG.set(2); upd(); }, 'small'), button('CJ-1 cranking, 17 000 rpm', () => { sPhi.set(1.1); sU.set(8); sP.set(1.05); sT.set(293); sG.set(0.8); upd(); }, 'small'), button('Lean mixture φ = 0.6', () => { sPhi.set(0.6); upd(); }, 'small'));
  const ro = { mie: readout('Energy needed here', 'mJ', 'hot'), E: readout('Your spark', 'mJ', 'cool'), pr: readout('Chance one spark lights it', '%', 'good'), f: readout('Spark ÷ needed', '×', 'fuel') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, pre, sPhi.el, sU.el, sP.el, sT.el, sG.el, sE.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 0.3, xmax: 3, ymin: 0.1, ymax: 1e4, ylog: true, aspect: 1.35, xlabel: 'mixture strength φ  (lean ← 1 → rich)', ylabel: 'minimum ignition energy (mJ)' });
  function upd() {
    const phi = sPhi.get(), o = { U: sU.get(), P: sP.get(), T: sT.get(), gap: sG.get() }, E = sE.get(), m = mie(phi, o), pr = pIgnite(E, m);
    ro.mie.set(isFinite(m) ? (m < 10 ? m.toFixed(2) : m.toFixed(0)) : 'no flame'); ro.E.set(E < 10 ? E.toFixed(1) : E.toFixed(0)); ro.pr.set((pr * 100).toFixed(pr > 0.99 ? 0 : 1), pr > 0.9 ? 'good' : pr > 0.4 ? 'fuel' : 'bad'); ro.f.set(isFinite(m) ? (E / m).toFixed(E / m > 10 ? 0 : 1) : '–');
    const c = p.begin().col; p.axes();
    p.band(0.3, FLAM.lean, { color: c.muted, alpha: .12, label: '' }); p.band(FLAM.rich, 3, { color: c.muted, alpha: .12 });
    p.text(0.32, 4000, 'too lean: no flame', { color: c.muted, size: 11 }); p.text(2.98, 4000, 'too rich: no flame', { color: c.muted, size: 11, align: 'right' });
    const xs = [], ys = []; for (let x = FLAM.lean + 0.005; x < FLAM.rich - 0.005; x += 0.01) { xs.push(x); ys.push(Math.min(9000, mie(x, o))); }
    p.line(xs, ys, { color: c.fire, width: 3.2 });
    p.hline(E, { color: c.air, label: 'your spark: ' + (E < 10 ? E.toFixed(1) : E.toFixed(0)) + ' mJ', align: 'right', width: 2 });
    p.hline(0.25, { color: c.ok, alpha: .7, label: 'best case 0.25 mJ', align: 'left' });
    if (isFinite(m)) p.dot(phi, Math.min(m, 9000), { color: c.fire, r: 6.5 });
  }
  p.onDraw(upd); upd();
}
