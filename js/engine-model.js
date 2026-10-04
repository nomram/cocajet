/* ==========================================================================
   engine-model.js  -  a compact "mean-line" model of a small turbojet.

   Pure JavaScript, no DOM: the same file is used by the browser widgets, the
   3D simulator and the Node calibration script (tools/calibrate.mjs).

   What it models (all SI units unless a name ends in _mm / _rpm / _C):
     * ISA atmosphere + ram effect
     * Centrifugal compressor  (Euler work, Wiesner slip, incidence / friction /
       diffuser / tip-clearance / choke losses)  ->  a real compressor map
     * Combustor  (energy balance, pressure loss, combustion efficiency)
     * Turbine stage + exhaust nozzle as two compressible orifices in series,
       solved so that mass flow matches everywhere
     * Shaft power balance and spool-up dynamics  (I * w * dw/dt = P_turb - P_comp)

   Gas properties are real-gas (cp, gamma, enthalpy and entropy of the actual
   N2/O2/CO2/H2O mixture, see thermo.js) rather than constants.

   It is a *teaching* model: good to a few tens of percent for a real small
   engine, and it reproduces the right trends, which is what the widgets need.
   ========================================================================== */
import { gasFor, humidityRatio } from './thermo.js';

export const R_AIR = 287.05;
export const T_REF = 288.15;

/* --- fuels ---------------------------------------------------------------- */
export const FUELS = {
  propane:  { name: 'Propane (LPG)', LHV: 46.35e6, AFR: 15.6, rho: 493 },
  kerosene: { name: 'Kerosene / Jet-A', LHV: 43.2e6, AFR: 14.7, rho: 800 },
  methane:  { name: 'Natural gas', LHV: 50.0e6, AFR: 17.2, rho: 0.72 },
};

/* --- reference engine ("CJ-1") ----------------------------------------------
   Every length here is also the length used by tools/build-stl.mjs, so the
   guide, the maths and the STL files all describe the same machine.          */
export const CJ1 = {
  // compressor
  D2: 0.056,          // impeller exducer diameter [m]
  b2: 0.0060,         // exducer blade height [m]
  D1t: 0.042,         // inducer tip diameter [m]
  D1h: 0.012,         // inducer hub diameter [m]
  beta2: 30,          // backsweep from radial at exit [deg]
  beta1b: 66,         // blade angle at inducer tip, from axial [deg]
  Zfull: 7,           // full blades
  Zsplit: 7,          // splitter blades
  clearance: 0.0004,  // tip clearance [m]
  // diffuser
  etaDiff: 0.70,      // fraction of exit dynamic head recovered (vaned diffuser + bend)
  // combustor
  dpB: 0.05,          // total-pressure loss  (fraction of P02)
  etaB: 0.91,         // combustion efficiency at the design point (incomplete burn-out + heat lost through the casing)
  // turbine & nozzle
  At: 7.7e-4,         // effective turbine-stage throat area [m^2]   (NGV + rotor)
  Dturb: 0.051,       // mean turbine diameter [m]
  etaTpk: 0.80,       // peak turbine efficiency
  A5: 1.119e-3,       // nozzle exit area [m^2]  (annulus r 20.5 / 8 mm in the STL)
  Cd: 0.96,
  // shaft
  etaM: 0.97,         // mechanical efficiency
  I: 3.4e-5,          // rotor polar inertia [kg m^2]  (54 g impeller + 73 g turbine + 68 g shaft)
  // fuel
  fuel: 'propane',
  // limits
  Nmax: 125000,       // never exceed (rpm)
  Ndesign: 115000,    // full-power speed used in the guide (rpm)
  TITlimit: 1200,     // K, hot-section material limit used for warnings
};

/* --- atmosphere ------------------------------------------------------------ */
export function isa(h = 0, dT = 0, rh = 0) {
  // troposphere + lower stratosphere, good to 20 km;  rh = relative humidity 0..1 (optional)
  let T, P;
  if (h <= 11000) {
    T = 288.15 - 0.0065 * h;
    P = 101325 * Math.pow(T / 288.15, 5.25588);
  } else {
    T = 216.65;
    P = 22632.06 * Math.exp(-9.80665 * (h - 11000) / (R_AIR * 216.65));
  }
  T += dT;
  const hum = rh > 0 ? humidityRatio(rh, T, P) : 0;
  const g = gasFor(0, 'propane', hum);
  const rho = P / (g.R * T);
  return { T, P, rho, a: g.a(T), h, rh, hum };
}

