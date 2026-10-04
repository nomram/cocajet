/* ==========================================================================
   engine-sim.js — a running engine: ECU / manual controls, spool dynamics (engine-model.js),
   thermal state of every part, and a "visual" snapshot the 3D viewer consumes.
   No DOM — works in Node and in the browser.
   ========================================================================== */
import { CJ1, FUELS, isa, gasPath, buildFuelTable, stepSpool, R_AIR } from './engine-model.js';
import { FuelSupply } from './fuel-supply.js';

export const PHASES = {
  off: 'Off', starter: 'Spin-up (starter)', ignition: 'Ignition', ramp: 'Accelerating', run: 'Running',
  cooldown: 'Cool-down', flameout: 'Flame-out', fault: 'Fault',
};

/** Liner materials -> max safe wall temperature (K) used for the damage model. */
export const LINERS = {
  can:   { name: 'Coke can (aluminium 3004)', Tmax: 800 },
  ss304: { name: 'Stainless 304',             Tmax: 1150 },
  ss310: { name: 'Stainless 310S',            Tmax: 1300 },
  inco:  { name: 'Inconel 625',               Tmax: 1450 },
};

/** Per-part thermal behaviour: time constant [s] and the weights used to build the target temperature. */
const THERMAL = {
  'shaft':              { tau: 14 },
  'bearing-tunnel':     { tau: 40 },
  'impeller':           { tau: 7 },
  'diffuser-plate':     { tau: 18 },
  'compressor-housing': { tau: 25 },
  'combustor-casing':   { tau: 55 },
  'flame-tube':         { tau: 2.4 },
  'fuel-ring':          { tau: 12 },
  'igniter':            { tau: 18 },
  'ngv':                { tau: 4 },
  'turbine-wheel':      { tau: 6 },
  'turbine-casing':     { tau: 28 },
  'exhaust-nozzle':     { tau: 10 },
  'test-stand':         { tau: 900 },
};
export const THERMAL_SAMPLES = 16;

/** Gas temperature along the axis (K); z in mm (STL coordinates). Pure function so the 3D flow can use it too. */
export function gasTempProfile(z, T, lit) {
  const { T01, T02, T03, T04, T5 } = T;
  if (z < 24) return T01;
  if (z < 41) return T01 + (T02 - T01) * (z - 24) / 17;
  if (z < 78) return T02;
  if (z < 165) {
    if (!lit) return T02;
    const Tpk = Math.min(2050, T02 + 2.6 * (T03 - T02));
    if (z < 90) return T02 + (Tpk - T02) * (z - 78) / 12;
    return T03 + (Tpk - T03) * Math.exp(-(z - 90) / 24);
  }
  if (z < 180) return T03;
  if (z < 192) return T03 + (T04 - T03) * (z - 180) / 12;
  return T04 + (T5 - T04) * Math.min(1, (z - 192) / 60);
}

export class EngineSim {
  constructor(opts = {}) {
    this.p = { ...CJ1, ...(opts.params || {}) };
    this.alt = opts.altitude || 0;
    this.dT = opts.dT || 0;
    this.V0 = opts.V0 || 0;
    this.rh = opts.rh || 0;
    this.liner = opts.liner || 'can';
    this.partMeta = {};           // id -> {z0,z1}
    this.mode = 'auto';           // 'auto' (ECU) | 'manual'
    this.throttle = 0;            // 0..1 (auto)
    this.manual = { fuel: 0, starter: false, ignition: false };
    this.events = [];
    this.fuelSys = new FuelSupply({ T: 288.15 });
    this._rebuildAmbient();
    this.reset();
  }

