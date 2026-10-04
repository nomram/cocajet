// Where can the igniter light the CJ-1 while it is being cranked? Ignition probability over (rpm, fuel flow),
// computed from the engine model (airflow, pressure, temperature at the plug) and the spark-energy model of this chapter.
import { h, shell, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, gasPath } from '../engine-model.js';
import { EngineSim } from '../engine-sim.js';
import { plugState, lightProbability } from '../ignition-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Where does the igniter work? The CJ-1’s light-off map', note: 'Colour = chance that one spark lights the mixture at the plug, for every combination of rotor speed (which sets the air flow and pressure) and fuel flow. The white line is the path of the engine’s automatic start sequence, recorded from the simulator: the starter spins the rotor, the igniter and gas valve come on at 17 000 rpm, and the fuel is ramped until the flame takes. Too little fuel is too lean, too much is too rich: the plug only works in a band.' });
  const cv = h('canvas', { class: 'plot' });
  const sE = slider({ label: 'Spark energy', min: 0.5, max: 300, step: 0.5, value: 25, unit: 'mJ', log: true, fmt: v => v < 10 ? v.toFixed(1) : v.toFixed(0), onInput: upd });
  const sG = slider({ label: 'Electrode gap', min: 0.3, max: 3, step: 0.1, value: 0.8, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const pre = h('div', { class: 'btn-row' }, button('Weak coil, 3 mJ', () => { sE.set(3); upd(); }, 'small'), button('Normal, 25 mJ', () => { sE.set(25); upd(); }, 'small'), button('Strong, 100 mJ', () => { sE.set(100); upd(); }, 'small'));
  const ro = { w: readout('Fuel band that lights at 17 000 rpm', 'g/s', 'cool'), p: readout('Chance at the ECU’s first setting', '%', 'good') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, pre, sE.el, sG.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 5000, xmax: 60000, ymin: 0, ymax: 1.6, aspect: 1.35, xlabel: 'rotor speed (rpm)', ylabel: 'fuel flow (g/s)', xtickFmt: v => (v / 1000) + 'k', margin: { l: 50, r: 14, t: 12, b: 40 } });
  const amb = isa(0), cache = new Map();
  const st = (N) => { const k = Math.round(N / 500); let v = cache.get(k); if (!v) { const g = gasPath(CJ1, Math.max(N, 1500), 0, amb, { lit: false }); v = { g, s: plugState(g.m, g.P02, g.T02) }; cache.set(k, v); } return v; };
  // the start sequence, recorded once
  const sim = new EngineSim(); sim.start(); const path = []; let lit = null;
  for (let t = 0; t < 25 && sim.phase !== 'run'; t += 0.05) { sim.step(0.05); if (sim.N > 3000) path.push([sim.N, sim.mf * 1000]); if (sim.lit && !lit) lit = [sim.N, sim.mf * 1000]; }
  function pr(N, mfgs) { const { g, s } = st(N), phi = mfgs * 1e-3 / (0.26 * g.m) * 15.6; return lightProbability({ type: 'spark', E: sE.get(), gap: sG.get() }, phi, s); }
  function upd() {
    const c = p.begin().col; p.axes();
    p.heat((N, f) => (N < 8000 || N > 62000 || f < 0.28) ? 0 : pr(N, f), { nx: 100, ny: 70, pal: 'viridis' });
    p.colorbar('viridis', 0, 1, 'chance of light-off', false);
    p.vline(8000, { color: '#fff', alpha: .5, dash: [2, 4] }); p.text(8400, 0.12, 'rotor too slow', { color: '#fff', size: 11 }); p.text(8400, 0.04, 'to pump air', { color: '#fff', size: 11 });
    p.line(path.map(a => a[0]), path.map(a => a[1]), { color: '#fff', width: 3 });
    if (lit) { p.dot(lit[0], lit[1], { color: c.fire, r: 7 }); p.text(lit[0] + 900, lit[1] + 0.07, 'light-off', { color: '#fff', size: 12, weight: 800 }); }
    const N0 = 17000, ys = []; for (let f = 0.28; f <= 1.6; f += 0.01) if (pr(N0, f) > 0.5) ys.push(f);
    ro.w.set(ys.length ? ys[0].toFixed(2) + ' – ' + ys[ys.length - 1].toFixed(2) : 'none', ys.length ? 'good' : 'bad');
    const f0 = 0.32; ro.p.set((pr(17000, f0) * 100).toFixed(0), pr(17000, f0) > 0.5 ? 'good' : 'bad');
  }
  p.onDraw(upd); upd();
}
