// Shaft power balance: where the turbine's power equals the compressor's, the engine can hold a speed.
import { h, shell, slider, toggle, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, gasPath } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Power balance: why an engine settles at one speed', note: 'The compressor demands power Pc(N). The turbine supplies Pt(N, fuel). If Pt > Pc the rotor accelerates; if Pt < Pc it slows. A steady speed is where the curves cross. The shaded gap is the power available to accelerate the rotor: that is what a fuel-controller manipulates.' });
  const cv = h('canvas', { class: 'plot' });
  const sF = slider({ label: 'Fuel flow', min: 0.4, max: 3.6, step: 0.05, value: 2.0, unit: 'g/s', fmt: v => v.toFixed(2), onInput: upd });
  const st = toggle({ label: 'Starter motor assisting (adds ~0.09 N·m below 55 000 rpm)', checked: false, onChange: upd });
  const ro = { N: readout('Equilibrium speed', 'rpm', 'good'), T: readout('Turbine inlet temperature', '°C', 'hot'), acc: readout('Acceleration at 80 000 rpm', 'rpm/s'), msg: readout('At this fuel flow', '') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sF.el, st.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)),
    h('p', { style: { fontSize: '.85rem', color: 'var(--muted)' } }, 'Try: 0.6 g/s settles at only ~30 000 rpm, far below idle (a “hung start”). 1.0 g/s settles near idle. 2.9 g/s settles at full power. Add a lot more and the equilibrium runs up past the safe maximum, into overspeed, surge or melted metal.'))));
  const p = new Plot(cv, { xmin: 20, xmax: 130, ymin: 0, ymax: 22, xlabel: 'engine speed (1000 rpm)', ylabel: 'shaft power (kW)', aspect: 1.35 });
  const amb = isa(0), pm = { ...CJ1 };
  const Ns = []; for (let N = 20000; N <= 130000; N += 2500) Ns.push(N);
  const comp = Ns.map(N => gasPath(pm, N, 0.001, amb).Pc / 1000 + (9e-14 * N ** 3 + 0.0004 * N) / 1000);
  function upd() {
    const mf = sF.get() / 1000, pt = Ns.map(N => { const g = gasPath(pm, N, mf, amb); const w = N * Math.PI / 30; return (pm.etaM * g.Pt + (st.get() ? 0.09 * Math.max(0, 1 - N / 55000) * w : 0)) / 1000; });
    // true compressor demand depends on the flow the turbine allows: recompute with the same fuel
    const pc = Ns.map(N => { const g = gasPath(pm, N, mf, amb); return (g.Pc + 9e-14 * N ** 3 + 0.0004 * N) / 1000; });
    const x = Ns.map(n => n / 1000);
    const c = p.begin().col; p.axes();
    p.area(x, pc, pt.map((v, i) => Math.max(v, pc[i])), { color: c.ok, alpha: .22 }); p.area(x, pt.map((v, i) => Math.min(v, pc[i])), pc, { color: c.bad, alpha: .18 });
    p.line(x, pc, { color: c.air, width: 3 }); p.line(x, pt, { color: c.fire, width: 3 });
    // equilibrium (stable: turbine crosses compressor from above)
    let eq = null; for (let i = 1; i < Ns.length; i++) if (pt[i - 1] >= pc[i - 1] && pt[i] < pc[i]) { const f = (pt[i - 1] - pc[i - 1]) / ((pt[i - 1] - pc[i - 1]) - (pt[i] - pc[i])); eq = Ns[i - 1] + f * 2500; }
    if (eq) { const e = eq / 1000, y = pc[Math.floor((eq - 20000) / 2500)]; p.vline(e, { color: c.ok }); p.dot(e, y, { color: c.ok, r: 7 }); p.text(e + 1.5, y + 1.8, 'steady speed', { color: c.ok, size: 12, weight: 800 }); }
    p.legend([[c.air, 'compressor + drag demand'], [c.fire, 'turbine supply' + (st.get() ? ' + starter' : '')], [c.ok, 'surplus → accelerates'], [c.bad, 'deficit → slows down']], { pos: 'tl' });
    ro.N.set(eq ? eq.toFixed(0) : 'none (dies down)', eq ? 'good' : 'bad');
    if (eq) { const g = gasPath(pm, eq, mf, amb); ro.T.set((g.T03 - 273.15).toFixed(0)); } else ro.T.set('–');
    const i80 = Ns.indexOf(80000), net = (pt[i80] - pc[i80]) * 1000, w = 80000 * Math.PI / 30;
    ro.acc.set((net / (pm.I * w) * 30 / Math.PI).toFixed(0)); ro.msg.set(!eq ? 'engine cannot sustain itself' : eq > pm.Ndesign + 2000 ? 'OVERSPEED' : eq > 100000 ? 'full power' : eq > 55000 ? 'part power' : 'idle', !eq || eq > pm.Ndesign + 2000 ? 'bad' : 'good');
  }
  p.onDraw(upd); upd();
}
