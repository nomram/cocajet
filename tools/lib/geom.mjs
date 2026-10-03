// Geometry helpers for the parametric STL generator.
// Axis convention (all parts): engine axis = +Z, flow travels toward +Z, "up" = +Y.
// Units: millimetres.  Rotation of the rotor is about +Z (clockwise seen from the intake).
import Module from 'manifold-3d';
import fs from 'node:fs';

const wasm = await Module();
wasm.setup();
export const { Manifold, CrossSection, Mesh } = wasm;

export const deg = Math.PI / 180;

/* ---------- polygons ---------------------------------------------------------------- */

export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
export function ccw(poly) { return signedArea(poly) < 0 ? poly.slice().reverse() : poly; }

/** Revolve a (r, z) polygon around the Z axis. Polygon may touch r = 0. */
export function revolve(poly, segments = 96) {
  const cs = CrossSection.ofPolygons([ccw(poly)]);
  return Manifold.revolve(cs, segments);
}

/** Thicken an open polyline (list of [r,z]) into a closed polygon, offsetting by +-t/2 along the normals. */
export function thickPolyline(pts, t) {
  const n = pts.length, left = [], right = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(n - 1, i + 1)];
    let tx = p2[0] - p0[0], ty = p2[1] - p0[1];
    const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    const nx = -ty, ny = tx;
    left.push([p1[0] + nx * t / 2, p1[1] + ny * t / 2]);
    right.push([p1[0] - nx * t / 2, p1[1] - ny * t / 2]);
  }
  return left.concat(right.reverse());
}

/** Sample an elliptical arc: centre (cx,cy), radii (a,b), from angle a0 to a1 (radians), n+1 points. */
export function arc(cx, cy, a, b, a0, a1, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (a1 - a0) * i / n;
    out.push([cx + a * Math.cos(t), cy + b * Math.sin(t)]);
  }
  return out;
}

/* ---------- placement helpers ---------------------------------------------------------- */

/** Radial cylinder (hole cutter / boss) at angle phi (deg) and axial position z, spanning r0..r1. */
export function radialCylinder(r0, r1, rad, z, phiDeg, seg = 24) {
  const len = r1 - r0;
  return Manifold.cylinder(len, rad, rad, seg, false)
    .rotate([0, 90, 0]).translate([r0, 0, 0])
    .rotate([0, 0, phiDeg]).translate([0, 0, z]);
}

/** Copies of a manifold rotated about Z. */
export function polarArray(m, n, phase = 0) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(m.rotate([0, 0, phase + 360 * i / n]));
  return arr;
}

export function unionAll(list) { return Manifold.union(list); }

/** Axial cylinder (tube): outer radius ro, inner radius ri (0 = solid), from z0 to z1. */
export function tube(ro, ri, z0, z1, seg = 96) {
  const poly = ri > 0
    ? [[ri, z0], [ro, z0], [ro, z1], [ri, z1]]
    : [[0, z0], [ro, z0], [ro, z1], [0, z1]];
  return revolve(poly, seg);
}

/* ---------- blade section ------------------------------------------------------------ */

/**
 * Cambered blade section along a circular camber arc.
 * Returns a polygon in (u = axial, v = tangential +theta) coordinates, CCW, centred on its centroid.
 *   chordLen  : length of the camber arc  (mm)
 *   tmax      : maximum thickness (mm)
 *   inletDeg  : metal angle at the leading edge, measured from axial toward +theta
 *   exitDeg   : metal angle at the trailing edge
 */
