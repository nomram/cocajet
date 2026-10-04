// The whole engine: choose conditions, see every station, thrust, fuel flow and the power balance.
import { h, shell, slider, select, readout, toggle, C } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, FUELS, isa, steadyAt, stationTable } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Engine cycle calculator: every station, every number', note: 'Steady-state running at the speed you choose: the model finds the fuel flow at which the turbine exactly drives the compressor, matches the flow through the turbine and the nozzle, then reports each station. Try a smaller nozzle (hotter, more pressure) or a hot day.' });
  const cvT = h('canvas', { class: 'plot' }), cvP = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Engine speed', min: 55000, max: 125000, step: 500, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sAlt = slider({ label: 'Altitude', min: 0, max: 8000, step: 100, value: 0, unit: 'm', fmt: v => v.toFixed(0), onInput: upd });
  const sdT = slider({ label: 'Day (ISA offset)', min: -30, max: 30, step: 1, value: 0, unit: '°C', fmt: v => (v > 0 ? '+' : '') + v.toFixed(0), onInput: upd });
  const sNoz = slider({ label: 'Nozzle exit area', min: 700, max: 1700, step: 10, value: 1119, unit: 'mm²', fmt: v => v.toFixed(0), onInput: upd });
  const sEc = slider({ label: 'Compressor loss multiplier', min: 0.6, max: 1.6, step: 0.05, value: 1, fmt: v => v.toFixed(2) + '×', onInput: upd });
  const sEt = slider({ label: 'Turbine peak efficiency', min: 0.65, max: 0.9, step: 0.01, value: 0.80, fmt: v => v.toFixed(2), onInput: upd });
  const fuel = select({ label: 'Fuel', options: [['propane', 'Propane'], ['kerosene', 'Kerosene'], ['methane', 'Natural gas']], value: 'propane', onChange: upd });
  const ro = { F: readout('Thrust', 'N', 'hot'), mf: readout('Fuel flow', 'g/s', 'fuel'), sfc: readout('Fuel per thrust', 'kg/(N·h)'), m: readout('Air flow', 'kg/s', 'cool'), pr: readout('Pressure ratio', '', 'cool'), egt: readout('EGT (T₄)', '°C', 'hot'), tit: readout('TIT (T₃)', '°C', 'hot'), ch: readout('Nozzle', '') };
  const tbl = h('tbody');
  body.append(h('div', { class: 'wgrid' }, h('div', { class: 'ctls' }, sN.el, sAlt.el, sdT.el, sNoz.el, sEc.el, sEt.el, fuel.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))),
    h('div', { class: 'wgrid even', style: { marginTop: '14px' } }, cvT, cvP),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, 'Station'), h('th', {}, 'What happens'), h('th', { class: 'num' }, 'T (K)'), h('th', { class: 'num' }, 'T (°C)'), h('th', { class: 'num' }, 'P (kPa)'))), tbl)));
  const pT = new Plot(cvT, { xmin: -0.3, xmax: 4.3, ymin: 0, ymax: 1400, xlabel: 'station', ylabel: 'total temperature (K)', aspect: 1.7, xticks: [0, 1, 2, 3, 4], xtickFmt: v => ['in', 'comp. out', 'turbine in', 'turbine out', 'nozzle'][Math.round(v)] || '' });
  const pP = new Plot(cvP, { xmin: -0.3, xmax: 4.3, ymin: 0, ymax: 220, xlabel: 'station', ylabel: 'total pressure (kPa)', aspect: 1.7, xticks: [0, 1, 2, 3, 4], xtickFmt: v => ['in', 'comp. out', 'turbine in', 'turbine out', 'nozzle'][Math.round(v)] || '' });
  const WHAT = ['Ambient air arrives (with ram if flying)', 'Compressor squeezes the air; it heats by ~75 K', 'Fuel burned, diluted; combustor loses ~5 % of the pressure', 'Turbine takes out just enough work to drive the compressor', 'Nozzle turns the remaining pressure into jet speed'];
  function upd() {
    const p = { ...CJ1, A5: sNoz.get() * 1e-6, etaTpk: sEt.get(), fuel: fuel.get() };
    // loss multiplier: scale the friction coefficient by editing clearance/diffuser quality (clean, monotonic knob)
    p.clearance = CJ1.clearance * sEc.get(); p.etaDiff = 1 - (1 - CJ1.etaDiff) * sEc.get();
    const amb = isa(sAlt.get(), sdT.get()), g = steadyAt(p, sN.get(), amb);
    ro.F.set(g.thrust.toFixed(1)); ro.mf.set((g.mf * 1000).toFixed(2)); ro.sfc.set(g.thrust > 1 ? (g.mf / g.thrust * 3600).toFixed(3) : '–'); ro.m.set(g.m.toFixed(3));
    ro.pr.set(g.PRc.toFixed(2)); ro.egt.set(C(g.T04).toFixed(0), C(g.T04) > 850 ? 'bad' : 'hot'); ro.tit.set(C(g.T03).toFixed(0), C(g.T03) > 900 ? 'bad' : 'hot');
    ro.ch.set(g.nozChoked ? 'choked' : 'subsonic', g.nozChoked ? 'fuel' : 'cool');
    const st = [[g.T01, g.P01], [g.T02, g.P02], [g.T03, g.P03], [g.T04, g.P04], [g.T04 * 1, g.P04]];
    st[4][0] = g.T04;
    tbl.innerHTML = '';
    ['0', '2', '3', '4', '5'].forEach((n, i) => tbl.append(h('tr', {}, h('td', {}, h('b', {}, n)), h('td', {}, WHAT[i]), h('td', { class: 'num' }, st[i][0].toFixed(0)), h('td', { class: 'num' }, C(st[i][0]).toFixed(0)), h('td', { class: 'num' }, (st[i][1] / 1000).toFixed(0)))));
    let c = pT.begin().col; pT.axes();
    pT.hline(1150, { color: c.bad, label: 'cheap-metal limit (~880 °C)', align: 'right', alpha: .8 });
    pT.line([0, 1, 2, 3, 4], st.map(s => s[0]), { color: c.fire, width: 3 }); pT.points([0, 1, 2, 3, 4], st.map(s => s[0]), { color: c.fire, r: 5, stroke: c.strong });
    ['0', '2', '3', '4', '5'].forEach((n, i) => pT.text(i, st[i][0] + 55, st[i][0].toFixed(0) + ' K', { align: 'center', color: c.text, size: 11, base: 'bottom', weight: 700 }));
    c = pP.begin().col; pP.set({ ymax: Math.max(120, Math.ceil(g.P03 / 20000) * 20 + 40) }); pP.axes();
    const prs = [g.P01, g.P02, g.P03, g.P04, g.P04].map(v => v / 1000);
    pP.hline(amb.P / 1000, { color: c.muted, label: 'ambient', align: 'right' });
    pP.line([0, 1, 2, 3, 4], prs, { color: c.air, width: 3 }); pP.points([0, 1, 2, 3, 4], prs, { color: c.air, r: 5, stroke: c.strong });
    prs.forEach((v, i) => pP.text(i, v + 6, v.toFixed(0), { align: 'center', color: c.text, size: 11, base: 'bottom', weight: 700 }));
    pP.area([3.3, 4], [amb.P / 1000, amb.P / 1000], [prs[3], prs[4]], { color: c.fuel, alpha: .3 });
    pP.text(3.65, (prs[3] + amb.P / 1000) / 2, 'turns into jet speed', { color: c.fuel, align: 'center', size: 11, weight: 800 });
  }
  [pT, pP].forEach(p => p.onDraw(upd)); upd();
}
