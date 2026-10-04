// The fuel menu for a jet: energy per kilogram and per litre, flame temperature, air needed, and what the CJ-1's heat input would cost in each fuel.
import { h, shell, select, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { FUELS, flameTemperature, AIR_MASS, molarMass, sub } from '../chem-model.js';

const O2M = 31.998, QCJ1 = 2.86e-3 * 46.35e6;                  // CJ-1 heat input, W (2.86 g/s of propane)
/* how each fuel is stored, density as stored [kg/L], flash point [°C], practical note for a small jet */
const INFO = {
  hydrogen: { rho: 0.024, store: 'gas at 350 bar', flash: 'gas', note: 'Invisible flame, flammable from 4 % to 75 % in air, leaks through almost everything and flashes back into the supply line. Even at 350 bar a litre holds little energy. Wonderful in a rocket (chapter 14), a poor first fuel for a hobby jet.' },
  methane:  { rho: 0.17, store: 'gas at 200 bar', flash: 'gas', note: 'Natural gas. Fed through a regulator like propane, lighter than air so leaks rise, and it is what power-station gas turbines burn. A 200 bar bottle holds a third of the energy per litre that liquid propane does.' },
  propane:  { rho: 0.50, store: 'liquid under 8 bar', flash: 'gas', note: 'Our fuel. Stored as a liquid, drawn off as vapour, so the bottle cools as it works (the freeze-off of chapter 7). Heavier than air: a leak pools on the floor. Burns clean, no pump or atomiser needed.' },
  butane:   { rho: 0.58, store: 'liquid under 2 bar', flash: 'gas', note: 'Lighter gas. It boils at −1 °C, so on a cold day the bottle gives almost no pressure; camping gas mixes it with propane to help.' },
  ethanol:  { rho: 0.79, store: 'liquid', flash: 13, note: 'Liquid, but with only 27 MJ/kg it needs about 1.6 times the fuel flow of kerosene. Burns cooler and cleaner, soaks up water from the air, and needs a pump and vaporiser or atomiser. The flame is pale and hard to see.' },
  methanol: { rho: 0.79, store: 'liquid', flash: 11, note: 'Only 21 MJ/kg: more than double the flow of kerosene. Poisonous by swallowing, breathing or skin contact, and it burns with a nearly invisible flame. Fine in a glow-plug model engine, a bad idea to spill in a workshop.' },
  octane:   { rho: 0.70, store: 'liquid', flash: -43, note: 'Petrol (gasoline). Not suitable: its flash point of −43 °C means the vapour above the liquid is explosive at any normal temperature, so the tank, the lines and the air around them are a bomb waiting for a spark. Also leaves gum.' },
  kerosene: { rho: 0.80, store: 'liquid', flash: '38–60', note: 'Jet-A, paraffin (lamp oil) and diesel are the proper turbine fuels: flash point above 38 °C so the liquid does not make explosive vapour in the tank, 35 MJ per litre. Needs a pump, a filter and a vaporiser or atomiser (chapters 7 and 8).' },
};
const ORDER = ['hydrogen', 'methane', 'propane', 'butane', 'ethanol', 'methanol', 'octane', 'kerosene'];
const METRICS = {
  mj_kg: { label: 'Energy per kilogram of fuel (MJ/kg, lower heating value)', get: d => d.lhv, unit: 'MJ/kg', dec: 1 },
  mj_l:  { label: 'Energy per litre as stored (MJ/L)', get: d => d.mjl, unit: 'MJ/L', dec: 1 },
  tad:   { label: 'Flame temperature at the exact mixture (K)', get: d => d.T, unit: 'K', dec: 0 },
  afr:   { label: 'Air needed to burn 1 kg of fuel exactly (kg)', get: d => d.afr, unit: 'kg', dec: 1 },
  flow:  { label: 'Fuel flow for the CJ-1’s heat input (g/s)', get: d => d.flow, unit: 'g/s', dec: 2 },
  tank:  { label: 'Tank volume for a 5-minute run (litres, as stored)', get: d => d.tank, unit: 'L', dec: 2 },
};

export default function init(el) {
  const { body } = shell(el, { title: 'The fuel menu: what can a jet burn, and what does it cost in kilograms and litres?', note: 'Energy, air demand and flame temperature are computed from the same chemistry as chapter 10’s balance and flame-temperature widgets. “CJ-1 heat input” is the 132 kW the engine takes at full power (2.86 g/s of propane): other fuels are shown for the chemistry, the engine model itself runs propane and kerosene. Storage densities are typical (bottle, 350 bar tank, liquid).' });
  const msel = select({ label: 'Compare by', options: Object.entries(METRICS).map(([k, m]) => [k, m.label]), value: 'mj_l', onChange: draw });
  const csel = select({ label: 'Air entering the flame', options: [['cj', 'As in the CJ-1 primary zone: 366 K, 1.94 atm'], ['std', 'Textbook: 298 K, 1 atm']], value: 'cj', onChange: () => { calc(); draw(); } });
  const cv = h('canvas', { class: 'plot' });
  const ro = { lhv: readout('Energy per kg', 'MJ/kg', 'hot'), mjl: readout('Energy per litre', 'MJ/L', 'fuel'), T: readout('Flame, exact mix', 'K', 'hot'), afr: readout('Air per kg fuel', 'kg', 'cool'), flow: readout('Flow for 132 kW', 'g/s'), tank: readout('5-min tank', 'L'), fl: readout('Flash point', '°C'), st: readout('Stored as', '') };
  const info = h('div', { class: 'widget-note', style: { padding: 0, marginTop: '10px', minHeight: '4.5em' } });
  body.append(h('div', { class: 'wgrid even' }, msel.el, csel.el), h('div', { style: { height: '8px' } }), cv, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), info);
  const p = new Plot(cv, { xmin: 0, xmax: 1, ymin: 0, ymax: ORDER.length, aspect: 2.3, minHeight: 300, grid: false, yticks: [], margin: { l: 128, r: 70, t: 10, b: 28 } });
  let sel = 'propane', D = {};
  function calc() {
    const [Ta, P] = csel.get() === 'cj' ? [366, 1.94] : [298.15, 1];
    for (const k of ORDER) {
      const F = FUELS[k], M = F.M, I = INFO[k], lhv = -F.dHc / M;        // MJ/kg (kJ/mol ÷ g/mol)
      const afr = F.nO2 * O2M / AIR_MASS.O2 / M, T = flameTemperature(k, 1, Ta, P, true).T, flow = QCJ1 / (lhv * 1e6) * 1000;
      D[k] = { lhv, mjl: lhv * I.rho, T, afr, flow, tank: flow * 300 / 1000 / I.rho, M };
    }
    const d = D[sel], I = INFO[sel];
    ro.lhv.set(d.lhv.toFixed(1)); ro.mjl.set(d.mjl.toFixed(1)); ro.T.set(d.T.toFixed(0)); ro.afr.set(d.afr.toFixed(1)); ro.flow.set(d.flow.toFixed(2)); ro.tank.set(d.tank.toFixed(2));
    ro.fl.set(String(I.flash), typeof I.flash === 'number' && I.flash < 30 ? 'bad' : ''); ro.fl.el.querySelector('.u').textContent = typeof I.flash === 'number' || /\d/.test(String(I.flash)) ? '°C' : ''; ro.st.set(I.store);
    info.innerHTML = '<b>' + FUELS[sel].name + '</b> (' + sub(FUELS[sel].f) + ', molar mass ' + d.M.toFixed(1) + ' g/mol). ' + I.note;
  }
  function draw() {
    const m = METRICS[msel.get()], c = p.begin().col, ctx = p.ctx, vals = ORDER.map(k => m.get(D[k])), vmax = Math.max(...vals) * 1.06;
    p.set({ xmax: vmax }); p.axes();
    ORDER.forEach((k, i) => {
      const y0 = p.Y(ORDER.length - i), y1 = p.Y(ORDER.length - i - 1), v = vals[i], on = k === sel;
      ctx.fillStyle = on ? c.fire : c.air; ctx.globalAlpha = on ? 1 : 0.62; ctx.fillRect(p.X(0), y0 + 4, p.X(v) - p.X(0), y1 - y0 - 8); ctx.globalAlpha = 1;
      p.ptext(p.m.l - 8, (y0 + y1) / 2, FUELS[k].name.replace(/ \(.*/, '').replace(' / Jet-A', ''), { align: 'right', base: 'middle', color: on ? c.strong : c.text, weight: on ? 800 : 600 });
      p.ptext(p.X(v) + 6, (y0 + y1) / 2, v.toFixed(m.dec) + ' ' + m.unit, { align: 'left', base: 'middle', color: c.muted, size: 11 });
    });
  }
  p.interact((x, y, pt, kind) => { if (kind !== 'down' || y == null) return; const i = Math.floor(ORDER.length - y); if (i >= 0 && i < ORDER.length) { sel = ORDER[i]; calc(); draw(); } });
  cv.style.cursor = 'pointer'; p.onDraw(draw); calc(); draw();
  body.append(h('p', { class: 'widget-note', style: { padding: 0, margin: '6px 0 0' } }, 'Tap or click a bar to select the fuel.'));
}