  _rebuildAmbient() {
    this.amb = isa(this.alt, this.dT, this.rh);
    this.table = buildFuelTable(this.p, this.amb, { V0: this.V0 });
    this.fuelSys.setAmbient(this.amb.T);
  }
  setAmbient({ altitude, dT, V0, rh } = {}) {
    if (altitude != null) this.alt = altitude;
    if (dT != null) this.dT = dT;
    if (V0 != null) this.V0 = V0;
    if (rh != null) this.rh = rh;
    this._rebuildAmbient();
  }
  /** change the propane supply (bottle size/fill, regulator, valve size...) */
  setFuelSystem(o) { Object.assign(this.fuelSys, o); if (o.liquid != null) this.fuelSys.liquid0 = o.liquid; if (o.regulator != null) this.fuelSys.Preg = o.regulator; this.fuelSys.reset(this.amb.T); }
  setParam(obj) { Object.assign(this.p, obj); this._rebuildAmbient(); }
  /** change the real engine (a blocked nozzle, a worn turbine...) WITHOUT telling the controller: its fuel table stays as built */
  setFault(obj) { Object.assign(this.p, obj); }
  setParts(parts) {
    for (const pt of parts) this.partMeta[pt.id] = { z0: pt.bbox.min[2], z1: pt.bbox.max[2], material: pt.material };
    this._initThermal();
  }

  reset() {
    this.t = 0;
    this.phase = 'off';
    this.N = 0; this.mf = 0; this.mfCmd = 0; this.lit = false;
    this.starter = false; this.ignition = false;
    this.fuelSys.reset(this.amb.T);
    this.batt = { soc: this.batt ? this.batt.soc : 1, V: 12.4, I: 0 };      // a 3S LiPo carries over between runs
    this.surgeT = 0; this.surgePhase = 0; this.surgeCycles = 0; this.surgeMod = 1; this._surgeFlag = false;
    this.starved = false; this.thrustMeas = 0; this.starterLevel = 0; this.dNdt = 0;
    this.trim = 0; this.wheelDamage = 0; this.destroyed = false;
    if (this.egtLimit == null) this.egtLimit = 1110;       // K (837 °C): the ECU backs the fuel off above this exhaust temperature
    this.phaseT = 0; this.lightTimer = 0;
    this.gp = gasPath(this.p, 1500, 0, this.amb, { V0: this.V0, lit: false });
    this.fuelIntegral = 0;
    this.linerDamage = 0;
    this.message = '';
    this.fuelUsed = 0;
    this.peak = { T04: 0, N: 0, thrust: 0 };
    this._initThermal();
  }

  _initThermal() {
    this.temps = {};
    for (const id of Object.keys(this.partMeta)) {
      this.temps[id] = new Float32Array(THERMAL_SAMPLES).fill(this.amb.T);
    }
  }

  noteOnce(key, msg, kind = 'bad', cooldown = 8) {
    this._warn = this._warn || {};
    if (this.t - (this._warn[key] ?? -1e9) > cooldown) { this._warn[key] = this.t; this.note(msg, kind); }
  }
  note(msg, kind = 'info') { this.message = msg; this.events.push({ t: this.t, msg, kind }); if (this.events.length > 40) this.events.shift(); }

  /* ---------------- user commands ---------------- */
  setThrottle(x) { this.throttle = Math.min(1, Math.max(0, x)); }
  start() {
    if (this.destroyed) { this.noteOnce('destroyed', 'The turbine wheel has failed. Press RESET to fit a new rotor.', 'bad', 3); return; }
    if (this.phase === 'off' || this.phase === 'flameout' || this.phase === 'fault') {
      this.phase = 'starter'; this.phaseT = 0; this.mode = 'auto';
      this.note('Starter motor on: spinning the shaft up.');
    }
  }
  stop() {
    if (this.phase === 'off') return;
    this.phase = 'cooldown'; this.phaseT = 0; this.lit = false; this.mf = 0; this.mfCmd = 0;
    this.note('Fuel off. Cool-down run: the starter keeps the air flowing until the hot section is below 100 °C.');
  }
  killFuel() { this.mf = 0; this.mfCmd = 0; this.lit = false; if (this.phase !== 'off') { this.phase = this.N > 2000 ? 'cooldown' : 'off'; this.note('Fuel valve closed.'); } }
  setMode(m) { this.mode = m; if (m === 'manual' && this.phase === 'off') this.phase = 'cooldown'; }

