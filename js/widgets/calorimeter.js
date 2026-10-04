// Dissolve a salt in water: the temperature change is q = n * dH_solution = m * c * dT (cold packs and hand warmers).
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';

// name, molar mass g/mol, dH_solution kJ/mol (positive = endothermic), solubility g/100 g water at 20 C (approx.), note
const SALTS = {
  nh4no3: { n: 'Ammonium nitrate (cold pack)', M: 80.04, dH: 25.7, sol: 190, note: 'The classic instant cold pack. (Also a fertiliser and an oxidiser: keep it dry and away from fuels.)' },
  kno3:   { n: 'Potassium nitrate (saltpetre)', M: 101.1, dH: 34.9, sol: 32, note: 'Strongly endothermic but not very soluble: it cools less than you would hope.' },
  kcl:    { n: 'Potassium chloride (salt substitute)', M: 74.55, dH: 17.2, sol: 34, note: 'Mildly endothermic.' },
  nacl:   { n: 'Table salt', M: 58.44, dH: 3.9, sol: 36, note: 'Almost thermoneutral: salt barely changes the temperature of water.' },
  licl:   { n: 'Lithium chloride', M: 42.39, dH: -37.0, sol: 83, note: 'Exothermic, and very soluble.' },
  mgso4:  { n: 'Magnesium sulphate, anhydrous', M: 120.4, dH: -91.2, sol: 35, note: 'Exothermic (the anhydrous form grabs water strongly: Epsom salt hydrate is far milder).' },
  cacl2:  { n: 'Calcium chloride (hand warmer, de-icer)', M: 111.0, dH: -82.8, sol: 75, note: 'The classic exothermic salt. It can burn skin when dissolved concentrated.' },
  naoh:   { n: 'Sodium hydroxide (caustic soda)', M: 40.0, dH: -44.5, sol: 109, note: 'Very exothermic AND caustic. Listed to show the physics: do not experiment with it.' },
};

export default function init(el) {
  const { body } = shell(el, { title: 'A calorimeter in a cup: dissolve a salt and watch the temperature', note: 'Heat released or absorbed: q = n·ΔH<sub>soln</sub>. It changes the temperature of the water by ΔT = −q ⁄ (m·c) with c ≈ 4.18 J/(g·K). The curve shows the dissolving (about 20 s) and then the slow leak of heat to the room.' });
  const cv = h('canvas', { class: 'plot' });
  const sel = select({ label: 'Salt', options: Object.entries(SALTS).map(([k, s]) => [k, s.n]), value: 'nh4no3', onChange: upd });
  const sM = slider({ label: 'Mass of salt', min: 1, max: 120, step: 1, value: 30, unit: 'g', fmt: v => v.toFixed(0), onInput: upd });
  const sW = slider({ label: 'Mass of water', min: 50, max: 500, step: 10, value: 100, unit: 'g', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Starting temperature', min: 5, max: 35, step: 1, value: 20, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { n: readout('Salt dissolved', 'mol', 'cool'), q: readout('Heat exchanged', 'kJ', 'fuel'), dT: readout('Temperature change', 'K', 'hot'), Tf: readout('Lowest / highest T', '°C', 'hot') };
  const note = h('p', { style: { fontSize: '.88rem', color: 'var(--muted)', margin: '4px 0 0' } });
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sel.el, sM.el, sW.el, sT.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), note)));
  const p = new Plot(cv, { xmin: 0, xmax: 300, ymin: -10, ymax: 60, aspect: 1.5, xlabel: 'time (s)', ylabel: 'temperature (°C)' });
  function upd() {
    const s = SALTS[sel.get()], mw = sW.get(), T0 = sT.get(), cap = s.sol * mw / 100, md = Math.min(sM.get(), cap), n = md / s.M;
    const q = n * s.dH * 1000, dT = -q / ((mw + md) * 4.18), Tend = T0 + dT;
    ro.n.set(n.toFixed(2)); ro.q.set((s.dH > 0 ? '−' : '+') + Math.abs(q / 1000).toFixed(2)); ro.dT.set((dT > 0 ? '+' : '') + dT.toFixed(1), dT < 0 ? 'cool' : 'hot'); ro.Tf.set(Tend.toFixed(1), dT < 0 ? 'cool' : 'hot');
    note.innerHTML = s.note + (sM.get() > cap ? ` <b style="color:var(--fuel)">Only ${cap.toFixed(0)} g can dissolve in ${mw} g of water at 20 °C: the rest stays as a solid.</b>` : '');
    const lo = Math.min(T0, Tend) - 4, hi = Math.max(T0, Tend, 25) + 6;
    p.set({ ymin: Math.floor(lo / 5) * 5, ymax: Math.ceil(hi / 5) * 5 });
    const c = p.begin().col; p.axes();
    const xs = [], ys = [], Tr = 21;
    for (let t = 0; t <= 300; t += 2) { const diss = 1 - Math.exp(-t / 9), Tm = T0 + dT * diss, leak = 1 - Math.exp(-(t) / 650); xs.push(t); ys.push(Tm + (Tr - Tm) * leak * (t > 25 ? 1 : 0.2) ); }
    p.hline(T0, { color: c.muted, label: 'start', align: 'right' }); p.hline(Tr, { color: c.muted, alpha: .4, dash: [2, 5], label: 'room', align: 'left' });
    p.line(xs, ys, { color: dT < 0 ? c.air : c.fire, width: 3 });
    if (Math.abs(dT) > 0.3) p.arrow(60, T0, 60, T0 + dT, { color: dT < 0 ? c.air : c.fire, width: 2 });
    p.text(66, T0 + dT / 2, (dT > 0 ? '+' : '') + dT.toFixed(1) + ' K', { color: dT < 0 ? c.air : c.fire, size: 13, weight: 800 });
  }
  p.onDraw(upd); upd();
}
