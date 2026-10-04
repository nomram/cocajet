// Why n < 1 matters: gas made vs gas let out, as a function of chamber pressure. Same picture as the Semenov diagram of chapter 10.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { cstar, RU } from '../rocket-model.js';

const RHO = 1750, A_COEF = 4.0, TC = 3100, MW = 30, GAM = 1.19, AB = 0.01, VC = 0.003;       // generic numbers: this is about the exponent, not the propellant
export default function init(el) {
  const { body } = shell(el, { title: 'Stable pressure or runaway? Gas made vs gas let out', note: 'The propellant makes gas at a rate that grows like P<sup>n</sup> (the <span style="color:var(--fire);font-weight:700">made</span> curve); the throat lets gas out at a rate that grows like P (the <span style="color:var(--air);font-weight:700">let out</span> line). Where they cross, the pressure holds. If n &lt; 1 the made-curve bends <i>under</i> the line, so a pressure rise lets out more than it makes and the pressure falls back: <b>stable</b>. If n ≥ 1 the made-curve is as steep as the line or steeper: any rise makes still more gas than can leave, the pressure feeds on itself, and the case bursts in milliseconds. This is exactly the Semenov picture of chapter 10, with pressure in place of temperature.' });
  const cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Pressure exponent n', min: 0.1, max: 1.2, step: 0.01, value: 0.35, fmt: v => v.toFixed(2), onInput: upd });
  const sK = slider({ label: 'Design operating pressure (sets the throat)', min: 1, max: 8, step: 0.1, value: 3, unit: 'MPa', fmt: v => v.toFixed(1), onInput: upd });
  const sBl = slider({ label: 'Throat partly blocked (debris, slag, a dropped piece)', min: 0, max: 60, step: 1, value: 0, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const sCr = slider({ label: 'Crack or void: extra burning area', min: 0, max: 100, step: 1, value: 0, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const st = select({ label: 'Start the clock from', options: [['up', 'a +25 % pressure kick'], ['down', 'a −25 % pressure kick'], ['eq', 'the normal operating pressure']], value: 'up', onChange: upd });
  const ro = { v: readout('Verdict', '', 'good'), P: readout('Operating pressure', 'MPa', 'hot'), sens: readout('Pressure change for +10 % burning area', '%', 'cool'), des: readout('Design Kn = Ab / At', '', 'cool'), tb: readout('Time to burst', 'ms', 'fuel') };
  body.append(h('div', { class: 'wgrid even' }, cvA, cvB), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sN.el, sK.el, sBl.el, sCr.el, st.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pA = new Plot(cvA, { xmin: 0, xmax: 10, ymin: 0, ymax: 1, aspect: 1.5, xlabel: 'chamber pressure (MPa)', ylabel: 'gas flow (kg/s)', title: 'Gas made vs gas let out', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const pB = new Plot(cvB, { xmin: 0, xmax: 1, ymin: 0, ymax: 10, aspect: 1.5, xlabel: 'time (s)', ylabel: 'chamber pressure (MPa)', title: 'What the pressure does', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const cs = cstar(TC, MW, GAM), Rg = RU / MW;
  const Peq = (n, Kn) => Math.abs(1 - n) < 1e-3 ? NaN : 1e6 * Math.pow(RHO * cs * A_COEF * Kn / 1e9, 1 / (1 - n));        // Pa
  function upd() {
    const n = sN.get(), Pd = sK.get(), Kd = Math.pow(Pd, 1 - n) * 1e9 / (RHO * cs * A_COEF), bl = sBl.get() / 100, cr = sCr.get() / 100, At = AB / Kd * (1 - bl), Ab = AB * (1 + cr);
    const gen = P => RHO * Ab * (A_COEF / 1000) * Math.pow(P / 1e6, n), out = P => P * At / cs;
    const Pdes = Pd, Pop = Peq(n, Ab / At) / 1e6, stable = n < 1;
    const Pb = 2.5 * Pd;                                           // case burst pressure: 2.5 × the design pressure
    const Pshow = Math.max(0.5, Math.min(60, Number.isFinite(Pop) ? Pop : Pdes));
    ro.v.set(stable ? 'stable' : 'RUNAWAY', stable ? 'good' : 'bad'); ro.P.set(Number.isFinite(Pop) ? Pop.toFixed(2) : '–', Pop > Pb ? 'bad' : 'hot'); ro.des.set(Kd.toFixed(0));
    ro.sens.set(stable ? ((Math.pow(1.1, 1 / (1 - n)) - 1) * 100).toFixed(0) : '∞', stable && n < 0.6 ? 'cool' : 'bad');
    // transient: dP/dt = (R T / V) (gen - out)
    const eqP = Number.isFinite(Pop) ? Pop * 1e6 : Pdes * 1e6; let P = st.get() === 'up' ? 1.25 * eqP : st.get() === 'down' ? 0.75 * eqP : eqP;
    const tau = VC * cs / (Rg * TC * At), dt = tau / 40, T = Math.min(2.5, Math.max(0.3, 14 * tau)); let t = 0, tb = null, ts = [0], Ps = [P / 1e6];
    for (let i = 0; i < 4000 && t < T; i++) {
      P += dt * (Rg * TC / VC) * (gen(P) - out(P)); P = Math.max(P, 1e4); t += dt;
      if (i % 4 === 0) { ts.push(t); Ps.push(P / 1e6); }
      if (P / 1e6 > Pb && tb == null) { tb = t; break; }
      if (P < 2e4) break;
    }
    ro.tb.set(tb != null ? (tb * 1000).toFixed(0) : '–', tb != null ? 'bad' : 'cool');
    // diagram
    const xmax = Math.max(1, Math.min(60, Math.max(Pshow * 1.9, 1.3 * Pb)));
    const gmax = Math.max(gen(xmax * 1e6), out(xmax * 1e6)); pA.set({ xmax, ymax: Math.max(0.05, Math.min(gmax, 3 * out(Pshow * 1e6))) * 1.05 });
    let c = pA.begin().col; pA.axes(); pA.clip(true);
    const xs = [], g1 = [], o1 = []; for (let i = 0; i <= 160; i++) { const Pm = xmax * i / 160; xs.push(Pm); g1.push(gen(Pm * 1e6)); o1.push(out(Pm * 1e6)); }
    pA.line(xs, g1, { color: c.fire, width: 3.2 }); pA.line(xs, o1, { color: c.air, width: 3 });
    // arrows that show which way the pressure moves
    const ya = pA.o.ymax * 0.07; for (let i = 1; i < 12; i++) { const Pm = xmax * i / 12, d = gen(Pm * 1e6) - out(Pm * 1e6); pA.arrow(Pm - Math.sign(d) * xmax * 0.018, ya, Pm + Math.sign(d) * xmax * 0.018, ya, { color: d > 0 ? c.fire : c.air, width: 2.4, head: 6 }); }
    pA.vline(Pb, { color: c.bad, label: 'burst', alpha: .9 }); pA.clip(false);
    pA.text(xmax * 0.03, pA.o.ymax * 0.93, 'gas made  ∝ Pⁿ', { color: c.fire, weight: 800 }); pA.text(xmax * 0.03, pA.o.ymax * 0.84, 'gas let out  ∝ P', { color: c.air, weight: 800 });
    if (Number.isFinite(Pop) && Pop < xmax) pA.dot(Pop, out(Pop * 1e6), { color: stable ? c.ok : c.bad, r: 7 });
    // transient
    pB.set({ xmax: Math.max(ts[ts.length - 1], 0.05), ymax: Math.max(1, Math.min(70, Math.max(Pb * 1.15, ...Ps) * 1.05)) }); c = pB.begin().col; pB.axes();
    pB.hband(Pb, pB.o.ymax, { color: c.bad, alpha: .08 }); pB.hline(Pb, { color: c.bad, label: 'case bursts', align: 'right', width: 2 });
    if (Number.isFinite(Pop)) pB.hline(Pop, { color: c.muted, label: 'equilibrium', align: 'left' });
    pB.line(ts, Ps, { color: stable && tb == null ? c.ok : c.bad, width: 3 }); if (tb != null) pB.dot(ts[ts.length - 1], Ps[Ps.length - 1], { color: c.bad, r: 8 });
  }
  pA.onDraw(upd); pB.onDraw(upd); upd();
}