/* --- orifice / nozzle mass flow ---------------------------------------------
   m = Cd A Pup sqrt(2g/((g-1) R T)) sqrt( r^(2/g) - r^((g+1)/g) ),  r = Pdown/Pup   */
export function critRatio(g) { return Math.pow(2 / (g + 1), g / (g - 1)); }
export function flowFn(r, g) {
  // dimensionless: m*sqrt(R*T)/(A*Pup)
  const rc = critRatio(g);
  if (r <= rc) r = rc;
  return Math.sqrt(2 * g / (g - 1) * (Math.pow(r, 2 / g) - Math.pow(r, (g + 1) / g)));
}
export function orificeFlow(A, Cd, Pup, T, Pdown, g = 1.333, R = R_AIR) {
  if (Pdown >= Pup) return 0;
  return Cd * A * Pup / Math.sqrt(R * T) * flowFn(Pdown / Pup, g);
}

/* --- compressor mean-line ---------------------------------------------------- */
export function wiesnerSlip(beta2deg, Z) {
  const b = beta2deg * Math.PI / 180;
  return 1 - Math.sqrt(Math.cos(b)) / Math.pow(Z, 0.7);
}

/**
 * Compressor performance at one speed and mass flow.
 * @param hum  water-vapour mass fraction of the inlet air (optional)
 * @returns {object} PR, eta, T02, P02, work, losses ...
 */
export function compressor(p, N, m, T01, P01, hum = 0) {
  const gas = gasFor(0, p.fuel || 'propane', hum), R = gas.R, cp = gas.cp(T01), g = gas.gamma(T01);
  const U2 = Math.PI * p.D2 * N / 60;
  const U1 = Math.PI * p.D1t * N / 60;
  const Zeff = p.Zfull + 0.7 * p.Zsplit;
  const sigma = wiesnerSlip(p.beta2, Zeff);
  const tanB2 = Math.tan(p.beta2 * Math.PI / 180);

  // inducer: static density from a couple of fixed-point passes
  const A1 = Math.PI / 4 * (p.D1t * p.D1t - p.D1h * p.D1h) * 0.90;
  const rho01 = P01 / (R * T01);
  let Cm1 = m / (rho01 * A1);
  for (let i = 0; i < 4; i++) {
    const T1 = Math.max(150, T01 - Cm1 * Cm1 / (2 * cp));
    const rho1 = rho01 * Math.pow(T1 / T01, 1 / (g - 1));
    Cm1 = m / (rho1 * A1);
  }
  const T1 = Math.max(150, T01 - Cm1 * Cm1 / (2 * cp));
  const W1 = Math.hypot(Cm1, U1);
  const beta1 = Math.atan2(U1, Cm1) * 180 / Math.PI;           // flow angle from axial
  const incidence = beta1 - p.beta1b;                            // + at low flow
  const MW1 = W1 / gas.a(T1);

  // exit blockage grows with the number of blades (0.6 mm thick); 0.92 for the reference 7+7 wheel
  const blk = 0.92 * Math.max(0.5, 1 - (p.Zfull + p.Zsplit) * 0.6e-3 / (Math.PI * p.D2 * Math.cos(p.beta2 * Math.PI / 180))) / 0.945;
  // exit: iterate density / flow coefficient / outlet pressure
  const h01 = gas.h(T01);
  const outlet = (dHin, dHs) => {
    const T02 = gas.Th(h01 + dHin, T01 + dHin / cp);
    const T2s = gas.Th(h01 + dHs, T01 + dHs / cp);
    return { T02, PR: gas.pressureRatio(T01, T2s) };
  };
  let PR = 1.5, Cm2 = 0, Ctheta2 = 0, dHE = 0, T02 = T01, rho2 = rho01;
  for (let it = 0; it < 6; it++) {
    rho2 = 0.88 * (P01 * PR) / (R * T02);
    Cm2 = m / (rho2 * Math.PI * p.D2 * p.b2 * blk);
    Ctheta2 = sigma * U2 - Cm2 * tanB2;
    dHE = U2 * Ctheta2;                                          // Euler work
    const losses = lossBreakdown(p, { U2, W1, Cm2, Ctheta2, incidence, MW1, dHE, Zeff });
    const dHin = Math.max(1, dHE + losses.disk);
    const dHs = Math.max(0, dHE - losses.sum);
    ({ T02, PR } = outlet(dHin, dHs));
  }
  const losses = lossBreakdown(p, { U2, W1, Cm2, Ctheta2, incidence, MW1, dHE, Zeff });
  const dHin = Math.max(1, dHE + losses.disk);
  const dHs = Math.max(0, dHE - losses.sum);
  ({ T02, PR } = outlet(dHin, dHs));
  const eta = Math.min(0.95, dHs / dHin);
  return {
    N, m, U2, U1, sigma, PR, eta, T02, P02: P01 * PR, dH: dHin, dHs, dHE,
    Cm1, Cm2, Ctheta2, W1, beta1, incidence, MW1, phi2: Cm2 / U2,
    losses, power: m * dHin,
    Phi: m / (rho01 * U2 * p.D2 * p.D2),
  };
}

