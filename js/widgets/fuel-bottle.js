// The propane bottle as a heat exchanger: every kilogram that leaves has to boil, boiling takes heat from the liquid, and a cold bottle cannot push gas fast enough.
import { h, shell, slider, toggle, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';
import { FuelSupply } from '../fuel-supply.js';

export default function init(el) {
  const { body } = shell(el, { title: 'The propane bottle: freeze-off', note: 'Propane is stored as a liquid with its vapour above it, and the engine draws <i>vapour</i>. Each gram that leaves must evaporate, and evaporating takes latent heat (426 kJ/kg) from the liquid. At full power that is more than a kilowatt, so the bottle cools, its vapour pressure falls, and when it drops to about the pressure in the combustor the flow cannot keep up: <b>freeze-off</b>. A regulator hides this until it is too late. Warm the bottle (a bath of warm water) and the run lasts far longer; a bigger bottle has more thermal mass.' });
  const cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Engine speed', min: 48000, max: 125000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Air and bottle starting temperature', min: -10, max: 35, step: 1, value: 15, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const sL = slider({ label: 'Liquid propane in the bottle', min: 0.5, max: 9, step: 0.1, value: 4, unit: 'kg', fmt: v => v.toFixed(1), onInput: upd });
  const warm = toggle({ label: 'Stand the bottle in a warm-water bath (better heat transfer)', checked: false, onChange: upd });
  const ro = { f: readout('Fuel flow demanded', 'g/s', 'fuel'), s: readout('Flow starts to fall short after', 'min', 'bad'), T: readout('Lowest bottle temperature', '°C', 'cool'), run: readout('Runs until the bottle is empty', 'min', 'good'), v: readout('Verdict', '', 'good') };
  body.append(h('div', { class: 'wgrid even' }, cvA, cvB), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sN.el, sT.el, sL.el, warm.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cvA, { xmin: 0, xmax: 20, ymin: -50, ymax: 40, aspect: 1.5, xlabel: 'time (min)', ylabel: 'bottle temperature (°C)', title: 'The bottle cools as it boils', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cvB, { xmin: 0, xmax: 20, ymin: 0, ymax: 4, aspect: 1.5, xlabel: 'time (min)', ylabel: 'fuel flow (g/s)', title: 'Flow demanded vs flow available', margin: { l: 52, r: 12, t: 28, b: 40 } });
  function upd() {
    const g = steadyAt({ ...CJ1 }, sN.get(), isa(0)), Tk = 273.15 + sT.get(), fs = new FuelSupply({ liquid: sL.get(), UA: warm.get() ? 25 : 4, T: Tk });
    const ts = [], Tb = [], avail = [], dem = []; let t = 0, starved = null, Tmin = Tk, run = null;
    while (t < 1500) {
      const mf = fs.step(1, g.mf, g.P02); Tmin = Math.min(Tmin, fs.Tb);
      if (starved == null && fs.starved(g.mf, g.P02)) starved = t;
      if (t % 10 === 0) { ts.push(t / 60); Tb.push(fs.Tb - 273.15); avail.push(fs.maxFlow(g.P02) * 1000); dem.push(fs.empty ? 0 : g.mf * 1000); }
      t++; if (fs.empty) { run = t; ts.push(t / 60); Tb.push(fs.Tb - 273.15); avail.push(0); dem.push(0); break; }
    }
    ro.f.set((g.mf * 1000).toFixed(2)); ro.s.set(starved != null && (run == null || starved < run - 5) ? (starved / 60).toFixed(1) : '–', starved != null ? 'bad' : 'good'); ro.T.set((Tmin - 273.15).toFixed(0)); ro.run.set(run ? (run / 60).toFixed(1) : '> 25');
    ro.v.set(starved != null && (run == null || starved < run - 5) ? 'FREEZE-OFF: engine starves' : 'fuel flow holds', starved != null && (run == null || starved < run - 5) ? 'bad' : 'good');
    let c = p1.begin().col; p1.axes(); p1.line(ts, Tb, { color: c.air, width: 3 }); p1.hline(-42, { color: c.muted, label: 'propane boils at −42 °C', align: 'right' });
    if (starved != null) p1.vline(starved / 60, { color: c.bad, label: 'starved' });
    c = p2.begin().col; p2.set({ ymax: Math.max(1, Math.ceil(g.mf * 1000 * 1.4)) }); p2.axes(); p2.line(ts, dem, { color: c.fire, width: 3 }); p2.line(ts, avail.map(v => Math.min(v, p2.o.ymax * 0.99)), { color: c.air, width: 3, dash: [6, 4] }); p2.text(19.6, g.mf * 1000 + p2.o.ymax * 0.07, 'demanded', { color: c.fire, align: 'right', weight: 700 }); p2.text(19.6, p2.o.ymax * 0.9, 'what the bottle can deliver', { color: c.air, align: 'right', weight: 700 });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
