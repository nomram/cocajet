/* ==========================================================================
   steam.js — water/steam properties and steam-plant cycles. No DOM.

   Data: data/steam-tables.json, built from IAPWS-IF97 by tools/build-steam-tables.py
     sat   saturation properties on a log-pressure grid (monotone cubic interpolation in ln p)
     grid  h(p,s) and T(p,s) on a (ln p, s) grid covering liquid, wet steam, vapour and supercritical fluid
           (bilinear interpolation; inside the dome the exact lever rule on the saturation table is used)
   Units: p MPa, T °C, h kJ/kg, s kJ/(kg·K), v m³/kg.
   ========================================================================== */
export const PC = 22.064, TC = 373.946;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let SAT = null, GR = null;

/* --- monotone cubic (Fritsch–Carlson) interpolant on arbitrary knots --- */
function pchip(xs, ys) {
  const n = xs.length, d = new Float64Array(n), dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx.push(xs[i + 1] - xs[i]); m.push((ys[i + 1] - ys[i]) / dx[i]); }
  d[0] = m[0]; d[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) d[i] = 0;
    else { const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1]; d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
  }
  return (x) => {
    x = clamp(x, xs[0], xs[n - 1]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] > x) hi = mid; else lo = mid; }
    const h = dx[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * d[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * d[hi];
  };
}

export function setSteamTables(d) {
  const lp = d.sat.p.map(Math.log);
  SAT = { lp, f: {}, pmin: d.sat.p[0] };
  for (const k of ['T', 'hf', 'hg', 'sf', 'sg']) SAT.f[k] = pchip(lp, d.sat[k]);
  for (const k of ['vf', 'vg']) { const f = pchip(lp, d.sat[k].map(Math.log)); SAT.f[k] = (x) => Math.exp(f(x)); }
  GR = d.grid;
}
export async function loadSteam(url = 'data/steam-tables.json') {
  if (SAT) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error('could not load ' + url + ' (' + r.status + ')');
  setSteamTables(await r.json());
}
export const ready = () => !!SAT;
export const P_LO = 0.005, P_HI = 30;

/* --- saturation --- */
export function sat(p) {
  const x = Math.log(clamp(p, SAT.pmin, PC)), o = {};
  for (const k in SAT.f) o[k] = SAT.f[k](x);
  o.p = p; o.hfg = o.hg - o.hf; o.sfg = o.sg - o.sf;
  return o;
}
export const Tsat = (p) => SAT.f.T(Math.log(clamp(p, SAT.pmin, PC)));
export function pSat(T) { let lo = Math.log(SAT.pmin), hi = Math.log(PC); for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (SAT.f.T(m) < T) lo = m; else hi = m; } return Math.exp((lo + hi) / 2); }
/** dome outline for plotting: arrays of T, sf, sg (from the triple point up to the critical point) */
export function dome(n = 120) {
  const T = [], sf = [], sg = [], p0 = SAT.pmin;
  for (let i = 0; i <= n; i++) { const p = p0 * Math.pow(PC / p0, i / n), q = sat(p); T.push(q.T); sf.push(q.sf); sg.push(q.sg); }
  return { T, sf, sg };
}

