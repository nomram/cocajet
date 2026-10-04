/* ==========================================================================
   chem-model.js - the chemistry behind chapter 10 (no DOM).
     * formula parser and molar masses
     * equation balancer (integer null space of the atom-count matrix)
     * formation enthalpies for the examples
     * adiabatic flame temperature with CO2 / H2O dissociation (equilibrium)
   Species thermodynamics use the same "rigid rotor + harmonic oscillators" model as thermo.js.
   ========================================================================== */

export const ATOMS = { H: 1.008, He: 4.0026, Li: 6.94, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Ti: 47.867, Cr: 51.996, Mn: 54.938, Fe: 55.845, Ni: 58.693, Cu: 63.546, Zn: 65.38, Br: 79.904, Ag: 107.87, Sn: 118.71, I: 126.90, W: 183.84, Pb: 207.2 };
export const AVOGADRO = 6.02214076e23;

/** "Ca(OH)2" -> {Ca:1, O:2, H:2}; throws on a bad formula */
export function parseFormula(str) {
  const s = str.replace(/\s+/g, '').replace(/[·.]/g, '');
  let i = 0;
  function group() {
    const out = {};
    while (i < s.length) {
      const ch = s[i];
      if (ch === '(') {
        i++; const inner = group(); if (s[i] !== ')') throw new Error('missing )'); i++;
        const k = num(); for (const e in inner) out[e] = (out[e] || 0) + inner[e] * k;
      } else if (ch === ')') { return out; }
      else if (/[A-Z]/.test(ch)) {
        let el = ch; i++; if (i < s.length && /[a-z]/.test(s[i])) { el += s[i]; i++; }
        if (!(el in ATOMS)) throw new Error('unknown element ' + el);
        out[el] = (out[el] || 0) + num();
      } else throw new Error('unexpected "' + ch + '"');
    }
    return out;
  }
  function num() { let n = ''; while (i < s.length && /\d/.test(s[i])) { n += s[i]; i++; } return n ? +n : 1; }
  const r = group(); if (i < s.length) throw new Error('unbalanced )'); if (!Object.keys(r).length) throw new Error('empty formula');
  return r;
}
export const molarMass = c => Object.entries(c).reduce((a, [e, n]) => a + n * ATOMS[e], 0);
/** "C3H8" -> "C<sub>3</sub>H<sub>8</sub>" */
export const sub = f => f.replace(/(\d+)/g, '<sub>$1</sub>');

/* ---------------- balancing ---------------- */
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; };
const lcm = (a, b) => a / gcd(a, b) * b;
class Fr { constructor(n, d = 1) { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); this.n = n / g; this.d = d / g; } add(o) { return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); } sub(o) { return new Fr(this.n * o.d - o.n * this.d, this.d * o.d); } mul(o) { return new Fr(this.n * o.n, this.d * o.d); } div(o) { return new Fr(this.n * o.d, this.d * o.n); } get zero() { return this.n === 0; } }