function lossBreakdown(p, s) {
  const inc = s.incidence;
  const incRad = inc * Math.PI / 180;
  // incidence: tangential component of relative velocity is lost.  More severe on the stall side.
  const kI = inc > 0 ? 0.9 : 0.35;
  const dInc = kI * 0.5 * Math.pow(s.W1 * Math.sin(incRad - (-3 * Math.PI / 180)), 2);
  const W2 = Math.hypot(s.Cm2, s.U2 - s.Ctheta2);
  const zr = (s.Zeff || 11.9) / 11.9;                                        // 11.9 = effective count of the reference wheel
  const dFric = 0.076 * zr * 0.5 * Math.pow(0.5 * (s.W1 + W2), 2);   // more blades = more wetted area
  const dLoad = 0.0062 * s.U2 * s.U2 * Math.pow(1 / zr, 2.2);                 // too few blades = high loading, flow separates
  const C2 = Math.hypot(s.Cm2, s.Ctheta2);
  const dDiff = (1 - p.etaDiff) * 0.5 * C2 * C2;
  const dClear = 0.65 * s.dHE * (p.clearance / p.b2);
  const dChoke = 0.5 * s.W1 * s.W1 * 90 * Math.pow(Math.max(0, s.MW1 - 0.90), 2);
  const disk = 0.020 * s.U2 * s.U2;                               // windage, adds to input work
  const sum = dInc + dFric + dLoad + dDiff + dClear + dChoke + 0.5 * disk;
  return { inc: dInc, fric: dFric, load: dLoad, diff: dDiff, clear: dClear, choke: dChoke, disk, sum };
}

/* Find the surge-side and choke-side flow limits for a speed (for maps & solver) */
export function compressorLimits(p, N, T01, P01) {
  const U1 = Math.PI * p.D1t * N / 60;
  const rho01 = P01 / (R_AIR * T01);
  const A1 = Math.PI / 4 * (p.D1t ** 2 - p.D1h ** 2) * 0.90;
  // surge: incidence = +9 deg  ->  Cm1 = U1 / tan(beta1b + 9deg)
  const CmSurge = U1 / Math.tan((p.beta1b + 9) * Math.PI / 180);
  let mSurge = rho01 * A1 * CmSurge * 0.97;
  // choke: relative inlet Mach = 1.0
  const a1 = Math.sqrt(1.4 * R_AIR * (T01 - 10));
  const CmChoke = Math.sqrt(Math.max(1, (a1 * 1.0) ** 2 - U1 ** 2));
  let mChoke = U1 < a1 ? rho01 * A1 * 0.78 * CmChoke : rho01 * A1 * 0.78 * 20;
  mSurge = Math.max(mSurge, 1e-4);
  if (mChoke < mSurge * 1.1) mChoke = mSurge * 1.1;
  return { mSurge, mChoke };
}