  /* ---------------- helpers ---------------- */
  ffFuel(N) { return this.table.at(N); }
  get idleRpm() { return 48000; }
  get maxRpm() { return this.p.Ndesign; }
  targetRpm() { return this.idleRpm + this.throttle * (this.maxRpm - this.idleRpm); }

  /* ---------------- stepping ---------------- */
  step(dt) {
    // sub-step for stability (spool dynamics are fast at high speed)
    let left = dt;
    while (left > 1e-6) { const h = Math.min(left, 0.02); this._step(h); left -= h; }
  }

  _step(dt) {
    this.t += dt; this.phaseT += dt;
    const p = this.p;
    let starter = false, cmd = this.mfCmd;
    const sm = Math.min(1, Math.max(0, (this.N - 30000) / 18000));
    const assist = 0.66 + 0.34 * sm * sm * (3 - 2 * sm);          // the starter does part of the work at low speed, so less fuel is needed
    const ff = this.ffFuel(Math.max(this.N, 20000)) * assist;
    const Pb = this.gp ? this.gp.P03 : this.amb.P;

    if (this.mode === 'manual') {
      starter = this.manual.starter;
      cmd = this.manual.fuel * 1e-3;
      this.ignition = this.manual.ignition;
    } else {
      switch (this.phase) {
        case 'off':
          cmd = 0; this.lit = false; break;
        case 'starter':
          starter = true; cmd = 0;
          if (this.N > 17000) { this.phase = 'ignition'; this.phaseT = 0; this.ignition = true; this.note('Igniter on, gas valve cracked open.'); }
          break;
        case 'ignition':
          starter = true; this.ignition = true;
          cmd = 0.00032 + 0.00004 * this.phaseT;
          if (this.lit) { this.phase = 'ramp'; this.phaseT = 0; this.note('Light-off! Flame established; ramping fuel.'); }
          else if (this.phaseT > 6) { this.phase = 'fault'; cmd = 0; this.ignition = false; this.note('No ignition. Check igniter / gas supply.', 'bad'); }
          break;
        case 'ramp': case 'run': {
          starter = this.N < 44000;
          const Nt = this.phase === 'ramp' ? Math.min(this.idleRpm, this.targetRpm()) : this.targetRpm();
          // feed-forward from the steady-state table + a bounded PD correction, with rate limits and an EGT limiter
          const err = Math.min(1, Math.max(-1, (Nt - this.N) / Math.max(Nt, 1)));
          const T04 = this.gp ? this.gp.T04 : 0;
          const egtLim = (this.phase === 'ramp' || (this.dNdt || 0) > 2000) ? Math.min(this.egtLimit, 1060) : this.egtLimit;   // stricter while accelerating
          const limiting = T04 > egtLim;
          // slow integral trim: lets the controller find the fuel a worn or damaged engine really needs
          if (this.lit && this.phase === 'run' && !limiting && Math.abs(err) < 0.04) this.trim = Math.min(0.9, Math.max(-0.2, this.trim + err * 0.6 * dt));   // only near the set-point: no wind-up while accelerating
          let want = ff * (1 + this.trim + Math.min(0.30, Math.max(-0.45, 14 * err - 4.0e-6 * (this.dNdt || 0))));
          if (limiting) want *= Math.max(0.6, 1 - (T04 - egtLim) / 250);
          want = Math.max(want, 0.52 * ff);                       // never lean-blow-out the flame on a throttle chop
          // surge protection: back off the fuel while the compressor is on its stall line
          if (this.surgeT > 0.05) want *= Math.max(0.55, 1 - 0.5 * this.surgeT);
          const up = this.phase === 'ramp' ? 0.00014 : 0.00060;   // kg/s per s
          if (this.lit) { if (want > cmd) cmd = Math.min(want, cmd + up * dt); else cmd = Math.max(want, cmd - 0.0009 * dt); }
          else cmd = Math.min(want, cmd + up * dt);
          this.ignition = this.phase === 'ramp' && this.N < 40000;
          if (this.phase === 'ramp' && this.N >= this.idleRpm * 0.97) { this.phase = 'run'; this.phaseT = 0; this.ignition = false; this.note('Idle reached. Use the throttle.'); }
          break;
        }
        case 'cooldown':
          cmd = 0; this.lit = false; this.ignition = false;
          starter = this.N < 22000 && this.hotTemp() > 400 && this.phaseT < 400;
          if (this.hotTemp() <= 400 && this.N < 6000) { this.phase = 'off'; this.note('Hot section below 125 °C. Safe to approach (the casing is still warm).'); }
          if (!starter && this.N < 1500) { this.phase = 'off'; }
          break;
        case 'flameout':
        case 'fault':
          cmd = 0; this.lit = false; this.ignition = false;
          starter = this.N < 22000 && this.hotTemp() > 400;
          if (this.phaseT > 4) { this.phase = 'cooldown'; this.phaseT = 0; }
          break;
      }
    }
    this.mfCmd = cmd;
    // the propane bottle, regulator and valve decide what really flows
    const mf = this.fuelSys.step(dt, cmd, Pb);
    const starved = this.fuelSys.starved(cmd, Pb) && this.lit;
    if (starved && !this.starved) this.note('FUEL STARVATION: valve wide open but the bottle is too cold (' + (this.fuelSys.Tb - 273.15).toFixed(0) + ' °C, ' + (this.fuelSys.bottlePressure / 1e5).toFixed(1) + ' bar). Warm the bottle or use a bigger one.', 'bad');
    this.starved = starved;
    this._lightLogic(dt, mf);
    this.mf = mf; this.starter = starter;
    this.fuelUsed += mf * dt;

    // the starter's speed controller ramps its power up over ~6 s and drops it quickly
    this.starterLevel = (this.starterLevel || 0) + Math.min(dt * (starter ? 0.17 : 1.5), Math.max(-dt * 1.5, (starter ? 1 : 0) - (this.starterLevel || 0)));
    const r = stepSpool(p, { N: this.N, lit: this.lit }, { mf, starter: this.starterLevel > 0.001, starterScale: this._starterScale() * this.starterLevel }, this.amb, dt, { V0: this.V0 });
    this.N = r.N; this.gp = r.gp; this.dNdt = r.dNdt;
    this._battery(dt, r.starterTorque);

    this._surge(dt);
    if (this.N > p.Nmax * 1.03 && this.lit) this.noteOnce('over', 'OVERSPEED! A real wheel could burst at this speed.');
    if (this.gp.T04 > 1120 && this.lit && this.phase !== 'ignition') this.noteOnce('temp', 'OVER-TEMPERATURE: EGT is above the safe limit.');
    this.peak.T04 = Math.max(this.peak.T04, this.lit ? this.gp.T04 : 0);
    this.peak.N = Math.max(this.peak.N, this.N);
    this.peak.thrust = Math.max(this.peak.thrust, this.gp.thrust);
    this.thrustMeas += (this.gp.thrust * this.surgeMod - this.thrustMeas) * (1 - Math.exp(-dt / 0.12));   // a load cell has a lag

    this._thermal(dt);
  }

