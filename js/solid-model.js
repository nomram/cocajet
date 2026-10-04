/* ==========================================================================
   solid-model.js - interior ballistics of a solid-propellant motor (no DOM).

   Textbook "quasi-steady plus chamber filling" model (Sutton, Rocket Propulsion Elements, ch. 12):

       burning rate         r      = a * (Pc / 1 MPa)^n                (St. Robert / Vieille law, a in mm/s at 1 MPa)
       gas made             m_gen  = rho * Ab * r
       gas leaving          m_out  = Pc * At / c*                       (choked throat)
       chamber pressure     dPc/dt = (R Tc / Vc) (m_gen - m_out) - (Pc / Vc) dVc/dt

   Equilibrium (m_gen = m_out):  Pc = ( rho c* a Kn / 1e9 )^(1/(1-n))  [MPa],   Kn = Ab / At

   Nothing here describes what a propellant is made of: the propellant is the four numbers
   (a, n, rho, c*) that a motor designer measures.  Presets are generic textbook orders of magnitude.
   ========================================================================== */
import { nozzle, cstar, motorClass, G0, RU } from './rocket-model.js';

const A_ = Math.PI / 4;

/** The grain shapes shown in the chapter.  All lengths in metres. */
export const GRAINS = {
  end:   { name: 'End burner (burns like a cigarette)',          kind: 'neutral',     note: 'constant burning area: constant thrust, but a long thin motor, and the whole case is hot for the whole burn' },
  bore:  { name: 'Bore (core) burner, ends inhibited',           kind: 'progressive', note: 'the hole grows, so the area grows and the thrust rises as it burns' },
  bates: { name: 'BATES segments (bore + both ends burn)',       kind: 'neutral',     note: 'the hole grows while the ends shrink: nearly constant thrust; the hobby favourite' },
  tube:  { name: 'Tube burning inside and out',                  kind: 'neutral',     note: 'inner surface grows, outer surface shrinks: perfectly constant area' },
  rod:   { name: 'Rod burning on the outside',                   kind: 'regressive',  note: 'the surface shrinks, so the thrust falls as it burns' },
};

/** geometry of one grain: web, burning area Ab(x) and remaining propellant volume Vg(x) for a burnt web thickness x */
export function grain(type, { D, d0, L, N = 1 }) {
  const seg = L / N;
  switch (type) {
    case 'end':   return { web: L, Ab: () => A_ * D * D, Vg: x => A_ * D * D * (L - x), port: () => 1e9, Rin: () => 0, Rout: () => D / 2 };
    case 'bore':  return { web: (D - d0) / 2, Ab: x => Math.PI * (d0 + 2 * x) * L, Vg: x => A_ * (D * D - (d0 + 2 * x) ** 2) * L, port: x => A_ * (d0 + 2 * x) ** 2, Rin: x => d0 / 2 + x, Rout: () => D / 2 };
    case 'bates': { const web = Math.min((D - d0) / 2, seg / 2);
      return { web, seg, N, Ab: x => N * (Math.PI * (d0 + 2 * x) * (seg - 2 * x) + 2 * A_ * (D * D - (d0 + 2 * x) ** 2)), Vg: x => N * A_ * (D * D - (d0 + 2 * x) ** 2) * (seg - 2 * x), port: x => A_ * (d0 + 2 * x) ** 2, Rin: x => d0 / 2 + x, Rout: () => D / 2 }; }
    case 'tube':  return { web: (D - d0) / 4, Ab: () => Math.PI * L * (D + d0), Vg: x => A_ * ((D - 2 * x) ** 2 - (d0 + 2 * x) ** 2) * L, port: x => A_ * ((d0 + 2 * x) ** 2 + 0.2 * D * D), Rin: x => d0 / 2 + x, Rout: x => D / 2 - x };
    case 'rod':   return { web: D / 2, Ab: x => Math.PI * (D - 2 * x) * L, Vg: x => A_ * (D - 2 * x) ** 2 * L, port: x => A_ * (D * D * 1.1 - (D - 2 * x) ** 2), Rin: () => 0, Rout: x => D / 2 - x };
  }
  throw new Error('grain ' + type);
}

/** generic textbook propellant "families": burn-rate coefficient, exponent, density, effective thermochemistry */
export const FAMILIES = {
  slow:   { n: 'slow-burning (low-rate composite)',  a: 2.5,  nexp: 0.30, rho: 1780, Tc: 3000, Mw: 29, g: 1.20 },
  medium: { n: 'medium composite',                   a: 4.0,  nexp: 0.35, rho: 1750, Tc: 3100, Mw: 30, g: 1.19 },
  fast:   { n: 'fast-burning composite',             a: 7.5,  nexp: 0.42, rho: 1720, Tc: 3150, Mw: 30, g: 1.19 },
  dbase:  { n: 'double-base type (smoky, no metal)', a: 5.5,  nexp: 0.60, rho: 1600, Tc: 2500, Mw: 24, g: 1.22 },
  bp:     { n: 'black-powder type (pressed, weak)',  a: 8.0,  nexp: 0.50, rho: 1700, Tc: 2000, Mw: 40, g: 1.25 },
};

