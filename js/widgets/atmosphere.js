// The standard atmosphere: pressure, temperature, density, speed of sound, and what altitude does to engine thrust.
import { h, shell, slider, readout, legend } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'The atmosphere and the engine', note: 'ISA = International Standard Atmosphere. A jet makes thrust by accelerating <em>mass</em> of air; thin air means less mass per second, so thrust falls almost in proportion to density.' });
  const cv = h('canvas', { class: 'plot' });
  const cv2 = h('canvas', { class: 'plot' });
  const sAlt = slider({ label: 'Altitude', min: 0, max: 15000, step: 100, value: 0, unit: 'm', fmt: v => v.toFixed(0), onInput: upd });
  const sDT = slider({ label: 'Hot / cold day (ISA offset)', min: -30, max: 30, step: 1, value: 0, unit: '°C', fmt: v => (v > 0 ? '+' : '') + v.toFixed(0), onInput: upd });
  const ro = { P: readout('Pressure', 'kPa', 'cool'), T: readout('Temperature', '°C', 'fuel'), rho: readout('Density', 'kg/m³', 'cool'), a: readout('Speed of sound', 'm/s'), F: readout('Engine thrust (115k rpm)', 'N', 'hot'), f: readout('Thrust vs sea level', '%', 'hot') };
  body.append(h('div', { class: 'wgrid' }, h('div', {}, cv, h('div', { style: { height: '10px' } }), cv2), h('div', { class: 'ctls' }, sAlt.el, sDT.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)),
    h('p', { style: { fontSize: '.85rem', color: 'var(--muted)' } }, 'Try it: slide to 10 000 m (airliner altitude). Pressure drops to ~26 kPa, air is −50 °C, and the same engine makes about a third of its sea-level thrust (the model re-solves the whole gas path).'))));

  const p1 = new Plot(cv, { xmin: 0, xmax: 110, ymin: 0, ymax: 15, xlabel: 'pressure (kPa)  /  density (% of sea level)', ylabel: 'altitude (km)', aspect: 1.9 });
  const p2 = new Plot(cv2, { xmin: 0, xmax: 15, ymin: 0, ymax: 110, xlabel: 'altitude (km)', ylabel: 'thrust (N)', aspect: 2.6 });
  // thrust lapse curve (computed once per ΔT change)
  let curve = [];
  const base = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(0)).thrust;
  function buildCurve() { curve = []; for (let km = 0; km <= 15; km += 1) curve.push(steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(km * 1000, sDT.get())).thrust); }
  let lastDT = null;
  function upd() {
    const alt = sAlt.get(), dT = sDT.get(), a = isa(alt, dT);
    if (dT !== lastDT) { buildCurve(); lastDT = dT; }
    const g = steadyAt({ ...CJ1 }, CJ1.Ndesign, a);
    ro.P.set((a.P / 1000).toFixed(1)); ro.T.set((a.T - 273.15).toFixed(0)); ro.rho.set(a.rho.toFixed(3)); ro.a.set(a.a.toFixed(0));
    ro.F.set(g.thrust.toFixed(1)); ro.f.set((g.thrust / base * 100).toFixed(0));
    const c = p1.begin().col;
    p1.axes();
    const hs = [], ps = [], rs = [];
    for (let km = 0; km <= 15; km += 0.25) { const q = isa(km * 1000, dT); hs.push(km); ps.push(q.P / 1000); rs.push(q.rho / 1.225 * 100); }
    // swap axes: x = value, y = altitude
    p1.line(ps, hs, { color: c.air, width: 2.4 }); p1.line(rs, hs, { color: c.fire, width: 2.4, dash: [6, 4] });
    p1.hline(alt / 1000, { color: c.muted }); p1.dot(a.P / 1000, alt / 1000, { color: c.air }); p1.dot(a.rho / 1.225 * 100, alt / 1000, { color: c.fire });
    p1.legend([[c.air, 'pressure (kPa)'], [c.fire, 'density (% of 1.225)', [6, 4]]], { pos: 'tr' });
    p1.text(95, 0.7, 'sea level', { color: c.muted, align: 'right', size: 11 });
    p2.begin().axes();
    p2.line(curve.map((_, i) => i), curve, { color: c.fire, width: 2.6 });
    p2.dot(alt / 1000, g.thrust, { color: c.fire }); p2.vline(alt / 1000, { color: c.muted });
    p2.hline(base, { color: c.muted, label: 'sea-level ISA', align: 'right' });
  }
  p1.onDraw(upd); p2.onDraw(upd);
  upd();
}
