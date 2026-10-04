// How hot is a flame? The energy released heats the products; at high temperature CO2 and H2O fall apart again and take some of the heat back.
import { h, shell, select, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { FUELS, flameTemperature, sub } from '../chem-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'How hot is the flame? Energy balance, dissociation and dilution', note: 'The heat released by the reaction goes into warming the products (and the nitrogen that came along): T<sub>flame</sub> follows from an energy balance. A lean mixture has more gas to warm, so it is cooler; a rich one has too little oxygen to release all the heat. Near φ = 1 the flame is so hot that CO₂ and H₂O begin to <b>dissociate</b> (CO₂ ⇌ CO + ½O₂, H₂O ⇌ H₂ + ½O₂), and since that reaction <i>absorbs</i> heat, it caps the temperature about 100 K below the “complete combustion” value. The turbine cannot take 2 300 K, so the engine burns near φ ≈ 1 in the primary zone and then mixes in the rest of the air: the <b>dilution</b> calculation shows how much. (Simplified: OH, O, H and NO are not included, so the answer is about 30 K above the full calculation.)' });
  const fsel = select({ label: 'Fuel', options: Object.entries(FUELS).map(([k, v]) => [k, v.name + ' · ' + v.f]), value: 'propane', onChange: upd });
  const sP = slider({ label: 'Equivalence ratio φ in the flame', min: 0.2, max: 1.8, step: 0.01, value: 1.1, fmt: v => v.toFixed(2), onInput: upd });
  const sT = slider({ label: 'Air temperature entering', min: 250, max: 800, step: 5, value: 366, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sA = slider({ label: 'Pressure', min: 0.5, max: 30, step: 0.1, value: 1.94, unit: 'atm', fmt: v => v.toFixed(2), log: true, onInput: upd });
  const sD = slider({ label: 'Gas temperature the turbine can take', min: 800, max: 1500, step: 5, value: 1066, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const eng = button('The CJ-1 primary zone', () => { fsel.set('propane'); sP.set(1.1); sT.set(366); sA.set(1.94); sD.set(1066); upd(); }, 'small'), ref = button('Textbook: 298 K, 1 atm, φ = 1', () => { sP.set(1); sT.set(298); sA.set(1); upd(); }, 'small');
  const cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const ro = { T: readout('Flame temperature', 'K', 'hot'), C: readout('… in °C', '°C', 'hot'), d: readout('Loss to dissociation', 'K', 'cool'), co: readout('CO in the flame', '%', 'bad'), o2: readout('O₂ in the flame', '%', 'cool'), dil: readout('Air to add so the mixture is only at the turbine limit', 'kg per kg of burnt gas', 'fuel'), sh: readout('Share of all air that may pass through the flame', '%', 'good') };
  body.append(h('div', { class: 'ctls' }, fsel.el, sP.el, sT.el, sA.el, sD.el, h('div', { class: 'btn-row' }, eng, ref)), h('div', { class: 'wgrid even', style: { marginTop: '12px' } }, cvA, cvB), h('div', { class: 'readouts', style: { marginTop: '10px' } }, ...Object.values(ro).map(r => r.el)));
  const p1 = new Plot(cvA, { xmin: 0.2, xmax: 1.8, ymin: 800, ymax: 2800, aspect: 1.5, xlabel: 'equivalence ratio φ', ylabel: 'flame temperature (K)', title: 'Flame temperature vs mixture', margin: { l: 56, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cvB, { xmin: 0.2, xmax: 1.8, ymin: 0, ymax: 0.2, aspect: 1.5, xlabel: 'equivalence ratio φ', ylabel: 'mole fraction in the flame', title: 'What is in the flame gas', margin: { l: 56, r: 12, t: 28, b: 40 }, ytickFmt: v => Math.round(v * 100) + '%' });
  function upd() {
    const fk = fsel.get(), phi = sP.get(), Ta = sT.get(), P = sA.get(), Td = sD.get();
    const eq = flameTemperature(fk, phi, Ta, P, true), cc = phi <= 1 ? flameTemperature(fk, phi, Ta, P, false) : null;
    ro.T.set(eq.T.toFixed(0)); ro.C.set((eq.T - 273.15).toFixed(0)); ro.d.set(cc ? (cc.T - eq.T).toFixed(0) : '–'); ro.co.set((eq.x.CO * 100).toFixed(1)); ro.o2.set((eq.x.O2 * 100).toFixed(1));
    // dilution: find the overall phi (less air-rich) that makes the mixed gas the turbine temperature
    let lo = 0.02, hi = Math.max(phi, 0.03); const tgt = Td; let share = NaN, dil = NaN;
    if (flameTemperature(fk, hi, Ta, P, true).T > tgt && flameTemperature(fk, lo, Ta, P, true).T < tgt) {
      for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (flameTemperature(fk, mid, Ta, P, true).T > tgt) hi = mid; else lo = mid; }
      const phiTot = 0.5 * (lo + hi); share = phiTot / phi; dil = 1 / share - 1;   // extra air per unit of primary air
    }
    const F = FUELS[fk], AFR = F.nO2 * 31.998 / 0.2314 / F.M, airP = AFR / phi;
    ro.sh.set(Number.isFinite(share) ? (share * 100).toFixed(0) : '–');
    ro.dil.set(Number.isFinite(dil) ? (airP * dil / (1 + airP)).toFixed(2) : '–');
    // curves
    const xs = [], ya = [], yb = [], comps = []; for (let f = 0.2; f <= 1.801; f += 0.04) { const e = flameTemperature(fk, f, Ta, P, true); xs.push(f); ya.push(e.T); comps.push(e.x); const c2 = f <= 1.0001 ? flameTemperature(fk, f, Ta, P, false) : null; yb.push(c2 ? c2.T : NaN); }
    let c = p1.set({ ymax: Math.ceil(Math.max(...ya, 1000) / 200) * 200 + 100, ymin: Math.floor(Math.min(...ya, Ta) / 200) * 200 }).begin().col; p1.axes();
    const k = yb.findIndex(v => !Number.isFinite(v)), kk = k < 0 ? yb.length : k;
    p1.line(xs.slice(0, kk), yb.slice(0, kk), { color: c.muted, width: 2, dash: [6, 4] }); p1.line(xs, ya, { color: c.fire, width: 3.2 });
    p1.hline(Td, { color: c.air, label: 'turbine limit', align: 'right' }); p1.vline(1, { color: c.muted, alpha: .6, label: 'exact mixture' }); p1.dot(phi, eq.T, { color: c.fire, r: 7 });
    p1.text(1.78, p1.o.ymin + (p1.o.ymax - p1.o.ymin) * 0.12, '— with dissociation (equilibrium)', { color: c.fire, size: 11, weight: 700, align: 'right' }); p1.text(1.78, p1.o.ymin + (p1.o.ymax - p1.o.ymin) * 0.05, '- - complete combustion only', { color: c.muted, size: 11, weight: 700, align: 'right' });
    c = p2.begin().col; p2.axes(); const sp = [['CO2', c.fire, 'CO₂'], ['H2O', c.violet, 'H₂O'], ['O2', c.air, 'O₂'], ['CO', c.bad, 'CO'], ['H2', c.fuel, 'H₂']];
    for (const [n, col, lab] of sp) { const ys = comps.map(q => q[n]); p2.line(xs, ys, { color: col, width: 2.6 }); const j = ys.indexOf(Math.max(...ys)); p2.text(xs[Math.min(xs.length - 1, j)], ys[j] + 0.01, lab, { color: col, size: 11, weight: 800, align: 'center' }); }
    p2.vline(phi, { color: c.muted, alpha: .8 }); p2.text(1.78, 0.19, 'N₂ (not shown) is the rest', { color: c.muted, size: 10.5, align: 'right' });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
