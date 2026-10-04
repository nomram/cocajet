// How much energy is stored in a spinning rotor, and what a burst fragment carries.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1 } from '../engine-model.js';

const REF = [['Hand-thrown brick (2 kg at 8 m/s)', 64], ['.22 LR rifle bullet', 150], ['9 mm pistol bullet', 500], ['.45 ACP pistol bullet', 700], ['12-gauge slug', 2500], ['Small car crashing at 15 km/h (1 t)', 8700]];

export default function init(el) {
  const { body } = shell(el, { title: 'The energy locked in the rotor, and what a burst fragment carries', note: 'E = ½Iω². The assembly’s stored energy rises with rpm squared. A turbine wheel that fails is not a gentle event: pieces leave at rim speed (about 340 m/s for ours) and a 10 g fragment carries the energy of a pistol bullet. Containment, distance and balance are not optional.' });
  const cv = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Rotor speed', min: 20000, max: 140000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sI = slider({ label: 'Rotor inertia  I', min: 100, max: 800, step: 5, value: 340, unit: 'g·cm²', fmt: v => v.toFixed(0), onInput: upd });
  const sF = slider({ label: 'Mass of the piece that breaks off', min: 1, max: 40, step: 0.5, value: 12, unit: 'g', fmt: v => v.toFixed(1), onInput: upd });
  const sR = slider({ label: 'Radius it comes from', min: 10, max: 32, step: 0.5, value: 25, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const ro = { E: readout('Stored rotor energy', 'J', 'hot'), eq: readout('Equal to a 1 kg mass dropped from', 'm', 'fuel'), v: readout('Fragment speed', 'm/s', 'bad'), fe: readout('Fragment energy', 'J', 'bad'), cmp: readout('Comparable to', '') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sN.el, sI.el, sF.el, sR.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 20, xmax: 140, ymin: 10, ymax: 5000, ylog: true, xlabel: 'rotor speed (1000 rpm)', ylabel: 'energy (J), log scale', aspect: 1.3 });
  function upd() {
    const N = sN.get(), I = sI.get() * 1e-7, w = N * Math.PI / 30, E = 0.5 * I * w * w, m = sF.get() / 1000, v = w * sR.get() / 1000, fe = 0.5 * m * v * v;
    ro.E.set(E.toFixed(0)); ro.eq.set((E / 9.81).toFixed(0)); ro.v.set(v.toFixed(0)); ro.fe.set(fe.toFixed(0));
    const near = REF.reduce((b, r) => Math.abs(Math.log(r[1] / fe)) < Math.abs(Math.log(b[1] / fe)) ? r : b); ro.cmp.set(near[0].replace(/ \(.*\)/, ''));
    const c = p.begin().col; p.axes();
    REF.forEach(([n, e], i) => { p.hline(e, { color: c.muted, alpha: .6, dash: [2, 4], label: n, align: 'left' }); });
    const xs = [], ys = [], ys2 = []; for (let q = 20; q <= 140; q += 2) { const ww = q * 1000 * Math.PI / 30; xs.push(q); ys.push(0.5 * I * ww * ww); ys2.push(0.5 * m * (ww * sR.get() / 1000) ** 2); }
    p.line(xs, ys, { color: c.fire, width: 3 }); p.line(xs, ys2, { color: c.bad, width: 3, dash: [6, 4] });
    p.dot(N / 1000, E, { color: c.fire }); p.dot(N / 1000, fe, { color: c.bad });
    p.legend([[c.fire, 'whole rotor'], [c.bad, 'one fragment', [6, 4]]], { pos: 'br' });
  }
  p.onDraw(upd); upd();
}
