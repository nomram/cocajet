// Print the model's headline numbers (used to keep the text of the guide in step with the physics).
//   node tools/numbers.mjs [--json]
import { CJ1, isa, steadyAt, compressorLimits } from '../js/engine-model.js';
const amb = isa(0);
const rows = {};
for (const N of [30000, 40000, 48000, 60000, 80000, 100000, 115000, 125000]) {
  const g = steadyAt({ ...CJ1 }, N, amb);
  rows[N] = { thrust: +g.thrust.toFixed(2), m: +g.m.toFixed(4), mf_gs: +(g.mf * 1000).toFixed(3), PRc: +g.PRc.toFixed(3), etaC: +g.etaC.toFixed(3), T02C: +(g.T02 - 273.15).toFixed(1), T03C: +(g.T03 - 273.15).toFixed(1), T04C: +(g.T04 - 273.15).toFixed(1), PRt: +g.PRt.toFixed(3), etaT: +g.etaT.toFixed(3), Ve: +g.Ve.toFixed(1), P04_P0: +(g.P04 / amb.P).toFixed(3), tsfc_kgNh: +(g.tsfc * 3600).toFixed(4), phi: +g.phi.toFixed(3), Pc_kW: +(g.Pc / 1000).toFixed(2), Pt_kW: +(g.Pt / 1000).toFixed(2), noz: g.nozChoked };
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else console.table(rows);