/** throat area [m^2] that gives a chosen Kn = Ab/At at the start of the burn */
export function throatForKn(type, geo, Kn) { return grain(type, geo).Ab(0) / Kn; }
/** throat area [m^2] that keeps the largest Kn of the whole burn at the chosen value (so the peak pressure is what you designed for) */
export function throatForPeakKn(type, geo, Kn) { const g = grain(type, geo); let m = 0; for (let i = 0; i <= 200; i++) m = Math.max(m, g.Ab(g.web * i / 200)); return m / Kn; }

/** equilibrium chamber pressure [Pa] for burning-area ratio Kn (n < 1); NaN when no equilibrium exists */
export function pcEq({ a, n, rho, cs, Kn }) {
  const base = rho * cs * a * Kn / 1e9;
  if (Math.abs(1 - n) < 1e-3) return NaN;
  return 1e6 * Math.pow(base, 1 / (1 - n));
}

/**
 * Fire a motor.  Returns time histories and the headline numbers.
 * p: { type, D, d0, L, N, At, eps, a, n, rho, Tc, Mw, g, Pburst, crack, erosive }  (SI, a in mm/s at 1 MPa)
 */
export function fireMotor(p) {
  const { type, D, d0, L, N = 1, At, eps, a, n, rho, Tc, Mw, g, Pburst = 1e9, crack = 0, Pa = 101325, erosive = true } = p;
  const Pdef = 0.7e6;                                         // lowest pressure at which the burn sustains itself (deflagration limit)
  const gr = grain(type, { D, d0, L, N }), cs = cstar(Tc, Mw, g), Rg = RU / Mw;
  const ref = nozzle({ Pc: 3e6, Tc, Mw, g, eps, Pa: 0 }), CFv = ref.CFvac, pePc = ref.Pe / 3e6;
  const CF = P => Math.max(0, CFv - Pa * eps / P);
  const tIns = 0.002, hv = 0.012, av = 0.012;
  const Vch = A_ * (D + 2 * tIns) ** 2 * (L + hv + av), Vg0 = gr.Vg(0), mProp = rho * Vg0;
  const Ab0 = gr.Ab(0), Abc = crack * Ab0, mIgn = 1.0e6 * At / cs;       // the igniter alone would hold ~1 MPa for a moment
  const out = { t: [], P: [], F: [], Kn: [], x: [] };
  let t = 0, x = 0, P = Pa, Fmax = 0, I = 0, Pmax = 0, fail = null, lit = false, tOut = 0;
  const TMAX = 90;
  let lastRec = -1, burned = false;
  while (t < TMAX) {
    const Vc = Math.max(1e-6, Vch - gr.Vg(x)), burning = x < gr.web;
    const Ab = burning ? gr.Ab(x) + Abc : 0;
    let fe = 1; if (erosive && burning) { const J = At / Math.max(gr.port(x), 1e-9); fe = 1 + 0.8 * Math.max(0, J - 0.5); }
    const r = burning && P > Pdef ? a / 1000 * Math.pow(P / 1e6, n) * fe : 0;
    if (r > 0) lit = true;
    const mgen = rho * Ab * r + (t < 0.08 ? mIgn : 0);
    const mout = P > Pa ? At * P / cs * Math.min(1, (P - Pa) / (0.9 * Pa)) : 0;
    const dVc = Ab * r;
    const tau = Vc * cs / (Rg * Tc * At);
    const dt = Math.min(2e-3, Math.max(1e-5, tau / 6));
    P += dt * ((Rg * Tc / Vc) * (mgen - mout) - P / Vc * dVc);
    P = Math.max(Pa, P); x += r * dt; t += dt;
    const F = P > Pa ? CF(P) * P * At : 0;
    Fmax = Math.max(Fmax, F); Pmax = Math.max(Pmax, P); I += F * dt;
    if (t - lastRec >= Math.max(dt, 0.0015)) { out.t.push(t); out.P.push(P); out.F.push(F); out.Kn.push(Ab / At); out.x.push(x); lastRec = t; }
    if (P > Pburst) { fail = { t, P }; break; }
    if (!burning && !burned) { burned = true; tOut = t; }
    if (burned && (F < 0.01 * Math.max(Fmax, 1) || t - tOut > 8)) break;
    if (!lit && t > 0.6) break;                              // never lit: stop looking
    if (lit && burning && r === 0 && t > 0.1 && P < 1.05 * Pa) { out.extinguished = true; break; }   // the fire went out part-way
  }
  // standard hobby convention: burn time between the 5 % points of the thrust curve
  let i0 = out.F.findIndex(f => f > 0.05 * Fmax), i1 = out.F.length - 1; while (i1 > 0 && out.F[i1] < 0.05 * Fmax) i1--;
  const tb = fail ? fail.t : (Fmax > 0 && i0 >= 0 ? Math.max(out.t[i1] - out.t[i0], 1e-3) : 0);
  const burnt = rho * (Vg0 - gr.Vg(Math.min(x, gr.web))), cstarRate = mProp > 0 ? I / (mProp * G0) : 0;
  return { ...out, gr, Fmax, Pmax, I, tb, Favg: tb ? I / tb : 0, mProp, burnt, sliver: Math.max(0, 1 - burnt / Math.max(mProp, 1e-12)), Isp: cstarRate, cs, CFv, pePc, lit, fail,
    cls: motorClass(I), Kn0: Ab0 / At, Peq0: (n < 1) ? pcEq({ a, n, rho, cs, Kn: (Ab0 + Abc) / At }) : NaN, hv, av, Vch, tIns, Vc0: Vch - Vg0,
    portRatio0: gr.port(0) / At };
}
