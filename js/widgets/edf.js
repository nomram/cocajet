// Electric ducted fan: the "electric jet". Thrust from electrical power, and the honest comparison with a propane turbojet: efficiency vs energy density.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { fanThrust, fanPowerFor, RHO0 } from '../electric-model.js';

const TSFC = 2.86e-3 / 58;                                // CJ-1: propane flow per newton [kg/(N s)]
const LHV = 46.4e6, BOTTLE = 0.35;                         // propane heating value; tank + regulator + hose [kg]
export default function init(el) {
  const { body } = shell(el, { title: 'The electric jet: ducted fan thrust, and how it compares with the propane turbojet', note: 'A ducted fan is an actuator disk: electricity → motor → fan → a column of accelerated air, F = ṁ(V<sub>e</sub> − V<sub>0</sub>). Per unit of energy it is far <i>more efficient</i> than a combustion jet, because it makes thrust from electricity without the thermodynamic penalty of heating air. But a kilogram of battery stores 70× less energy than a kilogram of propane. Set the thrust you need and the run time, and see what each costs to carry.' });
  const cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const sD = slider({ label: 'Fan diameter', min: 50, max: 140, step: 1, value: 90, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sAe = slider({ label: 'Exit nozzle area ÷ fan area', min: 0.55, max: 1, step: 0.01, value: 0.85, fmt: v => v.toFixed(2), onInput: upd });
  const sE = slider({ label: 'Battery → air flow efficiency (ESC × motor × fan)', min: 0.3, max: 0.75, step: 0.01, value: 0.55, fmt: v => (v * 100).toFixed(0) + ' %', onInput: upd });
  const sP = slider({ label: 'Electrical power', min: 0.3, max: 12, step: 0.1, value: 4.5, unit: 'kW', fmt: v => v.toFixed(1), onInput: upd });
  const sB = slider({ label: 'Battery specific energy', min: 120, max: 300, step: 5, value: 180, unit: 'Wh/kg', fmt: v => v.toFixed(0), onInput: upd });
  const sF = slider({ label: 'Thrust target for the comparison', min: 5, max: 120, step: 1, value: 58, unit: 'N', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { F: readout('Static thrust at the set power', 'N', 'fuel'), Ve: readout('Jet speed', 'm/s', 'cool'), eff: readout('Thrust per electrical kW', 'N/kW', 'good'), jet: readout('CJ-1 per kW of fuel heat', 'N/kW', 'hot'), Pf: readout('Electric power for the target thrust', 'kW', 'cool'), m5: readout('5-minute run: battery vs propane', 'kg', 'fuel'), r: readout('Battery ÷ propane mass', '×', 'bad') };
  body.append(h('div', { class: 'wgrid even' }, cvA, cvB), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sD.el, sAe.el, sE.el, sP.el, sB.el, sF.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pA = new Plot(cvA, { xmin: 0, xmax: 120, ymin: 0, ymax: 100, aspect: 1.5, xlabel: 'flight speed (m/s)', ylabel: 'thrust (N)', title: 'Thrust falls with speed, just like a jet', margin: { l: 50, r: 12, t: 28, b: 40 } });
  const pB = new Plot(cvB, { xmin: 0, xmax: 15, ymin: 0, ymax: 5, aspect: 1.5, xlabel: 'run time (minutes)', ylabel: 'mass of the energy store (kg)', title: 'What it costs to carry the energy for the thrust target', margin: { l: 50, r: 12, t: 28, b: 40 } });
  function upd() {
    const A = Math.PI / 4 * (sD.get() / 1000) ** 2, Ae = sAe.get() * A, eta = sE.get(), Pel = sP.get() * 1000, spec = sB.get() / 1000 * 3600e3 * 0.9;      // J/kg, 90 % usable
    const r0 = fanThrust(eta * Pel, Ae, 0), Ftar = sF.get(), Pneed = fanPowerFor(Ftar, Ae) / eta;
    const mBat5 = Pneed * 300 / spec, mJet5 = TSFC * Ftar * 300 + BOTTLE;
    ro.F.set(r0.F.toFixed(0)); ro.Ve.set(r0.Ve.toFixed(0)); ro.eff.set((r0.F / (Pel / 1000)).toFixed(1)); ro.jet.set((58 / (2.86e-3 * LHV / 1000)).toFixed(2));
    ro.Pf.set((Pneed / 1000).toFixed(1)); ro.m5.set(mBat5.toFixed(2) + ' vs ' + mJet5.toFixed(2)); ro.r.set((mBat5 / mJet5).toFixed(1), mBat5 > mJet5 ? 'bad' : 'good');
    let c = pA.begin().col; const xs = [], ys = []; for (let V = 0; V <= 120; V += 2) { xs.push(V); ys.push(fanThrust(eta * Pel, Ae, V).F); }
    pA.set({ ymax: Math.max(60, Math.ceil(Math.max(...ys, 58) * 1.1 / 10) * 10) }); c = pA.begin().col; pA.axes();
    pA.hline(58, { color: c.fire, dash: [6, 4], label: 'CJ-1 turbojet: 58 N (static)', align: 'right' }); pA.area(xs, xs.map(() => 0), ys, { color: c.air, alpha: .15 }); pA.line(xs, ys, { color: c.air, width: 3 });
    pA.text(118, ys[ys.length - 1] + pA.o.ymax * 0.06, 'electric ducted fan', { color: c.air, align: 'right', weight: 800 });
    const T = [], mb = [], mj = []; for (let t = 0; t <= 15; t += 0.5) { T.push(t); mb.push(Pneed * t * 60 / spec); mj.push(TSFC * Ftar * t * 60 + BOTTLE); }
    pB.set({ ymax: Math.max(1, Math.ceil(Math.max(...mb, ...mj) * 1.08)) }); c = pB.begin().col; pB.axes();
    pB.line(T, mb, { color: c.air, width: 3 }); pB.line(T, mj, { color: c.fire, width: 3 }); pB.vline(5, { color: c.muted, label: '5 min' });
    pB.text(14.6, mb[mb.length - 1] * 0.93, 'battery + electric fan', { color: c.air, align: 'right', weight: 800 }); pB.text(14.6, mj[mj.length - 1] + pB.o.ymax * 0.07, 'propane + bottle + turbojet', { color: c.fire, align: 'right', weight: 800 });
  }
  pA.onDraw(upd); pB.onDraw(upd); upd();
}