/* --- single-phase / mixed grid --- */
function rowVal(row, s) {
  const k = (s - GR.s0) / GR.ds, j = clamp(Math.floor(k), 0, row.length - 2), t = k - j;
  return row[j] + (row[j + 1] - row[j]) * t;
}
function gridVal(A, p, s) {
  const u = clamp((Math.log(clamp(p, P_LO, P_HI)) - GR.lnp0) / GR.dlnp, 0, GR.np - 1 - 1e-9), i = Math.floor(u), f = u - i;
  const a = rowVal(A[i], s), b = rowVal(A[i + 1], s);
  return a + (b - a) * f;
}
/** specific enthalpy at (p, s): the isentropic-expansion workhorse */
export function hps(p, s) {
  if (p < PC) { const q = sat(p); if (s >= q.sf && s <= q.sg) return q.hf + (s - q.sf) / q.sfg * q.hfg; }
  return gridVal(GR.h, p, s);
}
/** temperature at (p, s). Exact inside the dome; elsewhere bilinear, with up to ~2 K error in the first grid cell next to the saturation line */
export function Tps(p, s) {
  if (p < PC) { const q = sat(p); if (s >= q.sf && s <= q.sg) return q.T; }
  return gridVal(GR.T, p, s);
}
const S_LO = -0.3, S_HI = 12;
function bisect(f, target, lo, hi) { for (let i = 0; i < 52; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; }

/** full state from (p, s) */
export function statePS(p, s) {
  const o = { p, s, h: hps(p, s), T: Tps(p, s), x: null };
  if (p < PC) { const q = sat(p); o.x = s <= q.sf ? 0 : s >= q.sg ? 1 : (s - q.sf) / q.sfg; }
  return o;
}
/** full state from (p, h) */
export function statePH(p, h) {
  if (p < PC) {
    const q = sat(p);
    if (h >= q.hf && h <= q.hg) { const x = (h - q.hf) / q.hfg; return { p, h, s: q.sf + x * q.sfg, T: q.T, x }; }
  }
  const s = bisect((ss) => hps(p, ss), h, S_LO, S_HI);
  return statePS(p, s);
}
/** full state from (p, T) in single-phase fluid (liquid if T < Tsat, otherwise vapour / supercritical) */
export function statePT(p, T) {
  let lo = S_LO, hi = S_HI;
  if (p < PC) { const q = sat(p); if (T < q.T) hi = q.sf; else lo = q.sg; }
  return statePS(p, bisect((ss) => Tps(p, ss), T, lo, hi));
}
/** lowest steam temperature that is still dry steam (or dense supercritical fluid) at pressure p */
export const minSteamT = (p) => (p < PC ? Tsat(p) + 12 : 400);

/** a polyline of an isobar between two entropies (kinks at the dome edges are inserted exactly) */
export function isobar(p, s0, s1, n = 60) {
  const ss = [];
  for (let i = 0; i <= n; i++) ss.push(s0 + (s1 - s0) * i / n);
  if (p < PC) { const q = sat(p); for (const e of [q.sf, q.sg]) if (e > Math.min(s0, s1) && e < Math.max(s0, s1)) ss.push(e); }
  ss.sort((a, b) => a - b);
  if (s1 < s0) ss.reverse();
  return { s: ss, T: ss.map((s) => Tps(p, s)) };
}

/* --- Rankine cycle ---------------------------------------------------------
   No reheat:  1 turbine inlet → 2 turbine exit → 3 condenser exit (sat. liquid) → 4 pump exit
   Reheat:     1 HP inlet → 2 HP exit → 3 LP inlet (reheated to T1) → 4 LP exit → 5 condenser exit → 6 pump exit    */
export function rankine({ pb, T1, pc, etaT = 0.85, etaP = 0.85, reheat = false, prhFrac = 0.2 }) {
  const st = [], mk = (n, s, note) => { s.n = n; s.note = note; st.push(s); return s; };
  const s1 = mk(1, statePT(pb, T1), 'boiler');
  let prh = null, exits = [], wT = 0, qIn = 0, last = s1, paths = [];
  const expand = (a, p2) => {
    const h2s = hps(p2, a.s), b = statePH(p2, a.h - etaT * (a.h - h2s));
    b.h2s = h2s; b.xs = statePS(p2, a.s).x;
    wT += a.h - b.h; return b;
  };
  if (reheat) {
    prh = clamp(pb * prhFrac, pc * 1.5, pb * 0.9);
    const s2 = mk(2, expand(s1, prh), 'HP turbine'); paths.push([s1, s2]);
    const s3 = mk(3, statePT(prh, T1), 'reheater'); qIn += s3.h - s2.h;
    const s4 = mk(4, expand(s3, pc), 'LP turbine'); paths.push([s3, s4]); exits = [s2, s4]; last = s4;
  } else {
    const s2 = mk(2, expand(s1, pc), 'turbine'); paths.push([s1, s2]); exits = [s2]; last = s2;
  }
  const q = sat(pc), nf = st.length + 1;
  const sf = mk(nf, { p: pc, T: q.T, h: q.hf, s: q.sf, x: 0 }, 'condenser');
  const wP = q.vf * (pb - pc) * 1000 / etaP;
  const sp = mk(nf + 1, statePH(pb, q.hf + wP), 'pump');
  qIn += s1.h - sp.h;
  const qOut = last.h - sf.h, wNet = wT - wP;
  const xs = exits.map((e) => e.x), Tc = q.T;
  return {
    states: st, prh, paths, wT, wP, wNet, qIn, qOut, eta: wNet / qIn, bwr: wP / wT,
    xExit: last.x, xMin: Math.min(...xs), xIdeal: last.xs, Tc, carnot: 1 - (Tc + 273.15) / (T1 + 273.15),
  };
}

/** combined cycle: gas turbine + heat-recovery steam generator + steam turbine */
export const combinedCycle = (etaGT, eps, etaST) => etaGT + (1 - etaGT) * eps * etaST;