export function bladeSection({ chordLen, tmax, inletDeg, exitDeg, n = 22 }) {
  const a0 = inletDeg * deg, a1 = exitDeg * deg;
  const dphi = a1 - a0;
  const P = [], N = [], T = [];
  for (let i = 0; i <= n; i++) {
    // cosine spacing clusters points near LE / TE
    const xn = 0.5 * (1 - Math.cos(Math.PI * i / n));
    const s = xn * chordLen;
    const phi = a0 + dphi * xn;
    let u, v;
    if (Math.abs(dphi) < 1e-6) { u = s * Math.cos(a0); v = s * Math.sin(a0); }
    else {
      const R = chordLen / dphi;
      u = R * (Math.sin(phi) - Math.sin(a0));
      v = -R * (Math.cos(phi) - Math.cos(a0));
    }
    P.push([u, v]);
    N.push([-Math.sin(phi), Math.cos(phi)]);
    // NACA-style thickness distribution, open trailing edge
    const t = 5 * (tmax / 1) * (0.2969 * Math.sqrt(xn) - 0.1260 * xn - 0.3516 * xn * xn + 0.2843 * xn ** 3 - 0.1015 * xn ** 4);
    T.push(Math.max(t, 0.18));
  }
  const lower = [], upper = [];
  for (let i = 0; i <= n; i++) {
    lower.push([P[i][0] - N[i][0] * T[i] / 2, P[i][1] - N[i][1] * T[i] / 2]);
    upper.push([P[i][0] + N[i][0] * T[i] / 2, P[i][1] + N[i][1] * T[i] / 2]);
  }
  let poly = lower.concat(upper.reverse());
  // remove repeated vertex at the leading edge
  poly = poly.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6);
  if (Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1]) < 1e-6) poly.pop();
  // centre on centroid (area weighted)
  let cx = 0, cy = 0, A = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const cr = x1 * y2 - x2 * y1; A += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A;
  poly = poly.map(([x, y]) => [x - cx, y - cy]);
  return ccw(poly);
}

/**
 * Extrude a (u,v) blade section along the radial direction.
 * Result: blade stacking axis along +X from x = 0 to x = height, chord along +Z, tangential +Y.
 * Twist (deg, about the stacking axis) and tip scale are applied along the span.
 */
export function radialBlade(section, height, twistDeg = 0, tipScale = 1, divisions = 8) {
  // local frame for extrusion:  local x -> world -Z (so we pass x = -u), local y -> world Y,  local z -> world X.
  const poly = section.map(([u, v]) => [-u, v]).reverse();     // mirror => reverse to keep CCW
  const cs = CrossSection.ofPolygons([ccw(poly)]);
  const m = Manifold.extrude(cs, height, divisions, twistDeg, [tipScale, tipScale]);
  return m.rotate([0, 90, 0]);                                  // (x,y,z) -> (z, y, -x): local z -> world X
}

/* ---------- STL output ---------------------------------------------------------------- */

export function meshStats(m) {
  const mesh = m.getMesh();
  const vp = mesh.vertProperties, np = mesh.numProp;
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < vp.length; i += np) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], vp[i + k]); max[k] = Math.max(max[k], vp[i + k]);
  }
  return { tris: mesh.triVerts.length / 3, verts: vp.length / np, bbox: { min, max }, volume: m.volume(), area: m.surfaceArea(), genus: m.genus() };
}

export function writeBinarySTL(m, file, label = 'cocajet') {
  const mesh = m.getMesh();
  const vp = mesh.vertProperties, np = mesh.numProp, tv = mesh.triVerts;
  const nt = tv.length / 3;
  const buf = Buffer.alloc(84 + nt * 50);
  buf.write(label.slice(0, 79), 0, 'ascii');
  buf.writeUInt32LE(nt, 80);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = tv[3 * t] * np, b = tv[3 * t + 1] * np, c = tv[3 * t + 2] * np;
    const ax = vp[a], ay = vp[a + 1], az = vp[a + 2];
    const bx = vp[b], by = vp[b + 1], bz = vp[b + 2];
    const cx = vp[c], cy = vp[c + 1], cz = vp[c + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    for (const v of [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz]) { buf.writeFloatLE(v, o); o += 4; }
    buf.writeUInt16LE(0, o); o += 2;
  }
  fs.writeFileSync(file, buf);
  return nt;
}
