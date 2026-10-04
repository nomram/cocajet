/* ==========================================================================
   thermo.js - real-gas properties for the engine model (no DOM, no dependencies).

   The gas is an ideal gas whose specific heat grows with temperature because
   molecular vibrations "wake up" as it gets hotter.  Each species is a rigid
   rotor plus a set of harmonic oscillators:

        cp/R = c0 + sum_i  x_i^2 e^{x_i} / (e^{x_i} - 1)^2 ,        x_i = theta_i / T

   with c0 = 5/2 (atom), 7/2 (linear molecule) or 4 (bent molecule) and the
   vibration temperatures theta_i of the molecule.  Enthalpy and entropy follow by
   integrating cp and cp/T analytically.  This reproduces the textbook tables
   (JANAF / NIST) for N2, O2, CO2 and H2O to better than ~1.5 % between 250 K
   and 2200 K, which is far better than the rest of a mean-line model.

   Everything is evaluated through pre-computed 1 K tables, so a property look-up
   costs a few multiplications.
   ========================================================================== */

export const RU = 8314.462;          // J / (kmol K)
export const T0 = 298.15;            // enthalpy reference (sensible enthalpy is zero here)
export const P0 = 101325;            // entropy reference pressure

/* c0: translation + rotation, th: vibration temperatures [K] (degenerate modes repeated) */
export const SPECIES = {
  N2:  { M: 28.0134, c0: 3.5, th: [3374] },
  O2:  { M: 31.998,  c0: 3.5, th: [2256] },
  Ar:  { M: 39.948,  c0: 2.5, th: [] },
  CO2: { M: 44.0095, c0: 3.5, th: [3380, 1930, 960, 960] },
  H2O: { M: 18.0153, c0: 4.0, th: [5360, 5400, 2290] },
};
const NAMES = ['N2', 'O2', 'Ar', 'CO2', 'H2O'];

const TMIN = 100, TMAX = 3000, NT = TMAX - TMIN + 1;

function cpOverR(sp, T) {
  let s = sp.c0;
  for (const th of sp.th) { const x = th / T, e = Math.exp(x); s += x * x * e / ((e - 1) * (e - 1)); }
  return s;
}
function hOverR(sp, T) {                       // K, sensible enthalpy relative to T0
  let s = sp.c0 * (T - T0);
  for (const th of sp.th) s += th * (1 / (Math.exp(th / T) - 1) - 1 / (Math.exp(th / T0) - 1));
  return s;
}
function sOverR(sp, T) {                       // entropy at P0, relative to T0
  let s = sp.c0 * Math.log(T / T0);
  for (const th of sp.th) {
    const f = (t) => { const x = th / t, e = Math.exp(x); return x / (e - 1) - Math.log(1 - 1 / e); };
    s += f(T) - f(T0);
  }
  return s;
}

/* per-species tables in J/kg, J/(kg K) */
const TAB = {};
for (const n of NAMES) {
  const sp = SPECIES[n], R = RU / sp.M;
  const cp = new Float64Array(NT), h = new Float64Array(NT), s = new Float64Array(NT);
  for (let i = 0; i < NT; i++) { const T = TMIN + i; cp[i] = cpOverR(sp, T) * R; h[i] = hOverR(sp, T) * R; s[i] = sOverR(sp, T) * R; }
  TAB[n] = { R, cp, h, s };
}
const look = (arr, T) => {
  if (T <= TMIN) return arr[0] + (T - TMIN) * (arr[1] - arr[0]);
  if (T >= TMAX) return arr[NT - 1] + (T - TMAX) * (arr[NT - 1] - arr[NT - 2]);
  const x = T - TMIN, i = x | 0, f = x - i;
  return arr[i] + f * (arr[i + 1] - arr[i]);
};

/* --- fuels (complete combustion to CO2 + H2O) ------------------------------ */
export const FUEL_DEF = {
  propane:  { nC: 3,  nH: 8,  M: 44.097 },
  kerosene: { nC: 12, nH: 23, M: 167.31 },
  methane:  { nC: 1,  nH: 4,  M: 16.043 },
};

/* dry air by mass (from 78.08 % N2, 20.95 % O2, 0.93 % Ar by volume) */
const AIR_W = { N2: 0.7556, O2: 0.2316, Ar: 0.01283, CO2: 0, H2O: 0 };

/**
 * Mass fractions of the gas made by burning f kg of fuel in 1 kg of air (complete combustion,
 * lean).  `humidity` is the water-vapour mass fraction of the incoming air (kg/kg of moist air).
 */
