// Extra STL models used by the chapters (not part of the CJ-1 engine):
//   node build-extras.mjs      -> ../models/extras/diy-plug-*.stl + diy-plug.json
// A home-made spark plug: M10 x 1 bolt body, alumina tube insulator, Kanthal/tungsten centre wire and a bent ground strap.
// Axis = +Z, z = 0 at the terminal end of the body, the combustion end is at +Z.  Units: mm.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Manifold, tube, revolve, meshStats, writeBinarySTL } from './lib/geom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'models', 'extras');
fs.mkdirSync(out, { recursive: true });

const D = { hexAF: 14, hexH: 6, washerOD: 14, washerID: 10.2, washerT: 1, shankD: 10, shankL: 19.0, bore: 5.0, insOD: 4.8, insID: 1.7, wire: 1.6, gap: 0.8 };
const zShank0 = D.hexH + D.washerT, zTip = zShank0 + D.shankL;           // shell ends at z = 26
const parts = [];

// --- shell: hex head + M10 shank (thread drawn as a plain cylinder with a chamfer) with a through bore
const hex = Manifold.cylinder(D.hexH, D.hexAF / Math.sqrt(3), D.hexAF / Math.sqrt(3), 6, false);   // circumscribed radius = AF / sqrt(3)
const shank = revolve([[0, zShank0], [D.shankD / 2, zShank0], [D.shankD / 2, zTip - 0.6], [D.shankD / 2 - 0.6, zTip], [0, zTip]], 64);
const shell = Manifold.union([hex, shank]).subtract(tube(D.bore / 2, 0, -1, zTip + 1, 48));
parts.push({ id: 'shell', name: 'Body: M10×1 stainless bolt, drilled Ø5', file: 'diy-plug-shell.stl', color: '#9aa4ad', material: 'Stainless A2 (304)', density: 7900, m: shell, note: 'An M10×1.0 hex bolt, 28 mm long, drilled through Ø5.0 on a lathe or drill press. The thread seals into the engine; the hex takes a spanner.' });
// --- copper crush washer
parts.push({ id: 'washer', name: 'Copper crush washer', file: 'diy-plug-washer.stl', color: '#c97b4a', material: 'Copper', density: 8960, m: tube(D.washerOD / 2, D.washerID / 2, D.hexH, zShank0), note: 'Annealed copper: crushes to seal against the engine boss.' });
// --- insulator: alumina tube, protruding 20 mm at the terminal end (creepage path) and 1.5 mm at the nose
const insZ0 = -20, insZ1 = zTip + 1.5;
parts.push({ id: 'insulator', name: 'Insulator: alumina tube Ø4.8 × Ø1.7', file: 'diy-plug-insulator.stl', color: '#efe8d8', material: 'Alumina 96–99 %', density: 3900, m: tube(D.insOD / 2, D.insID / 2, insZ0, insZ1, 48), note: 'Single-bore alumina (thermocouple-sheath tube). 20 mm outside the body to stop the spark flashing over the ceramic.' });
// --- centre electrode: Ø1.6 wire with a crimp bead at the terminal end
const tipZ = insZ1 + 1.5;
const wire = tube(D.wire / 2, 0, insZ0 - 6, tipZ, 32);
const bead = revolve([[0, insZ0 - 9], [1.7, insZ0 - 8], [1.9, insZ0 - 6.5], [1.7, insZ0 - 5], [0, insZ0 - 4]], 32);
parts.push({ id: 'electrode', name: 'Centre electrode: Ø1.6 Kanthal / tungsten wire', file: 'diy-plug-electrode.stl', color: '#d7dde3', material: 'Kanthal A1 / tungsten / Inconel 600', density: 7100, m: Manifold.union([wire, bead]), note: 'Oxidation-resistant alloy wire, 1.5 mm proud of the ceramic. The bead at the end takes the HV lead crimp.' });
// --- ground strap: 1 x 3 mm strip, welded to the shell face, bent over the electrode tip
const legX0 = D.shankD / 2 - 1.4, strapZ0 = zTip - 0.5, hz = tipZ + D.gap;
const box = (x0, x1, y0, y1, z0, z1) => Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
const strap = Manifold.union([box(legX0, legX0 + 1.0, -1.5, 1.5, strapZ0, hz + 1.0), box(-1.2, legX0 + 1.0, -1.5, 1.5, hz, hz + 1.0)]);
parts.push({ id: 'strap', name: 'Ground strap: 1×3 mm nichrome / stainless', file: 'diy-plug-strap.stl', color: '#bfc7cf', material: 'Nichrome 80/20 or stainless', density: 8400, m: strap, note: 'Welded (TIG or spot) to the face of the body and bent over the tip. The gap under it is set with a feeler gauge: 0.8 mm.' });

const EXPLODE = { shell: [0, 0, 0], insulator: [-20, 0, 0], electrode: [-38, 0, 0], strap: [22, 0, 0], washer: [40, 0, 0] };
const man = { units: 'mm', axis: '+Z points into the engine; z = 0 at the terminal end of the body', gap_mm: D.gap, parts: [] };
const merged = [];
for (const p of parts) {
  const st = meshStats(p.m);
  const nt = writeBinarySTL(p.m, path.join(out, p.file), 'DIY spark plug: ' + p.name);
  man.parts.push({ id: p.id, name: p.name, file: p.file, color: p.color, material: p.material, mass_g: +((st.volume / 1000) * (p.density / 1000)).toFixed(2), tris: nt, bbox: { min: st.bbox.min.map(v => +v.toFixed(2)), max: st.bbox.max.map(v => +v.toFixed(2)) }, note: p.note, explode: EXPLODE[p.id] });
  merged.push(p.m);
  console.log(p.file.padEnd(28), String(nt).padStart(6), 'tris', ' mass', man.parts[man.parts.length - 1].mass_g, 'g');
}
const asm = Manifold.compose(merged);
man.assembly = { file: 'diy-plug-assembly.stl', tris: writeBinarySTL(asm, path.join(out, 'diy-plug-assembly.stl'), 'DIY spark plug assembly') };
fs.writeFileSync(path.join(out, 'diy-plug.json'), JSON.stringify(man, null, 1));
console.log('wrote', parts.length, 'parts + assembly');
