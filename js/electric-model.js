/* electric-model.js - actuator-disk fans, gridded ion thrusters and corona ("ion wind") thrusters (no DOM). SI units. */
export const Q_E = 1.602176634e-19, AMU = 1.66053907e-27, EPS0 = 8.8541878128e-12, G0 = 9.80665, RHO0 = 1.225;

/* ---------------- ducted fan ("electric jet engine") ---------------- */
/** Jet speed and thrust of a ducted fan: flow power P_flow [W] through exit area Ae [m^2] at flight speed V0 [m/s].  P = 1/2 m (Ve^2 - V0^2),  m = rho Ae Ve. */
export function fanThrust(Pflow, Ae, V0 = 0, rho = RHO0) {
  const f = Ve => 0.5 * rho * Ae * Ve * (Ve * Ve - V0 * V0) - Pflow;
  let lo = V0, hi = V0 + 2000; for (let i = 0; i < 70; i++) { const mid = 0.5 * (lo + hi); if (f(mid) > 0) hi = mid; else lo = mid; }
  const Ve = 0.5 * (lo + hi), mdot = rho * Ae * Ve;
  return { Ve, mdot, F: mdot * (Ve - V0), Pprop: mdot * (Ve - V0) * V0 };
}
/** flow power needed for a static thrust F:  F = (4 rho Ae)^(1/3) P^(2/3) */
export const fanPowerFor = (F, Ae, rho = RHO0) => Math.pow(F, 1.5) / Math.sqrt(4 * rho * Ae);

/* ---------------- gridded ion thruster ---------------- */
export const IONS = {
  xenon:   { n: 'xenon',   M: 131.29, note: 'heavy and easy to ionise: the standard' },
  krypton: { n: 'krypton', M: 83.80,  note: 'cheaper, lighter: more Isp, less thrust' },
  argon:   { n: 'argon',   M: 39.95,  note: 'very cheap, light: needs more voltage and power per newton' },
  iodine:  { n: 'iodine',  M: 126.90, note: 'solid at room temperature: stored without a high-pressure tank' },
};
/**
 * Ion thruster: ions of mass M [u] (single charge) fall through the grid voltage Vb [V].
 *   v = sqrt(2 q V / m),  F = gamma * mdot_beam * v,  Child-Langmuir limit J = (4 eps0 / 9) sqrt(2q/m) V^1.5 / d^2
 */
export function ionThruster({ Vb, d, D, loading, M, etaM = 0.9, gamma = 0.97, etaP = 0.8, Pavail = Infinity, transparency = 0.6 }) {
  const m = M * AMU, v = Math.sqrt(2 * Q_E * Vb / m), Jcl = 4 * EPS0 / 9 * Math.sqrt(2 * Q_E / m) * Math.pow(Vb, 1.5) / (d * d);
  const area = Math.PI / 4 * D * D;
  let I = Jcl * loading * area * transparency;                         // beam current [A]
  let P = I * Vb / etaP; let throttled = false;
  if (P > Pavail) { I *= Pavail / P; P = Pavail; throttled = true; }
  const mdotBeam = I * m / Q_E, mdot = mdotBeam / etaM, F = gamma * mdotBeam * v;
  return { v, Jcl, I, P, F, mdot, Isp: F / (mdot * G0), FperP: P > 0 ? F / P : 0, throttled, area, Vb };
}

/* ---------------- corona ("ion wind") thruster ---------------- */
export const MOBILITY = 2.0e-4;                                        // m^2/(V s), positive ions in air
export const EHD_EFF = 0.35;                                           // share of the ideal I d / mu that real electrodes deliver
/** Thrust of a corona thruster: F = eta I d / mu.  Current follows I = K V (V - Von) (Mott-Gurney-like), onset and spark-over per gap. */
export function ionWind({ V, d, L = 1.0, Kref = 3.0e-12 }) {
  const Von = 0.5e3 * d * 1000;                                         // corona onset: ~0.5 kV per mm of gap for a thin wire
  const Vspark = 1.4e3 * d * 1000;                                      // spark-over, thin wire to foil: ~1.4 kV per mm
  const K = Kref * L * Math.pow(0.03 / d, 3);
  const I = V > Von ? K * V * (V - Von) : 0, F = EHD_EFF * I * d / MOBILITY, P = I * V;
  return { I, F, P, Von, Vspark, spark: V >= Vspark, corona: V > Von, FperP: P > 0 ? F / P : 0 };
}
