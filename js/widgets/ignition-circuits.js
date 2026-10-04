// Where the spark energy comes from: coil (inductive), capacitor discharge, piezo clicker.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';

const TYPES = { coil: 'Inductive coil (car-style, 12 V)', cdi: 'Capacitor discharge (CDI)', piezo: 'Piezo clicker (BBQ lighter)' };
export default function init(el) {
  const { body } = shell(el, { title: 'Three ways to make a spark', note: '<b>Inductive coil:</b> current builds up in a coil for a few milliseconds (the <i>dwell</i>), storing ½·L·I²; when the transistor cuts the current the collapsing field drives the secondary to tens of kilovolts. <b>CDI:</b> a capacitor is charged to a few hundred volts and dumped into a pulse transformer: stored energy ½·C·V². <b>Piezo:</b> a hammer cracks a quartz-like crystal, which makes a few kilovolts but only about a millijoule. Compare the result with the energy the flame needs (the red band).' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sel = select({ label: 'Circuit', options: Object.entries(TYPES), value: 'coil', onChange: () => { build(); upd(); } });
  const ctl = h('div', { class: 'ctls' });
  let sliders = {};
  const ro = { Es: readout('Energy in the spark', 'mJ', 'hot'), Vp: readout('Voltage available', 'kV', 'cool'), P: readout('Average power at the rate set', 'W', 'fuel'), v: readout('Verdict at 1 mJ best-case → 25 mJ comfortable', '') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sel.el, ctl), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv, { xmin: 0, xmax: 10, ymin: 0, ymax: 12, aspect: 1.5, xlabel: 'time since the coil was switched on (ms)', ylabel: 'primary current (A)', title: 'Coil current while it is "dwelling"', margin: { l: 50, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cv2, { xmin: 0.1, xmax: 1000, ymin: 0, ymax: 1, xlog: true, aspect: 1.5, xlabel: 'spark energy (mJ)', ylabel: '', title: 'Your spark against the flame’s needs', yticks: [], margin: { l: 14, r: 14, t: 28, b: 40 } });
  function mk(key, o) { sliders[key] = slider({ ...o, onInput: upd }); ctl.append(sliders[key].el); }
  function build() {
    ctl.innerHTML = ''; sliders = {};
    const t = sel.get();
    if (t === 'coil') { mk('V', { label: 'Supply voltage', min: 6, max: 16, step: 0.1, value: 12, unit: 'V', fmt: v => v.toFixed(1) }); mk('L', { label: 'Primary inductance', min: 0.5, max: 8, step: 0.1, value: 3, unit: 'mH', fmt: v => v.toFixed(1) }); mk('R', { label: 'Primary resistance', min: 0.4, max: 4, step: 0.1, value: 1.5, unit: 'Ω', fmt: v => v.toFixed(1) }); mk('dw', { label: 'Dwell time', min: 0.3, max: 10, step: 0.1, value: 3, unit: 'ms', fmt: v => v.toFixed(1) }); mk('f', { label: 'Sparks per second', min: 1, max: 100, step: 1, value: 20, unit: 'Hz', fmt: v => v.toFixed(0) }); }
    if (t === 'cdi') { mk('C', { label: 'Capacitor', min: 0.1, max: 4.7, step: 0.1, value: 1.0, unit: 'µF', fmt: v => v.toFixed(1) }); mk('Vc', { label: 'Charge voltage', min: 100, max: 450, step: 5, value: 300, unit: 'V', fmt: v => v.toFixed(0) }); mk('f', { label: 'Sparks per second', min: 1, max: 100, step: 1, value: 20, unit: 'Hz', fmt: v => v.toFixed(0) }); }
    if (t === 'piezo') { mk('f', { label: 'Clicks per second (your thumb)', min: 1, max: 10, step: 1, value: 3, unit: 'Hz', fmt: v => v.toFixed(0) }); }
  }
  function upd() {
    const t = sel.get(), g = (k) => sliders[k] ? sliders[k].get() : 0;
    let Es = 0, Vp = 0, f = g('f') || 1, curve = null;
    if (t === 'coil') { const Imax = g('V') / g('R'), tau = g('L') * 1e-3 / g('R'), I = Imax * (1 - Math.exp(-g('dw') * 1e-3 / tau)); Es = 0.5 * g('L') * 1e-3 * I * I * 1e3 * 0.5; Vp = Math.min(40, Math.sqrt(2 * Es * 1e-3 / 25e-12) / 1000); curve = { Imax, tau, I }; }
    if (t === 'cdi') { Es = 0.5 * g('C') * 1e-6 * g('Vc') * g('Vc') * 1e3 * 0.6; Vp = Math.min(40, 15 + Es * 0.1); }
    if (t === 'piezo') { Es = 1.2; Vp = 12; }
    ro.Es.set(Es < 10 ? Es.toFixed(1) : Es.toFixed(0)); ro.Vp.set(Vp.toFixed(0)); ro.P.set((Es * 1e-3 * f).toFixed(2));
    ro.v.set(Es < 1 ? 'too weak' : Es < 25 ? 'marginal' : 'comfortable', Es < 1 ? 'bad' : Es < 25 ? 'fuel' : 'good');
    let c = p1.begin().col;
    if (curve) { p1.set({ ymax: Math.max(4, Math.ceil(curve.Imax * 1.1)) }); p1.axes(); const xs = [], ys = []; for (let x = 0; x <= 10; x += 0.1) { xs.push(x); ys.push(curve.Imax * (1 - Math.exp(-x * 1e-3 / curve.tau))); } p1.line(xs, ys, { color: c.air, width: 3 }); p1.vline(g('dw'), { color: c.fire, label: 'dwell' }); p1.dot(g('dw'), curve.I, { color: c.fire }); p1.hline(curve.Imax, { color: c.muted, label: 'V/R limit', align: 'right' }); p1.text(0.2, curve.Imax * 0.45, 'time constant L/R = ' + (curve.tau * 1000).toFixed(1) + ' ms', { color: c.muted, size: 11 }); }
    else { p1.set({ ymax: 1 }); p1.axes(); p1.text(5, 0.5, t === 'cdi' ? 'a capacitor charges in microseconds: no dwell needed' : 'a hammer and a crystal: no battery at all', { color: c.muted, align: 'center', size: 12 }); }
    c = p2.begin().col; p2.axes();
    p2.band(0.25, 1.5, { color: c.ok, alpha: .22 }); p2.band(1.5, 25, { color: c.fuel, alpha: .16 }); p2.band(25, 1000, { color: c.fire, alpha: .12 });
    p2.text(0.27, 0.9, 'best case', { color: c.ok, size: 11, weight: 700 }); p2.text(1.8, 0.9, 'marginal', { color: c.fuel, size: 11, weight: 700 }); p2.text(30, 0.9, 'comfortable', { color: c.fire, size: 11, weight: 700 });
    p2.vline(Math.max(0.1, Es), { color: c.air, label: '' }); p2.dot(Math.max(0.1, Es), 0.45, { color: c.air, r: 8 }); p2.text(Math.max(0.12, Es) * 1.15, 0.58, Es.toFixed(Es < 10 ? 1 : 0) + ' mJ', { color: c.air, weight: 800 });
  }
  build(); p1.onDraw(upd); p2.onDraw(upd); upd();
}
