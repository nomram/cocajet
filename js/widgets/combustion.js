// Combustion chemistry: balance the reaction, find the air:fuel ratio, flame temperature vs mixture strength.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';

const FUELS = {
  propane:  { name: 'Propane  C₃H₈',          x: 3,  y: 8,  z: 0, LHV: 46.35 },
  kerosene: { name: 'Kerosene / Jet-A  C₁₂H₂₃', x: 12, y: 23, z: 0, LHV: 43.2 },
  methane:  { name: 'Natural gas  CH₄',        x: 1,  y: 4,  z: 0, LHV: 50.0 },
  butane:   { name: 'Butane  C₄H₁₀',          x: 4,  y: 10, z: 0, LHV: 45.7 },
  gasoline: { name: 'Petrol (octane) C₈H₁₈',  x: 8,  y: 18, z: 0, LHV: 44.4 },
  ethanol:  { name: 'Ethanol  C₂H₆O',         x: 2,  y: 6,  z: 1, LHV: 26.8 },
  hydrogen: { name: 'Hydrogen  H₂',           x: 0,  y: 2,  z: 0, LHV: 120.0 },
};
const MC = 12.011, MH = 1.008, MO = 15.999, MN2 = 28.0134, MO2 = 31.998;
const sub = (n) => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
function derive(f) {
  const M = f.x * MC + f.y * MH + f.z * MO;
  const o2 = f.x + f.y / 4 - f.z / 2;                        // moles O2 per mole fuel
  const AFR = o2 * (MO2 + 3.76 * MN2) / M;
  return { M, o2, AFR };
}
const hmix = (T) => 0.95 * T + 1.1e-4 * T * T - 6.67e-9 * T * T * T;       // kJ/kg, cp = 0.95 + 2.2e-4 T - 2e-8 T²
export function flameTemp(fuel, phi, Tin) {
  const d = derive(fuel);
  const lean = phi <= 1;
  let Q = lean ? fuel.LHV * 1000 * phi / (d.AFR + phi) : fuel.LHV * 1000 / (d.AFR + phi) * (1 - 0.35 * (phi - 1));
  const target = hmix(Tin) + Q;
  let lo = Tin, hi = 4200;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (hmix(mid) < target) lo = mid; else hi = mid; }
  const Tid = (lo + hi) / 2;
  const pen = 0.25 * Math.max(0, Tid - 1300) * Math.exp(-Math.pow((phi - 1.05) / 0.4, 2));     // dissociation (CO2 -> CO + O ...)
  return Tid - pen;
}