/* --- turbine efficiency vs blade-speed ratio -------------------------------- */
function turbineEff(p, N, dhIs) {
  const U = Math.PI * p.Dturb * N / 60;
  const nu = U / Math.sqrt(2 * Math.max(dhIs, 1));
  const f = 1 - 0.9 * Math.pow((nu - 0.62) / 0.62, 2);
  return Math.max(0.25, p.etaTpk * Math.min(1, Math.max(0.3, f)));
}
export function turbineBladeSpeedRatio(p, N, dhIs) { return Math.PI * p.Dturb * N / 60 / Math.sqrt(2 * Math.max(dhIs, 1)); }

/* --- combustion efficiency: a Lefebvre-style loading parameter -----------------
   Efficiency rises with pressure and inlet temperature (faster chemistry) and falls with
   air flow (less residence time).  The curve is normalised so the design point gives p.etaB.  */
const REF = { P02: 196.6e3, T02: 366, m: 0.151 };
export function combustionLoading(P02, T02, m) {
  return Math.pow(P02 / REF.P02, 1.75) * Math.exp((T02 - REF.T02) / 150) / (m / REF.m);
}
export function combustionEfficiency(p, P02, T02, m) {
  const F = (x) => 1 - 0.40 * Math.exp(-2.2 * x);
  return Math.min(0.995, p.etaB * F(combustionLoading(P02, T02, m)) / F(1));
}

/* --- mechanical losses: bearings (viscous drag, ~N^1.5) + windage on the turbine disc (~rho N^3) ----- */
export function mechLoss(p, N, P04) {
  const x = N / p.Ndesign;
  return (1 - p.etaM) * 12.5e3 * (0.45 * Math.pow(x, 1.5) + 0.55 * Math.pow(x, 3) * Math.min(1.5, P04 / 1.40e5));
}

/* --- the full gas path at one (N, fuel flow) --------------------------------- */
/**
 * Solve the engine gas path for a given spool speed and fuel flow.
 * @param p    parameter set (see CJ1)
 * @param N    spool speed [rpm]
 * @param mf   fuel mass flow [kg/s]
 * @param amb  {T,P,hum}   ambient (use isa())
 * @param opts {V0: flight speed m/s, lit: boolean}
 */