/** coefficients that balance reactants -> products, or {error}. */
export function balance(reactants, products) {
  const sp = [...reactants, ...products], cs = sp.map(parseFormula), els = [...new Set(cs.flatMap(c => Object.keys(c)))];
  const R = reactants.length;
  const M = els.map(e => cs.map((c, j) => new Fr((c[e] || 0) * (j < R ? 1 : -1))));
  // reduced row echelon form
  const rows = M.length, cols = sp.length, piv = []; let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let p = r; while (p < rows && M[p][c].zero) p++; if (p === rows) continue;
    [M[r], M[p]] = [M[p], M[r]]; const pv = M[r][c]; M[r] = M[r].map(x => x.div(pv));
    for (let i = 0; i < rows; i++) if (i !== r && !M[i][c].zero) { const f = M[i][c]; M[i] = M[i].map((x, k) => x.sub(f.mul(M[r][k]))); }
    piv.push(c); r++;
  }
  const free = []; for (let c = 0; c < cols; c++) if (!piv.includes(c)) free.push(c);
  if (free.length === 0) return { error: 'These atoms cannot be balanced with these species (check the formulas).' };
  if (free.length > 1) return { error: 'More than one way to balance this: add or remove a species.' };
  const f = free[0], v = new Array(cols).fill(null).map(() => new Fr(0)); v[f] = new Fr(1);
  piv.forEach((c, i) => { v[c] = new Fr(0).sub(M[i][f]); });
  const L = v.reduce((a, x) => lcm(a, x.d), 1), ints = v.map(x => x.n * (L / x.d)), g = ints.reduce((a, x) => gcd(a, x), 0);
  let out = ints.map(x => x / g); if (out.some(x => x < 0)) out = out.map(x => -x);
  if (out.some(x => x <= 0)) return { error: 'No positive coefficients balance this: a species is on the wrong side.' };
  return { coeffs: out, species: sp, reactants: out.slice(0, R), products: out.slice(R) };
}
/** atom ledger of an equation with given coefficients: {el: [left, right]} */
export function ledger(reactants, products, cl, cr) {
  const L = {}, add = (arr, co, side) => arr.forEach((f, i) => { const c = parseFormula(f); for (const e in c) { (L[e] ||= [0, 0])[side] += c[e] * co[i]; } });
  add(reactants, cl, 0); add(products, cr, 1); return L;
}

/* ---------------- fuels and their data (kJ/mol, gas phase unless noted) ---------------- */
export const HF = { CO2: -393.51, H2O: -241.83, CO: -110.53, H2: 0, O2: 0, N2: 0 };
export const FUELS = {
  hydrogen: { name: 'Hydrogen', f: 'H2',      C: 0,  H: 2,  O: 0, hf: 0 },
  methane:  { name: 'Methane (natural gas)', f: 'CH4', C: 1, H: 4, O: 0, hf: -74.87 },
  propane:  { name: 'Propane (our fuel)', f: 'C3H8', C: 3, H: 8, O: 0, hf: -103.85 },
  butane:   { name: 'Butane (lighter gas)', f: 'C4H10', C: 4, H: 10, O: 0, hf: -125.6 },
  ethanol:  { name: 'Ethanol (alcohol)', f: 'C2H6O', C: 2, H: 6, O: 1, hf: -234.8 },
  octane:   { name: 'Octane (petrol)', f: 'C8H18', C: 8, H: 18, O: 0, hf: -208.4 },
  kerosene: { name: 'Kerosene / Jet-A (average)', f: 'C12H23', C: 12, H: 23, O: 0, hf: -291.7 },
};
for (const k in FUELS) { const F = FUELS[k]; F.M = F.C * ATOMS.C + F.H * ATOMS.H + F.O * ATOMS.O; F.nO2 = F.C + F.H / 4 - F.O / 2; F.dHc = F.C * HF.CO2 + F.H / 2 * HF.H2O - F.hf; }   // kJ/mol of fuel, steam products (lower heating value)

/* mass fractions and mole fractions of dry air */
export const AIR_MOLE = { N2: 0.7808, O2: 0.2095, Ar: 0.0093, CO2: 0.0004 };
export const AIR_MASS = { N2: 0.7552, O2: 0.2314, Ar: 0.0128, CO2: 0.0006 };

/* ---------------- species thermodynamics (J/mol, J/mol/K) ---------------- */
const RG = 8.314462, T0 = 298.15;
const SP = {
  N2:  { c0: 3.5, th: [3374], S: 191.61 }, O2: { c0: 3.5, th: [2256], S: 205.15 }, CO: { c0: 3.5, th: [3122], S: 197.66 }, H2: { c0: 3.5, th: [6215], S: 130.68 },
  CO2: { c0: 3.5, th: [3380, 1930, 960, 960], S: 213.79 }, H2O: { c0: 4.0, th: [5360, 5400, 2290], S: 188.84 },
};
const hs = (n, T) => { const sp = SP[n]; let s = sp.c0 * (T - T0); for (const th of sp.th) s += th * (1 / (Math.exp(th / T) - 1) - 1 / (Math.exp(th / T0) - 1)); return RG * s; };   // sensible enthalpy, J/mol
const ss = (n, T) => { const sp = SP[n]; let s = sp.c0 * Math.log(T / T0); for (const th of sp.th) { const f = t => { const x = th / t, e = Math.exp(x); return x / (e - 1) - Math.log(1 - 1 / e); }; s += f(T) - f(T0); } return RG * s + sp.S; };   // absolute entropy at 1 atm, J/mol/K
const G = (n, T) => HF[n] * 1000 + hs(n, T) - T * ss(n, T);            // Gibbs energy, J/mol
const lnK = (T, a, b) => -((G(a[0], T) + 0.5 * G('O2', T)) - G(b, T)) / (RG * T);   // b -> a0 + 1/2 O2
export const equilibriumConstants = T => ({ CO2: Math.exp(lnK(T, ['CO'], 'CO2')), H2O: Math.exp(lnK(T, ['H2'], 'H2O')) });