export default function init(el) {
  const { body } = shell(el, { title: 'Burning fuel in air: the chemistry calculator', note: 'Simplified: variable specific heat plus a dissociation correction near stoichiometric. Real values (from equilibrium codes) are within ~5 %. φ (phi) is the <em>equivalence ratio</em>: φ = 1 is exactly enough air, φ &lt; 1 is lean (spare oxygen), φ &gt; 1 is rich.' });
  const cv = h('canvas', { class: 'plot' });
  const eqn = h('div', { class: 'eq', style: { margin: '0 0 10px' } });
  const sel = select({ label: 'Fuel', options: Object.entries(FUELS).map(([k, f]) => [k, f.name]), value: 'propane', onChange: upd });
  const sPhi = slider({ label: 'Mixture strength φ', min: 0.1, max: 1.8, step: 0.01, value: 1.0, fmt: v => v.toFixed(2), onInput: upd });
  const sT = slider({ label: 'Air temperature entering the flame', min: 250, max: 800, step: 5, value: 366, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { afr: readout('Stoichiometric air:fuel', 'kg:kg', 'cool'), tad: readout('Flame temperature', '°C', 'hot'), o2: readout('Oxygen needed', 'kg/kg fuel'), co2: readout('CO₂ made', 'kg/kg fuel'), lhv: readout('Energy released', 'MJ/kg', 'fuel'), air: readout('Air for 100 kW', 'g/s', 'cool') };
  const prod = h('div', { style: { display: 'flex', height: '26px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--line)', margin: '8px 0 2px' } });
  const prodLbl = h('div', { class: 'legend' });
  body.append(eqn, h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sel.el, sPhi.el, sT.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)),
    h('div', {}, h('div', { style: { fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' } }, 'Exhaust gas by volume'), prod, prodLbl))));
  const p = new Plot(cv, { xmin: 0, xmax: 1.8, ymin: 200, ymax: 2600, xlabel: 'mixture strength φ  (lean ← 1 → rich)', ylabel: 'adiabatic flame temperature (°C)', aspect: 1.5, ytickFmt: v => v.toFixed(0) });

  function upd() {
    const f = FUELS[sel.get()], d = derive(f), phi = sPhi.get(), Tin = sT.get();
    const Tad = flameTemp(f, phi, Tin);
    ro.afr.set(d.AFR.toFixed(1)); ro.tad.set((Tad - 273.15).toFixed(0), Tad > 2100 ? 'bad' : 'hot'); ro.o2.set((d.o2 * MO2 / d.M).toFixed(2)); ro.co2.set((f.x * 44.009 / d.M).toFixed(2));
    ro.lhv.set(f.LHV.toFixed(1)); ro.air.set((100 / (f.LHV * 1000) * d.AFR * 1000).toFixed(0));
    // reaction text
    const O2 = d.o2, hx = (n) => (Math.round(n * 100) / 100).toString();
    const fuelTxt = f.x ? `\\mathrm{C}_{${f.x}}\\mathrm{H}_{${f.y}}${f.z ? '\\mathrm{O}' : ''}` : '\\mathrm{H}_2';
    eqn.innerHTML = `$$${fuelTxt} + ${hx(O2)}\\,(\\mathrm{O}_2 + 3.76\\,\\mathrm{N}_2) \\;\\longrightarrow\\; ${f.x ? hx(f.x) + '\\,\\mathrm{CO}_2 + ' : ''}${hx(f.y / 2)}\\,\\mathrm{H}_2\\mathrm{O} + ${hx(3.76 * O2)}\\,\\mathrm{N}_2 \\quad(\\varphi=1)$$`;
    if (window.renderMath) window.renderMath(eqn);
    // products (lean: excess O2, rich: leftover fuel treated as unburnt H2/CO lumped in "fuel")
    const nCO2 = f.x * Math.min(1, 1 / phi), nH2O = f.y / 2 * Math.min(1, 1 / phi), nO2 = Math.max(0, O2 * (1 / phi - 1)), nN2 = 3.76 * O2 / phi, nF = Math.max(0, phi > 1 ? (1 - 1 / phi) * 3 : 0);
    const parts = [['N₂', nN2, '#4c8dff'], ['O₂', nO2, '#ff6b6b'], ['CO₂', nCO2, '#8a8f98'], ['H₂O', nH2O, '#4cc9f0'], ['unburnt', nF, '#ffb703']];
    const tot = parts.reduce((a, q) => a + q[1], 0);
    prod.innerHTML = ''; prodLbl.innerHTML = '';
    parts.forEach(([n, v, c]) => { if (v / tot < 0.002) return; prod.append(h('div', { style: { flex: String(v), background: c }, title: n })); prodLbl.append(h('span', {}, h('i', { style: { background: c } }), `${n} ${(v / tot * 100).toFixed(1)} %`)); });
    // curve
    const col = p.begin().col;
    p.band(0, 0.4, { color: col.air, alpha: .06 });
    p.axes();
    const xs = [], ys = [];
    for (let q = 0.1; q <= 1.8001; q += 0.02) { xs.push(q); ys.push(flameTemp(f, q, Tin) - 273.15); }
    p.line(xs, ys, { color: col.fire, width: 2.6 });
    p.hline(660, { color: col.air, label: 'aluminium melts (660 °C)', align: 'right' });
    p.vline(0.30, { color: col.air, label: 'whole engine φ ≈ 0.3' }); p.vline(1.0, { color: col.fuel, label: 'primary zone φ ≈ 1' });
    p.dot(phi, Tad - 273.15, { color: col.fire });
    p.text(0.31, 340, 'what the turbine sees (~800 °C)', { color: col.air, size: 11, bg: true });
  }
  p.onDraw(upd); upd();
}
