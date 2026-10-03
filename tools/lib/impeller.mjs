// Centrifugal impeller blade builder (ruled-surface blades, like a 3-axis machined / cast turbo wheel).
import { Manifold, Mesh, deg } from './geom.mjs';

/** Meridional contours: quarter-ellipses from the inducer eye to the radial exit. */
export function meridional(P) {
  const hub = (s) => ({
    r: P.R2 - (P.R2 - P.rh1) * Math.cos(Math.PI * s / 2),
    z: P.zE + P.Lax * Math.sin(Math.PI * s / 2),
  });
  const shr = (s) => ({
    r: P.R2 - (P.R2 - P.rs1) * Math.cos(Math.PI * s / 2),
    z: P.zE + (P.Lax - P.b2) * Math.sin(Math.PI * s / 2),
  });
  return { hub, shr };
}

/** Wrap angle theta(s): blade angle along the shroud goes linearly from beta1s to beta2 (deg from meridional). */
function wrapAngle(P, shr, s) {
  const N = 200;
  let th = 0, prev = shr(0);
  for (let i = 1; i <= N; i++) {
    const si = (i / N) * s;
    const cur = shr(si);
    const sm = ((i - 0.5) / N) * s;
    const beta = (P.beta1s + (P.beta2 - P.beta1s) * sm) * deg;
    const rm = 0.5 * (cur.r + prev.r);
    const dm = Math.hypot(cur.r - prev.r, cur.z - prev.z);
    th -= Math.tan(beta) / rm * dm;                    // negative: blades sweep back against rotation (+theta)
    prev = cur;
  }
  return th;
}

/**
 * One blade as a closed manifold solid.
 *   sStart : meridional start (0 = full blade, ~0.4 = splitter)
 *   phase  : rotation about Z (rad)
 */
export function impellerBlade(P, { sStart = 0, phase = 0, n = 34 } = {}) {
  const { hub, shr } = meridional(P);
  const nodes = [];                                    // nodes[i][k][j] = [x,y,z]
  const thetaCache = [];
  for (let i = 0; i < n; i++) {
    const s = sStart + (1 - sStart) * i / (n - 1);
    const th = wrapAngle(P, shr, s) + phase;
    thetaCache.push(th);
    const h = hub(s), c = shr(s);
    // ruling direction (hub -> shroud) in the (r,z) plane
    let dr = c.r - h.r, dz = c.z - h.z;
    const L = Math.hypot(dr, dz); dr /= L; dz /= L;
    const hubPt = { r: h.r - dr * P.embed, z: h.z - dz * P.embed };
    const tipPt = { r: c.r - dr * P.clearance, z: c.z - dz * P.clearance };
    // taper: thicker at root, thinner at the tip
    const row = [];
    for (let k = 0; k < 2; k++) {
      const sign = k === 0 ? -1 : 1;
      const col = [];
      for (let j = 0; j < 2; j++) {
        const pt = j === 0 ? hubPt : tipPt;
        const t = j === 0 ? P.tRoot : P.tTip;
        const dth = sign * (t / 2) / pt.r;
        col.push([pt.r * Math.cos(th + dth), pt.r * Math.sin(th + dth), pt.z]);
      }
      row.push(col);
    }
    nodes.push(row);
  }
  const verts = [], idx = {};
  const vid = (i, k, j) => {
    const key = `${i},${k},${j}`;
    if (!(key in idx)) { idx[key] = verts.length / 3; verts.push(...nodes[i][k][j]); }
    return idx[key];
  };
  const tris = [];
  const quad = (a, b, c, d) => { tris.push(a, b, c, a, c, d); };
  const last = n - 1;
  // caps  (+i / -i)
  quad(vid(last, 0, 0), vid(last, 1, 0), vid(last, 1, 1), vid(last, 0, 1));
  quad(vid(0, 0, 0), vid(0, 0, 1), vid(0, 1, 1), vid(0, 1, 0));
  for (let i = 0; i < last; i++) {
    // +k / -k   (quad in (j,i))
    quad(vid(i, 1, 0), vid(i, 1, 1), vid(i + 1, 1, 1), vid(i + 1, 1, 0));
    quad(vid(i, 0, 0), vid(i + 1, 0, 0), vid(i + 1, 0, 1), vid(i, 0, 1));
    // +j / -j   (quad in (i,k))
    quad(vid(i, 0, 1), vid(i + 1, 0, 1), vid(i + 1, 1, 1), vid(i, 1, 1));
    quad(vid(i, 0, 0), vid(i, 1, 0), vid(i + 1, 1, 0), vid(i + 1, 0, 0));
  }
  const build = (flip) => {
    const t = flip ? tris.map((v, q) => (q % 3 === 1 ? tris[q + 1] : q % 3 === 2 ? tris[q - 1] : v)) : tris;
    const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(t) });
    return new Manifold(mesh);
  };
  let m = build(false);
  if (m.status() !== 'NoError' || m.volume() < 0) { try { m = build(true); } catch (e) { /* ignore */ } }
  if (m.status() !== 'NoError') throw new Error('impeller blade invalid: ' + m.status());
  return m;
}
