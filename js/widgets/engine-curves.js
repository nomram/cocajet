// "Data sheet" curves: thrust, fuel flow, EGT, pressure ratio and mass flow vs engine speed.
import { h, shell, slider, readout, C } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt, compressorMap } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Engine data sheet: how it behaves from idle to full power', note: 'Each point is a steady-state solution of the whole gas path. Notice that thrust rises with the <em>square-ish</em> of rpm: 48 000 → 115 000 rpm is 2.4× the speed but ~8× the thrust. The last 10 % of rpm costs the most fuel.' });
  const cs = Array.from({ length: 4 }, () => h('canvas', { class: 'plot' }));
  const sN = slider({ label: 'Mark an operating point', min: 40000, max: 125000, step: 500, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { F: readout('Thrust', 'N', 'hot'), mf: readout('Fuel', 'g/s', 'fuel'), egt: readout('EGT', '°C', 'hot'), pr: readout('PR', '', 'cool') };
  body.append(h('div', { class: 'wgrid even' }, cs[0], cs[1]), h('div', { class: 'wgrid even', style: { marginTop: '12px' } }, cs[2], cs[3]), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sN.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const amb = isa(0), p0 = { ...CJ1 };
  const Ns = []; for (let N = 40000; N <= 125000; N += 2500) Ns.push(N);
  const data = Ns.map(N => steadyAt(p0, N, amb));
  const mk = (cv, o) => new Plot(cv, Object.assign({ xmin: 40, xmax: 125, aspect: 1.55, xlabel: 'engine speed (1000 rpm)', margin: { l: 56, r: 12, t: 26, b: 42 } }, o));
  const P = [mk(cs[0], { ymin: 0, ymax: 80, ylabel: 'thrust (N)', title: 'Thrust' }), mk(cs[1], { ymin: 0, ymax: 3.6, ylabel: 'fuel flow (g/s)', title: 'Fuel flow' }), mk(cs[2], { ymin: 500, ymax: 900, ylabel: 'temperature (°C)', title: 'EGT (solid) and TIT (dashed)' }), mk(cs[3], { ymin: 1, ymax: 2.2, ylabel: 'pressure ratio', title: 'Compressor pressure ratio' })];
  const xs = Ns.map(n => n / 1000);
  function upd() {
    const N = sN.get(), g = steadyAt(p0, N, amb);
    ro.F.set(g.thrust.toFixed(1)); ro.mf.set((g.mf * 1000).toFixed(2)); ro.egt.set(C(g.T04).toFixed(0)); ro.pr.set(g.PRc.toFixed(2));
    const series = [[data.map(d => d.thrust), g.thrust], [data.map(d => d.mf * 1000), g.mf * 1000], [data.map(d => C(d.T04)), C(g.T04)], [data.map(d => d.PRc), g.PRc]];
    P.forEach((pl, i) => {
      const c = pl.begin().col; pl.axes();
      pl.band(40, 48, { color: c.muted, alpha: .1 }); pl.text(44, pl.o.ymax * 0.93, 'idle', { color: c.muted, size: 11, align: 'center', base: 'top' });
      pl.line(xs, series[i][0], { color: [c.fire, c.fuel, c.bad, c.air][i], width: 3 });
      if (i === 2) pl.line(xs, data.map(d => C(d.T03)), { color: c.fire, width: 2, dash: [6, 4] });
      pl.vline(N / 1000, { color: c.muted, dash: [3, 3] }); pl.dot(N / 1000, series[i][1], { color: [c.fire, c.fuel, c.bad, c.air][i] });
    });
  }
  P.forEach(p => p.onDraw(upd)); upd();
}
