// A jet engine versus a rocket of the same thrust: speed, altitude and what they cost in propellant.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';
import { G0 } from '../rocket-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Jet or rocket? Same thrust, very different appetites', note: 'The thrust equation for the jet is F = ṁ(V<sub>e</sub> − V₀): the engine pays for the air it swallows, because it has to speed it up from the flight speed V₀. A rocket carries its own propellant and has no V₀ to subtract: its thrust does not care how fast it flies or how thin the air is. But look at the propellant bill: the turbojet gets its oxygen free from the air, so each kilogram of fuel gives about <b>8× more impulse</b> (Isp ≈ 2 000 s against 250 s).' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sV = slider({ label: 'Flight speed V₀', min: 0, max: 250, step: 5, value: 0, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const sH = slider({ label: 'Altitude', min: 0, max: 12, step: 0.5, value: 0, unit: 'km', fmt: v => v.toFixed(1), onInput: upd });
  const sI = slider({ label: 'Rocket Isp', min: 150, max: 450, step: 5, value: 250, unit: 's', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { Fj: readout('Jet thrust now', 'N', 'hot'), Fr: readout('Rocket thrust', 'N', 'fuel'), mj: readout('Jet propellant used', 'kg / min', 'cool'), mr: readout('Rocket propellant used', 'kg / min', 'cool'), ij: readout('Jet Isp', 's', 'good'), x: readout('Rocket burns', '× more', 'bad') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sV.el, sH.el, sI.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv, { xmin: 0, xmax: 250, ymin: 0, ymax: 80, aspect: 1.5, xlabel: 'flight speed (m/s)', ylabel: 'thrust (N)', title: 'Thrust vs flight speed', margin: { l: 50, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cv2, { xmin: 0, xmax: 12, ymin: 0, ymax: 80, aspect: 1.5, xlabel: 'altitude (km)', ylabel: 'thrust (N)', title: 'Thrust vs altitude (at the chosen speed)', margin: { l: 50, r: 12, t: 28, b: 40 } });
  const cache = new Map();
  const jet = (V, hh) => { const k = V + '|' + hh; let g = cache.get(k); if (!g) { g = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(hh * 1000), { V0: V }); cache.set(k, g); } return g; };
  function upd() {
    const V = sV.get(), hh = sH.get(), Isp = sI.get(), Fr = 58, g = jet(V, hh);
    const mjMin = g.mf * 60, mrMin = Fr / (Isp * G0) * 60;
    ro.Fj.set(g.thrust.toFixed(1)); ro.Fr.set(Fr.toFixed(0)); ro.mj.set(mjMin.toFixed(2)); ro.mr.set(mrMin.toFixed(2)); ro.ij.set((g.thrust / (g.mf * G0)).toFixed(0)); ro.x.set((mrMin / mjMin * g.thrust / Fr).toFixed(1));
    let c = p1.begin().col; p1.axes();
    const xs = [], ys = []; for (let v = 0; v <= 250; v += 10) { xs.push(v); ys.push(jet(v, hh).thrust); }
    p1.line(xs, ys, { color: c.fire, width: 3.2 }); p1.hline(Fr, { color: c.air, width: 3, dash: [], label: 'rocket: 58 N whatever the speed', align: 'right' }); p1.vline(V, { color: c.muted }); p1.dot(V, g.thrust, { color: c.fire });
    p1.text(245, ys[ys.length - 1] - 5, 'CJ-1 turbojet: ṁ(Ve − V₀), helped a little by ram pressure', { color: c.fire, align: 'right', size: 11, weight: 700 });
    c = p2.begin().col; p2.axes();
    const ax = [], ay = []; for (let a = 0; a <= 12; a += 1) { ax.push(a); ay.push(jet(V, a).thrust); }
    p2.line(ax, ay, { color: c.fire, width: 3.2 }); p2.hline(Fr, { color: c.air, width: 3, dash: [], label: 'rocket', align: 'right' }); p2.vline(hh, { color: c.muted }); p2.dot(hh, g.thrust, { color: c.fire });
    p2.text(11.8, ay[ay.length - 1] + 6, 'thin air = less mass flow = less thrust', { color: c.fire, align: 'right', size: 11, weight: 700 });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
