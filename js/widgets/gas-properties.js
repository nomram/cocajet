// Real gases are not "cp = 1005": molecular vibrations wake up as it gets hot, so cp rises and gamma falls. The engine model uses these curves.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { Gas, SPECIES, AIR, gasFor, composition } from '../thermo.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Real gas: specific heat and γ change with temperature', note: 'A molecule stores energy in motion (translation), spinning (rotation) and, once hot enough, vibration of its bonds. Each vibration “switches on” around its characteristic temperature, so the heat needed to warm a kilogram of gas rises with temperature: cp climbs and γ = cp/(cp − R) falls. CO₂ and water vapour, the products of burning, have more modes than nitrogen, so the hot gas in the turbine is much “stickier” than cold air. The simulator and every widget in this guide use these curves instead of a fixed cp = 1005 J/(kg·K) and γ = 1.4.' });
  const cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const sT = slider({ label: 'Gas temperature', min: 250, max: 1500, step: 5, value: 1066, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sF = slider({ label: 'Fuel burned per kg of air (turbine gas)', min: 0, max: 0.06, step: 0.001, value: 0.019, unit: 'kg/kg', fmt: v => v.toFixed(3), onInput: upd });
  const sH = slider({ label: 'Humidity of the incoming air', min: 0, max: 100, step: 5, value: 0, unit: '% RH at 30 °C', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { cpA: readout('cp of cold air at T', 'J/(kg·K)', 'cool'), cpG: readout('cp of the burnt gas at T', 'J/(kg·K)', 'hot'), gA: readout('γ of air', '', 'cool'), gG: readout('γ of the burnt gas', '', 'hot'), aG: readout('Speed of sound in the burnt gas', 'm/s', 'fuel'), dh: readout('Heat to take it from 366 K (compressor exit) to T, real vs constant cp', 'kJ/kg', 'good'), err: readout('Error if you assume cp = 1005', '%', 'bad') };
  body.append(h('div', { class: 'wgrid even' }, cvA, cvB), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sT.el, sF.el, sH.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pA = new Plot(cvA, { xmin: 250, xmax: 1500, ymin: 900, ymax: 1500, aspect: 1.5, xlabel: 'temperature (K)', ylabel: 'cp (J/(kg·K))', title: 'Specific heat of the gases', margin: { l: 56, r: 12, t: 28, b: 40 } });
  const pB = new Plot(cvB, { xmin: 250, xmax: 1500, ymin: 1.2, ymax: 1.45, aspect: 1.5, xlabel: 'temperature (K)', ylabel: 'γ = cp / (cp − R)', title: 'Ratio of specific heats', margin: { l: 56, r: 12, t: 28, b: 40 } });
  const pure = n => new Gas({ [n]: 1 });
  const GAS = [['N₂', pure('N2'), '#4cc9f0'], ['O₂', pure('O2'), '#3ddc97'], ['CO₂', pure('CO2'), '#ffb703'], ['H₂O', pure('H2O'), '#b388ff']];
  function upd() {
    const T = sT.get(), f = sF.get(), rh = sH.get() / 100, psat = 610.94 * Math.exp(17.625 * 30 / (30 + 243.04)), pv = rh * psat, W = 0.622 * pv / (101325 - pv), hum = W / (1 + W);
    const air = gasFor(0, 'propane', hum), burnt = gasFor(f, 'propane', hum);
    let c = pA.begin().col; pA.axes();
    const Ts = []; for (let t = 250; t <= 1500; t += 10) Ts.push(t);
    pA.clip(true); for (const [n, g, col] of GAS) { pA.line(Ts, Ts.map(t => g.cp(t)), { color: col, width: 1.6, alpha: .85 }); const yl = g.cp(1490); if (yl < 1480) pA.text(1490, yl + (n === 'O₂' ? -22 : n === 'N₂' ? -8 : 10), n, { color: col, align: 'right', size: 11, weight: 700 }); } pA.clip(false);
    pA.text(262, 1470, 'H₂O (off the chart): 1 900 → 2 500 J/(kg·K)', { color: GAS[3][2], size: 10.5, weight: 700 });
    pA.line(Ts, Ts.map(t => air.cp(t)), { color: c.strong, width: 3 }); pA.line(Ts, Ts.map(t => burnt.cp(t)), { color: c.fire, width: 3 }); pA.hline(1005, { color: c.muted, label: 'the textbook shortcut: 1005', align: 'right' });
    pA.vline(T, { color: c.air, alpha: .8 }); pA.dot(T, air.cp(T), { color: c.strong, r: 5 }); pA.dot(T, burnt.cp(T), { color: c.fire, r: 6 });
    pA.text(560, air.cp(560) - 38, 'air', { color: c.strong, weight: 800 }); pA.text(1000, burnt.cp(1000) + 60, 'turbine gas', { color: c.fire, weight: 800 });
    c = pB.begin().col; pB.axes(); pB.line(Ts, Ts.map(t => air.gamma(t)), { color: c.strong, width: 3 }); pB.line(Ts, Ts.map(t => burnt.gamma(t)), { color: c.fire, width: 3 }); pB.hline(1.4, { color: c.muted, label: 'γ = 1.4', align: 'right' }); pB.hline(1.33, { color: c.muted, label: 'γ = 1.33 (the usual “hot gas” number)', align: 'right' });
    pB.vline(T, { color: c.air, alpha: .8 }); pB.dot(T, air.gamma(T), { color: c.strong, r: 5 }); pB.dot(T, burnt.gamma(T), { color: c.fire, r: 6 });
    ro.cpA.set(air.cp(T).toFixed(0)); ro.cpG.set(burnt.cp(T).toFixed(0)); ro.gA.set(air.gamma(T).toFixed(3)); ro.gG.set(burnt.gamma(T).toFixed(3)); ro.aG.set(burnt.a(T).toFixed(0));
    const real = burnt.h(T) - burnt.h(366), crude = 1005 * (T - 366); ro.dh.set((real / 1000).toFixed(0) + ' vs ' + (crude / 1000).toFixed(0)); ro.err.set((100 * (crude - real) / real).toFixed(0), Math.abs(crude - real) / Math.max(1, real) > 0.08 ? 'bad' : 'cool');
  }
  pA.onDraw(upd); pB.onDraw(upd); upd();
}
