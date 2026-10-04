// Why hobby rockets want T/W of 5-15 and launchers settle for 1.2-1.5: gravity loss and drag loss for a fixed mass ratio.
import { h, shell, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { G0 } from '../rocket-model.js';

/* vertical ascent of a single stage with constant thrust: returns burn-out speed, height, and the two losses */
function ascend({ Isp, R, tw, m0 = 5e5, Cd = 0.3, D = 3.7 }) {
  const mdot = tw * G0 * m0 / (Isp * G0) , F = tw * m0 * G0, tb = (m0 - m0 / R) / mdot, A = Math.PI / 4 * D * D;
  let t = 0, v = 0, hgt = 0, gl = 0, dl = 0; const dt = Math.min(0.02, tb / 4000);
  const ts = [0], vs = [0];
  while (t < tb) {
    const m = m0 - mdot * t, rho = 1.225 * Math.exp(-hgt / 8500), drag = 0.5 * rho * v * v * Cd * A;
    v += (F / m - drag / m - G0) * dt; hgt += v * dt; gl += G0 * dt; dl += drag / m * dt; t += dt;
    if (ts.length < 400 && t > ts[ts.length - 1] + tb / 400) { ts.push(t); vs.push(v); }
  }
  return { v, hgt, tb, gl, dl, ideal: Isp * G0 * Math.log(R), ts, vs };
}
export default function init(el) {
  const { body } = shell(el, { title: 'Why the thrust-to-weight ratio sets the class: gravity loss', note: 'A rocket that lifts off with thrust F and weight W = mg gains speed at (F/W − 1)·g. Burn the same propellant more gently and the burn lasts longer, so gravity pulls back for longer: the speed lost is g·t<sub>burn</sub> (the <b>gravity loss</b>). Burn it harder and gravity loss shrinks, but drag grows (the rocket is fast low in the thick air) and the engine and structure must be stronger. A hobby rocket has to be fast off its rod before its fins can steer, so it needs T/W of 5 or more; an orbital launcher can afford 1.2 to 1.5 because it has minutes, not seconds.' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sI = slider({ label: 'Specific impulse', min: 80, max: 450, step: 5, value: 300, unit: 's', fmt: v => v.toFixed(0), onInput: upd });
  const sR = slider({ label: 'Mass ratio (lift-off ÷ burn-out)', min: 1.5, max: 10, step: 0.1, value: 4, fmt: v => v.toFixed(1), onInput: upd });
  const sT = slider({ label: 'Lift-off thrust-to-weight ratio', min: 1.05, max: 20, step: 0.01, value: 1.4, log: true, fmt: v => v.toFixed(2), onInput: upd });
  const sM = slider({ label: 'Lift-off mass', min: 0.05, max: 3e6, step: 1, value: 5e5, unit: '', log: true, fmt: v => v < 1 ? (v * 1000).toFixed(0) + ' g' : v < 1000 ? v.toFixed(v < 10 ? 1 : 0) + ' kg' : (v / 1000).toFixed(v < 1e5 ? 0 : 0) + ' t', onInput: upd });
  const sD = slider({ label: 'Body diameter (drag)', min: 0.02, max: 10, step: 0.01, value: 3.7, unit: '', log: true, fmt: v => v < 1 ? (v * 100).toFixed(1) + ' cm' : v.toFixed(2) + ' m', onInput: upd });
  const pre = h('div', { class: 'btn-row' }, ...[['Hobby rocket', 85, 1.5, 8, 0.1, 0.03], ['Sounding rocket', 250, 5, 3.5, 3000, 0.4], ['Orbital launcher', 300, 4, 1.4, 5e5, 3.7]].map(([n, i, r, t, m, d]) => button(n, () => { sI.set(i); sR.set(r); sT.set(t); sM.set(m); sD.set(d); upd(); }, 'small')));
  const ro = { tb: readout('Burn time', 's', 'cool'), id: readout('Ideal Δv (rocket equation)', 'm/s', 'cool'), gl: readout('Lost to gravity', 'm/s', 'bad'), dl: readout('Lost to drag', 'm/s', 'bad'), v: readout('Speed at burn-out', 'm/s', 'good'), h: readout('Height at burn-out', 'km', 'fuel') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, pre, sI.el, sR.el, sT.el, sM.el, sD.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv, { xmin: 1, xmax: 20, xlog: true, ymin: 0, ymax: 4000, aspect: 1.5, xlabel: 'lift-off thrust-to-weight ratio', ylabel: 'speed at burn-out (m/s)', title: 'Burn-out speed vs T/W (same propellant)', margin: { l: 56, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cv2, { xmin: 0, xmax: 100, ymin: 0, ymax: 4000, aspect: 1.5, xlabel: 'time (s)', ylabel: 'speed (m/s)', title: 'The climb', margin: { l: 56, r: 12, t: 28, b: 40 } });
  function upd() {
    const prm = { Isp: sI.get(), R: sR.get(), m0: sM.get(), D: sD.get() }, tw = sT.get(), r = ascend({ ...prm, tw });
    ro.tb.set(r.tb.toFixed(0)); ro.id.set(r.ideal.toFixed(0)); ro.gl.set(r.gl.toFixed(0)); ro.dl.set(r.dl.toFixed(0)); ro.v.set(r.v.toFixed(0)); ro.h.set((r.hgt / 1000).toFixed(1));
    const xs = [], ys = [], gls = []; for (let k = 1.05; k <= 20; k *= 1.06) { const a = ascend({ ...prm, tw: k }); xs.push(k); ys.push(a.v); gls.push(a.ideal - a.gl); }
    const stp = r.ideal > 3000 ? 500 : r.ideal > 800 ? 200 : 100; p1.set({ ymax: Math.ceil(r.ideal * 1.08 / stp) * stp }); let c = p1.begin().col; p1.axes();
    p1.hline(r.ideal, { color: c.muted, label: 'ideal Δv, no gravity or drag', align: 'left' }); p1.line(xs, gls, { color: c.fuel, width: 1.8, dash: [5, 4] }); p1.line(xs, ys, { color: c.air, width: 3 });
    p1.band(1.2, 1.6, { color: c.violet, alpha: .14 }); p1.band(5, 15, { color: c.fuel, alpha: .12 }); p1.text(1.4, p1.o.ymax * 0.06, 'launchers', { color: c.violet, align: 'center', size: 10.5, weight: 700 }); p1.text(8.6, p1.o.ymax * 0.06, 'hobby rockets', { color: c.fuel, align: 'center', size: 10.5, weight: 700 });
    p1.dot(tw, r.v, { color: c.fire, r: 7 }); p1.text(19, gls[gls.length - 1] + p1.o.ymax * 0.05, 'minus gravity only', { color: c.fuel, align: 'right', size: 10.5 }); p1.text(19, ys[ys.length - 1] - p1.o.ymax * 0.06, 'minus gravity and drag', { color: c.air, align: 'right', size: 10.5, weight: 700 });
    p2.set({ xmax: Math.max(5, Math.ceil(r.tb * 1.05)), ymax: Math.max(100, Math.ceil(r.v * 1.2 / (r.v > 2000 ? 500 : r.v > 500 ? 200 : 50)) * (r.v > 2000 ? 500 : r.v > 500 ? 200 : 50)) }); c = p2.begin().col; p2.axes(); p2.line(r.ts, r.vs, { color: c.fire, width: 3 }); p2.vline(r.tb, { color: c.muted, label: 'burn-out' });
    for (const k of [1.2, 1.6, 5, 12]) { const a = ascend({ ...prm, tw: k }); p2.clip(true); p2.line(a.ts, a.vs, { color: c.muted, width: 1, alpha: .6 }); p2.clip(false); if (a.tb < p2.o.xmax * 0.97 && a.v < p2.o.ymax) p2.text(a.tb, a.v, 'T/W ' + k, { color: c.muted, size: 10, align: 'right' }); }
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
