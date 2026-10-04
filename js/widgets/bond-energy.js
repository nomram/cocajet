// Heat of reaction from bond energies: pay to break bonds, get paid to make new ones.
import { h, shell, select, readout } from '../ui.js';
import { Plot } from '../plot.js';

const BOND = { 'H–H': 436, 'O=O': 498, 'N≡N': 945, 'C–H': 413, 'C–C': 347, 'O–H': 463, 'C=O': 799, 'N=O': 631, 'N–H': 391 };
// name, equation text, broken {bond: count}, formed {bond: count}, measured dH (kJ for the reaction as written)
const RX = {
  methane:  { n: 'Methane burns', eq: 'CH₄ + 2 O₂ → CO₂ + 2 H₂O', br: { 'C–H': 4, 'O=O': 2 }, fo: { 'C=O': 2, 'O–H': 4 }, dH: -802, note: 'natural gas: the commonest exothermic reaction in the world' },
  propane:  { n: 'Propane burns', eq: 'C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O', br: { 'C–C': 2, 'C–H': 8, 'O=O': 5 }, fo: { 'C=O': 6, 'O–H': 8 }, dH: -2043, note: 'the fuel of our engine: 46 MJ per kg' },
  hydrogen: { n: 'Hydrogen burns', eq: '2 H₂ + O₂ → 2 H₂O', br: { 'H–H': 2, 'O=O': 1 }, fo: { 'O–H': 4 }, dH: -484, note: 'the rocket fuel with the most energy per kg (120 MJ/kg)' },
  electrol: { n: 'Water is split (electrolysis)', eq: '2 H₂O → 2 H₂ + O₂', br: { 'O–H': 4 }, fo: { 'H–H': 2, 'O=O': 1 }, dH: 484, note: 'the exact reverse: you must pay back all the heat, as electricity' },
  nox:      { n: 'Air is burnt (N₂ + O₂ → NO)', eq: 'N₂ + O₂ → 2 NO', br: { 'N≡N': 1, 'O=O': 1 }, fo: { 'N=O': 2 }, dH: 181, note: 'endothermic: only happens in a very hot flame or lightning. It is why engines make NOx' },
  ammonia:  { n: 'Ammonia is made (Haber)', eq: 'N₂ + 3 H₂ → 2 NH₃', br: { 'N≡N': 1, 'H–H': 3 }, fo: { 'N–H': 6 }, dH: -92, note: 'mildly exothermic, but N≡N is so strong it needs a catalyst and 400 °C' },
};
const sum = (o) => Object.entries(o).reduce((a, [b, n]) => a + BOND[b] * n, 0);

export default function init(el) {
  const { body } = shell(el, { title: 'Why do reactions give out (or soak up) heat? Count the bonds', note: 'Average bond energies (kJ/mol) add up to within ~5 % of the measured heat of reaction. Breaking a bond always costs energy; making one always releases it. If the new bonds are stronger in total, the difference leaves as heat: the reaction is <b>exothermic</b>. If the old bonds were stronger, heat must be supplied: <b>endothermic</b>.' });
  const cv = h('canvas', { class: 'plot' });
  const sel = select({ label: 'Reaction', options: Object.entries(RX).map(([k, r]) => [k, r.n]), value: 'methane', onChange: upd });
  const ro = { br: readout('Energy to break bonds', 'kJ', 'bad'), fo: readout('Energy released making bonds', 'kJ', 'good'), dH: readout('Net heat of reaction ΔH', 'kJ', 'hot'), me: readout('Measured ΔH', 'kJ', 'cool'), type: readout('Type', '') };
  const info = h('div', { class: 'eq', style: { margin: '0 0 8px' } }), lst = h('div', { style: { fontSize: '.84rem', color: 'var(--text-2)' } }), note = h('p', { style: { fontSize: '.88rem', color: 'var(--muted)', margin: '6px 0 0' } });
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sel.el, info, lst, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), note)));
  const p = new Plot(cv, { xmin: 0, xmax: 3, ymin: -3000, ymax: 4000, aspect: 1.35, xticks: [], ylabel: 'energy (kJ per reaction as written)', margin: { l: 66, r: 14, t: 16, b: 30 } });
  function upd() {
    const r = RX[sel.get()], B = sum(r.br), F = sum(r.fo), dH = B - F;
    ro.br.set(B.toLocaleString('en')); ro.fo.set(F.toLocaleString('en')); ro.dH.set((dH > 0 ? '+' : '') + dH.toFixed(0), dH < 0 ? 'hot' : 'cool'); ro.me.set((r.dH > 0 ? '+' : '') + r.dH); ro.type.set(dH < 0 ? 'EXOTHERMIC' : 'ENDOTHERMIC', dH < 0 ? 'hot' : 'cool');
    info.innerHTML = `<b>${r.eq}</b>`;
    lst.innerHTML = '<b>Bonds broken:</b> ' + Object.entries(r.br).map(([b, n]) => `${n} × ${b} (${BOND[b]})`).join(', ') + '<br><b>Bonds made:</b> ' + Object.entries(r.fo).map(([b, n]) => `${n} × ${b} (${BOND[b]})`).join(', ');
    note.textContent = r.note + '.';
    const top = Math.max(B, F) * 1.12 + 150, bot = Math.min(0, dH, B - F) - 0.12 * top;
    p.set({ ymax: top, ymin: Math.min(bot, -top * 0.25) });
    const c = p.begin().col; p.axes();
    const ctx = p.ctx, bar = (x0, x1, y0, y1, col, label, lx) => { const X0 = p.X(x0), X1 = p.X(x1), Y0 = p.Y(y0), Y1 = p.Y(y1); ctx.fillStyle = col; ctx.globalAlpha = .85; ctx.fillRect(X0, Math.min(Y0, Y1), X1 - X0, Math.abs(Y1 - Y0)); ctx.globalAlpha = 1; p.text(lx, (y0 + y1) / 2, label, { color: '#fff', align: 'center', size: 12, weight: 700 }); };
    p.hline(0, { color: c.muted, dash: [], width: 1.2 });
    bar(0.15, 0.95, 0, B, c.bad, '+' + B, 0.55);
    bar(1.05, 1.85, B, B - F, c.ok, '−' + F + ' make', 1.45);
    bar(2.05, 2.85, 0, dH, dH < 0 ? c.fire : c.air, (dH > 0 ? '+' : '') + dH.toFixed(0), 2.45);
    const yc = p.o.ymin + (p.o.ymax - p.o.ymin) * 0.035;
    p.text(0.55, yc, 'break bonds', { color: c.text, align: 'center', size: 11 }); p.text(1.45, yc, 'make bonds', { color: c.text, align: 'center', size: 11 }); p.text(2.45, yc, 'NET: ΔH', { color: c.text, align: 'center', size: 11, weight: 800 });
    p.arrow(0.95, B, 1.05, B, { color: c.muted, width: 1.2, head: 4 });
    p.text(2.45, dH < 0 ? dH - top * 0.06 : dH + top * 0.06, dH < 0 ? 'heat OUT' : 'heat IN', { color: dH < 0 ? c.fire : c.air, align: 'center', size: 12, weight: 800 });
  }
  p.onDraw(upd); upd();
}
