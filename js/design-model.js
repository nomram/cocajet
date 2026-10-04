/* ==========================================================================
   design-model.js - evaluate, score and optimise a parts list (no DOM).

   A design is {casing, comp, turb, bear, fuel}.  The casing decides the wheel diameter (a wheel needs about 15 % of
   clearance inside the can); the wheel, turbine, bearings and fuel decide the performance, which is read from a table of
   real engine-model runs (data/design-table.json, built by tools/build-design-table.mjs) and interpolated in size and speed.
   ========================================================================== */
import { CASINGS, COMPRESSORS, TURBINES, BEARINGS, FUELSYS, BASE, AIRFRAME, GOALS } from './catalog.js';
import { X_GRID, S_GRID, N_REF } from './engine-scale.js';

let TABLE = null;
export async function loadTable(url = 'data/design-table.json') {
  if (TABLE) return TABLE;
  const r = await fetch(url); if (!r.ok) throw new Error('could not load ' + url);
  TABLE = await r.json(); return TABLE;
}
export const setTable = t => { TABLE = t; };

const G = 9.80665, FIT = 0.85;
const lerp = (a, b, t) => a + (b - a) * t;
function bracket(arr, v) { if (v <= arr[0]) return [0, 0, 0]; if (v >= arr[arr.length - 1]) return [arr.length - 1, arr.length - 1, 0]; let i = 0; while (arr[i + 1] < v) i++; return [i, i + 1, (v - arr[i]) / (arr[i + 1] - arr[i])]; }
/** bilinear lookup of one set at size scale s and speed fraction x; null when a corner is missing */
function perf(set, s, x) {
  const [i0, i1, ts] = bracket(S_GRID.map(Math.log), Math.log(s)), [j0, j1, tx] = bracket(X_GRID, x);
  const c = [[set[i0][j0], set[i0][j1]], [set[i1][j0], set[i1][j1]]];
  if (c.some(r => r.some(v => !v))) return null;
  const out = []; for (let k = 0; k < 5; k++) out.push(lerp(lerp(c[0][0][k], c[0][1][k], tx), lerp(c[1][0][k], c[1][1][k], tx), ts)); return out;   // F, m, mf (g/s), T03, PR
}

/** standard wheel diameter used by this compressor option in this casing (mm), or null when none fits */
export function wheelFor(casingKey, compKey) {
  const C = CASINGS[casingKey], W = COMPRESSORS[compKey], max = FIT * (C.OD - 2 * C.wall);
  if (!W.sizes) return max >= 30 ? max : null;
  const ok = W.sizes.filter(d => d <= max + 0.01); return ok.length ? ok[ok.length - 1] : null;
}

const polar = (W, V, A) => { const q = 0.5 * 1.225 * V * V, k = 1 / (Math.PI * A.AR * A.e); return q * A.S * A.CD0 + k * W * W / (q * A.S); };