  /** equivalence ratio in the primary zone (about 26 % of the air enters there) */
  pzPhi(mf, m = this.gp ? this.gp.m : 0.01) { return mf / (0.26 * Math.max(m, 0.004)) * FUELS[this.p.fuel || 'propane'].AFR; }

  _lightLogic(dt, mf) {
    const phi = this.pzPhi(mf);
    if (!this.lit) {
      // the spark only lights a mixture that is neither too weak nor too rich at the plug
      if (this.ignition && mf > 0.00028 && this.N > 8000 && this.N < 62000 && phi > 0.65 && phi < 2.6) {
        this.lightTimer += dt;
        if (this.lightTimer > 1.4) { this.lit = true; this.lightTimer = 0; }
      } else this.lightTimer = Math.max(0, this.lightTimer - dt);
    } else {
      // blow-out: primary zone outside the lean / rich stability limits (propane flammability: phi 0.5 - 2.5)
      const lean = phi < 0.42 && this.N > 25000;
      const rich = phi > 3.0 && this.N > 25000;
      if (mf <= 1e-5 || lean || rich) {
        this.lit = false;
        if (this.mode === 'manual' || this.phase !== 'cooldown') {
          this.phase = this.mode === 'manual' ? this.phase : 'flameout';
          this.note(mf <= 1e-5 ? 'Fuel cut: flame out.' : (lean ? 'Flame-out: mixture too lean (primary zone φ = ' + phi.toFixed(2) + ').' : 'Flame-out: mixture too rich (primary zone φ = ' + phi.toFixed(2) + ').'), 'bad');
        }
      }
    }
  }