export function composition(f = 0, fuel = 'propane', humidity = 0) {
  const w = {}, a = 1 - humidity;
  for (const n of NAMES) w[n] = (AIR_W[n] || 0) * a;
  w.H2O += humidity;
  if (f > 0) {
    const fd = FUEL_DEF[fuel] || FUEL_DEF.propane, kmol = f / fd.M;          // kmol of fuel per kg of air
    const o2 = Math.min(w.O2 / SPECIES.O2.M, kmol * (fd.nC + fd.nH / 4));   // never burn more O2 than there is
    const burn = o2 / (fd.nC + fd.nH / 4);
    w.O2 -= o2 * SPECIES.O2.M; w.CO2 += burn * fd.nC * SPECIES.CO2.M; w.H2O += burn * fd.nH / 2 * SPECIES.H2O.M;
  }
  let tot = 0; for (const n of NAMES) tot += w[n];
  for (const n of NAMES) w[n] /= tot;
  return w;
}

/** A gas mixture with temperature-dependent properties (all per kg of mixture). */
export class Gas {
  constructor(w) {
    this.w = NAMES.map(n => w[n] || 0);
    this.R = 0; NAMES.forEach((n, i) => { this.R += this.w[i] * TAB[n].R; });
    this.M = RU / this.R;
  }
  cp(T) { let s = 0; for (let i = 0; i < 5; i++) if (this.w[i]) s += this.w[i] * look(TAB[NAMES[i]].cp, T); return s; }
  h(T)  { let s = 0; for (let i = 0; i < 5; i++) if (this.w[i]) s += this.w[i] * look(TAB[NAMES[i]].h, T); return s; }
  s(T)  { let s = 0; for (let i = 0; i < 5; i++) if (this.w[i]) s += this.w[i] * look(TAB[NAMES[i]].s, T); return s; }
  gamma(T) { const c = this.cp(T); return c / (c - this.R); }
  a(T) { return Math.sqrt(this.gamma(T) * this.R * T); }
  /** temperature at which the sensible enthalpy equals h (Newton on a smooth function, clamped to the table) */
  Th(h, guess = 600) {
    let T = Math.min(2950, Math.max(120, guess));
    for (let i = 0; i < 10; i++) {
      let d = (this.h(T) - h) / this.cp(T);
      d = Math.max(-500, Math.min(500, d));
      T = Math.min(2950, Math.max(120, T - d));
      if (Math.abs(d) < 1e-4) break;
    }
    return T;
  }
  /** temperature at entropy s (at P0) */
  Ts(s, guess = 600) {
    let T = Math.min(2950, Math.max(120, guess));
    for (let i = 0; i < 10; i++) {
      let d = (this.s(T) - s) * T / this.cp(T);
      d = Math.max(-500, Math.min(500, d));
      T = Math.min(2950, Math.max(120, T - d));
      if (Math.abs(d) < 1e-4) break;
    }
    return T;
  }
  /** end state of an isentropic change T1 -> pressure ratio PR (PR>1 compression) */
  isentropicT(T1, PR) { return this.Ts(this.s(T1) + this.R * Math.log(PR), T1 * Math.pow(PR, 0.27)); }
  /** pressure ratio that corresponds to the isentropic temperature change T1 -> T2s */
  pressureRatio(T1, T2s) { return Math.exp((this.s(T2s) - this.s(T1)) / this.R); }
  /** effective gamma over a temperature interval (for flow functions) */
  gammaMean(Ta, Tb) { return this.gamma(0.5 * (Ta + Tb)); }
}

const cache = new Map();
const FUEL_IDX = { propane: 1, kerosene: 2, methane: 3 };
/** Cached gas for a fuel/air ratio (quantised to 1/4000 so the cache stays small and look-ups are cheap). */
export function gasFor(f = 0, fuel = 'propane', humidity = 0) {
  const fq = Math.round(f * 4000), hq = Math.round(humidity * 2000);
  const key = ((FUEL_IDX[fuel] || 1) * 64 + hq) * 100000 + fq;
  let g = cache.get(key);
  if (!g) { g = new Gas(composition(fq / 4000, fuel, humidity)); if (cache.size > 600) cache.clear(); cache.set(key, g); }
  return g;
}
export const AIR = new Gas(AIR_W);

/** Humidity: water-vapour mass fraction of moist air at relative humidity rh (0..1), T [K], P [Pa] */
export function humidityRatio(rh, T, P) {
  const Tc = T - 273.15;
  const psat = 610.94 * Math.exp(17.625 * Tc / (Tc + 243.04));     // Magnus formula, Pa
  const pv = Math.min(rh * psat, 0.95 * P);
  const W = 0.622 * pv / (P - pv);                                   // kg vapour / kg dry air
  return W / (1 + W);
}

/** Propane vapour pressure [Pa] (Clausius-Clapeyron fit to 231-323 K: 1.01 bar at -42 C, 8.4 bar at 20 C) */
export function propanePsat(T) { return 1e5 * Math.exp(9.990 - 2305.8 / T); }
/** Latent heat of vaporisation of propane [J/kg] (Watson scaling from 426 kJ/kg at 231 K, Tc = 369.8 K) */
export function propaneHfg(T) { return 426e3 * Math.pow(Math.max(0.05, (369.8 - T) / (369.8 - 231.1)), 0.38); }
