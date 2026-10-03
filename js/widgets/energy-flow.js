// Where does the fuel's energy go? Computed with the engine model.
import { h, shell, slider, readout, legend } from '../ui.js';
import { CJ1, FUELS, isa, steadyAt } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Where does the fuel’s energy go?', note: 'Computed by the engine model at the chosen speed. On a test stand the engine does no useful <em>work</em> (nothing moves), yet it is a perfectly good thrust machine. Fly it and the same jet starts doing work.' });
  const sN = slider({ label: 'Engine speed', min: 55000, max: 120000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sV = slider({ label: 'Flight speed', min: 0, max: 250, step: 5, value: 0, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const barA = h('div', { style: { display: 'flex', height: '54px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--line)' } });
  const barB = h('div', { style: { display: 'flex', height: '54px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--line)' } });
  const lgA = h('div', { class: 'legend' }), lgB = h('div', { class: 'legend' });
  const ro = { fuel: readout('Fuel power', 'kW', 'fuel'), thr: readout('Thrust', 'N', 'hot'), th: readout('Thermal efficiency', '%', 'cool'), pe: readout('Propulsive efficiency', '%', 'cool'), ov: readout('Overall efficiency', '%', 'good'), sfc: readout('Fuel per thrust', 'kg/(N·h)') };
  body.append(
    h('div', { class: 'wgrid even' }, sN.el, sV.el),
    h('h4', {}, '1 · The fuel’s energy, split'), barA, lgA,
    h('h4', {}, '2 · The jet’s kinetic energy, split (matters only when flying)'), barB, lgB,
    h('div', { class: 'readouts', style: { marginTop: '14px' } }, ...Object.values(ro).map(r => r.el)));
  function seg(bar, lg, items) {
    bar.innerHTML = ''; lg.innerHTML = '';
    const tot = items.reduce((a, i) => a + Math.max(0, i[1]), 0);
    for (const [name, v, c] of items) {
      if (v <= 0) continue;
      bar.append(h('div', { style: { flex: String(v), background: c, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '.8rem', color: '#0c1218', minWidth: '2px' }, title: name }, v / tot > 0.07 ? (v / tot * 100).toFixed(0) + '%' : ''));
      lg.append(h('span', {}, h('i', { style: { background: c } }), `${name}: ${(v / 1000).toFixed(1)} kW (${(v / tot * 100).toFixed(0)} %)`));
    }
  }
  function upd() {
    const N = sN.get(), V0 = sV.get(), p = { ...CJ1 };
    const g = steadyAt(p, N, isa(0), { V0 });
    const LHV = FUELS[p.fuel].LHV, Pf = g.mf * LHV;
    const KEj = 0.5 * g.mg * g.Ve * g.Ve, KEin = 0.5 * g.m * V0 * V0;
    const heat = g.mg * 1148 * Math.max(0, g.T5 - g.T01);
    const comb = (1 - p.etaB) * Pf, other = Math.max(0, Pf - KEj + KEin - heat - comb);
    seg(barA, lgA, [['Jet kinetic energy', KEj - KEin, '#ffb703'], ['Hot exhaust (heat)', heat, '#ff6b35'], ['Unburnt / combustion loss', comb, '#8a8f98'], ['Casing heat & misc.', other, '#4c5560']]);
    const F = g.thrust, Pt = F * V0, dKE = KEj - KEin;
    seg(barB, lgB, [['Useful thrust power  F·V₀', Pt, '#3ddc97'], ['Wasted: kinetic energy left in the wake', Math.max(0, dKE - Pt), '#ff6b6b']]);
    ro.fuel.set((Pf / 1000).toFixed(0)); ro.thr.set(F.toFixed(1));
    ro.th.set((dKE / Pf * 100).toFixed(1)); ro.pe.set(V0 > 0 ? (Pt / dKE * 100).toFixed(0) : '0'); ro.ov.set((Pt / Pf * 100).toFixed(1)); ro.sfc.set(F > 1 ? (g.mf / F * 3600).toFixed(3) : '–');
  }
  upd();
}