  /* ---- starter battery: 3S LiPo, 2200 mAh ---- */
  _starterScale() { return Math.min(1.1, Math.max(0.25, this.batt.V / 11.3)); }
  _battery(dt, torque) {
    const b = this.batt, Kt = 0.0046;                       // N m per A of the starter motor
    b.I = torque > 0 ? torque / Kt + 1.5 : 0;
    const voc = 3 * (3.45 + 0.75 * Math.pow(Math.max(0, b.soc), 0.6));
    b.V = voc - b.I * 0.035;
    b.soc = Math.max(0, b.soc - b.I * dt / (2.2 * 3600));
  }

  /* ---- compressor surge: pulsing, ECU back-off, flame-out if it persists ---- */
  _surge(dt) {
    const g = this.gp, lim = g.limits;
    this.surgeMargin = (g.m - lim.mSurge) / lim.mSurge;
    const inSurge = this.lit && g.surge && this.N > 60000;
    if (inSurge) {
      this.surgeT += dt; this.surgePhase += dt * 8.0;           // chuffing at about 8 Hz
      if (!this._surgeFlag) { this._surgeFlag = true; this.surgeCycles++; this.note('COMPRESSOR SURGE: the flow keeps reversing. Back off the fuel or open the nozzle.', 'bad'); }
      const ph = this.surgePhase % 1;
      this.surgeMod = 1 - 0.75 * Math.pow(ph, 0.6) * (1 - ph * 0.3);       // slow build, abrupt collapse
      if (this.surgeT > 2.4 && this.mode !== 'manual') { this.lit = false; this.phase = 'flameout'; this.phaseT = 0; this.note('Flame-out after prolonged surge. The ECU cut the fuel.', 'bad'); this.surgeT = 0; }
      else if (this.surgeT > 3.5) { this.lit = false; this.note('Flame-out after prolonged surge.', 'bad'); this.surgeT = 0; }
    } else {
      this.surgeT = Math.max(0, this.surgeT - dt * 0.6); this.surgeMod += (1 - this.surgeMod) * Math.min(1, dt * 10);
      if (this.surgeT === 0) this._surgeFlag = false;
    }
  }

  /** hottest gas-path part (K) — used to decide when the cool-down run can end */
  hotTemp() {
    let m = 0;
    for (const id of ['flame-tube', 'turbine-wheel', 'ngv', 'exhaust-nozzle', 'turbine-casing', 'combustor-casing']) {
      const a = this.temps[id]; if (a) for (const v of a) m = Math.max(m, v);
    }
    return m;
  }
  maxTemp() { let m = 0; for (const a of Object.values(this.temps)) for (const v of a) m = Math.max(m, v); return m; }

  /* ---------------- thermal model ---------------- */
  /** Gas temperature along the axis (K). z in mm. */
  gasT(z, g = this.gp) {
    return gasTempProfile(z, { T01: this.amb.T, T02: g.T02, T03: g.T03, T04: g.T04, T5: g.T5 }, this.lit);
  }

