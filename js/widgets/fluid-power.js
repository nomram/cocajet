// The energy in a moving fluid: P/A = ½ ρ v³ for air, hot exhaust and water.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';

const FLUIDS = [
  { id: 'air', name: 'Air, sea level (1.225 kg/m³)', rho: 1.225, col: 'air' },
  { id: 'air10', name: 'Air at 10 km (0.41 kg/m³)', rho: 0.413, col: 'violet' },
  { id: 'gas', name: 'Hot exhaust gas, 1 000 K (0.35 kg/m³)', rho: 0.35, col: 'fire' },
  { id: 'water', name: 'Water (1 000 kg/m³)', rho: 1000, col: 'ok' },
];
const fmtP = (w) => w >= 1e9 ? (w / 1e9).toFixed(1) + ' GW' : w >= 1e6 ? (w / 1e6).toFixed(1) + ' MW' : w >= 1e3 ? (w / 1e3).toFixed(1) + ' kW' : w.toFixed(0) + ' W';

export default function init(el) {
  const { body } = shell(el, { title: 'How much energy is in moving air (and water)?', note: 'Power flowing through each square metre: P/A = ½ρv³. Note the cube: double the speed → eight times the power. A turbine can capture only part of it (Betz limit 59 %, chapter 4).' });
  const cv = h('canvas', { class: 'plot' });
  const sV = slider({ label: 'Speed of the stream', min: 1, max: 600, step: 1, value: 12, unit: 'm/s', fmt: v => v.toFixed(0), log: true, onInput: upd });
  const sD = slider({ label: 'Rotor diameter', min: 0.1, max: 120, step: 0.1, value: 2, unit: 'm', fmt: v => v.toFixed(1), log: true, onInput: upd });
  const sel = select({ label: 'Fluid for the turbine example', options: FLUIDS.map(f => [f.id, f.name]), value: 'air', onChange: upd });
  const ro = {}; FLUIDS.forEach(f => { ro[f.id] = readout(f.name.split(' (')[0] + ' · per m²', '', f.col === 'ok' ? 'good' : f.col === 'fire' ? 'hot' : 'cool'); });
  const roT = readout('Power in the stream through the rotor', '', 'fuel'), roC = readout('Capturable at Cp = 0.40', '', 'good'), roB = readout('Betz limit (59.3 %)', '', 'cool');
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sV.el, h('div', { class: 'readouts' }, ...FLUIDS.map(f => ro[f.id].el)), h('hr', { style: { margin: '10px 0' } }), sel.el, sD.el, h('div', { class: 'readouts' }, roT.el, roC.el, roB.el))));
  const p = new Plot(cv, { xmin: 1, xmax: 600, ymin: 0.5, ymax: 1e10, xlog: true, ylog: true, xlabel: 'speed (m/s)', ylabel: 'power per m² of area (W/m²)', aspect: 1.25, margin: { l: 62, r: 14, t: 14, b: 44 } });
  function upd() {
    const v = sV.get(), c = p.begin().col; p.axes();
    FLUIDS.forEach(f => p.fn(x => 0.5 * f.rho * x ** 3, 1, 600, { color: c[f.col], width: 2.4 }, 80));
    FLUIDS.forEach(f => ro[f.id].set(fmtP(0.5 * f.rho * v ** 3)));
    const marks = [[10, 'air', 'breeze for a wind turbine'], [70, 'air', 'hurricane'], [380, 'gas', 'our jet exhaust'], [3, 'water', 'river / tidal stream'], [0.9, 'water', '']];
    marks.slice(0, 4).forEach(([x, id, t]) => { const f = FLUIDS.find(q => q.id === id); p.dot(x, 0.5 * f.rho * x ** 3, { color: c[f.col], r: 4.5 }); p.text(x * 1.12, 0.5 * f.rho * x ** 3 * 0.45, t, { size: 11, color: c.text, bg: true }); });
    p.vline(v, { color: c.strong, dash: [3, 3] });
    const f = FLUIDS.find(q => q.id === sel.get()), A = Math.PI * sD.get() ** 2 / 4, P = 0.5 * f.rho * A * v ** 3;
    roT.set(fmtP(P)); roC.set(fmtP(P * 0.4)); roB.set(fmtP(P * 16 / 27));
    p.legend(FLUIDS.map(q => [c[q.col], q.name.split(' (')[0]]), { pos: 'tl' });
  }
  p.onDraw(upd); upd();
}
