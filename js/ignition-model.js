/* ignition-model.js - how much spark energy does it take to light a propane-air mixture? (no DOM)
   A teaching model built on the textbook facts: the minimum ignition energy (MIE) of propane in still air at
   room conditions is about 0.25 mJ, at the best mixture (phi ~ 1.1-1.2). It grows steeply toward the lean and rich
   flammability limits (phi 0.5 and 2.5), grows with the speed of the gas sweeping the spark away, falls with
   pressure and with initial temperature, and rises when the electrode gap is smaller than the quenching distance
   (~2 mm), because the cold electrodes then steal the heat of the young flame kernel. */
export const FLAM = { lean: 0.5, rich: 2.5 };

export function mie(phi, { U = 0, P = 1, T = 293, gap = 2 } = {}) {
  if (phi <= FLAM.lean || phi >= FLAM.rich) return Infinity;
  const base = 0.25 * Math.exp(Math.pow(Math.log(phi / 1.15), 2) / (2 * 0.3 * 0.3));
  const fU = 1 + Math.pow(Math.max(U, 0) / 10, 1.2);
  const fP = Math.pow(Math.max(P, 0.2), -1.5);
  const fT = Math.exp(-(T - 293) / 160);
  const fG = gap < 2 ? Math.pow(2 / Math.max(gap, 0.2), 1.3) : 1;
  return base * fU * fP * fT * fG;
}
/** probability that one spark of energy E (mJ) lights the mixture */
export function pIgnite(E, mieEff) { return !isFinite(mieEff) || E <= 0 ? 0 : 1 / (1 + Math.pow(mieEff / E, 3)); }

/** Paschen's law for air: breakdown voltage [V] for a gap d [mm] at pressure p [bar] and gas temperature T [K] */
export function paschen(d_mm, p_bar = 1.01325, T = 293) {
  const A = 15, B = 365, gam = 0.01;                                   // per cm per Torr, V per cm per Torr
  const pd = p_bar * 750.06 * (293 / T) * (d_mm / 10);               // Torr * cm at the density of 293 K
  const den = Math.log(A * pd) - Math.log(Math.log(1 + 1 / gam));
  return den > 0.05 ? B * pd / den : Infinity;
}

/** gas state at the plug while the engine is being cranked (swirl and the primary jets make the local speed much higher than the mean) */
export function plugState(m, P02, T02) { return { U: 4 + 250 * m, P: P02 / 1e5, T: T02 }; }
/** chance per spark (or per second for a glow plug) that the igniter lights the mixture.  ig = {type: 'spark'|'glow', E (mJ), gap (mm)} */
export function lightProbability(ig, phi, st) {
  if (ig.type === 'glow') return Math.exp(-Math.pow(Math.log(Math.max(phi, 0.05) / 1.2) / 0.45, 2)) / (1 + Math.pow(st.U / 45, 2));
  return pIgnite(ig.E, mie(phi, { U: st.U, P: st.P, T: st.T, gap: ig.gap }));
}
