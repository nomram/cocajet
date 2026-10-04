/* ==========================================================================
   fuel-supply.js - the propane bottle, regulator and fuel valve (no DOM).

   Propane is stored as a liquid in equilibrium with its vapour.  The engine draws
   VAPOUR; every kilogram that leaves has to evaporate first, and evaporating takes
   latent heat from the liquid.  A bottle that is run hard therefore cools, its
   vapour pressure falls, and eventually it can no longer push enough gas through
   the valve ("freeze-off").  The regulator hides this until the bottle pressure
   drops below its set-point.

       dTb/dt = ( UA (Tamb - Tb) - mdot * h_fg(Tb) ) / C_bottle
       P_feed = min( P_regulator , 0.97 * P_sat(Tb) )
       mdot   = Cd * A_valve * P_feed / sqrt(R T) * flowFn( P_back / P_feed )
   ========================================================================== */
import { orificeFlow } from './engine-model.js';
import { propanePsat, propaneHfg } from './thermo.js';

const R_PROPANE = 8314.462 / 44.097;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class FuelSupply {
  constructor(o = {}) {
    this.liquid0 = o.liquid ?? 4.0;           // kg of liquid propane at the start
    this.steel = o.steel ?? 5.0;              // kg of cylinder steel
    this.UA = o.UA ?? 4.0;                    // W/K, bottle to ambient air (frost makes it better)
    this.Preg = o.regulator ?? 2.0e5;         // regulator set-point [Pa gauge]
    this.Amax = o.valve ?? 6.0e-6;            // fully-open valve area [m^2]  (about 2.8 mm diameter)
    this.Cd = 0.8;
    this.tau = o.tau ?? 0.12;                 // valve actuator lag [s]
    this.reset(o.T ?? 288.15);
  }
  reset(Tamb = this.Tamb) {
    this.Tamb = Tamb; this.Tb = Tamb; this.mL = this.liquid0;
    this.open = 0; this.flow = 0; this.cmd = 0; this.used = 0;
  }
  setAmbient(T) { this.Tamb = T; }
  /** absolute supply pressure at the valve inlet [Pa] */
  get feedPressure() { return Math.min(this.Preg + 101325, 0.97 * propanePsat(this.Tb)); }
  get bottlePressure() { return propanePsat(this.Tb); }
  /** flow at valve opening x (0..1) into back-pressure Pb [Pa abs] */
  flowAt(x, Pb) { return orificeFlow(Math.max(0, x) * this.Amax, this.Cd, this.feedPressure, 290, Pb, 1.13, R_PROPANE); }
  /** opening that would deliver mf [kg/s] */
  openingFor(mf, Pb) { const full = this.flowAt(1, Pb); return full > 1e-9 ? clamp(mf / full, 0, 1) : 1; }
  /** maximum flow available right now [kg/s] */
  maxFlow(Pb) { return this.mL > 0.001 ? this.flowAt(1, Pb) : 0; }
  get empty() { return this.mL <= 0.001; }
  /** true when the valve is wide open and still cannot deliver what was asked */
  starved(mfCmd, Pb) { return mfCmd > 1e-5 && (this.empty || mfCmd > 1.02 * this.maxFlow(Pb)); }
  /** advance by dt; mfCmd is what the controller asks for [kg/s]; returns the actual flow */
  step(dt, mfCmd, Pb) {
    this.cmd = mfCmd;
    const target = this.openingFor(mfCmd, Pb);
    this.open += (target - this.open) * (1 - Math.exp(-dt / this.tau));
    let mf = this.mL > 0.001 ? this.flowAt(this.open, Pb) : 0;
    mf = Math.min(mf, this.mL / Math.max(dt, 1e-6));
    const C = this.mL * 2600 + this.steel * 500;                       // J/K
    this.Tb += dt * (this.UA * (this.Tamb - this.Tb) - mf * propaneHfg(this.Tb)) / C;
    this.mL = Math.max(0, this.mL - mf * dt); this.used += mf * dt;
    this.flow = mf;
    return mf;
  }
}