/** equilibrium composition (moles) of C,H,O,N atoms at T [K], P [atm]; species CO2, CO, H2O, H2, O2, N2 */
function equilibrium(nC, nH, nO, nN, T, P, dissociate = true) {
  const K1 = dissociate ? Math.exp(lnK(T, ['CO'], 'CO2')) : 0, K2 = dissociate ? Math.exp(lnK(T, ['H2'], 'H2O')) : 0;
  const nN2 = nN / 2, base = nN2 + nC + nH / 2;
  const state = y => { const nt = base + y, q = Math.sqrt(Math.max(P * y / nt, 1e-300)); const a = nC / (1 + K1 / q), b = nH / 2 / (1 + K2 / q); return { a, b, nt }; };
  const f = y => { const s = state(y); return s.a + s.b + nC + 2 * y - nO; };
  let lo = 1e-30, hi = Math.max(nO / 2, 1e-12) + 1e-9;
  if (f(hi) < 0) { lo = hi; hi = hi * 4 + 1; }
  for (let i = 0; i < 70; i++) { const mid = Math.sqrt(lo * hi); if (f(mid) > 0) hi = mid; else lo = mid; }
  const y = Math.sqrt(lo * hi), s = state(y);
  return { CO2: s.a, CO: nC - s.a, H2O: s.b, H2: nH / 2 - s.b, O2: y, N2: nN2 };
}

/**
 * Adiabatic flame temperature of fuel + air at equivalence ratio phi (1 = stoichiometric), air inlet temperature Tair [K], pressure P [atm].
 * Returns {T, comp (mole fractions), ...}.  dissociate=false: complete combustion only (valid for phi <= 1).
 */
export function flameTemperature(fuelKey, phi, Tair = 298.15, P = 1, dissociate = true) {
  const F = FUELS[fuelKey], nF = 1, nO2air = F.nO2 / phi, nN2air = nO2air * (AIR_MOLE.N2 + AIR_MOLE.Ar) / AIR_MOLE.O2;
  const nC = F.C, nH = F.H, nO = F.O + 2 * nO2air, nN = 2 * nN2air;
  const Hin = F.hf * 1000 + nO2air * hs('O2', Tair) + nN2air * hs('N2', Tair);                    // J, per mole of fuel (fuel enters at 298 K)
  const comp = T => {
    if (!dissociate) {
      if (phi > 1) return null;
      return { CO2: nC, CO: 0, H2O: nH / 2, H2: 0, O2: nO2air - F.nO2, N2: nN2air };
    }
    return equilibrium(nC, nH, nO, nN, T, P, true);
  };
  const Hout = T => { const c = comp(T); if (!c) return NaN; let h = 0; for (const n in c) h += c[n] * (HF[n] * 1000 + hs(n, T)); return h; };
  if (!dissociate && phi > 1) return { T: NaN, comp: null };
  let lo = 300, hi = 3800;
  for (let i = 0; i < 46; i++) { const mid = 0.5 * (lo + hi); if (Hout(mid) > Hin) hi = mid; else lo = mid; }
  const T = 0.5 * (lo + hi), c = comp(T), tot = Object.values(c).reduce((a, b) => a + b, 0), x = {}; for (const n in c) x[n] = c[n] / tot;
  return { T, comp: c, x, tot, nF, nO2air, nN2air };
}
