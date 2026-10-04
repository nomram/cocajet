// Scenario regression tests for the engine simulator (Node):  node tools/test-sim.mjs
import { EngineSim } from '../js/engine-sim.js';
import { CJ1 } from '../js/engine-model.js';
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fails++; };
const fmt = (s) => `t=${s.t.toFixed(0)}s ${s.phase} N=${s.N.toFixed(0)} F=${s.thrust.toFixed(1)} N EGT=${(s.gp.T04 - 273).toFixed(0)}C mf=${(s.mf * 1e3).toFixed(2)}`;
function until(s, cond, tmax = 120, dt = 0.02) { const t0 = s.t; while (!cond(s) && s.t - t0 < tmax) s.step(dt); return cond(s); }
function sc(name, fn) { console.log('\n' + name); fn(); }

sc('auto start to full power', () => {
  const s = new EngineSim(); s.start(); s.setThrottle(1);
  ok(until(s, x => x.phase === 'run', 40), 'reaches idle within 40 s (' + fmt(s) + ')');
  const tIdle = s.t; let peakEGT = 0; ok(until(s, x => { peakEGT = Math.max(peakEGT, x.gp.T04); return x.N > 114000; }, 40), 'reaches 114k rpm within 40 s of idle (' + fmt(s) + ')');
  ok(tIdle > 7 && tIdle < 25, 'idle reached after a realistic ' + tIdle.toFixed(1) + ' s');
  ok(peakEGT < 1100, 'peak EGT ' + (peakEGT - 273).toFixed(0) + ' °C stays below 830 °C');
  s.step(10); ok(Math.abs(s.thrust - 58) < 1.5 && Math.abs(s.N - 115000) < 400, 'steady full power: ' + fmt(s));
  // steady stability: rpm must not hunt
  let lo = 1e9, hi = 0; for (let i = 0; i < 400; i++) { s.step(0.02); lo = Math.min(lo, s.N); hi = Math.max(hi, s.N); }
  ok(hi - lo < 300, 'rpm steady within ' + (hi - lo).toFixed(0) + ' rpm (no hunting)');
  s.setThrottle(0); until(s, x => x.N < 52000, 40); ok(s.phase === 'run' && s.lit, 'throttle chop does not blow the flame out (' + fmt(s) + ')');
  s.stop(); ok(until(s, x => x.phase === 'off', 900, 0.1), 'cool-down completes');
});
sc('hot start (manual, 0.9 g/s at 25 000 rpm)', () => {
  const s = new EngineSim(); s.setMode('manual'); s.manual.starter = true; until(s, x => x.N > 25000, 30);
  s.manual.ignition = true; s.manual.fuel = 0.9; let peak = 0; until(s, x => { peak = Math.max(peak, x.gp.T04); return x.t > 12; }, 20);
  ok(s.lit || peak > 1000, 'lights or overheats'); ok(peak > 1150, 'EGT spikes to ' + (peak - 273).toFixed(0) + ' °C (> 880 °C)');
});
sc('wet start (3 g/s at 22 000 rpm)', () => {
  const s = new EngineSim(); s.setMode('manual'); s.manual.starter = true; until(s, x => x.N > 22000, 30);
  s.manual.ignition = true; s.manual.fuel = 3; until(s, x => x.t > 12, 20); ok(!s.lit, 'too rich: does not light');
});
sc('lean flame-out at full power', () => {
  const s = new EngineSim(); s.start(); s.setThrottle(1); until(s, x => x.N > 112000, 60);
  s.setMode('manual'); s.manual.fuel = 0.5; s.manual.starter = false; until(s, x => !x.lit, 10); ok(!s.lit, 'flame goes out when fuel is cut to 0.5 g/s');
});
function block(f, limiter, T = 80, immortal = false) {
  const s = new EngineSim(); s.immortal = immortal; s.egtLimit = limiter ? 1110 : 1e9; s.start(); s.setThrottle(1); until(s, x => x.N > 114000, 60); s.step(6);
  let surged = false, peak = 0;
  for (let i = 0; i < T * 5; i++) { s.setFault({ A5: 1.119e-3 * (1 - (1 - f) * Math.min(1, i / 100)) }); for (let k = 0; k < 10; k++) { s.step(0.02); peak = Math.max(peak, s.gp.T04); if (s.surgeT > 0.05) surged = true; } }
  return { s, surged, peak };
}
sc('nozzle 20 % blocked, ECU limiter ON: EGT is held, thrust is traded away', () => {
  const { s, peak, surged } = block(0.8, true); console.log('   ', fmt(s));
  ok(peak < 1223 && !surged, 'peak EGT ' + (peak - 273).toFixed(0) + ' °C, no surge'); ok(s.lit && s.N > 60000, 'engine still running at ' + s.N.toFixed(0) + ' rpm');
});
sc('nozzle 40 % blocked, ECU limiter OFF, indestructible wheel: repeated surge', () => {
  const { s, peak, surged } = block(0.6, false, 80, true); console.log('   ', fmt(s), 'surge cycles', s.surgeCycles);
  ok(peak > 1400, 'EGT reaches ' + (peak - 273).toFixed(0) + ' °C'); ok(surged && s.surgeCycles >= 3, 'compressor surges repeatedly (' + s.surgeCycles + ' cycles)');
});
sc('same, but a real Inconel wheel: it creeps and ruptures', () => {
  const { s } = block(0.6, false, 80, false); console.log('   ', fmt(s)); ok(s.destroyed && !s.lit, 'turbine wheel failure stops the engine');
});
sc('Coke-can liner burns through at full power', () => {
  const s = new EngineSim(); s.setParts && 0; s.start(); s.setThrottle(1);
  // thermal model needs part metadata
  const parts = [['flame-tube', 71.75, 165], ['turbine-wheel', 179, 190], ['ngv', 165.6, 179.3], ['exhaust-nozzle', 191, 255], ['turbine-casing', 169, 195], ['combustor-casing', 60, 169], ['impeller', 10, 50], ['shaft', 26, 194], ['bearing-tunnel', 50, 171], ['diffuser-plate', 35, 50], ['compressor-housing', 0, 60], ['fuel-ring', 62, 91], ['igniter', 83, 97]];
  s.setParts(parts.map(([id, a, b]) => ({ id, bbox: { min: [0, 0, a], max: [0, 0, b] }, material: 'x' })));
  until(s, x => x.linerDamage >= 1 || x.t > 900, 900, 0.05);
  ok(s.linerDamage >= 1, 'aluminium liner burns through (' + s.t.toFixed(0) + ' s at full power)');
});
sc('propane bottle freeze-off on a long full-power run', () => {
  const s = new EngineSim(); s.start(); s.setThrottle(1); let starvedAt = null;
  until(s, x => { if (x.starved && starvedAt == null) starvedAt = x.t; return x.starved || x.t > 900; }, 900, 0.05);
  ok(starvedAt != null && starvedAt > 150 && starvedAt < 700, 'fuel starvation after ' + (starvedAt ? starvedAt.toFixed(0) : 'never') + ' s (bottle ' + (s.fuelSys.Tb - 273.15).toFixed(0) + ' °C, ' + (s.fuelSys.bottlePressure / 1e5).toFixed(1) + ' bar)');
});
console.log(fails ? `\n${fails} FAILED` : '\nall scenarios passed');
process.exit(fails ? 1 : 0);
