// Runs the real engine model for every combination of (compressor, turbine, bearings, fuel) at six sizes and eight speeds,
// and writes data/design-table.json for the design workbench.   node tools/build-design-table.mjs
import fs from 'node:fs';
import { isa, steadyAt } from '../js/engine-model.js';
import { buildParams, S_GRID, X_GRID, N_REF } from '../js/engine-scale.js';
import { COMPRESSORS, TURBINES, BEARINGS, FUELSYS } from '../js/catalog.js';

const amb = isa(0), out = { meta: { S: S_GRID, X: X_GRID, nref: N_REF, fields: ['F', 'm', 'mf', 'T03', 'PR'] }, sets: {} };
const r3 = v => +v.toPrecision(4);
let count = 0, total = Object.keys(COMPRESSORS).length * Object.keys(TURBINES).length * Object.keys(BEARINGS).length * Object.keys(FUELSYS).length, t0 = Date.now();
for (const comp in COMPRESSORS) for (const turb in TURBINES) for (const bear in BEARINGS) for (const fuel in FUELSYS) {
  const key = [comp, turb, bear, fuel].join('|'), rows = [];
  for (const s of S_GRID) {
    const p = buildParams({ comp, turb, bear, fuel, s }), row = [];
    for (const x of X_GRID) {
      const g = steadyAt(p, x * N_REF / s, amb);
      row.push(g.surge || !isFinite(g.thrust) ? null : [r3(g.thrust), r3(g.m), r3(g.mf * 1000), Math.round(g.T03), r3(g.PRc)]);
    }
    rows.push(row);
  }
  out.sets[key] = rows; count++;
  if (count % 6 === 0) console.log(`${count}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
fs.writeFileSync(new URL('../data/design-table.json', import.meta.url), JSON.stringify(out));
console.log('wrote data/design-table.json', (fs.statSync(new URL('../data/design-table.json', import.meta.url)).size / 1024).toFixed(0), 'KB in', ((Date.now() - t0) / 1000).toFixed(0), 's');