  _thermal(dt) {
    const g = this.gp, T01 = this.amb.T, T02 = g.T02;
    const lit = this.lit;
    const Tw = (id) => this.temps[id];
    const Tturb = this.temps['turbine-wheel'] ? avg(this.temps['turbine-wheel']) : T01;
    for (const [id, meta] of Object.entries(this.partMeta)) {
      const arr = this.temps[id]; if (!arr) continue;
      const th = THERMAL[id] || { tau: 30 };
      const a = 1 - Math.exp(-dt * (1 + this.N / 20000) / th.tau);      // moving air speeds up heating and cooling
      for (let k = 0; k < THERMAL_SAMPLES; k++) {
        const z = meta.z0 + (meta.z1 - meta.z0) * k / (THERMAL_SAMPLES - 1);
        const Tg = this.gasT(z);
        let target = T01;
        switch (id) {
          case 'impeller': target = T01 + 0.8 * (this.gasT(z) - T01) + 0.04 * (Tturb - T01); break;
          case 'compressor-housing': target = T01 + 0.55 * (Math.min(T02, this.gasT(z)) - T01) + 0.03 * (this.gasT(100) - T01); break;
          case 'diffuser-plate': target = T02 + 0.05 * (this.gasT(100) - T02); break;
          case 'bearing-tunnel': target = T02 + (0.07 + 0.55 * Math.max(0, (z - 120) / 60)) * (lit ? (g.T03 - T02) : 0); break;
          case 'shaft': target = T01 + 0.3 * (T02 - T01) * (1 - (z - 26) / 170) + 0.6 * (Tturb - T01) * Math.pow(Math.max(0, (z - 80) / 115), 2); break;
          case 'combustor-casing': target = T02 + 0.075 * (this.gasT(Math.min(150, z + 20)) - T02) * (lit ? 1 : 0) + (z > 155 ? 0.12 * (g.T04 - T02) : 0); break;
          case 'flame-tube': target = T02 + 0.30 * (Tg - T02); break;
          case 'fuel-ring': target = T02 + 0.12 * ((lit ? 1400 : T02) - T02); break;
          case 'igniter': target = T02 + 0.30 * ((lit ? 1500 : T02) - T02) * Math.max(0, 1 - (z - 90) / 40); break;
          case 'ngv': target = lit ? 0.90 * g.T03 + 0.10 * T02 : T02; break;
          case 'turbine-wheel': target = lit ? 0.80 * (0.5 * (g.T03 + g.T04)) + 0.20 * T02 : T02; if (this.N < 1000 && !lit) target = T01 + (target - T01) * 0.2; break;
          case 'turbine-casing': target = lit ? 0.70 * g.T04 + 0.3 * T02 : T02; break;
          case 'exhaust-nozzle': target = lit ? T01 + 0.80 * (Tg - T01) : T02; break;
          case 'test-stand': target = T01 + 0.01 * (this.gasT(240) - T01); break;
        }
        if (this.N < 800 && !lit) target = T01 + (target - T01) * 0.3;
        // spread heat along the part (cheap conduction) so profiles stay smooth
        arr[k] += (target - arr[k]) * a;
      }
      for (let k = 1; k < THERMAL_SAMPLES - 1; k++) arr[k] += 0.04 * (arr[k - 1] + arr[k + 1] - 2 * arr[k]);
    }
    // liner damage (illustrative)
    const ft = this.temps['flame-tube'];
    if (ft) {
      const Tmax = LINERS[this.liner].Tmax;
      let peak = 0; for (const v of ft) peak = Math.max(peak, v);
      if (peak > Tmax - 100) {
        const over = Math.min(1.5, (peak - (Tmax - 100)) / 100);
        this.linerDamage = Math.min(1, this.linerDamage + dt * over * over / 90);
        if (this.linerDamage >= 1 && !this._burned) { this._burned = true; this.note('Liner burn-through! Metal at ' + Math.round(peak - 273) + ' °C. Shut down and replace/upgrade the flame tube.', 'bad'); }
      }
    }
    // turbine wheel: creep life falls about 4x for every 25 K (Larson-Miller); an Inconel wheel lasts thousands of hours at 680 C
    if (!this.destroyed && !this.immortal) {
      const tw = this.temps['turbine-wheel'];
      let Tw = this.lit ? 0.8 * 0.5 * (g.T03 + g.T04) + 0.2 * g.T02 : 0;
      if (tw) { Tw = 0; for (const v of tw) Tw = Math.max(Tw, v); }
      if (Tw > 900) {
        this.wheelDamage = Math.min(1, this.wheelDamage + dt / (2.0e7 * Math.pow(4, -(Tw - 950) / 25)));
        if (this.wheelDamage >= 1) {
          this.destroyed = true; this.lit = false; this.phase = 'fault'; this.phaseT = 0; this.mf = 0; this.mfCmd = 0;
          this.note('TURBINE WHEEL FAILURE: the blades crept and ruptured at ' + Math.round(Tw - 273) + ' °C. A real engine would now throw metal. Press RESET.', 'bad');
        }
      }
    }
  }

