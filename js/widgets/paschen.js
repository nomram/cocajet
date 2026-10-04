// Breakdown voltage of a spark gap (Paschen's law) and why a pressurised combustor needs a stronger coil.
import { h, shell, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { paschen } from '../ignition-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'How many volts does it take to make a spark?', note: 'Air is an insulator until the electric field strips electrons off its molecules and they avalanche into a conducting channel: a spark. The voltage needed depends on the <b>number of molecules in the gap</b> (pressure ÷ temperature) times the gap: <i>Paschen’s law</i>. Compress the air in a combustor and the same gap needs far more volts; the same plug in hot, thin gas fires easily. (Air at 1 atm breaks down at about 3 kV per millimetre.)' });
  const cv = h('canvas', { class: 'plot' });
  const sG = slider({ label: 'Electrode gap', min: 0.2, max: 5, step: 0.05, value: 0.8, unit: 'mm', fmt: v => v.toFixed(2), onInput: upd });
  const sP = slider({ label: 'Gas pressure at the plug', min: 0.5, max: 6, step: 0.05, value: 1.0, unit: 'bar', fmt: v => v.toFixed(2), onInput: upd });
  const sT = slider({ label: 'Gas temperature at the plug', min: 250, max: 1500, step: 5, value: 293, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sV = slider({ label: 'Voltage your coil can deliver', min: 5, max: 40, step: 0.5, value: 15, unit: 'kV', fmt: v => v.toFixed(1), onInput: upd });
  const pre = h('div', { class: 'btn-row' }, button('Bench, still air', () => { sP.set(1.013); sT.set(293); upd(); }, 'small'), button('CJ-1 cranking (17 000 rpm)', () => { sP.set(1.05); sT.set(293); upd(); }, 'small'), button('CJ-1 at full power', () => { sP.set(1.85); sT.set(366); upd(); }, 'small'), button('Cylinder of a petrol engine, compressed', () => { sP.set(10); sT.set(600); upd(); }, 'small'));
  const ro = { vb: readout('Breakdown voltage here', 'kV', 'hot'), v0: readout('Same gap, bench air', 'kV', 'cool'), x: readout('Compared with the bench', '×', 'fuel'), ok: readout('Will your coil fire it?', '') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, pre, sG.el, sP.el, sT.el, sV.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 0.2, xmax: 5, ymin: 0, ymax: 40, aspect: 1.35, xlabel: 'electrode gap (mm)', ylabel: 'breakdown voltage (kV)' });
  function upd() {
    const g = sG.get(), P = sP.get(), T = sT.get(), V = sV.get(), vb = paschen(g, P, T) / 1000, v0 = paschen(g, 1.01325, 293) / 1000;
    ro.vb.set(isFinite(vb) ? vb.toFixed(1) : '–'); ro.v0.set(v0.toFixed(1)); ro.x.set(isFinite(vb) ? (vb / v0).toFixed(2) : '–'); ro.ok.set(V > vb * 1.15 ? 'YES, with margin' : V > vb ? 'barely' : 'NO', V > vb * 1.15 ? 'good' : V > vb ? 'fuel' : 'bad');
    const c = p.begin().col; p.axes();
    const xs = [], a = [], b = []; for (let x = 0.2; x <= 5.001; x += 0.05) { xs.push(x); a.push(paschen(x, 1.01325, 293) / 1000); b.push(paschen(x, P, T) / 1000); }
    p.hband(0, V, { color: c.ok, alpha: .1 }); p.hline(V, { color: c.ok, label: 'your coil: ' + V.toFixed(1) + ' kV', align: 'right' });
    p.line(xs, a, { color: c.muted, width: 2, dash: [6, 5] }); p.line(xs, b, { color: c.fire, width: 3.2 });
    p.text(4.9, a[a.length - 1] - 2.2, 'bench air (1 bar, 20 °C)', { color: c.muted, align: 'right', size: 11 }); p.text(4.9, Math.min(38, b[b.length - 1] + 2), 'this pressure and temperature', { color: c.fire, align: 'right', size: 11, weight: 700 });
    p.vline(g, { color: c.air }); if (isFinite(vb)) p.dot(g, vb, { color: c.fire, r: 6 });
    p.text(g + 0.06, 3, 'gap ' + g.toFixed(2) + ' mm', { color: c.air, size: 11 });
  }
  p.onDraw(upd); upd();
}
