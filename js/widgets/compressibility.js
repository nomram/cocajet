// Gases are compressible fluids: density changes with Mach number, and speed of sound depends on temperature.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Is air a liquid? Sort of: compressibility', note: 'Below Mach 0.3 air behaves like an incompressible liquid (density changes under 5 %). Inside a turbojet the air is routinely above Mach 0.8 and heated to 1 000 K, so engineers must treat it as a compressible gas.' });
  const cv = h('canvas', { class: 'plot' });
  const sT = slider({ label: 'Gas temperature', min: 200, max: 1500, step: 10, value: 300, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sV = slider({ label: 'Flow speed', min: 5, max: 700, step: 1, value: 150, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { a: readout('Speed of sound', 'm/s', 'cool'), M: readout('Mach number'), rho: readout('Density vs stagnation', '%', 'fuel'), P: readout('Pressure vs stagnation', '%', 'cool'), T: readout('Temp. if brought to rest', 'K', 'hot') };
  const where = h('div', { class: 'legend' });
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sT.el, sV.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)),
    h('p', { style: { fontSize: '.85rem', color: 'var(--muted)' } }, 'Where in our engine? Inlet ≈ 100 m/s (Mach 0.3) · impeller exit ≈ 330 m/s (Mach 0.8) · flame tube ≈ 40 m/s · NGV exit ≈ 450 m/s (Mach 0.7 at 1 000 K) · nozzle ≈ 380 m/s.'))));
  const p = new Plot(cv, { xmin: 0, xmax: 1.6, ymin: 0, ymax: 1.05, xlabel: 'Mach number  M = V / a', ylabel: 'isentropic ratio (static / total)', aspect: 1.5 });
  const g = 1.4;
  const r = (M, e) => Math.pow(1 + (g - 1) / 2 * M * M, e);
  function upd() {
    const T = sT.get(), V = sV.get(), a = Math.sqrt(1.4 * 287.05 * T), M = V / a;
    ro.a.set(a.toFixed(0)); ro.M.set(M.toFixed(2), M > 0.3 ? (M > 1 ? 'bad' : 'hot') : 'good');
    ro.rho.set((r(M, -1 / (g - 1)) * 100).toFixed(0)); ro.P.set((r(M, -g / (g - 1)) * 100).toFixed(0)); ro.T.set((T / r(M, -1) ).toFixed(0));
    const c = p.begin().col;
    p.band(0.3, 1.6, { color: c.warn, alpha: .06 }); p.band(1, 1.6, { color: c.bad, alpha: .07 });
    p.axes();
    p.fn(m => r(m, -1 / (g - 1)), 0, 1.6, { color: c.fire, width: 2.4 }); p.fn(m => r(m, -g / (g - 1)), 0, 1.6, { color: c.air, width: 2.4 }); p.fn(m => r(m, -1), 0, 1.6, { color: c.fuel, width: 2.4, dash: [6, 4] });
    p.vline(M, { color: c.strong }); p.vline(0.3, { color: c.muted, label: 'M = 0.3: 5 % density change' }); p.vline(1, { color: c.bad, label: 'sonic' });
    p.legend([[c.fire, 'density'], [c.air, 'pressure'], [c.fuel, 'temperature', [6, 4]]], { pos: 'tr' });
  }
  p.onDraw(upd); upd();
}