  /** Per-part wall temperature (K) at normalised axial position 0..1 */
  tempAt(id, f) {
    const a = this.temps[id]; if (!a) return this.amb.T;
    const x = f * (THERMAL_SAMPLES - 1), i = Math.min(THERMAL_SAMPLES - 2, Math.max(0, Math.floor(x))), u = x - i;
    return a[i] * (1 - u) + a[i + 1] * u;
  }

  /** Everything the 3D view needs, in one object. */
  visual() {
    const g = this.gp, p = this.p;
    const T = (K) => K - 273.15;
    const rho = (P, Tk) => P / (R_AIR * Tk);
    const m = g.m, mg = g.mg;
    const c = g.comp;
    const rho02 = rho(g.P02, g.T02);
    const vAnn = (m * 0.78) / (rho02 * Math.PI * (48 ** 2 - 33 ** 2) * 1e-6);
    const vCanIn = (mg) / (rho(g.P03, g.T03) * Math.PI * (32.5 ** 2 - 17.5 ** 2) * 1e-6);
    const vNGV = mg / (rho(g.P03 * 0.8, g.T03) * 7.4e-4);
    const vTurb = mg / (rho(g.P04 * 1.05, g.T04 * 1.02) * Math.PI * (29.7 ** 2 - 21 ** 2) * 1e-6);
    return {
      N: this.N, lit: this.lit, phase: this.phase, mf: this.mf,
      fuelFrac: Math.min(1.3, this.mf / Math.max(1e-6, this.ffFuel(this.maxRpm))),
      mdot: m, thrust: g.thrust, T: { T01: this.amb.T, T02: g.T02, T03: g.T03, T04: g.T04, T5: g.T5 },
      v: {
        in: Math.max(5, c.Cm1 || 20), imp: Math.hypot(c.Cm2 || 0, c.Ctheta2 || 0) || 10,
        diff: 0.45 * (Math.hypot(c.Cm2 || 0, c.Ctheta2 || 0) || 10), ann: Math.max(2, vAnn), can: Math.max(3, vCanIn),
        ngv: Math.max(5, vNGV), turb: Math.max(5, vTurb), noz: Math.max(5, g.Ve),
      },
      nozChoked: g.nozChoked, pr04: g.P04 / this.amb.P, starter: this.starter, ignition: this.ignition,
      surge: this.surgeT > 0.05, surgeMod: this.surgeMod, wheelDamage: this.wheelDamage, destroyed: this.destroyed, surgePhase: this.surgePhase % 1, linerDamage: this.linerDamage, T04C: T(g.T04), T03C: T(g.T03),
      // the thrust calculation, term by term (what the HUD prints)
      thrustCalc: {
        F: this.thrust, mg: g.mg, Ve: g.Ve, mom: g.thrustParts.mom, press: g.thrustParts.press, ram: g.thrustParts.ram,
        V0: this.V0, A5: p.A5, Pe: g.Pe, P0: this.amb.P, choked: g.nozChoked, Mexit: g.Mexit, meas: this.thrustMeas,
      },
      phi: g.phi, etaB: g.etaB,
    };
  }

  /** net thrust [N], including the pulsing of a surging compressor */
  get thrust() { return this.gp ? this.gp.thrust * this.surgeMod : 0; }
  /** compressor pressure ratio, including surge pulsing */
  get PR() { return this.gp ? 1 + (this.gp.PRc - 1) * this.surgeMod : 1; }
}
const avg = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
