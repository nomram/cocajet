/* rocket-model.js - ideal-gas nozzle and rocket-performance relations (no DOM).  All SI, gamma constant. */
export const G0 = 9.80665, RU = 8314.462;

/** area ratio A/A* for Mach number M */
export function areaMach(M, g) {
  return (1 / M) * Math.pow((2 / (g + 1)) * (1 + (g - 1) / 2 * M * M), (g + 1) / (2 * (g - 1)));
}
/** Mach number for a given area ratio (sup = true: supersonic branch) */
export function machFromArea(ar, g, sup = true) {
  if (ar <= 1) return 1;
  let lo = sup ? 1 : 1e-4, hi = sup ? 30 : 1;
  for (let i = 0; i < 80; i++) { const mid = 0.5 * (lo + hi), a = areaMach(mid, g); if (sup ? a < ar : a > ar) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}
export const pRatio = (M, g) => Math.pow(1 + (g - 1) / 2 * M * M, -g / (g - 1));        // p/p0
export const tRatio = (M, g) => 1 / (1 + (g - 1) / 2 * M * M);                           // T/T0
/** normal shock: downstream Mach and total-pressure ratio for upstream Mach M1 */
export function normalShock(M1, g) {
  const M2 = Math.sqrt((1 + (g - 1) / 2 * M1 * M1) / (g * M1 * M1 - (g - 1) / 2));
  const p02p01 = Math.pow((g + 1) * M1 * M1 / ((g - 1) * M1 * M1 + 2), g / (g - 1)) * Math.pow((g + 1) / (2 * g * M1 * M1 - (g - 1)), 1 / (g - 1));
  return { M2, p02p01, p2p1: 1 + 2 * g / (g + 1) * (M1 * M1 - 1) };
}
/** characteristic velocity c* [m/s] */
export function cstar(Tc, Mw, g) { const R = RU / Mw; return Math.sqrt(R * Tc) / (Math.sqrt(g) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1)))); }

/**
 * Rocket nozzle performance.
 * @param Pc chamber pressure [Pa]   Tc [K]   Mw [kg/kmol]   g gamma   eps exit/throat area ratio   Pa ambient [Pa]
 */
export function nozzle({ Pc, Tc, Mw, g, eps, Pa = 0 }) {
  const R = RU / Mw, Me = machFromArea(eps, g, true), Pe = Pc * pRatio(Me, g), Te = Tc * tRatio(Me, g);
  const Ve = Me * Math.sqrt(g * R * Te), cs = cstar(Tc, Mw, g);
  const CFv = Math.sqrt(2 * g * g / (g - 1) * Math.pow(2 / (g + 1), (g + 1) / (g - 1)) * (1 - Math.pow(Pe / Pc, (g - 1) / g)));
  const CF = CFv + (Pe - Pa) / Pc * eps;
  return { R, Me, Pe, Te, Ve, cstar: cs, CF, CFvac: CFv + Pe / Pc * eps, Isp: CF * cs / G0, IspVac: (CFv + Pe / Pc * eps) * cs / G0, separated: Pa > 0 && Pe / Pa < 0.38 };
}
/** expansion ratio whose exit pressure equals the given ambient pressure (optimum expansion) */
export function epsForPe(Pc, Pe, g) {
  const M = Math.sqrt(2 / (g - 1) * (Math.pow(Pc / Pe, (g - 1) / g) - 1));
  return areaMach(M, g);
}
/** Tsiolkovsky: delta-v for a mass ratio and Isp */
export const deltaV = (isp, m0, mf) => isp * G0 * Math.log(m0 / mf);
/** US model-rocket motor class letters by total impulse [N s] (each letter doubles) */
export function motorClass(Itot) {
  if (Itot <= 0.3125) return '1/8A'; if (Itot <= 0.625) return '1/4A'; if (Itot <= 1.25) return '1/2A';
  const L = 'ABCDEFGHIJKLMNO'; let hi = 2.5;
  for (let i = 0; i < L.length; i++) { if (Itot <= hi) return L[i]; hi *= 2; }
  return '> O';
}
/** nozzle presets: typical chamber conditions of well-known propellant families */
export const PROPS = {
  hydrolox: { n: 'Liquid hydrogen + oxygen', Tc: 3500, Mw: 12.0, g: 1.25 },
  methalox: { n: 'Methane + oxygen', Tc: 3550, Mw: 20.5, g: 1.23 },
  kerolox:  { n: 'Kerosene (RP-1) + oxygen', Tc: 3600, Mw: 23.3, g: 1.22 },
  solid:    { n: 'Composite solid propellant (effective values)', Tc: 3100, Mw: 30.0, g: 1.19 },
  cold:     { n: 'Cold nitrogen gas', Tc: 293, Mw: 28.0, g: 1.40 },
  steam:    { n: 'Hot steam (heated water)', Tc: 700, Mw: 18.0, g: 1.30 },
};

/**
 * Vertical flight with constant thrust and exponential atmosphere (no wind, no tilt).
 * m0 liftoff mass [kg], mp propellant [kg], F thrust [N] for tb [s], D body diameter [m], Cd drag coefficient on frontal area.
 * Returns time histories (thinned) and the headline numbers.  Stops at apogee.
 */
export function flyVertical({ m0, mp, F, tb, D, Cd = 0.55, rod = 1.2, g = G0 }) {
  const A = Math.PI / 4 * D * D, out = { t: [0], h: [0], v: [0] };
  let t = 0, h = 0, v = 0, vmax = 0, tRod = null, vRod = 0, gravLoss = 0, dragLoss = 0;
  const lift = F > m0 * g;
  if (!lift) return { ...out, apogee: 0, vmax: 0, tApogee: 0, vRod: 0, tRod: null, lift: false, gravLoss: 0, dragLoss: 0, tw: F / (m0 * g) };
  while (t < 2000) {
    const dt = t < tb + 1 ? 0.004 : 0.02, burning = t < tb, m = m0 - mp * Math.min(1, t / tb);
    const rho = 1.225 * Math.exp(-h / 8500), drag = 0.5 * rho * v * Math.abs(v) * Cd * A;
    const a = ((burning ? F : 0) - drag) / m - g;
    gravLoss += burning ? g * dt : 0; dragLoss += Math.abs(drag) / m * dt;
    v += a * dt; h += v * dt; t += dt; vmax = Math.max(vmax, v);
    if (tRod == null && h >= rod) { tRod = t; vRod = v; }
    if ((out.t.length < 2 || t - out.t[out.t.length - 1] >= Math.max(0.05, t / 400))) { out.t.push(t); out.h.push(h); out.v.push(v); }
    if (v <= 0 && t > tb) break;
  }
  return { ...out, apogee: h, vmax, tApogee: t, vRod, tRod, lift: true, gravLoss, dragLoss, tw: F / (m0 * g) };
}