export function gasPath(p, N, mf, amb, opts = {}) {
  const V0 = opts.V0 || 0;
  const fuel = FUELS[p.fuel] || FUELS.propane, fk = FUELS[p.fuel] ? p.fuel : 'propane';
  const hum = amb.hum || 0;
  const gA = gasFor(0, fk, hum);
  const M0 = V0 / amb.a;
  const ramT = 1 + 0.2 * M0 * M0;
  const T01 = amb.T * ramT;
  const P01 = amb.P * Math.pow(ramT, 3.5) * (1 - (p.dpIn ?? 0.01));
  const lit = opts.lit !== false && mf > 0;

  const lim = compressorLimits(p, Math.max(N, 500), T01, P01);

  const evalAt = (m) => {
    const c = compressor(p, N, m, T01, P01, hum);
    const mg = m + mf;
    const gP = lit ? gasFor(mf / m, fk, hum) : gA;
    const etaB = lit ? combustionEfficiency(p, c.P02, c.T02, m) : 0;
    let T03 = c.T02;
    if (lit) T03 = gP.Th((m * gA.h(c.T02) + etaB * Math.min(mf, 0.98 * m / fuel.AFR) * fuel.LHV) / mg, c.T02 + 600);   // cannot burn more fuel than the oxygen allows
    // combustor loss ~ (corrected flow)^2 : tiny when the engine is only being cranked
    const dpEff = Math.min(0.30, p.dpB * Math.pow(mg / 0.15, 2) * (T03 / 1060) * Math.pow(190e3 / c.P02, 2));
    const P03 = c.P02 * (1 - dpEff);
    // turbine orifice: find PRt so that flow(PRt) = mg
    const RP = gP.R, gt = gP.gamma(T03 - 40);
    const kT = p.Cd * p.At * P03 / Math.sqrt(RP * T03);
    const capFlow = kT * flowFn(critRatio(gt), gt);
    let PRt;
    if (mg >= capFlow) {
      PRt = 1 / critRatio(gt);
    } else {
      let lo = 1.00001, hi = 1 / critRatio(gt);
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (kT * flowFn(1 / mid, gt) < mg) lo = mid; else hi = mid;
      }
      PRt = 0.5 * (lo + hi);
    }
    const h03 = gP.h(T03), T04s = gP.Ts(gP.s(T03) - RP * Math.log(PRt), T03 * Math.pow(PRt, -0.25));
    const dhIs = h03 - gP.h(T04s);
    const etaT = turbineEff(p, N, dhIs);
    const T04 = gP.Th(h03 - etaT * dhIs, T03 - 50);
    const P04 = P03 / PRt;
    const mNoz = orificeFlow(p.A5, p.Cd, P04, T04, amb.P, gP.gamma(T04 - 30), RP);
    return { c, gP, P03, T03, T04, P04, PRt, etaT, dhIs, mg, mNoz, etaB, dpEff, res: mNoz - mg, overflow: mg >= capFlow };
  };

  let lo = lim.mSurge * 0.30, hi = lim.mChoke;
  let rLo = evalAt(lo), rHi = evalAt(hi);
  let m, sol, surge = false, choked = false;
  if (rLo.res <= 0) { m = lo; sol = rLo; surge = N > 0.45 * p.Nmax; }
  else if (rHi.res >= 0) { m = hi; sol = rHi; choked = true; }
  else {
    for (let i = 0; i < 45; i++) {
      const mid = 0.5 * (lo + hi);
      const r = evalAt(mid);
      if (r.res > 0) lo = mid; else hi = mid;
    }
    m = 0.5 * (lo + hi);
    sol = evalAt(m);
  }
  const { c, gP } = sol;
  // beyond the surge line (positive incidence > 9 deg) and spinning fast enough to matter
  if (!surge && m < lim.mSurge && N > 0.45 * p.Nmax) surge = true;

  // nozzle exit
  const mg = sol.mg, RP = gP.R;
  const gn = gP.gamma(sol.T04 - 30), rcrit = critRatio(gn);
  const nozChoked = amb.P / sol.P04 <= rcrit;
  let Ve, Pe = amb.P, Tex;
  const h04 = gP.h(sol.T04), s04 = gP.s(sol.T04);
  if (nozChoked) {
    Pe = sol.P04 * rcrit;
    const T5s = gP.Ts(s04 - RP * Math.log(sol.P04 / Pe), sol.T04 * 0.85);
    Ve = 0.99 * Math.sqrt(Math.max(0, 2 * (h04 - gP.h(T5s))));
    Tex = gP.Th(h04 - 0.5 * Ve * Ve, T5s);
  } else {
    const T5s = gP.Ts(s04 - RP * Math.log(sol.P04 / Math.min(sol.P04, amb.P)), sol.T04 * 0.9);
    Ve = 0.985 * Math.sqrt(Math.max(0, 2 * (h04 - gP.h(T5s))));
    Tex = gP.Th(h04 - 0.5 * Ve * Ve, T5s);
  }
  const mom = mg * Ve, press = (Pe - amb.P) * p.A5, ram = m * V0;
  const thrust = mom + press - ram;
  const Pc = c.power;
  const Pt = mg * (gP.h(sol.T03) - h04);
  const Pmech = mechLoss(p, N, sol.P04);
  return {
    N, mf, m, mg, lit,
    T01, P01, T02: c.T02, P02: c.P02, T03: sol.T03, P03: sol.P03, T04: sol.T04, P04: sol.P04,
    T5: Tex, Ve, Pe, nozChoked, Mexit: Ve / Math.sqrt(gn * RP * Tex),
    PRc: c.PR, etaC: c.eta, PRt: sol.PRt, etaT: sol.etaT, etaB: sol.etaB, dhIsT: sol.dhIs,
    thrust: Math.max(0, thrust), thrustRaw: thrust, thrustParts: { mom, press, ram },
    Pc, Pt, Pmech, Pnet: Pt - Pc - Pmech,
    tsfc: thrust > 1 ? mf / thrust : 0,                  // kg/(N s)
    comp: c, limits: lim, surge, choked, overflow: sol.overflow,
    far: mf / Math.max(m, 1e-9),
    phi: (mf / Math.max(m, 1e-9)) * fuel.AFR,            // overall equivalence ratio
    cpHot: gP.cp(sol.T03), gammaHot: gP.gamma(sol.T03), Rhot: RP,
  };
}

