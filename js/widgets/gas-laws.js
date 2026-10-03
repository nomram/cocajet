// Gas-law processes on a pressure–volume diagram. Area under the curve = work.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';

const R = 287.05, g = 1.4, cv = R / (g - 1), cp = R * g / (g - 1);

export default function init(el) {
  const { body } = shell(el, { title: 'Gas laws on a P–V diagram: pick a process, move the volume',
    note: 'Per kilogram of air starting at 101.3 kPa and 15 °C. The shaded area under the path is the <strong>work</strong> done on (or by) the gas. First law: ΔU = Q + W_on. Adiabatic means no heat in or out: that is what happens in a fast compressor.' });
  const cvs = h('canvas', { class: 'plot' });
  const sel = select({ label: 'Process', options: [['adiabatic', 'Adiabatic (no heat exchange): P·vᵞ = const'], ['isothermal', 'Isothermal (temperature held): P·v = const'], ['isobaric', 'Isobaric (pressure held)'], ['isochoric', 'Isochoric (volume held)']], value: 'adiabatic', onChange: upd });
  const sV = slider({ label: 'Final specific volume  v₂ (m³/kg)', min: 0.15, max: 1.6, step: 0.005, value: 0.4, fmt: v => v.toFixed(3), onInput: upd });
  const sT = slider({ label: 'Final temperature (for isobaric / isochoric)', min: 150, max: 1400, step: 5, value: 600, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { P: readout('Final pressure', 'kPa', 'cool'), T: readout('Final temperature', 'K', 'hot'), W: readout('Work done ON the gas', 'kJ/kg', 'fuel'), Q: readout('Heat added', 'kJ/kg', 'hot'), U: readout('Internal energy change', 'kJ/kg') };
  const note = h('div', { class: 'callout', style: { margin: '10px 0 0' } });
  body.append(h('div', { class: 'wgrid' }, cvs, h('div', { class: 'ctls' }, sel.el, sV.el, sT.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), note)));
  const p = new Plot(cvs, { xmin: 0, xmax: 1.7, ymin: 0, ymax: 1100, xlabel: 'specific volume v (m³ per kg)', ylabel: 'pressure P (kPa)', aspect: 1.35, margin: { l: 58, r: 14, t: 14, b: 44 } });
  const P1 = 101325, T1 = 288.15, v1 = R * T1 / P1;
  function endState() {
    const proc = sel.get();
    let v2 = sV.get(), P2, T2, W, Q, path;
    if (proc === 'adiabatic') { P2 = P1 * Math.pow(v1 / v2, g); T2 = P2 * v2 / R; W = cv * (T2 - T1); Q = 0; path = (v) => P1 * Math.pow(v1 / v, g); }
    else if (proc === 'isothermal') { P2 = P1 * v1 / v2; T2 = T1; W = R * T1 * Math.log(v1 / v2); Q = -W; path = (v) => P1 * v1 / v; }
    else if (proc === 'isobaric') { T2 = sT.get(); v2 = R * T2 / P1; P2 = P1; W = -P1 * (v2 - v1); Q = cp * (T2 - T1); path = () => P1; }
    else { T2 = sT.get(); P2 = P1 * T2 / T1; v2 = v1; W = 0; Q = cv * (T2 - T1); path = null; }
    return { proc, v2, P2, T2, W, Q, path };
  }
  function upd() {
    const e = endState(), c = p.begin().col;
    sV.el.style.display = (e.proc === 'adiabatic' || e.proc === 'isothermal') ? '' : 'none';
    sT.el.style.display = (e.proc === 'isobaric' || e.proc === 'isochoric') ? '' : 'none';
    p.set({ ymax: Math.max(400, Math.ceil(e.P2 / 1000 / 100) * 100 + 100), xmax: Math.max(1.7, e.v2 * 1.08) });
    p.axes();
    p.fn(v => P1 * v1 / v / 1000, 0.1, p.o.xmax, { color: c.air, width: 1.4, dash: [3, 4], alpha: .8 });
    p.fn(v => P1 * Math.pow(v1 / v, g) / 1000, 0.1, p.o.xmax, { color: c.fire, width: 1.4, dash: [3, 4], alpha: .8 });
    p.text(p.o.xmax * 0.97, P1 * v1 / (p.o.xmax * 0.97) / 1000 + 22, 'isotherm (15 °C)', { color: c.air, size: 11, align: 'right', base: 'bottom' });
    // work area
    const xs = [], y1 = [], y0 = [];
    const a = Math.min(v1, e.v2), b = Math.max(v1, e.v2);
    if (e.path) { for (let i = 0; i <= 80; i++) { const v = a + (b - a) * i / 80; xs.push(v); y1.push(e.path(v) / 1000); y0.push(0); } p.area(xs, y0, y1, { color: c.fuel, alpha: .28 }); }
    // path
    if (e.path) p.fn(v => e.path(v) / 1000, a, b, { color: c.strong, width: 3 }, 80);
    else p.line([v1, v1], [P1 / 1000, e.P2 / 1000], { color: c.strong, width: 3 });
    p.dot(v1, P1 / 1000, { color: c.air }); p.dot(e.v2, e.P2 / 1000, { color: c.fire });
    p.text(v1, P1 / 1000 - 30, '1', { color: c.air, align: 'center' }); p.text(e.v2, e.P2 / 1000 + 28, '2', { color: c.fire, align: 'center' });
    ro.P.set((e.P2 / 1000).toFixed(0)); ro.T.set(e.T2.toFixed(0)); ro.W.set((e.W / 1000).toFixed(1)); ro.Q.set((e.Q / 1000).toFixed(1)); ro.U.set((cv * (e.T2 - T1) / 1000).toFixed(1));
    note.innerHTML = {
      adiabatic: '<span class="ct">Adiabatic</span>All the work goes into heat: squeeze to ⅓ of the volume and the air is 150 °C hotter. This is what our compressor wheel does, in about 20 microseconds per parcel of air.',
      isothermal: '<span class="ct">Isothermal</span>The gas stays cool because heat leaks out as fast as you add work. It needs less work than adiabatic compression, which is why big compressors use intercoolers.',
      isobaric: '<span class="ct">Isobaric</span>Constant pressure while heating: the gas expands and does work. This is what the flame tube does: the combustor adds heat at (nearly) constant pressure.',
      isochoric: '<span class="ct">Isochoric</span>Nothing moves, so no work: all the heat goes into internal energy and the pressure climbs.',
    }[e.proc];
  }
  p.onDraw(upd); upd();
}