/** full evaluation of one design at a chosen operating turbine-inlet temperature opts.T (kelvin, default the CJ-1 value) */
export function evaluate(sel, opts = {}) {
  const C = CASINGS[sel.casing], W = COMPRESSORS[sel.comp], T = TURBINES[sel.turb], B = BEARINGS[sel.bear], F = FUELSYS[sel.fuel], A = opts.airframe || AIRFRAME;
  const bad = why => ({ sel, valid: false, why });
  const D2 = wheelFor(sel.casing, sel.comp); if (D2 == null) return bad('No ' + W.name.toLowerCase() + ' of a size that fits inside this casing.');
  const s = D2 / 56; if (s < S_GRID[0] || s > S_GRID[S_GRID.length - 1]) return bad('The wheel (' + D2.toFixed(0) + ' mm) is outside the range this workbench has been tabulated for (31–134 mm).');
  const set = TABLE.sets[[sel.comp, sel.turb, sel.bear, sel.fuel].join('|')];
  // limits on speed, then the operating point: the highest speed whose turbine-inlet temperature stays at or below the chosen setting
  const Top = opts.T || 1066;
  const xTip = W.Ulimit / (Math.PI * 0.056 * N_REF / 60), xMax = Math.min(X_GRID[X_GRID.length - 1], B.xmax, xTip);
  let xBranch = X_GRID[0], tmin = Infinity;                                      // the self-sustaining branch starts where T03 is lowest
  for (let xx = X_GRID[0]; xx <= xMax + 1e-9; xx += 0.01) { const q = perf(set, s, xx); if (q && q[3] < tmin) { tmin = q[3]; xBranch = xx; } }
  const Teff = Math.max(Top, tmin + 10), hot = Teff > Top;                         // a poor compressor/turbine pair simply has to run hotter
  let x = null, p = null, limit = null;
  for (let xx = xMax; xx >= xBranch - 1e-9; xx -= 0.005) { const q = perf(set, s, xx); if (q && q[3] <= Teff + 1.5) { x = xx; p = q; break; } }
  if (x == null) return bad('No stable operating point in the tabulated range for this combination.');
  limit = hot ? 'self-sustaining minimum' : Math.abs(x - xMax) < 0.006 ? (xMax === B.xmax ? 'bearing speed' : xMax === xTip ? 'wheel tip speed' : 'tabulated range') : 'turbine-inlet temperature setting';
  const [F0, m0, mf, T03, PR] = p, mfs = mf / 1000;
  // size effects not in the table: a casing longer than the similar-scaled can gives the flame more time
  const Lref = 115 * s, etaMult = Math.min(1.03, Math.max(0.93, Math.pow(C.L / Lref, 0.12))), tsfc = mfs / F0 / etaMult;
  const Dt = 0.911 * D2;
  // geometry, mass, volume
  const ODm = C.OD / 1000, Lm = C.L / 1000, casingMass = Math.PI * ODm * Lm * (C.wall / 1000) * C.rho, mass = 1.1 * s * s * s + casingMass;
  const lenTot = Lm + D2 / 1000, dEnv = ODm + 0.02, vol = Math.PI / 4 * dEnv * dEnv * lenTot * 1000;
  // cost and effort
  const price = C.price + W.price(D2) + T.price(Dt) + B.price + F.price + BASE.price;
  const hours = C.hours + W.hours(D2) + T.hours(Dt) + B.hours + F.hours + BASE.hours;
  const skill = Math.max(C.skill, W.skill, T.skill, B.skill, F.skill, BASE.skill);
  // life of each weak link at the operating point (minutes)
  const lifeLiner = C.life0 * Math.pow(4, (1066 - T03) / 25), lifeTurb = T.life0 * Math.pow(4, (T.Tcont - T03) / 25), lifeBear = B.life0 / Math.pow(x, 3);
  const life = Math.min(lifeLiner, lifeTurb, lifeBear), weak = life === lifeLiner ? 'casing / liner' : life === lifeTurb ? 'turbine wheel' : 'bearings';
  // reference airframe: top speed and range
  const mFuel = A.tankL * 0.9 * F.rhoTank, Wt = (A.mass + mass + mFuel) * G, thr = V => F0 - 0.72 * m0 * V;
  let vmax = 0; for (let V = 10; V <= 220; V += 1) if (thr(V) >= polar(Wt, V, A)) vmax = V;
  let range = 0, vc = 0;
  if (vmax > 20) { vc = 0.7 * vmax; const D = polar(Wt, vc, A), xt = Math.min(1, D / thr(vc)), flow = tsfc * (1 + 0.9 * (1 - xt)) * D; range = vc * (mFuel * 0.9 / flow) / 1000; }
  const lift = F0 / (Wt / G);        // thrust over total weight for the vertical case
  const warn = []; if (hot) warn.push('Needs ' + (Teff - 273.15).toFixed(0) + ' °C turbine-inlet temperature just to sustain itself (you asked for ' + (Top - 273.15).toFixed(0) + ' °C): the compressor and turbine are a poor match at this size.');
  if (life < 2) warn.push('Weak link lasts under 2 minutes at this temperature.'); if (F0 < 8) warn.push('Under 8 newtons: too little thrust to be useful.');
  return {
    sel, valid: true, viable: warn.length === 0, warn, D2, Dt, s, x, N: x * N_REF / s, U2: Math.PI * D2 / 1000 * (x * N_REF / s) / 60, F: F0, m: m0, mf, T03, PR, tsfc: tsfc * 3600, isp: F0 / (mfs * G),
    price, hours, skill, life, weak, mass, vol, density: F0 / vol, perMass: F0 / mass, vmax, vc, range, mFuel, totalMass: Wt / G, lift, limit,
    Top, hot, lifeLiner, lifeTurb, lifeBear, xMax, xTip, casingMass,
  };
}

