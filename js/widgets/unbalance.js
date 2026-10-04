// Rotor balance: unbalance force and the ISO 1940 balance grades.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Balance: the cheapest reliability upgrade', note: 'Unbalance U (g·mm) = mass × distance of its centre from the axis. The rotating force it causes is F = U·ω² (not a typo: ω², so it is 145 N per g·mm at 115 000 rpm). ISO 1940 grades limit the allowed U: G2.5 for turbo-machinery, G1 for fine rotors, G0.4 for precision spindles.' });
  const cv = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Rotor speed', min: 20000, max: 140000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sM = slider({ label: 'Rotor mass', min: 100, max: 500, step: 5, value: 195, unit: 'g', fmt: v => v.toFixed(0), onInput: upd });
  const sU = slider({ label: 'Unbalance you have', min: 0.002, max: 2, step: 0.001, value: 0.03, unit: 'g·mm', fmt: v => v.toFixed(3), log: true, onInput: upd });
  const ro = { F: readout('Rotating force', 'N', 'hot'), g: readout('Your balance grade', 'G', 'cool'), e: readout('Centre of mass offset', 'µm'), ok: readout('Verdict', ''), a: readout('G2.5 allows', 'g·mm', 'good'), b: readout('G1 allows', 'g·mm', 'good') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sN.el, sM.el, sU.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)),
    h('p', { style: { fontSize: '.85rem', color: 'var(--muted)' } }, 'Intuition: 0.05 g·mm is a 5 mg grain of sand stuck 10 mm from the axis. At 115 000 rpm it hurls 7 N at the bearings, about four times the weight of the whole rotor. A drop of paint (0.5 g·mm) hurls 70 N. Real shops balance to a few hundredths of a g·mm.'))));
  const p = new Plot(cv, { xmin: 20, xmax: 140, ymin: 0.002, ymax: 3, ylog: true, xlabel: 'rotor speed (1000 rpm)', ylabel: 'allowed unbalance (g·mm), log', aspect: 1.35 });
  function upd() {
    const N = sN.get(), m = sM.get() / 1000, U = sU.get(), w = N * Math.PI / 30, F = U * 1e-6 * w * w, e = U / sM.get() * 1000;
    const G = (U / sM.get()) * w;                  // e [mm] · ω [rad/s] = mm/s, with e = U/m
    const Ug = (g) => g * sM.get() / w;              // allowed U (g·mm) for grade g (mm/s)
    ro.F.set(F.toFixed(F < 10 ? 1 : 0)); ro.g.set(G.toFixed(G < 10 ? 1 : 0)); ro.e.set(e.toFixed(2)); ro.ok.set(G <= 1 ? 'G1: excellent' : G <= 2.5 ? 'G2.5: good' : G <= 6.3 ? 'G6.3: poor' : 'too rough: it will shake', G <= 2.5 ? 'good' : 'bad'); ro.a.set(Ug(2.5).toFixed(3)); ro.b.set(Ug(1).toFixed(3));
    const c = p.begin().col; p.axes();
    for (const [g, col, lab] of [[6.3, c.bad, 'G6.3'], [2.5, c.fuel, 'G2.5'], [1, c.ok, 'G1'], [0.4, c.air, 'G0.4']]) { const xs = [], ys = []; for (let q = 20; q <= 140; q += 4) { xs.push(q); ys.push(g * sM.get() / (q * 1000 * Math.PI / 30)); } p.line(xs, ys, { color: col, width: 2.4 }); p.text(138, ys[ys.length - 1] * 1.25, lab, { color: col, align: 'right', size: 11, base: 'bottom' }); }
    p.hline(U, { color: c.fire, width: 2, label: 'your unbalance ' + U.toFixed(2) + ' g·mm', align: 'left' }); p.dot(N / 1000, U, { color: c.fire }); p.vline(N / 1000, { color: c.muted });
    p.text(80, 0.0028, 'below a line = that grade or better', { color: c.muted, size: 11 });
  }
  p.onDraw(upd); upd();
}
