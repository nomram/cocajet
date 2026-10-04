// Slice every STL in ../models with the plane y = 0 and write a true cross-section drawing.
//   node section-svg.mjs [outfile.svg]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const models = path.join(here, '..', 'models');
const manifest = JSON.parse(fs.readFileSync(path.join(models, 'manifest.json'), 'utf8'));
const out = process.argv[2] || path.join(here, '..', 'img', 'cj1-section.svg');

function readSTL(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(80);
  const tris = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k++) tris[i * 9 + k] = b.readFloatLE(o + k * 4);
  }
  return tris;
}

/** segments of the intersection of triangle soup with plane y = 0, as [[z1,x1],[z2,x2]] */
function slice(tris) {
  const segs = [];
  for (let i = 0; i < tris.length; i += 9) {
    const v = [[tris[i], tris[i + 1], tris[i + 2]], [tris[i + 3], tris[i + 4], tris[i + 5]], [tris[i + 6], tris[i + 7], tris[i + 8]]];
    const pts = [];
    for (let a = 0; a < 3; a++) {
      const p = v[a], q = v[(a + 1) % 3];
      if ((p[1] > 0) !== (q[1] > 0)) {
        const t = (0 - p[1]) / (q[1] - p[1]);
        pts.push([p[2] + t * (q[2] - p[2]), p[0] + t * (q[0] - p[0])]);
      }
    }
    if (pts.length === 2) segs.push(pts);
  }
  return segs;
}

const sx = 3.6, sy = 3.6, padL = 30, padT = 20;
const xmin = -20, xmax = 270, ymin = -75, ymax = 75;
const W = (xmax - xmin) * sx + padL * 2, H = (ymax - ymin) * sy + padT * 2;
const X = (z) => padL + (z - xmin) * sx;
const Y = (x) => padT + (ymax - x) * sy;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif">\n`;
svg += `<rect width="100%" height="100%" fill="#0e1318"/>\n`;
// axis line
svg += `<line x1="${X(xmin)}" y1="${Y(0)}" x2="${X(xmax)}" y2="${Y(0)}" stroke="#44515d" stroke-dasharray="8 4 2 4"/>\n`;
for (const p of manifest.parts) {
  if (p.stand) continue;
  const segs = slice(readSTL(path.join(models, p.file)));
  let d = '';
  for (const [a, b] of segs) d += `M${X(a[0]).toFixed(1)} ${Y(a[1]).toFixed(1)}L${X(b[0]).toFixed(1)} ${Y(b[1]).toFixed(1)}`;
  svg += `<path d="${d}" stroke="${p.color}" stroke-width="1.6" fill="none" stroke-linecap="round"><title>${p.name}</title></path>\n`;
}
// numbered callouts (anchor on the part, label above/below)
const MARK = [
  ['1', 'compressor-housing', 3, 37.5, 12, 62], ['2', 'impeller', 34, 15, 34, 62], ['3', 'diffuser-plate', 46, 36, 46, 62],
  ['4', 'bearing-tunnel', 105, 11, 105, 62], ['5', 'combustor-casing', 135, 50, 135, 66], ['6', 'flame-tube', 125, 33, 125, 62],
  ['7', 'fuel-ring', 67.5, -25, 67.5, -62], ['8', 'ngv', 172, 27, 172, 62], ['9', 'turbine-wheel', 185, 21, 185, -50],
  ['10', 'turbine-casing', 182, -34, 182, -62], ['11', 'exhaust-nozzle', 232, 24, 232, 62], ['12', 'shaft', 150, 0, 150, -50],
];
for (const [n, id, z, x, lz, lx] of MARK) {
  const col = (manifest.parts.find(p => p.id === id) || {}).color || '#fff';
  svg += `<line x1="${X(z)}" y1="${Y(x)}" x2="${X(lz)}" y2="${Y(lx)}" stroke="${col}" stroke-width="1" stroke-dasharray="3 3" opacity=".8"/>`;
  svg += `<circle cx="${X(z)}" cy="${Y(x)}" r="3" fill="${col}"/>`;
  svg += `<circle cx="${X(lz)}" cy="${Y(lx)}" r="11" fill="#0e1318" stroke="${col}" stroke-width="1.6"/><text x="${X(lz)}" y="${Y(lx) + 4}" fill="#e7edf3" font-size="11" font-weight="700" text-anchor="middle">${n}</text>`;
}
// flow arrow + station labels
svg += `<g fill="#9aa4ad" font-size="11" text-anchor="middle"><text x="${X(-12)}" y="${Y(-70)}">air in →</text><text x="${X(262)}" y="${Y(-70)}">→ jet</text></g>`;
svg += `</svg>\n`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg);
console.log('wrote', out, `${W.toFixed(0)}x${H.toFixed(0)}`);
