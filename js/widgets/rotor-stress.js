// Centrifugal stress in a turbine blade root and a disc, vs rpm; safety factor and burst speed.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { MATERIALS, yieldAt } from './material-strength.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Spinning stress: will the turbine wheel hold together?', note: 'Blade root: σ = k·½ρω²(r_t² − r_h²) (k ≈ 0.85 for our tapered blade). Disc with a small bore: peak σ ≈ 0.83·ρ·U² (solid disc: 0.41·ρU²), ignoring the blade load on the rim (which makes it worse). Compare with yield at the metal temperature. The safety factor against bursting is the square root of the strength ratio.' });
  const cv = h('canvas', { class: 'plot' });
  const mats = MATERIALS.filter(m => ['al', 'al2', 's304', 's310', 'i625', 'i718', 'mild', 'ti'].includes(m.id));
  const sel = select({ label: 'Material', options: mats.map(m => [m.id, m.n]), value: 'i718', onChange: upd });
  const part = select({ label: 'Part', options: [['turb', 'Turbine wheel (blade tip r = 29.7 mm, hub r = 19.5 mm, ~750 °C)'], ['comp', 'Compressor impeller (R = 28 mm, ~120 °C)']], value: 'turb', onChange: () => { sT.set(part.get() === 'turb' ? 750 : 120); upd(); } });
  const sN = slider({ label: 'Rotor speed', min: 30000, max: 160000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Metal temperature', min: 20, max: 1000, step: 10, value: 750, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { sb: readout('Blade-root stress', 'MPa', 'hot'), sd: readout('Disc bore stress', 'MPa', 'hot'), y: readout('Yield at this temperature', 'MPa', 'cool'), sf: readout('Safety factor (yield)', '×', 'good'), nb: readout('Burst speed (rough)', 'rpm', 'bad'), mg: readout('Speed margin to burst', '×') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, part.el, sel.el, sN.el, sT.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 30, xmax: 160, ymin: 0, ymax: 800, xlabel: 'rotor speed (1000 rpm)', ylabel: 'stress (MPa)', aspect: 1.3 });
  const stress = (kind, N) => { const m = mats.find(q => q.id === sel.get()), w = N * Math.PI / 30, rho = m.rho, isT = part.get() === 'turb';
    const rt = isT ? 0.0297 : 0.028, rh = isT ? 0.0195 : 0.006, R = isT ? 0.021 : 0.028;
    return kind === 'blade' ? 0.85 * 0.5 * rho * w * w * (rt * rt - rh * rh) / 1e6 : 0.83 * rho * (w * R) ** 2 / 1e6; };
  function upd() {
    const m = mats.find(q => q.id === sel.get()), N = sN.get(), T = sT.get(), isT = part.get() === 'turb';
    const sb = stress('blade', N), sd = stress('disc', N), s = Math.max(isT ? sb : 0, sd), y = yieldAt(m, T), uts = y * 1.25 + 10;
    ro.sb.set(sb.toFixed(0)); ro.sd.set(sd.toFixed(0)); ro.y.set(y.toFixed(0)); ro.sf.set((y / s).toFixed(2), y / s < 1.2 ? 'bad' : y / s < 1.8 ? 'fuel' : 'good');
    const Nb = N * Math.sqrt(uts / s); ro.nb.set((Nb / 1000).toFixed(0) + 'k'); ro.mg.set((Nb / 115000).toFixed(2), Nb / 115000 < 1.25 ? 'bad' : 'good');
    const c = p.begin().col; p.set({ ymax: Math.max(300, Math.ceil(Math.max(y * 1.3, stress(isT ? 'blade' : 'disc', 160000)) / 100) * 100) }); p.axes();
    const xs = [], b = [], d = []; for (let q = 30; q <= 160; q += 2) { xs.push(q); b.push(stress('blade', q * 1000)); d.push(stress('disc', q * 1000)); }
    p.hband(0, y, { color: c.ok, alpha: .08 }); p.hline(y, { color: c.ok, width: 2, label: 'yield at ' + T + ' °C: ' + y.toFixed(0) + ' MPa', align: 'right' });
    if (isT) p.line(xs, b, { color: c.fire, width: 3 }); p.line(xs, d, { color: c.fuel, width: 3, dash: [6, 4] });
    p.vline(115, { color: c.muted, label: 'CJ-1 full power' }); p.vline(125, { color: c.bad, dash: [3, 3], alpha: .6 });
    p.dot(N / 1000, isT ? sb : sd, { color: c.fire });
    p.legend(isT ? [[c.fire, 'blade root'], [c.fuel, 'disc bore', [6, 4]]] : [[c.fuel, 'impeller bore', [6, 4]]], { pos: 'tl' });
  }
  p.onDraw(upd); upd();
}
