// Thermal runaway (Semenov): heat made by a reaction grows exponentially with T, heat lost grows only linearly.
import { h, shell, slider, toggle, readout } from '../ui.js';
import { Plot } from '../plot.js';

const R = 8.314, Q_TOT = 600e3, CAP = 1000;                     // J per kg of reactant mix, J/K heat capacity
export default function init(el) {
  const { body } = shell(el, { title: 'Runaway or steady burn? Heat made vs heat lost (Semenov diagram)', note: 'Heat <span style="color:var(--fire);font-weight:700">made</span> by the reaction grows exponentially with temperature (Arrhenius). Heat <span style="color:var(--air);font-weight:700">lost</span> to the surroundings grows only in proportion to the temperature difference. Where the curves cross, the temperature holds still. If the made-curve stays above the loss-line everywhere, the temperature can only climb: <b>thermal runaway</b>. Every jet, rocket and chemical plant is designed to keep the loss line safely above the made-curve in the places where it matters.' });
  const cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const sH = slider({ label: 'Cooling coefficient h (heat loss per kelvin)', min: 0.05, max: 3, step: 0.01, value: 0.9, unit: 'W/K', log: true, fmt: v => v.toFixed(2), onInput: upd });
  const sTa = slider({ label: 'Surroundings / inlet temperature', min: 250, max: 500, step: 1, value: 300, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sQ = slider({ label: 'Reactivity (heat made at 300 K)', min: 0.2, max: 20, step: 0.1, value: 2.5, unit: 'W', log: true, fmt: v => v.toFixed(1), onInput: upd });
  const sEa = slider({ label: 'Activation energy Eₐ', min: 40, max: 160, step: 1, value: 80, unit: 'kJ/mol', fmt: v => v.toFixed(0), onInput: upd });
  const sT0 = slider({ label: 'Starting temperature of the batch', min: 250, max: 520, step: 1, value: 305, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const burn = toggle({ label: 'Reactant is used up as it burns (finite fuel)', checked: true, onChange: upd });
  const ctl = toggle({ label: 'Feedback control: add cooling above 350 K', onChange: upd });
  const ro = { st: readout('Verdict', ''), hc: readout('Critical cooling h*', 'W/K', 'cool'), te: readout('Steady temperature', 'K', 'good'), pk: readout('Peak temperature', 'K', 'hot') };
  body.append(h('div', { class: 'wgrid even' }, cvA, cvB), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sH.el, sTa.el, sQ.el, sEa.el, sT0.el, burn.el, ctl.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pA = new Plot(cvA, { xmin: 280, xmax: 700, ymin: 0, ymax: 60, aspect: 1.45, xlabel: 'temperature (K)', ylabel: 'power (W)', title: 'Heat made vs heat lost', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const pB = new Plot(cvB, { xmin: 0, xmax: 1200, ymin: 250, ymax: 1000, aspect: 1.45, xlabel: 'time (s)', ylabel: 'temperature (K)', title: 'What the temperature does', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const G = (T, q, Ea) => q * Math.exp(Ea * 1000 / R * (1 / 300 - 1 / T));
  function upd() {
    const h_ = sH.get(), Ta = sTa.get(), q = sQ.get(), Ea = sEa.get(), T0 = sT0.get();
    // critical h: the smallest value of G/(T-Ta); below it the loss line never touches the made-curve
    let hc = 1e9, Tc = Ta; for (let T = Ta + 1; T < 900; T += 0.5) { const r = G(T, q, Ea) / (T - Ta); if (r < hc) { hc = r; Tc = T; } }
    const roots = []; let prev = G(Ta + 0.01, q, Ea) - h_ * 0.01;
    for (let T = Ta + 0.5; T < 1400; T += 0.5) { const f = G(T, q, Ea) - h_ * (T - Ta); if (prev > 0 && f <= 0 || prev < 0 && f >= 0) roots.push({ T, stable: prev > 0 }); prev = f; }
    const low = roots.find(r => r.stable), runaway = h_ < hc;
    ro.st.set(runaway ? 'RUNAWAY' : 'stable', runaway ? 'bad' : 'good'); ro.hc.set(hc.toFixed(2)); ro.te.set(low ? low.T.toFixed(0) : '–', low ? 'good' : 'bad');
    // --- diagram ---
    const ymax = Math.max(40, Math.min(300, G(Math.min(700, Tc + 120), q, Ea))) ;
    pA.set({ ymax, xmin: Math.max(250, Ta - 20) }); let c = pA.begin().col; pA.axes();
    const xs = [], g = []; for (let T = pA.o.xmin; T <= 700; T += 2) { xs.push(T); g.push(G(T, q, Ea)); }
    pA.clip(true); pA.line(xs, g, { color: c.fire, width: 3.2 }); pA.line([Ta, 700], [0, h_ * (700 - Ta)], { color: c.air, width: 3 });
    pA.line([Ta, 700], [0, hc * (700 - Ta)], { color: c.muted, width: 1.5, dash: [6, 5] }); pA.clip(false);
    pA.text(pA.o.xmin + 6, ymax * 0.93, 'heat made (reaction)', { color: c.fire, weight: 800 }); pA.text(pA.o.xmin + 6, ymax * 0.84, 'heat lost (cooling)', { color: c.air, weight: 800 });
    pA.text(695, hc * (695 - Ta) * 0.9, 'critical line h*', { color: c.muted, align: 'right', size: 11 });
    for (const r of roots) if (r.T < 700) pA.dot(r.T, G(r.T, q, Ea), { color: r.stable ? c.ok : c.bad, r: 6 });
    // --- time simulation ---
    const dt = 0.5, N = 2400; let T = T0, cfrac = 1, pk = T, ignT = null; const ts = [0], Ts = [T];
    for (let i = 1; i <= N; i++) {
      const gen = G(T, q, Ea) * (burn.get() ? cfrac : 1), loss = h_ * (T - Ta) + (ctl.get() && T > 350 ? 1.2 * (T - 350) : 0);
      T += dt * (gen - loss) / CAP; if (burn.get()) cfrac = Math.max(0, cfrac - dt * gen / Q_TOT);
      T = Math.min(T, 2200); pk = Math.max(pk, T); if (ignT == null && T > Ta + 120) ignT = i * dt;
      if (i % 4 === 0) { ts.push(i * dt); Ts.push(T); }
    }
    ro.pk.set(pk.toFixed(0), pk > 800 ? 'bad' : 'hot');
    pB.set({ ymax: Math.max(600, Math.ceil(Math.min(2200, pk + 60) / 100) * 100), ymin: Math.min(250, Ta - 20) }); c = pB.begin().col; pB.axes();
    pB.hline(Ta, { color: c.muted, alpha: .6, label: 'surroundings', align: 'right' }); pB.line(ts, Ts, { color: runaway ? c.bad : c.ok, width: 3 });
    if (ignT != null) pB.vline(ignT, { color: c.bad, label: 'runaway begins' });
  }
  pA.onDraw(upd); pB.onDraw(upd); upd();
}
