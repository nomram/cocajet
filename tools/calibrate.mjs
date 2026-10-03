// Calibration / sanity script for js/engine-model.js
//   node calibrate.mjs
import { CJ1, isa, gasPath, steadyAt, compressorMap, compressor } from '../js/engine-model.js';

const amb = isa(0);
const p = { ...CJ1 };
const rpms = [20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 115000, 120000];
console.log('rpm      mdot   PRc  etaC  T03    T04    PRt   etaT  thrust  fuel g/s  TSFC kg/Nh  phi   flags');
for (const N of rpms) {
  const g = steadyAt(p, N, amb);
  console.log(
    String(N).padStart(6),
    g.m.toFixed(3).padStart(8),
    g.PRc.toFixed(2).padStart(5),
    g.etaC.toFixed(2).padStart(5),
    g.T03.toFixed(0).padStart(6),
    g.T04.toFixed(0).padStart(6),
    g.PRt.toFixed(2).padStart(6),
    g.etaT.toFixed(2).padStart(5),
    g.thrust.toFixed(1).padStart(7),
    (g.mf * 1000).toFixed(2).padStart(8),
    (g.tsfc * 3600).toFixed(3).padStart(10),
    g.phi.toFixed(2).padStart(6),
    (g.surge ? ' SURGE' : '') + (g.choked ? ' CHOKE' : '') + (g.nozChoked ? ' nozChoked' : ''),
  );
}
const g = steadyAt(p, 115000, amb);
console.log('\nDesign point (115 krpm):');
console.log(' mdot', g.m.toFixed(4), 'PRc', g.PRc.toFixed(3), 'etaC', g.etaC.toFixed(3));
console.log(' T02', g.T02.toFixed(1), 'T03', g.T03.toFixed(1), 'T04', g.T04.toFixed(1), 'T5', g.T5.toFixed(1));
console.log(' P02', (g.P02 / 1e3).toFixed(1), 'P03', (g.P03 / 1e3).toFixed(1), 'P04', (g.P04 / 1e3).toFixed(1), 'kPa');
console.log(' Ve', g.Ve.toFixed(1), 'thrust N', g.thrust.toFixed(2), 'fuel g/s', (g.mf * 1e3).toFixed(2));
console.log(' Pc kW', (g.Pc / 1e3).toFixed(2), 'Pt kW', (g.Pt / 1e3).toFixed(2));
const c = g.comp;
console.log(' comp: U2', c.U2.toFixed(0), 'sigma', c.sigma.toFixed(3), 'phi2', c.phi2.toFixed(3), 'inc', c.incidence.toFixed(1), 'MW1', c.MW1.toFixed(2));
console.log(' losses kJ/kg', Object.fromEntries(Object.entries(c.losses).map(([k, v]) => [k, +(v / 1e3).toFixed(2)])));
console.log(' limits', g.limits);

console.log('\nCompressor map @115k:');
const map = compressorMap(p, amb, [115000]);
for (const pt of map[0].pts) console.log('  m', pt.m.toFixed(3), 'PR', pt.PR.toFixed(2), 'eta', pt.eta.toFixed(2), 'MW1', pt.MW1.toFixed(2), 'inc', pt.inc.toFixed(1));