/* --- steady state: find the fuel flow that holds N ---------------------------- */
export function steadyAt(p, N, amb, opts = {}) {
  let lo = 0, hi = 0.02;
  const f = (mf) => gasPath(p, N, mf, amb, opts);
  if (f(lo).Pnet > 0) return f(lo);                      // would self-rotate without fuel (never happens)
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid).Pnet > 0) hi = mid; else lo = mid;
  }
  return f(0.5 * (lo + hi));
}

/** Lookup table of steady fuel flow vs speed (used as controller feed-forward). */
export function buildFuelTable(p, amb, opts = {}) {
  const Ns = [], mfs = [];
  for (let N = 20000; N <= p.Nmax + 1; N += 5000) { Ns.push(N); mfs.push(steadyAt(p, N, amb, opts).mf); }
  return {
    Ns, mfs,
    at(N) {
      if (N <= Ns[0]) return mfs[0] * N / Ns[0];
      for (let i = 1; i < Ns.length; i++) if (N <= Ns[i]) {
        const f = (N - Ns[i - 1]) / (Ns[i] - Ns[i - 1]);
        return mfs[i - 1] + f * (mfs[i] - mfs[i - 1]);
      }
      return mfs[mfs.length - 1];
    },
  };
}

/* --- design helper: sweep speeds ---------------------------------------------- */
export function sweepSteady(p, amb, rpmList, opts) {
  return rpmList.map(N => steadyAt(p, N, amb, opts));
}

/* --- spool dynamics ------------------------------------------------------------- */
/**
 * Advance the spool by dt.
 * state: {N (rpm), mf, lit, ...}   controls: {mf, starter(0..1), ignition}
 */
export function stepSpool(p, state, controls, amb, dt, opts = {}) {
  const N = Math.max(state.N, 1500);                       // avoid the 1/omega singularity at standstill
  const gp = gasPath(p, N, controls.mf, amb, { ...opts, lit: state.lit });
  const w = N * Math.PI / 30;
  // small brushless starter: ~0.09 N m at stall, falling to zero at 55 000 rpm (scaled by battery state)
  const sp = p.starter || { T0: 0.09, N0: 55000 };
  const starterTorque = controls.starter ? sp.T0 * (controls.starterScale ?? 1) * Math.max(0, 1 - state.N / sp.N0) : 0;
  const torque = gp.Pnet / w + starterTorque;
  const dw = torque / p.I;
  let Nnew = state.N + dw * 30 / Math.PI * dt;
  Nnew = Math.min(Math.max(Nnew, 0), p.Nmax * 1.08);
  return { N: Nnew, gp, torque, Pnet: torque * w, dNdt: dw * 30 / Math.PI, starterTorque };
}

/* --- compressor map generator ---------------------------------------------------- */
export function compressorMap(p, amb, speeds, nPts = 28) {
  const lines = [];
  for (const N of speeds) {
    const lim = compressorLimits(p, N, amb.T, amb.P);
    const pts = [];
    for (let i = 0; i < nPts; i++) {
      const m = lim.mSurge + (lim.mChoke - lim.mSurge) * i / (nPts - 1);
      const c = compressor(p, N, m, amb.T, amb.P);
      pts.push({ m, PR: c.PR, eta: c.eta, MW1: c.MW1, inc: c.incidence });
    }
    lines.push({ N, pts, lim });
  }
  return lines;
}

/* --- convenience: format station table -------------------------------------------- */
export function stationTable(g) {
  return [
    { st: '0', name: 'Ambient', T: g.T01, P: g.P01 },
    { st: '2', name: 'Compressor exit', T: g.T02, P: g.P02 },
    { st: '3', name: 'Turbine inlet (TIT)', T: g.T03, P: g.P03 },
    { st: '4', name: 'Turbine exit (EGT)', T: g.T04, P: g.P04 },
    { st: '5', name: 'Nozzle exit', T: g.T5, P: g.Pe },
  ];
}
