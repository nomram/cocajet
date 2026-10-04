/* engine-scale.js - turn a choice of parts into a parameter set for engine-model.js (no DOM).
   Every engine in the workbench is the CJ-1 scaled by s = D2 / 56 mm at the same tip speed (so the same Mach numbers),
   with the proportions and efficiencies of the chosen compressor, turbine and bearings. */
import { CJ1 } from './engine-model.js';
import { COMPRESSORS, TURBINES, BEARINGS, FUELSYS } from './catalog.js';

export const S_GRID = [0.55, 0.75, 1.0, 1.35, 1.8, 2.4];
export const X_GRID = [0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.05, 1.15];           // spool speed as a fraction of the CJ-1's tip-speed-equivalent design speed
export const N_REF = 115000;                                                       // rpm of the CJ-1 at x = 1

export function buildParams({ comp, turb, bear, fuel, s }) {
  const C = COMPRESSORS[comp], T = TURBINES[turb], B = BEARINGS[bear], F = FUELSYS[fuel];
  const D2 = CJ1.D2 * s;
  return {
    ...CJ1, fuel: F.fuel,
    D2, b2: C.b2 * D2, D1t: C.d1t * D2, D1h: C.d1h * D2, beta2: C.beta2, Zfull: C.Z[0], Zsplit: C.Z[1], clearance: 0.0004 * C.clr * Math.sqrt(s), etaDiff: C.etaDiff,
    etaB: CJ1.etaB * F.etaBfactor, At: CJ1.At * s * s, Dturb: CJ1.Dturb * s, A5: CJ1.A5 * s * s, etaTpk: T.etaTpk,
    etaM: B.etaM, mechScale: B.mechScale * s * s, I: CJ1.I * Math.pow(s, 5), vol: s * s * s, flowScale: s * s,
    Nmax: 125000 / s, Ndesign: N_REF / s,
  };
}