export function allSelections(locks = {}) {
  const out = [];
  const pick = (cat, key, lock) => lock ? [lock] : Object.keys(cat);
  for (const casing of pick(CASINGS, 'casing', locks.casing)) for (const comp of pick(COMPRESSORS, 'comp', locks.comp)) for (const turb of pick(TURBINES, 'turb', locks.turb))
    for (const bear of pick(BEARINGS, 'bear', locks.bear)) for (const fuel of pick(FUELSYS, 'fuel', locks.fuel)) out.push({ casing, comp, turb, bear, fuel });
  return out;
}

/** evaluate all designs once (cached by operating temperature) */
const cache = new Map();
export function universe(opts = {}) {
  const key = String(opts.T || 1066); if (cache.has(key)) return cache.get(key);
  const list = allSelections().map(sel => evaluate(sel, opts)), valid = list.filter(d => d.valid && d.viable);
  const ranges = {}; for (const g of Object.values(GOALS)) { const vals = valid.map(d => d[g.metric]).filter(v => v > 0); const log = ['price', 'hours', 'life', 'range'].includes(g.metric); ranges[g.metric] = { min: Math.min(...vals), max: Math.max(...vals), log }; }
  const u = { list, valid, ranges, opts }; cache.set(key, u); return u;
}
const norm = (u, g, d) => { const r = u.ranges[g.metric], v = Math.max(d[g.metric], 0); const f = r.log ? (x => Math.log(Math.max(x, 1e-9))) : (x => x); const t = r.max === r.min ? 0.5 : (f(v) - f(r.min)) / (f(r.max) - f(r.min)); return Math.min(1, Math.max(0, g.dir > 0 ? t : 1 - t)); };
/** weighted score 0..100 of a valid design; w = {price, ease, density, speed, range, life} */
export function score(u, d, w) { let a = 0, b = 0; for (const [k, g] of Object.entries(GOALS)) { const wk = w[k] || 0; if (!wk) continue; a += wk * norm(u, g, d); b += wk; } return b ? 100 * a / b : 0; }
export function scored(u, w, locks = {}) { return u.valid.filter(d => Object.entries(locks).every(([k, v]) => !v || d.sel[k] === v)).map(d => ({ d, sc: score(u, d, w) })).sort((a, b) => b.sc - a.sc); }

/** for every slot, the best single replacement of the current design (what a swap gains or loses) */
export function swapSuggestions(u, sel, w) {
  const cur = evaluate(sel, u.opts); const base = cur.valid ? score(u, cur, w) : -1, out = [];
  const slots = { casing: CASINGS, comp: COMPRESSORS, turb: TURBINES, bear: BEARINGS, fuel: FUELSYS };
  for (const [slot, cat] of Object.entries(slots)) for (const key of Object.keys(cat)) {
    if (key === sel[slot]) continue; const d = u.list.find(q => Object.keys(sel).every(k => q.sel[k] === (k === slot ? key : sel[k]))); if (!d || !d.valid) continue;
    out.push({ slot, key, d, gain: score(u, d, w) - base });
  }
  return { cur, base, swaps: out.sort((a, b) => b.gain - a.gain) };
}
export function bestFor(u, goalKey, locks = {}) {
  const w = { [goalKey]: 1 }; return scored(u, w, locks)[0];
}
