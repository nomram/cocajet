// Balancing chemical equations: atoms are never created or destroyed. Practice with real fuels, or type your own.
import { h, shell, select, button, readout } from '../ui.js';
import { balance, ledger, parseFormula, molarMass, sub } from '../chem-model.js';

/* reaction skeletons: reactants, products, per-species formation enthalpies (kJ/mol, phase noted in the label), story */
const RX = [
  { n: 'Hydrogen burns', r: ['H2', 'O2'], p: ['H2O'], hf: { H2: 0, O2: 0, H2O: -241.83 }, s: 'the cleanest fire: the only product is water vapour. A rocket upper stage runs on this.' },
  { n: 'Methane burns (natural gas)', r: ['CH4', 'O2'], p: ['CO2', 'H2O'], hf: { CH4: -74.87, O2: 0, CO2: -393.51, H2O: -241.83 }, s: 'one carbon, four hydrogens: it needs 2 O₂.' },
  { n: 'Propane burns (our fuel)', r: ['C3H8', 'O2'], p: ['CO2', 'H2O'], hf: { C3H8: -103.85, O2: 0, CO2: -393.51, H2O: -241.83 }, s: 'balance the carbon first (3 CO₂), then the hydrogen (4 H₂O), then count the oxygens: 10 + 4 = 14 atoms = 5 O₂.' },
  { n: 'Butane burns (lighter gas)', r: ['C4H10', 'O2'], p: ['CO2', 'H2O'], hf: { C4H10: -125.6, O2: 0, CO2: -393.51, H2O: -241.83 }, s: '13 O₂ is odd, so double everything: 2 C₄H₁₀ + 13 O₂ → 8 CO₂ + 10 H₂O.' },
  { n: 'Ethanol burns (alcohol)', r: ['C2H6O', 'O2'], p: ['CO2', 'H2O'], hf: { C2H6O: -234.8, O2: 0, CO2: -393.51, H2O: -241.83 }, s: 'the fuel already contains one oxygen atom, so it needs only 3 O₂, not 3.5.' },
  { n: 'Octane burns (petrol)', r: ['C8H18', 'O2'], p: ['CO2', 'H2O'], hf: { C8H18: -208.4, O2: 0, CO2: -393.51, H2O: -241.83 }, s: '12.5 O₂ per octane: multiply everything by 2 to get whole numbers.' },
  { n: 'Dodecane burns (kerosene-like)', r: ['C12H26', 'O2'], p: ['CO2', 'H2O'], hf: { C12H26: -290.9, O2: 0, CO2: -393.51, H2O: -241.83 }, s: 'jet fuel is a mix of molecules of about this size: 18.5 O₂ each, so double it.' },
  { n: 'Rich propane: not enough oxygen', r: ['C3H8', 'O2'], p: ['CO', 'H2O'], hf: { C3H8: -103.85, O2: 0, CO: -110.53, H2O: -241.83 }, s: 'with too little air the carbon stops at CO (poisonous) and less heat is released: compare ΔH with the complete burn.' },
  { n: 'Iron rusts (hand-warmers)', r: ['Fe', 'O2'], p: ['Fe2O3'], hf: { Fe: 0, O2: 0, Fe2O3: -824.2 }, s: 'slow burning of a metal: iron oxide has 2 Fe per formula, so you need an even number of Fe atoms.' },
  { n: 'Aluminium burns (a metal fuel)', r: ['Al', 'O2'], p: ['Al2O3'], hf: { Al: 0, O2: 0, Al2O3: -1675.7 }, s: 'the white smoke of rocket exhaust and fireworks is this solid oxide.' },
  { n: 'Hydrogen peroxide decomposes', r: ['H2O2'], p: ['H2O', 'O2'], hf: { H2O2: -187.8, H2O: -285.83, O2: 0 }, s: 'it makes its own oxygen: the reaction behind peroxide thrusters (liquid water products here).' },
  { n: 'Nitrous oxide decomposes', r: ['N2O'], p: ['N2', 'O2'], hf: { N2O: 82.05, N2: 0, O2: 0 }, s: 'heat comes out even without a fuel: why nitrous oxide must be handled with care.' },
  { n: 'Electrolysis of water', r: ['H2O'], p: ['H2', 'O2'], hf: { H2O: -285.83, H2: 0, O2: 0 }, s: 'endothermic: the reverse of the hydrogen fire, paid for with electricity.' },
  { n: 'Ammonia synthesis (Haber)', r: ['N2', 'H2'], p: ['NH3'], hf: { N2: 0, H2: 0, NH3: -45.9 }, s: 'fertiliser and the nitrogen in many chemicals.' },
  { n: 'Slaking lime', r: ['CaO', 'H2O'], p: ['Ca(OH)2'], hf: { CaO: -634.9, H2O: -285.83, 'Ca(OH)2': -985.2 }, s: 'already balanced: the bracket in Ca(OH)₂ means one Ca, two O and two H.' },
  { n: 'Ammonia oxidised to nitric oxide', r: ['NH3', 'O2'], p: ['NO', 'H2O'], hf: { NH3: -45.9, O2: 0, NO: 90.25, H2O: -241.83 }, s: 'both sides have N, H and O; start with the elements that appear only once on each side.' },
  { n: 'Limestone is heated (cement)', r: ['CaCO3'], p: ['CaO', 'CO2'], hf: { CaCO3: -1206.9, CaO: -634.9, CO2: -393.51 }, s: 'already balanced, and strongly endothermic: it needs a kiln.' },
];
const fmt1 = (sp, co) => sp.map((f, i) => (co[i] > 1 ? co[i] + ' ' : '') + sub(f)).join(' + '), fmtEq = (R, P, cl, cr) => fmt1(R, cl) + ' → ' + fmt1(P, cr);
const ARROW = '<span style="font-size:1.4em;margin:0 .5em">→</span>';
export default function init(el) {
  const { body } = shell(el, { title: 'Balancing equations: atoms are never created or destroyed', note: 'An equation says which substances react and what they make. A <b>balanced</b> equation has the same number of each kind of atom on both sides, because chemistry only rearranges atoms. The big numbers in front of a formula (<b>coefficients</b>) say how many molecules; you may change them but never the little numbers (<b>subscripts</b>), which would change the substance. Method: balance the atoms that appear in only one compound on each side first (usually C, then H), balance O last, and double everything if you get a fraction. <b>Practice mode:</b> use the − and + buttons until every row of the atom count shows ✓. <b>Solver mode:</b> type your own reaction.' });
  const sel = select({ label: 'Reaction to practise', options: RX.map((r, i) => [i, r.n]), value: 2, onChange: () => { cl = RX[+sel.get()].r.map(() => 1); cr = RX[+sel.get()].p.map(() => 1); hint = 0; upd(); } });
  const eq = h('div', { class: 'be-eq' }), led = h('div', { class: 'be-led' }), msg = h('div', { class: 'be-msg' }), story = h('p', { class: 'muted' });
  const btnHint = button('Hint: next step', () => { hint++; upd(); }, 'small'), btnSolve = button('Show the solution', () => { const r = RX[+sel.get()], b = balance(r.r, r.p); cl = b.reactants.slice(); cr = b.products.slice(); upd(); }, 'small'), btnReset = button('Reset to all 1', () => { cl = RX[+sel.get()].r.map(() => 1); cr = RX[+sel.get()].p.map(() => 1); hint = 0; upd(); }, 'small');
  const own = h('input', { type: 'text', value: 'C4H10 + O2 -> CO2 + H2O', 'aria-label': 'your own reaction', style: { width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: '1.05rem', borderRadius: '10px', border: '1px solid var(--line-2)', background: 'var(--panel)', color: 'var(--text)' } });
  const ownOut = h('div', { class: 'be-own' });
  const ro = { dh: readout('ΔH of this equation as written', 'kJ', 'hot'), kind: readout('Type', '', 'cool'), per: readout('… per mole of the first reactant', 'kJ/mol', 'fuel') };
  body.append(h('div', { class: 'ctls' }, sel.el, h('div', { class: 'btn-row' }, btnHint, btnSolve, btnReset)), eq, h('div', { class: 'wgrid', style: { marginTop: '8px' } }, led, h('div', {}, msg, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), story)),
    h('h4', { style: { margin: '18px 0 6px' } }, 'Solver mode: type any reaction (reactants -> products)'), own, ownOut);
  const css = document.createElement('style');
  css.textContent = '.be-eq{display:flex;flex-wrap:wrap;align-items:center;gap:6px 4px;margin:14px 0;font-size:1.35rem}.be-sp{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.be-sp b{font-family:var(--mono);min-width:1.4em;text-align:center;font-size:1.2rem}.be-sp button{border:1px solid var(--line-2);background:var(--panel-2);color:var(--text);border-radius:6px;width:26px;height:26px;cursor:pointer;font-weight:700}.be-plus{font-size:1.2rem;margin:0 .3em;color:var(--muted)}.be-led table{border-collapse:collapse;font-size:.95rem}.be-led td,.be-led th{padding:5px 12px;border-bottom:1px solid var(--line);text-align:center}.be-led th{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.be-ok{color:var(--ok);font-weight:800}.be-no{color:var(--bad);font-weight:800}.be-msg{font-weight:700;margin-bottom:8px}.be-own{margin-top:8px;font-size:1.25rem}.be-own .led{font-size:.9rem;color:var(--text-2)}';
  el.append(css);
  let cl = RX[2].r.map(() => 1), cr = RX[2].p.map(() => 1), hint = 0;
  const step = (arr, i, d) => { arr[i] = Math.max(1, Math.min(60, arr[i] + d)); upd(); };
  function side(species, co, arr) {
    return species.map((f, i) => [h('span', { class: 'be-sp' }, h('button', { onclick: () => step(arr, i, -1), 'aria-label': 'less ' + f }, '−'), h('b', {}, String(co[i])), h('button', { onclick: () => step(arr, i, 1), 'aria-label': 'more ' + f }, '+'), h('span', { html: sub(f) })), i < species.length - 1 ? h('span', { class: 'be-plus' }, '+') : null]);
  }
  function upd() {
    const r = RX[+sel.get()], L = ledger(r.r, r.p, cl, cr), els = Object.keys(L), ok = els.every(e => L[e][0] === L[e][1]);
    eq.replaceChildren(...side(r.r, cl, cl).flat().filter(Boolean), h('span', { html: ARROW }), ...side(r.p, cr, cr).flat().filter(Boolean));
    // hint order: elements that appear in one compound per side first, oxygen last
    const order = els.slice().sort((a, b) => (a === 'O') - (b === 'O') || (a === 'H') - (b === 'H')), shown = Math.min(order.length, hint);
    led.innerHTML = '<table><tr><th>Atom</th><th>Left side</th><th>Right side</th><th></th></tr>' + els.map(e => '<tr><td><b>' + e + '</b></td><td>' + L[e][0] + '</td><td>' + L[e][1] + '</td><td class="' + (L[e][0] === L[e][1] ? 'be-ok' : 'be-no') + '">' + (L[e][0] === L[e][1] ? '✓' : '✗') + '</td></tr>').join('') + '</table>';
    const b = balance(r.r, r.p), minimal = b.coeffs && [...cl, ...cr].every((c, i) => c === b.coeffs[i]);
    msg.innerHTML = ok ? (minimal ? '<span class="be-ok">Balanced, in the smallest whole numbers. ✓</span>' : '<span class="be-ok">Balanced ✓</span> <span class="muted">(every coefficient can still be divided by a common factor: the smallest version is ' + fmtEq(r.r, r.p, b.reactants, b.products) + ')</span>') : '<span class="be-no">Not balanced yet: the ✗ rows show which atoms disagree.</span>' + (hint ? '<br><span class="muted">Hint: balance ' + order.slice(0, shown).join(', then ') + ' first' + (shown < order.length ? '' : ', and finally check them all') + '.</span>' : '');
    const dH = r.p.reduce((a, f, i) => a + cr[i] * r.hf[f], 0) - r.r.reduce((a, f, i) => a + cl[i] * r.hf[f], 0);
    ro.dh.set(ok ? dH.toFixed(0) : '–'); ro.kind.set(ok ? (dH < 0 ? 'exothermic' : 'endothermic') : '–', ok ? (dH < 0 ? 'hot' : 'cool') : 'cool'); ro.per.set(ok ? (dH / cl[0]).toFixed(0) : '–');
    story.innerHTML = '<b>' + r.n + '.</b> ' + r.s;
  }
  function solve() {
    try {
      const t = own.value.replace('→', '->').replace('=>', '->').replace(/=+>?/, '->').split('->'); if (t.length !== 2) throw new Error('write it as: reactants -> products');
      const part = s => s.split('+').map(x => x.trim().replace(/^\d+\s*(?=[A-Z(])/, '')).filter(Boolean);
      const R = part(t[0]), P = part(t[1]); [...R, ...P].forEach(parseFormula);
      const b = balance(R, P); if (b.error) { ownOut.innerHTML = '<span class="be-no">' + b.error + '</span>'; return; }
      const L = ledger(R, P, b.reactants, b.products);
      ownOut.innerHTML = fmtEq(R, P, b.reactants, b.products) + '<div class="led">Atom check: ' + Object.entries(L).map(([e, v]) => e + ' ' + v[0] + ' = ' + v[1]).join(' · ') + '. Molar masses: ' + R.map((f, i) => b.reactants[i] + '×' + molarMass(parseFormula(f)).toFixed(1)).join(' + ') + ' = ' + R.reduce((a, f, i) => a + b.reactants[i] * molarMass(parseFormula(f)), 0).toFixed(1) + ' g = ' + P.reduce((a, f, i) => a + b.products[i] * molarMass(parseFormula(f)), 0).toFixed(1) + ' g (mass is conserved too).</div>';
    } catch (e) { ownOut.innerHTML = '<span class="be-no">' + e.message + '</span>'; }
  }
  own.addEventListener('input', solve); upd(); solve();
}
