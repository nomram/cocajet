// Spec sheet of the reference engine, straight from the model + manifest.
import { h, shell, C } from '../ui.js';
import { CJ1, FUELS, isa, steadyAt } from '../engine-model.js';
import { loadManifest } from '../viewer3d.js';

export default async function init(el) {
  const { body } = shell(el, { title: 'CJ-1 spec sheet', badge: 'Data', note: 'Design point: sea level, 15 °C, full power. Every figure is computed by the same model that drives the simulator and the STL generator, so the guide never disagrees with itself.' });
  const g = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(0));
  let mass = '≈ 2.4 kg';
  try { const m = await loadManifest(); mass = (m.parts.filter(p => !p.stand).reduce((a, p) => a + p.mass_g, 0) / 1000).toFixed(1) + ' kg (steel/Inconel mix)'; } catch (e) { /* offline manifest */ }
  const rows = [
    ['Performance', [
      ['Static thrust', g.thrust.toFixed(1) + ' N  (' + (g.thrust / 9.81).toFixed(1) + ' kgf, ' + (g.thrust * 0.2248).toFixed(1) + ' lbf)'],
      ['Speed range', '48 000 (idle) – ' + CJ1.Ndesign.toLocaleString('en') + ' rpm (max ' + CJ1.Nmax.toLocaleString('en') + ')'],
      ['Air mass flow', g.m.toFixed(3) + ' kg/s'],
      ['Fuel (propane)', (g.mf * 1000).toFixed(2) + ' g/s  =  ' + (g.mf * 3600).toFixed(1) + ' kg/h'],
      ['Thrust-specific fuel consumption', (g.tsfc * 3600).toFixed(3) + ' kg/(N·h)'],
      ['Jet velocity', g.Ve.toFixed(0) + ' m/s'],
    ]],
    ['Thermodynamics', [
      ['Compressor pressure ratio / efficiency', g.PRc.toFixed(2) + ' / ' + (g.etaC * 100).toFixed(0) + ' %'],
      ['Compressor outlet T₂', C(g.T02).toFixed(0) + ' °C   (P₂ = ' + (g.P02 / 1000).toFixed(0) + ' kPa)'],
      ['Turbine inlet T₃', C(g.T03).toFixed(0) + ' °C   (' + g.T03.toFixed(0) + ' K)'],
      ['Turbine exit (EGT) T₄', C(g.T04).toFixed(0) + ' °C   (P₄ = ' + (g.P04 / 1000).toFixed(0) + ' kPa)'],
      ['Turbine pressure ratio / efficiency', g.PRt.toFixed(2) + ' / ' + (g.etaT * 100).toFixed(0) + ' %'],
      ['Compressor power = turbine power', (g.Pc / 1000).toFixed(1) + ' kW'],
      ['Overall equivalence ratio φ', (g.phi).toFixed(2) + '  (about ' + (1 / g.phi * 15.6).toFixed(0) + ':1 air:fuel by mass)'],
    ]],
    ['Geometry (mm)', [
      ['Impeller', '56 exducer / 42 inducer tip / 12 hub, 7 + 7 backswept (30°) blades'],
      ['Combustor', 'annular, Ø100 casing, Ø66 Coke-can outer liner, Ø35 inner liner, 93 long'],
      ['Turbine', 'Ø59.4 axial wheel, 19 blades; 16-vane nozzle guide ring'],
      ['Nozzle exit', 'annulus ' + (CJ1.A5 * 1e6).toFixed(0) + ' mm² (r 20.5 outer / 8 cone)'],
      ['Length / diameter', '≈ 255 mm long (without the plume), Ø114 over the flanges'],
      ['Rotor', 'Ø8 shaft, two 8×16×5 bearings, polar inertia ' + (CJ1.I * 1e7).toFixed(0) + ' g·cm²'],
      ['Mass', mass],
    ]],
  ];
  for (const [title, list] of rows) {
    body.append(h('h4', { style: { margin: '14px 0 4px' } }, title), h('div', { class: 'table-wrap', style: { margin: '0 0 6px' } }, h('table', { class: 'data' }, h('tbody', {}, list.map(([k, v]) => h('tr', {}, h('td', { style: { width: '40%', color: 'var(--text-2)' } }, k), h('td', { style: { fontFamily: 'var(--mono)', fontSize: '.86rem' } }, v)))))));
  }
}
