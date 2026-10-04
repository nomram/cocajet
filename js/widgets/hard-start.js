// Hard start: propellant that flows BEFORE the flame exists pools in the chamber and then burns all at once.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';

const RT_COLD = 62e3, CS_COLD = 390, CS_HOT = 1550, Q = 3.5e6, GAM = 1.25, RT_HOT = 1.0e6, PSS = 3.0e6;      // generic: vapour at 300 K, burned gas, heat of combustion per kg of mixture
export default function init(el) {
  const { body } = shell(el, { title: 'Hard start: flow first, flame later = bomb', note: 'The same lesson in a jet engine and a rocket. If propellant (vapour) is let into the chamber <i>before</i> something is burning, it cannot leave fast, because the throat is sized for hot gas and the cold gas is denser and slower, so it <b>accumulates</b>. When the igniter finally fires, all of it burns at nearly constant volume, in milliseconds: ΔP = (γ−1)·m·q / V. The cure is a rule of sequence: <b>light the pilot first, then open the main flow</b>. The same rule lives in the CJ-1’s start procedure (chapter 7: a hot start is fuel pooled in the combustor, lit late) and in chapter 11 (the ignition window).' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sq = select({ label: 'Start sequence', options: [['pilot', 'Pilot flame first, then propellant (correct)'], ['delay', 'Propellant first, igniter after a delay'], ['same', 'Both at the same instant']], value: 'delay', onChange: upd });
  const sM = slider({ label: 'Propellant flow ṁ', min: 20, max: 500, step: 5, value: 150, unit: 'g/s', fmt: v => v.toFixed(0), onInput: upd });
  const sV = slider({ label: 'Chamber volume V', min: 0.2, max: 6, step: 0.1, value: 1.0, unit: 'L', fmt: v => v.toFixed(1), onInput: upd });
  const sD = slider({ label: 'Igniter delay after propellant starts', min: 0, max: 800, step: 5, value: 120, unit: 'ms', fmt: v => v.toFixed(0), onInput: upd });
  const sB = slider({ label: 'Chamber burst limit as a multiple of working pressure', min: 1.5, max: 5, step: 0.1, value: 3, unit: '×', fmt: v => v.toFixed(1), onInput: upd });
  const ro = { m: readout('Propellant pooled at ignition', 'g', 'fuel'), P: readout('Pressure spike', 'MPa', 'hot'), w: readout('Working pressure', 'MPa', 'cool'), s: readout('Spike / burst limit', '%', 'cool'), v: readout('Verdict', '', 'good') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sq.el, sM.el, sV.el, sD.el, sB.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv, { xmin: 0, xmax: 0.8, ymin: 0, ymax: 12, aspect: 1.5, xlabel: 'time since the propellant valve opened (s)', ylabel: 'chamber pressure (MPa)', title: 'Pressure history', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cv2, { xmin: 0, xmax: 800, ymin: 0, ymax: 12, aspect: 1.5, xlabel: 'igniter delay (ms)', ylabel: 'peak pressure (MPa)', title: 'The longer you wait, the bigger the bang', margin: { l: 52, r: 12, t: 28, b: 40 } });
  function run(mdot, V, delay, seq, burst) {
    const At = mdot * CS_HOT / PSS, tI = seq === 'pilot' ? 0 : seq === 'same' ? 0.004 : delay / 1000;
    const dt = 1e-4, ts = [], Ps = []; let t = 0, M = 0, P = 0, ignited = false, spike = 0, pooled = 0;
    if (seq === 'pilot') { ignited = true; }
    for (let i = 0; i < 12000 && t < 0.85; i++) {
      if (!ignited && t >= tI) { pooled = M; const dP = (GAM - 1) * M * Q / (V / 1000); spike = dP; ts.push(t); Ps.push(P); P += dP; ts.push(t + 1e-4); Ps.push(P); ignited = true; }
      if (!ignited) { P = M * RT_COLD / (V / 1000); M += dt * (mdot - P * At / CS_COLD); }
      else P += dt * (RT_HOT / (V / 1000)) * (mdot - P * At / CS_HOT);
      if (P < 0) P = 0; t += dt; if (i % 20 === 0 || (ignited && ts.length && t - ts[ts.length - 1] < 2e-3)) { ts.push(t); Ps.push(P); }
      if (P > 3.5 * PSS * 5) break;
    }
    return { ts, Ps, spike: Math.max(spike, ...Ps), pooled, At, tI };
  }
  function upd() {
    const mdot = sM.get() / 1000, V = sV.get(), burst = sB.get(), seq = sq.get(), r = run(mdot, V, sD.get(), seq, burst);
    const peak = Math.max(...r.Ps) / 1e6, lim = burst * PSS / 1e6, frac = peak / lim * 100;
    ro.m.set((r.pooled * 1000).toFixed(1)); ro.P.set(peak.toFixed(1), peak > lim ? 'bad' : 'hot'); ro.w.set((PSS / 1e6).toFixed(1)); ro.s.set(frac.toFixed(0), frac > 100 ? 'bad' : frac > 70 ? 'hot' : 'good');
    ro.v.set(peak > lim ? 'HARD START: chamber ruptured' : frac > 70 ? 'marginal' : 'smooth start', peak > lim ? 'bad' : frac > 70 ? 'cool' : 'good');
    let c = p1.set({ xmax: 0.8, ymax: Math.max(6, Math.ceil(Math.max(peak, lim) * 1.12)) }).begin().col; p1.axes();
    p1.hband(lim, p1.o.ymax, { color: c.bad, alpha: .08 }); p1.hline(lim, { color: c.bad, label: 'burst limit', align: 'right', width: 2 }); p1.hline(PSS / 1e6, { color: c.muted, label: 'working pressure', align: 'right' });
    p1.line(r.ts, r.Ps.map(v => v / 1e6), { color: peak > lim ? c.bad : c.fire, width: 3 }); if (seq !== 'pilot') p1.vline(r.tI, { color: c.air, label: 'igniter fires' });
    const xs = [], ys = []; for (let d = 0; d <= 800; d += 20) { xs.push(d); ys.push(Math.max(...run(mdot, V, d, 'delay', burst).Ps) / 1e6); }
    p2.set({ ymax: p1.o.ymax }); c = p2.begin().col; p2.axes(); p2.hband(lim, p2.o.ymax, { color: c.bad, alpha: .08 }); p2.hline(lim, { color: c.bad, label: 'burst limit', align: 'right', width: 2 });
    p2.line(xs, ys, { color: c.fire, width: 3 }); p2.dot(Math.min(800, seq === 'delay' ? sD.get() : seq === 'same' ? 4 : 0), peak, { color: c.air, r: 7 });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
