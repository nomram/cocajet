// From a balanced equation to kilograms: how much oxygen, how much air, how much CO2 and water, how much heat. Lean, rich and the CJ-1.
import { h, shell, select, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { FUELS, ATOMS, AIR_MOLE, sub } from '../chem-model.js';

const M_O2 = 2 * ATOMS.O, M_CO2 = ATOMS.C + M_O2, M_H2O = 2 * ATOMS.H + ATOMS.O, M_N2 = 2 * ATOMS.N, M_AR = 39.948;
const N2_PER_O2 = AIR_MOLE.N2 / AIR_MOLE.O2, AR_PER_O2 = AIR_MOLE.Ar / AIR_MOLE.O2;
const nice = x => x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3);
const mass = g => g >= 1000 ? (g / 1000).toFixed(g >= 10000 ? 1 : 2) + ' kg' : g >= 10 ? g.toFixed(1) + ' g' : g.toFixed(2) + ' g';
export default function init(el) {
  const { body } = shell(el, { title: 'From equation to kilograms: moles, air and what comes out', note: 'A balanced equation is also a recipe in <i>moles</i>: C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O says that 1 mol of propane needs 5 mol of oxygen and gives 3 mol of CO₂ and 4 mol of water. Multiply each mole count by its molar mass and you have kilograms. Since air is only 23 % oxygen by mass, burning needs about 16 kg of air per kg of fuel. <b>φ (equivalence ratio)</b> compares the fuel you actually add with the exact amount: φ = 1 is stoichiometric, φ &lt; 1 is lean (spare oxygen), φ &gt; 1 is rich (spare fuel). Our engine burns at an overall φ of about 0.3.' });
  const fsel = select({ label: 'Fuel', options: Object.entries(FUELS).map(([k, v]) => [k, v.name + ' · ' + v.f]), value: 'propane', onChange: upd });
  const sM = slider({ label: 'Mass of fuel', min: 1, max: 20000, step: 1, value: 1000, unit: '', log: true, fmt: v => mass(v), onInput: upd });
  const sP = slider({ label: 'Equivalence ratio φ', min: 0.2, max: 2, step: 0.005, value: 1, fmt: v => v.toFixed(3) + (Math.abs(v - 1) < 0.01 ? ' (exact)' : v < 1 ? ' (lean)' : ' (rich)'), onInput: upd });
  const cj = button('The CJ-1 for one second', () => { fsel.set('propane'); sM.set(2.857); sP.set(0.295); upd(); }, 'small'), one = button('Exact mixture, 1 kg of fuel', () => { sM.set(1000); sP.set(1); upd(); }, 'small');
  const eq = h('div', { class: 'st-eq' }), tbl = h('div', { class: 'table-wrap' }), cv = h('canvas', { class: 'plot' }), msg = h('p', { class: 'muted' });
  const ro = { afr: readout('Air needed (exact mix)', 'kg per kg fuel', 'cool'), co2: readout('CO₂ made', 'kg per kg fuel', 'hot'), q: readout('Heat released', 'MJ per kg fuel', 'fuel'), o2: readout('Oxygen needed', 'kg per kg fuel', 'cool'), vol: readout('Gas molecules after ÷ before', '', 'good') };
  body.append(h('div', { class: 'ctls' }, fsel.el, sM.el, sP.el, h('div', { class: 'btn-row' }, cj, one)), eq, tbl, h('div', { class: 'wgrid even', style: { marginTop: '8px' } }, cv, h('div', {}, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), msg)));
  const css = document.createElement('style'); css.textContent = '.st-eq{font-size:1.25rem;margin:12px 0;font-weight:600}.st-tot td{font-weight:700;border-top:2px solid var(--line-2)}'; el.append(css);
  const p = new Plot(cv, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, aspect: 1.5, minHeight: 220, margin: { l: 14, r: 14, t: 28, b: 14 }, grid: false, title: 'Where the mass goes: in (left) and out (right)' });
  function upd() {
    const F = FUELS[fsel.get()], mF = +sM.get().toPrecision(3), phi = +sP.get().toFixed(3), nF = mF / F.M, nO2need = nF * F.nO2, nO2 = nO2need / phi, burnFrac = Math.min(1, 1 / phi), nBurn = nF * burnFrac;
    const nO2used = nBurn * F.nO2, nO2left = Math.max(0, nO2 - nO2used), nN2 = nO2 * N2_PER_O2, nAr = nO2 * AR_PER_O2;
    const nCO2 = nBurn * F.C, nH2O = nBurn * F.H / 2, fuelLeft = nF - nBurn;
    const mAir = nO2 * M_O2 + nN2 * M_N2 + nAr * M_AR, inTot = mF + mAir;
    const rows = [
      ['Fuel ' + sub(F.f), nF, mF, 'in'], ['Oxygen O₂ (from the air)', nO2, nO2 * M_O2, 'in'], ['Nitrogen N₂ and argon (come along for the ride)', nN2 + nAr, nN2 * M_N2 + nAr * M_AR, 'in'],
      ['Carbon dioxide CO₂', nCO2, nCO2 * M_CO2, 'out'], ['Water H₂O (steam)', nH2O, nH2O * M_H2O, 'out'], ['Oxygen left over', nO2left, nO2left * M_O2, 'out'], ['Nitrogen N₂ and argon', nN2 + nAr, nN2 * M_N2 + nAr * M_AR, 'out'],
    ]; if (fuelLeft > 1e-9) rows.push(['Fuel left unburnt (real flames make CO and soot)', fuelLeft, fuelLeft * F.M, 'out']);
    const outTot = rows.filter(r => r[3] === 'out').reduce((a, r) => a + r[2], 0);
    // equation per mole of fuel, with fractional coefficients if needed
    const fr = x => Number.isInteger(x) ? (x === 1 ? '' : x + ' ') : (x * 4 === Math.round(x * 4) ? x.toString().replace(/\.0+$/, '') + ' ' : x.toFixed(2) + ' ');
    eq.innerHTML = sub(F.f) + ' + ' + fr(F.nO2) + 'O<sub>2</sub> → ' + fr(F.C) + 'CO<sub>2</sub> + ' + fr(F.H / 2) + 'H<sub>2</sub>O' + (Number.isInteger(F.nO2) && Number.isInteger(F.H / 2) ? '' : '<span class="muted" style="font-size:.85rem;font-weight:400"> &nbsp;(fractions are fine per molecule; multiply by 4 for whole numbers)</span>');
    const sec = (t) => '<tr><th colspan="4" style="text-align:left;background:var(--panel-2)">' + t + '</th></tr>';
    tbl.innerHTML = '<table class="data"><tr><th>Substance</th><th class="num">Moles</th><th class="num">Mass</th><th class="num">Share of the total</th></tr>' + sec('Going in') + rows.filter(r => r[3] === 'in').map(r => '<tr><td>' + r[0] + '</td><td class="num">' + nice(r[1]) + ' mol</td><td class="num">' + mass(r[2]) + '</td><td class="num">' + (100 * r[2] / inTot).toFixed(1) + ' %</td></tr>').join('') + '<tr class="st-tot"><td>Total in</td><td></td><td class="num">' + mass(inTot) + '</td><td></td></tr>' + sec('Coming out') + rows.filter(r => r[3] === 'out').map(r => '<tr><td>' + r[0] + '</td><td class="num">' + nice(r[1]) + ' mol</td><td class="num">' + mass(r[2]) + '</td><td class="num">' + (100 * r[2] / outTot).toFixed(1) + ' %</td></tr>').join('') + '<tr class="st-tot"><td>Total out</td><td></td><td class="num">' + mass(outTot) + '</td><td></td></tr></table>';
    const afr = F.nO2 * M_O2 * (1 + N2_PER_O2 * M_N2 / M_O2 + AR_PER_O2 * M_AR / M_O2) / F.M;
    ro.afr.set(afr.toFixed(2)); ro.co2.set((F.C * M_CO2 / F.M).toFixed(2)); ro.q.set((-F.dHc / F.M).toFixed(1)); ro.o2.set((F.nO2 * M_O2 / F.M).toFixed(2));
    ro.vol.set(((rows.filter(r => r[3] === 'out').reduce((a, r) => a + r[1], 0)) / (rows.filter(r => r[3] === 'in').reduce((a, r) => a + r[1], 0))).toFixed(3));
    msg.innerHTML = phi < 0.99 ? 'Lean: <b>' + (nO2left / nO2 * 100).toFixed(0) + ' %</b> of the oxygen is left over. The heat released, <b>' + (nBurn * -F.dHc / 1000).toFixed(1) + ' MJ</b>, warms ' + (mAir + mF).toFixed(0) + ' g of mixture, so the more lean, the cooler the gas (next sections).' : phi > 1.01 ? 'Rich: oxygen runs out first, so only <b>' + (burnFrac * 100).toFixed(0) + ' %</b> of the fuel can burn completely. The oxygen is the <i>limiting reagent</i>.' : 'Exact mixture: every oxygen and every fuel molecule has a partner. Mass in = mass out: <b>' + mass(inTot) + '</b>.';
    // mass bars
    const c = p.begin().col, ctx = p.ctx, W = p.W, H = p.H, scale = (H - 70) / Math.max(inTot, outTot, 1);
    const stack = (x, items) => { let y = H - 24; for (const [lab, m, col] of items) { if (m <= 0) continue; const hh = m * scale; ctx.fillStyle = col; ctx.globalAlpha = .88; ctx.fillRect(x, y - hh, W * 0.34, hh); ctx.globalAlpha = 1; if (hh > 14) { ctx.fillStyle = '#fff'; ctx.font = '700 11px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab + ' ' + mass(m), x + W * 0.17, y - hh / 2); } y -= hh; } };
    stack(W * 0.1, [['fuel', mF, c.fuel], ['O₂', nO2 * M_O2, c.air], ['N₂ + Ar', nN2 * M_N2 + nAr * M_AR, c.muted]]);
    stack(W * 0.56, [['CO₂', nCO2 * M_CO2, c.fire], ['H₂O', nH2O * M_H2O, c.violet], ['unburnt', fuelLeft * F.M, c.fuel], ['spare O₂', nO2left * M_O2, c.air], ['N₂ + Ar', nN2 * M_N2 + nAr * M_AR, c.muted]]);
    ctx.fillStyle = c.text; ctx.font = '700 12px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('IN', W * 0.27, H - 20); ctx.fillText('OUT', W * 0.73, H - 20);
    ctx.fillStyle = c.muted; ctx.textBaseline = 'middle'; ctx.font = '800 22px ui-sans-serif, system-ui'; ctx.fillText('=', W * 0.5, H / 2);
  }
  p.onDraw(upd); upd();
}
