// Reading a chemical formula: the subscripts count atoms, the atoms have masses, and a mole is a handful of grams.
import { h, shell, button, readout } from '../ui.js';
import { parseFormula, molarMass, ATOMS, sub, AVOGADRO } from '../chem-model.js';

const PRESETS = [
  ['O2', 'oxygen: the part of air that burns things'], ['N2', 'nitrogen: 78 % of air, stays out of the fight'], ['CO2', 'carbon dioxide: what burning carbon makes'], ['H2O', 'water (vapour in a flame)'],
  ['CH4', 'methane: natural gas'], ['C3H8', 'propane: our fuel'], ['C4H10', 'butane: lighter gas'], ['C2H6O', 'ethanol: alcohol fuel'], ['C8H18', 'octane: petrol'], ['H2', 'hydrogen: the lightest fuel'],
  ['H2O2', 'hydrogen peroxide: a liquid that releases oxygen'], ['N2O', 'nitrous oxide: an oxidiser'], ['Fe2O3', 'rust'], ['Al2O3', 'aluminium oxide: what burnt aluminium becomes'], ['Ca(OH)2', 'slaked lime: note the bracket!'], ['NH4NO3', 'ammonium nitrate: a cold-pack salt'],
];
const COL = { H: '#e8eef5', C: '#555d66', N: '#4a6cf7', O: '#ff4d3d', Fe: '#c97b4a', Al: '#b9c2cc', Ca: '#6fbf73', Cl: '#3ddc97', S: '#e6c800', Na: '#b388ff' };

export default function init(el) {
  const { body } = shell(el, { title: 'Reading a formula: atoms, masses and the mole', note: 'A formula is a recipe for one molecule. <b>Subscripts</b> (the small numbers) count atoms: C₃H₈ is 3 carbon atoms and 8 hydrogen atoms stuck together; a bracket multiplies everything inside it: Ca(OH)₂ is 1 Ca, 2 O and 2 H. Each atom has a mass, so the molecule does too. One <b>mole</b> is 6.022×10²³ molecules, chosen so that a mole weighs its <i>molar mass</i> in grams: 18.0 g of water, 44.1 g of propane. Type a formula (capital letters begin an element, so Co is cobalt and CO is carbon monoxide) or pick one.' });
  const inp = h('input', { type: 'text', value: 'C3H8', 'aria-label': 'chemical formula', style: { fontSize: '1.4rem', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--line-2)', background: 'var(--panel)', color: 'var(--text)', fontFamily: 'var(--mono)', width: '100%', boxSizing: 'border-box' } });
  const pre = h('div', { class: 'btn-row', style: { flexWrap: 'wrap' } }, ...PRESETS.map(([f, d]) => button(f, () => { inp.value = f; upd(); }, 'small')));
  const out = h('div', { class: 'fm-out' }), bag = h('canvas', { class: 'plot' });
  const ro = { M: readout('Molar mass', 'g/mol', 'hot'), n: readout('Moles in 1 kg', 'mol', 'cool'), mol: readout('Mass of one molecule', 'g × 10⁻²³', 'cool'), N: readout('Atoms in one molecule', '', 'fuel') };
  body.append(h('div', { class: 'ctls' }, inp, pre), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', {}, out), h('div', {}, bag, h('div', { class: 'readouts', style: { marginTop: '8px' } }, ...Object.values(ro).map(r => r.el)))));
  const note = h('p', { class: 'muted', style: { marginTop: '8px' } }); body.append(note);
  const css = document.createElement('style');
  css.textContent = '.fm-out{overflow-x:auto;min-width:0}.fm-out+*{min-width:0}.wgrid>div{min-width:0}.fm-out table{width:100%;border-collapse:collapse;font-size:.92rem}.fm-out td,.fm-out th{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left}.fm-out th{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.fm-out .bar{height:9px;border-radius:5px;background:var(--fire);display:block}.fm-err{color:var(--bad);font-weight:700}';
  el.append(css);
  const ctx = bag.getContext('2d');
  function draw(counts) {
    const dpr = Math.min(2.5, devicePixelRatio || 1), W = bag.clientWidth || 400, Ht = 150; bag.style.height = Ht + 'px'; bag.width = W * dpr; bag.height = Ht * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-2'); ctx.fillRect(0, 0, W, Ht);
    if (!counts) return; const total = Object.values(counts).reduce((a, b) => a + b, 0), r = Math.max(4, Math.min(11, Math.sqrt((W * Ht * 0.5) / Math.max(total, 1) / 4)));
    let x = 14, y = 18; ctx.font = '700 11px ui-sans-serif, system-ui'; ctx.textBaseline = 'middle';
    const els = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    for (const [e, n] of els) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-2'); ctx.fillText(e + ' × ' + n, 14, y); y += r * 2 + 8; x = 14;
      for (let i = 0; i < Math.min(n, 120); i++) { if (x + r > W - 10) { x = 14; y += r * 2 + 3; } ctx.fillStyle = COL[e] || '#9aa4ad'; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x + r, y, r, 0, 7); ctx.fill(); ctx.stroke(); x += r * 2 + 3; }
      y += r * 2 + 10;
    }
  }
  function upd() {
    let counts; try { counts = parseFormula(inp.value); } catch (e) { out.innerHTML = '<p class="fm-err">Not a formula I can read: ' + e.message + '. Example: C3H8, Ca(OH)2, H2O.</p>'; draw(null); Object.values(ro).forEach(r => r.set('–')); note.textContent = ''; return; }
    const M = molarMass(counts), n = Object.values(counts).reduce((a, b) => a + b, 0), pr = PRESETS.find(p => p[0] === inp.value.trim());
    out.innerHTML = '<div style="font-size:1.5rem;font-weight:700;margin-bottom:6px">' + sub(inp.value.trim()) + '</div><table><tr><th>Element</th><th>Atoms</th><th>Atomic mass</th><th>Contribution</th><th>Share of the mass</th></tr>' +
      Object.entries(counts).map(([e, k]) => '<tr><td><b>' + e + '</b></td><td>' + k + '</td><td>' + ATOMS[e].toFixed(3) + '</td><td>' + k + ' × ' + ATOMS[e].toFixed(3) + ' = ' + (k * ATOMS[e]).toFixed(2) + '</td><td><span class="bar" style="width:' + (100 * k * ATOMS[e] / M).toFixed(0) + '%"></span>' + (100 * k * ATOMS[e] / M).toFixed(1) + ' %</td></tr>').join('') +
      '<tr><td colspan="3"><b>Total (molar mass)</b></td><td colspan="2"><b>' + M.toFixed(2) + ' g/mol</b></td></tr></table>';
    draw(counts); ro.M.set(M.toFixed(2)); ro.n.set((1000 / M).toFixed(1)); ro.mol.set((M / AVOGADRO * 1e23).toFixed(3)); ro.N.set(String(n));
    note.innerHTML = (pr ? '<b>' + pr[1] + '.</b> ' : '') + '1 kg of it is ' + (1000 / M).toFixed(1) + ' mol, i.e. ' + ((1000 / M) * 6.022e23).toExponential(2).replace('e+', ' × 10<sup>') + '</sup> molecules.';
  }
  inp.addEventListener('input', upd); window.addEventListener('resize', upd); upd();
}
