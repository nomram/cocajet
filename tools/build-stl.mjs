// Parametric generator for the CJ-1 "Coke-can" turbojet.
//   node build-stl.mjs            -> ../models/*.stl  + ../models/manifest.json
//
// Every number below is a real dimension used in the guide (millimetres).
// Axis = +Z (flow direction), up = +Y.  Rotor spins about +Z.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Manifold, CrossSection, deg, revolve, thickPolyline, arc, radialCylinder, polarArray, unionAll, tube,
  bladeSection, radialBlade, meshStats, writeBinarySTL, ccw,
} from './lib/geom.mjs';
import { impellerBlade, meridional } from './lib/impeller.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'models');
fs.mkdirSync(outDir, { recursive: true });

const SEG = 112;               // facets around the axis
const hi = (n) => Math.max(8, Math.round(n));

/* ====================================================================================
   Master parameter table  (also exported to models/manifest.json -> shown in the guide)
   ==================================================================================== */
export const P = {
  // --- compressor ------------------------------------------------------------------
  zE: 24,           // z of the inducer plane
  R2: 28,           // impeller exducer radius  (56 mm wheel)
  rs1: 21,          // inducer tip radius       (42 mm)
  rh1: 6,           // inducer hub radius       (12 mm)
  Lax: 17,          // axial length of the wheel
  b2: 6,            // exducer blade height
  beta1s: 66,       // blade angle at inducer tip   (from axial)
  beta2: 30,        // backsweep at exit            (from radial)
  nFull: 7, nSplit: 7,
  tRoot: 1.0, tTip: 0.55, embed: 0.7, clearance: 0.4,
  bore: 4,          // shaft radius
  // --- static structure --------------------------------------------------------------
  shell: 2.0,       // sheet / casting thickness
  rCasIn: 48, rCasOut: 50,
  zFrontWall: 34.6, zPlateFront: 41, zPlateRear: 50,
  zCasFront: 60, zCasRear: 165,
  // --- combustor ---------------------------------------------------------------------
  rCanOut: 33, rCanIn: 17, canWall: 0.5,
  zDome: 72, domeDepth: 6, zCanRear: 165,
  // --- turbine -----------------------------------------------------------------------
  rTurbHub: 21, rTurbTip: 29.7, rTurbCase: 30.1,
  nNGV: 16, nRotor: 19,
  zRotor: 184.6, zShaftRear: 194,
  // --- nozzle ------------------------------------------------------------------------
  zNozzle0: 195, zNozzleEnd: 255, rNozzleExit: 20.5, rConeEnd: 8,
};

const MATERIALS = {
  al:     { name: 'Aluminium (6061 / A356)', density: 2700 },
  can:    { name: 'Aluminium can (3004-H19)', density: 2730 },
  steel:  { name: 'Mild / alloy steel',       density: 7850 },
  ss304:  { name: 'Stainless 304 / 321',      density: 7900 },
  ss310:  { name: 'Stainless 310S',           density: 7900 },
  inco:   { name: 'Inconel 718 / 625',        density: 8200 },
  ceramic:{ name: 'Alumina + brass/steel',    density: 3900 },
};

const parts = [];       // {id, file, name, ... manifold}
function addPart(def) { parts.push(def); }

/* ====================================================================================
   Helper: closed shell around a flow passage
   passage : polygon of (r,z) points describing the *cavity* (must include the axis side, i.e. start/end at r=0)
   ==================================================================================== */
function shellAround(passage, thick, zMin, zMax, rMax = 120) {
  const cav = CrossSection.ofPolygons([ccw(passage)]);
  const grown = cav.offset(thick, 'Round', 2, 24);
  const box = CrossSection.square([rMax, zMax - zMin], false).translate([0, zMin]);
  const shell = grown.intersect(box).subtract(cav);
  return Manifold.revolve(shell, SEG);
}

function boltHoles(n, rBolt, rHole, z0, z1, phase = 0) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const a = phase + 360 * i / n;
    arr.push(Manifold.cylinder(z1 - z0, rHole, rHole, 14, false)
      .translate([rBolt, 0, z0]).rotate([0, 0, a]));
  }
  return unionAll(arr);
}

/* ====================================================================================
   01  SHAFT  (Ø8 steel with hex nut)
   ==================================================================================== */
{
  const shaft = tube(P.bore, 0, 26, P.zShaftRear, 48);
  const nut = Manifold.cylinder(4, 6.8, 6.8, 6, false).translate([0, 0, P.zShaftRear - 4]);
  // small shoulder under the nut + chamfer-ish step at front
  const m = unionAll([shaft, nut]);
  addPart({ id: 'shaft', name: 'Main shaft + lock nut', step: 1, material: 'steel', color: '#b9c0c8', rotor: true, m,
    note: 'Ø8 mm hardened steel rod (e.g. ground drill-rod or a 8 mm pin gauge), ~168 mm. M8 nut shown at the hot end.' });
}

/* ====================================================================================
   02  BEARING TUNNEL  (the "spine": tube, front flange, rear plate)
   ==================================================================================== */
{
  const prof = [
    [8, P.zPlateRear], [26, P.zPlateRear], [26, P.zPlateRear + 4], [14, P.zPlateRear + 4], [14, 167],
    [17, 167], [17, 171], [8, 171],
  ];
  let m = revolve(prof, SEG);
  // bearing seat steps: slightly larger bore at both ends (Ø16 bearing, Ø14 relief between)
  const relief = tube(7, 0, P.zPlateRear + 9, 162, 64).subtract(tube(0, 0, 0, 0, 3).translate([0, 0, 0]));
  m = m.subtract(tube(7.4, 0, P.zPlateRear + 8, 163, 64));
  // bolt holes in flange
  m = m.subtract(boltHoles(6, 20, 1.7, P.zPlateRear - 1, P.zPlateRear + 5, 15));
  addPart({ id: 'bearing-tunnel', name: 'Bearing tunnel (spine)', step: 1, material: 'ss304', color: '#9aa4ad', m,
    note: 'Ø28 × Ø16 steel tube with a bolt-on front flange. Two 8×16×5 bearings press into the ends.' });
}

/* ====================================================================================
   03  IMPELLER  (centrifugal compressor wheel, 7 + 7 backswept blades)
   ==================================================================================== */
{
  const { hub } = meridional(P);
  const zE = P.zE;
  // nose ogive from the axis to the eye
  const nose = [];
  const noseLen = 14, rEye = P.rh1;
  for (let i = 0; i <= 12; i++) {
    const a = (Math.PI / 2) * (1 - i / 12);                       // 90deg -> 0
    nose.push([rEye * Math.cos(a), zE - noseLen + noseLen * Math.sin(Math.PI / 2 * (i / 12) * 1.0) * 0 + (noseLen) * (1 - Math.sin(a))]);
  }
  // nose polyline from (0, zE-noseLen) to (rEye, zE)   (elliptical)
  const nosePts = [];
  for (let i = 0; i <= 14; i++) {
    const t = (Math.PI / 2) * i / 14;
    nosePts.push([rEye * Math.sin(t), zE - noseLen * Math.cos(t)]);
  }
  const hubPts = [];
  for (let i = 1; i <= 24; i++) { const h = hub(i / 24); hubPts.push([h.r, h.z]); }
  const back = [
    [P.R2, zE + P.Lax + 3.5], [20, zE + P.Lax + 4.0], [12, zE + P.Lax + 5.0], [9, zE + P.Lax + 5.6],
    [9, zE + 26], [P.bore, zE + 26], [P.bore, zE - 6], [0, zE - 6],
  ];
  const poly = [...nosePts, ...hubPts, ...back];
  let body = revolve(poly, SEG);
  const blades = [];
  const pitch = (2 * Math.PI) / P.nFull;
  for (let i = 0; i < P.nFull; i++) blades.push(impellerBlade(P, { sStart: 0, phase: i * pitch }));
  for (let i = 0; i < P.nSplit; i++) blades.push(impellerBlade(P, { sStart: 0.42, phase: (i + 0.5) * pitch }));
  const m = unionAll([body, ...blades]);
  addPart({ id: 'impeller', name: 'Compressor impeller', step: 2, material: 'al', color: '#c9d1d9', rotor: true, m,
    note: '56 mm exducer, 7 full + 7 splitter blades, 30° backsweep. Use a scrap-turbo compressor wheel or CNC/cast this shape.' });
}

/* ====================================================================================
   04  DIFFUSER PLATE  (static back wall + 15 vanes)
   ==================================================================================== */
{
  const zf = P.zPlateFront, zr = P.zPlateRear;
  const prof = [[9.5, zr - 3], [28.6, zr - 3], [28.6, zf], [42, zf], [42, zr], [9.5, zr]];
  let m = revolve(prof, SEG);
  m = m.subtract(boltHoles(6, 20, 1.7, zr - 1, zr + 5, 15)).add(Manifold.cube([0.001, 0.001, 0.001]).translate([0, 0, 0])).subtract(Manifold.cube([0.001, 0.001, 0.001]).translate([0, 0, 0]));
  // vanes: logarithmic-spiral strips extruded between plate and front wall
  const nV = 15, rIn = 30, rOut = 41, vz0 = P.zFrontWall + 0.25, hV = P.zPlateFront - vz0 + 0.4;
  const vane = (() => {
    const pts = [];
    const steps = 14, ang = 62 * deg;                       // tangential angle from radial
    for (let i = 0; i <= steps; i++) {
      const r = rIn + (rOut - rIn) * i / steps;
      const th = Math.tan(ang) * Math.log(r / rIn) * -1;    // sweeps against rotation
      pts.push([r * Math.cos(th), r * Math.sin(th)]);
    }
    const thick = (i, n) => 0.7 + 0.9 * Math.sin(Math.PI * Math.min(1, (i + 1) / (n * 0.6)) / 2) * (1 - 0.5 * i / n);
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 1)], p2 = pts[Math.min(pts.length - 1, i + 1)];
      let tx = p2[0] - p0[0], ty = p2[1] - p0[1]; const L = Math.hypot(tx, ty); tx /= L; ty /= L;
      const t = thick(i, pts.length);
      left.push([pts[i][0] - ty * t / 2, pts[i][1] + tx * t / 2]);
      right.push([pts[i][0] + ty * t / 2, pts[i][1] - tx * t / 2]);
    }
    const poly = left.concat(right.reverse());
    return Manifold.extrude(CrossSection.ofPolygons([ccw(poly)]), hV).translate([0, 0, vz0]);
  })();
  // vane height overlaps 0.4 into plate for a clean union; front is free to touch the housing wall.
  const vanes = polarArray(vane.translate([0, 0, 0]), nV, 0);
  m = unionAll([m, ...vanes]);
  addPart({ id: 'diffuser-plate', name: 'Diffuser back-plate + vanes', step: 3, material: 'al', color: '#aeb8c2', m,
    note: '15 curved vanes slow the air from ~300 m/s to ~120 m/s and turn kinetic energy into pressure.' });
}

/* ====================================================================================
   05  COMPRESSOR HOUSING  (bellmouth + shroud + bend)
   ==================================================================================== */
{
  const pass = [[0, -6], [37, -6], [37, 0]];
  // bellmouth: quarter ellipse from (37,0) to (21.4,14)
  for (let i = 1; i <= 16; i++) { const t = (Math.PI / 2) * i / 16; pass.push([37 - 15.6 * Math.sin(t), 14 - 14 * Math.cos(t)]); }
  pass.push([21.4, 24]);
  for (let i = 1; i <= 20; i++) {
    const t = (Math.PI / 2) * i / 20;
    pass.push([28.4 - 7 * Math.cos(t), 24 + 10.6 * Math.sin(t)]);
  }
  pass.push([40, 34.6]);
  for (let i = 1; i <= 14; i++) { const t = (Math.PI / 2) * i / 14; pass.push([40 + 8 * Math.sin(t), 42.6 - 8 * Math.cos(t)]); }
  pass.push([48, 70], [0, 70]);
  let m = shellAround(pass, P.shell, 0, 60);
  // flange
  const fl = revolve([[48, 57], [57, 57], [57, 60], [48, 60]], SEG);
  m = unionAll([m, fl]).subtract(boltHoles(8, 53, 2.25, 56, 61, 22.5));
  addPart({ id: 'compressor-housing', name: 'Inlet bellmouth + compressor housing', step: 4, material: 'al', color: '#d3dae0', m,
    note: 'Spun / hand-beaten aluminium or a 3D-printed pattern for casting. 0.4 mm gap over the blade tips.' });
}

/* ====================================================================================
   06  COMBUSTOR CASING  (pressure vessel)
   ==================================================================================== */
{
  const zc0 = P.zCasFront, zc1 = P.zCasRear + 4;
  const shell = revolve([[P.rCasIn, zc0], [P.rCasOut, zc0], [P.rCasOut, zc1], [P.rCasIn, zc1]], SEG);
  const flF = revolve([[P.rCasIn, zc0], [57, zc0], [57, zc0 + 3], [P.rCasIn, zc0 + 3]], SEG);
  const flR = revolve([[P.rCasIn, zc1 - 3], [57, zc1 - 3], [57, zc1], [P.rCasIn, zc1]], SEG);
  const endPlate = revolve([[34.4, zc1 - 3], [P.rCasIn + 0.5, zc1 - 3], [P.rCasIn + 0.5, zc1], [34.4, zc1]], SEG);
  // fuel port (angle 0) and igniter port (angle 90): bosses then holes
  const bossFuel = radialCylinder(P.rCasIn, 56, 5.0, 67.5, 0, 28);
  const bossIgn = radialCylinder(P.rCasIn, 57, 9.5, 90, 90, 40);
  let m = unionAll([shell, flF, flR, endPlate, bossFuel, bossIgn]);
  m = m.subtract(radialCylinder(P.rCasIn - 3, 60, 3.3, 67.5, 0, 24))
       .subtract(radialCylinder(P.rCasIn - 3, 60, 5.2, 90, 90, 32));
  m = m.subtract(boltHoles(8, 53, 2.25, zc0 - 1, zc0 + 4, 22.5)).subtract(boltHoles(8, 53, 2.25, zc1 - 4, zc1 + 1, 22.5));
  addPart({ id: 'combustor-casing', name: 'Combustor casing (pressure vessel)', step: 5, material: 'ss304', color: '#8e99a3', m,
    note: 'Ø100 × 2 mm stainless pipe, 105 mm long, with welded flanges and two ports (fuel + igniter).' });
}

/* ====================================================================================
   07  FLAME TUBE  (annular liner made from a Coke can + inner tube)
   ==================================================================================== */
{
  const rO = P.rCanOut, rI = P.rCanIn, t = P.canWall, zD = P.zDome, dd = P.domeDepth, zR = P.zCanRear;
  const zw = zD + dd;                      // where straight walls start
  // centre-line of the U: inner wall rear -> inner wall front -> dome arc -> outer wall front -> outer wall rear
  const rc = (rO + rI) / 2, half = (rO - rI) / 2;
  const mid = [];
  mid.push([rI - t / 2, zR]);
  mid.push([rI - t / 2, zw]);
  for (let i = 1; i < 16; i++) {                                    // semi-ellipse dome
    const a = Math.PI * i / 16;
    mid.push([rc - (half - t / 2) * Math.cos(a), zw - dd * Math.sin(a)]);
  }
  mid.push([rO + t / 2 - t, zw]);
  mid.push([rO + t / 2 - t, zR]);
  const poly = thickPolyline(mid, t);
  let m = revolve(poly, SEG);
  // hole rows  [z, nHoles, Ø_outer, Ø_inner, phase]
  const rows = [
    ['primary',   88, 8, 5.5, 4.5, 0],
    ['secondary', 112, 8, 6.5, 5.0, 22.5],
    ['dilution',  142, 8, 8.0, 6.5, 0],
  ];
  const cutters = [];
  for (const [, z, n, dOut, dIn, ph] of rows) {
    for (let i = 0; i < n; i++) {
      const a = ph + 360 * i / n;
      cutters.push(radialCylinder(rO - 3, rO + 2, dOut / 2, z, a, 20));
      cutters.push(radialCylinder(rI - 2, rI + 3, dIn / 2, z, a + 180 / n, 20));
    }
  }
  // dome: 8 lance holes (Ø6) + 16 small cooling holes
  for (let i = 0; i < 8; i++) {
    const a = 22.5 + 45 * i, r = rc;
    cutters.push(Manifold.cylinder(14, 3.0, 3.0, 20, true).translate([r * Math.cos(a * deg), r * Math.sin(a * deg), zD + 2]));
  }
  for (let i = 0; i < 16; i++) {
    const a = 11.25 + 22.5 * i, r = rc;
    cutters.push(Manifold.cylinder(14, 1.0, 1.0, 12, true).translate([(r - 5) * Math.cos(a * deg), (r - 5) * Math.sin(a * deg), zD + 2.5]));
    cutters.push(Manifold.cylinder(14, 1.0, 1.0, 12, true).translate([(r + 5) * Math.cos((a + 11) * deg), (r + 5) * Math.sin((a + 11) * deg), zD + 2.5]));
  }
  // igniter hole in the outer wall (angle 90, z=90)
  cutters.push(radialCylinder(rO - 3, rO + 2, 5.3, 90, 90, 32));
  m = m.subtract(unionAll(cutters));
  addPart({ id: 'flame-tube', name: 'Flame tube (Coke-can annular liner)', step: 6, material: 'can', color: '#d94b3d', m,
    note: 'Outer wall = a Coke can (Ø66) with the ends cut off; inner wall = Ø35 tube. Holes drilled in 3 rows: primary / secondary / dilution.' });
  P._holeRows = rows;
}

/* ====================================================================================
   08  FUEL RING + 8 LANCES, and 09 IGNITER
   ==================================================================================== */
{
  const zr = 67.5, Rm = 25, ro = 2.6, ri = 1.6;
  const ringCS = (r) => CrossSection.circle(r, 24).translate([Rm, 0]);
  const torus = (r) => Manifold.revolve(ringCS(r), 72).translate([0, 0, 0]);
  let ring = torus(ro).subtract(torus(ri)).translate([0, 0, zr]);
  // lances: hollow tubes from ring forward through the dome holes
  const lanceOuter = 2.0, lanceInner = 1.2;
  const lances = [];
  for (let i = 0; i < 8; i++) {
    const a = (22.5 + 45 * i) * deg;
    const o = Manifold.cylinder(24, lanceOuter, lanceOuter, 16, false).translate([Rm * Math.cos(a), Rm * Math.sin(a), zr]);
    lances.push(o);
  }
  // feed pipe at angle 0 : from the ring out through the casing
  const feed = radialCylinder(Rm, 66, 3.0, zr, 0, 20);
  const feedBore = radialCylinder(Rm - 1, 67, 1.9, zr, 0, 16);
  const union = unionAll([ring, ...lances, feed]);
  let m = union;
  // bores
  const bores = [feedBore];
  for (let i = 0; i < 8; i++) {
    const a = (22.5 + 45 * i) * deg;
    bores.push(Manifold.cylinder(25.5, lanceInner, lanceInner, 12, false).translate([Rm * Math.cos(a), Rm * Math.sin(a), zr]));
  }
  // re-cut the ring cavity so bores connect: ring is hollow already
  m = m.subtract(unionAll(bores));
  // swage fitting hex on the feed pipe
  const hex = Manifold.cylinder(6, 5.2, 5.2, 6, false).rotate([0, 90, 0]).translate([57, 0, zr]);
  m = unionAll([m, hex]);
  addPart({ id: 'fuel-ring', name: 'Fuel ring + 8 injector lances', step: 7, material: 'ss304', color: '#c58b3c', m,
    note: 'Ø5 stainless tube bent into a ring; eight short lances push the gas into the primary zone. Feed enters at the side.' });
}
{
  // igniter (spark/glow plug style) pointing +Y from r=29 outward
  const axial = [[0, 0], [4.9, 0], [4.9, 34.6], [3.9, 34.6], [3.9, 44], [1.6, 44], [1.6, 50], [0, 50]];
  const body = revolve(axial, 40);
  const hex = Manifold.cylinder(6, 8.2, 8.2, 6, false).translate([0, 0, 28.6]);
  let m = unionAll([body, hex]);
  // orient: local Z -> world +Y, tip at r = 29
  m = m.rotate([-90, 0, 0]).translate([0, 29, 90]);
  addPart({ id: 'igniter', name: 'Igniter (spark / glow plug)', step: 7, material: 'ceramic', color: '#e8e2d0', m,
    note: 'A cheap M10 glow plug or spark plug. The tip sits inside the primary zone through a hole in the can.' });
}

/* ====================================================================================
   10  NOZZLE GUIDE VANES  (ring with 16 vanes)
   ==================================================================================== */
{
  const t = 1.5;
  const flowInner = (z) => (z < 172 ? 17.5 + (21 - 17.5) * (z - 165) / 7 : 21);
  const flowOuter = (z) => (z < 172 ? 32.5 - (32.5 - 30) * (z - 165) / 7 : 30);
    const outer = thickPolyline([[flowOuter(165) + t / 2, 165], [flowOuter(172) + t / 2, 172], [flowOuter(179) + t / 2, 179]], t);
  const inner = thickPolyline([[flowInner(165) - t / 2, 165], [flowInner(172) - t / 2, 172], [flowInner(179) - t / 2, 179]], t);
  const clip = Manifold.cube([200, 200, 14], true).translate([0, 0, 165.6 + 7 - 0.0]);   // keep z in [165.6, 179.6]
  const rings = unionAll([revolve(outer, SEG), revolve(inner, SEG)]).intersect(clip);
  const sec = bladeSection({ chordLen: 9.6, tmax: 2.2, inletDeg: 0, exitDeg: 58 });
  const vane = radialBlade(sec, 30.8 - 20.2, 0, 1).translate([20.2, 0, 175]);
  const vanes = polarArray(vane, P.nNGV, 0);
  const m = unionAll([rings, ...vanes]);
  addPart({ id: 'ngv', name: 'Nozzle guide vane ring (16 vanes)', step: 8, material: 'ss310', color: '#a46b3a', m,
    note: 'Accelerates the hot gas and swirls it 58° into the direction of rotation so the turbine blades can catch it.' });
}

/* ====================================================================================
   11  TURBINE WHEEL  (disc + 19 blades)
   ==================================================================================== */
{
  const zc = P.zRotor;
  const prof = [
    [P.bore, zc - 5.6], [9.5, zc - 5.6], [9.5, zc - 1.6], [19, zc - 1.6], [19, zc - 4.1], [21, zc - 4.1],
    [21, zc + 3.9], [19, zc + 3.9], [19, zc + 2.4], [9.5, zc + 2.4], [9.5, zc + 5.4], [P.bore, zc + 5.4],
  ];
  let disc = revolve(prof, SEG);
  const sec = bladeSection({ chordLen: 10.8, tmax: 1.9, inletDeg: 15, exitDeg: -60 });
  const h = P.rTurbTip - (P.rTurbHub - 1.5);
  const blade = radialBlade(sec, h, -10, 0.78).translate([P.rTurbHub - 1.5, 0, zc]);
  const blades = polarArray(blade, P.nRotor, 0);
  const m = unionAll([disc, ...blades]);
  addPart({ id: 'turbine-wheel', name: 'Axial turbine wheel (19 blades)', step: 8, material: 'inco', color: '#c97b2a', rotor: true, m,
    note: 'Laser/water-jet-cut disc with 19 twisted blades. Stainless 310 for a hobby build, Inconel 713/718 for hours of life.' });
}

/* ====================================================================================
   12  TURBINE CASING
   ==================================================================================== */
{
    // wall: bigger bore at the front (clearance for the NGV cone), 31.6 over the NGV cylinder, 30.1 over the rotor
  const wall = revolve([[33.2, 169], [35.5, 169], [35.5, 179.5], [32.5, 179.5], [32.5, 195], [30.1, 195], [30.1, 179.5],
    [31.6, 179.5], [31.6, 173], [33.2, 173]], SEG);
  const flF = revolve([[33.2, 169], [57, 169], [57, 173], [33.2, 173]], SEG);
  const flR = revolve([[30.1, 191], [44, 191], [44, 195], [30.1, 195]], SEG);
  let m = unionAll([wall, flF, flR]);
  m = m.subtract(boltHoles(8, 53, 2.25, 168, 174, 22.5)).subtract(boltHoles(6, 38, 2.0, 190, 196, 0));
  addPart({ id: 'turbine-casing', name: 'Turbine casing (shroud)', step: 9, material: 'ss310', color: '#7f8a94', m,
    note: 'Rolled / spun stainless. Inner Ø60.2 gives only 0.2–0.4 mm tip clearance over the turbine blades.' });
}

/* ====================================================================================
   13  EXHAUST NOZZLE + TAIL CONE + 3 STRUTS
   ==================================================================================== */
{
  const z0 = P.zNozzle0, z1 = P.zNozzleEnd;
  const rIn0 = 30.1, rIn1 = P.rNozzleExit;
  const cone = thickPolyline([[rIn0 + 0.75, z0], [rIn1 + 0.75, z1]], 1.5);
  const nozzle = revolve(cone, SEG).intersect(Manifold.cube([200, 200, 100], true).translate([0, 0, z0 + 50 + 0.01]));
  const flange = revolve([[30.1, z0], [44, z0], [44, z0 + 4], [30.1, z0 + 4]], SEG);
  // tail cone (hollow fairing)
  const tc = [];
  const zc0 = 191, zc1 = 252, rc0 = 21, rc1 = P.rConeEnd;
  for (let i = 0; i <= 20; i++) {
    const f = i / 20;
    tc.push([rc0 + (rc1 - rc0) * Math.pow(f, 1.15) * 1.0 - 0 * f, zc0 + (zc1 - zc0) * f]);
  }
  const tcOuter = thickPolyline(tc, 1.4);
  const cap = revolve([[0, zc1 - 1.4], [rc1, zc1 - 1.4], [rc1, zc1], [0, zc1]], 64);
  const cone2 = revolve(tcOuter, SEG);
  // struts
  const strutZ = 212, chord = 14;
  const rCone = (z) => rc0 + (rc1 - rc0) * Math.pow((z - zc0) / (zc1 - zc0), 1.15);
  const rNoz = (z) => rIn0 + (rIn1 - rIn0) * (z - z0) / (z1 - z0);
  const sec = bladeSection({ chordLen: chord, tmax: 1.6, inletDeg: 0, exitDeg: 0 });
  const strut = radialBlade(sec, rNoz(strutZ) + 1.5 - (rCone(strutZ) - 1.0), 0, 1).translate([rCone(strutZ) - 1.0, 0, strutZ]);
  const struts = polarArray(strut, 3, 90);
  const m = unionAll([nozzle, flange, cone2, cap, ...struts]).subtract(boltHoles(6, 38, 2.0, z0 - 1, z0 + 5, 0));
  addPart({ id: 'exhaust-nozzle', name: 'Exhaust nozzle + tail cone', step: 9, material: 'ss304', color: '#6f7a85', m,
    note: 'Convergent nozzle: exit annulus ≈ 1 100 mm². The cone hides the shaft nut and is held by three thin struts.' });
}

/* ====================================================================================
   14  TEST STAND
   ==================================================================================== */
{
  const plate = Manifold.cube([200, 8, 290], false).translate([-100, -70, -15]);
  const saddle = (z) => {
    const blk = Manifold.cube([120, 54, 18], false).translate([-60, -64, z]);
    const cut = Manifold.cylinder(30, 50.6, 50.6, 96, false).translate([0, 0, z - 6]);
    return blk.subtract(cut);
  };
  let m = unionAll([plate, saddle(102), saddle(128)]);
  // mounting slots / holes
  const holes = [];
  for (const [x, z] of [[-80, -5], [80, -5], [-80, 265], [80, 265], [-80, 130], [80, 130]]) {
    holes.push(Manifold.cylinder(12, 4.2, 4.2, 16, false).translate([x, -72, z]));
  }
  m = m.subtract(unionAll(holes));
  // straps
  for (const z of [102, 128]) {
    const strap = Manifold.cylinder(18, 53.4, 53.4, SEG, false).subtract(Manifold.cylinder(18, 50.6, 50.6, SEG, false))
      .intersect(Manifold.cube([140, 80, 18], false).translate([-70, 0, 0])).translate([0, 0, z]);
    const lugs = unionAll([-1, 1].map((sx) => Manifold.cube([14, 8, 18], false).translate([sx > 0 ? 50 : -64, -2, z])));
    m = unionAll([m, strap, lugs]);
  }
  addPart({ id: 'test-stand', name: 'Test stand + two saddle clamps', step: 10, material: 'steel', color: '#4c5560', m, stand: true,
    note: 'Welded steel plate with two saddles and straps. Bolt it to a heavy bench or the ground. NEVER hand-hold a running engine.' });
}

/* ====================================================================================
   Export
   ==================================================================================== */
const manifest = { generated: new Date().toISOString(), units: 'mm', axis: '+Z flow, +Y up, rotor spins about +Z', materials: MATERIALS, params: { ...P }, parts: [] };
delete manifest.params._holeRows;
manifest.params.holeRows = P._holeRows.map(([name, z, n, dOut, dIn, ph]) => ({ name, z, n, dOut, dIn, ph }));

let idx = 1;
const merged = [];
for (const p of parts) {
  const st = meshStats(p.m);
  const file = `${String(idx).padStart(2, '0')}-${p.id}.stl`;
  if (p.m.status() !== 'NoError') console.warn('!!', p.id, p.m.status());
  const nt = writeBinarySTL(p.m, path.join(outDir, file), `CJ-1 ${p.name}`);
  const mat = MATERIALS[p.material];
  const massG = (st.volume / 1000) * (mat.density / 1000);      // mm^3 -> cm^3 -> g
  manifest.parts.push({
    id: p.id, file, name: p.name, step: p.step, material: p.material, materialName: mat.name, color: p.color,
    rotor: !!p.rotor, stand: !!p.stand, note: p.note,
    tris: nt, volume_mm3: +st.volume.toFixed(1), area_mm2: +st.area.toFixed(1), mass_g: +massG.toFixed(1),
    bbox: { min: st.bbox.min.map((v) => +v.toFixed(2)), max: st.bbox.max.map((v) => +v.toFixed(2)) },
    genus: st.genus,
  });
  console.log(file.padEnd(32), String(nt).padStart(7), 'tris', ' vol', (st.volume / 1000).toFixed(1).padStart(8), 'cm3', ' mass', massG.toFixed(0).padStart(5), 'g', ' status', p.m.status(), ' genus', st.genus);
  if (!p.stand) merged.push(p.m);
  idx++;
}
// Assembly (everything except the stand) as one STL for quick viewing / fit checks
const asm = Manifold.compose(merged);
const ntA = writeBinarySTL(asm, path.join(outDir, '00-cj1-full-assembly.stl'), 'CJ-1 full assembly');
manifest.assembly = { file: '00-cj1-full-assembly.stl', tris: ntA };
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('assembly tris', ntA, ' total mass (no stand) g:', manifest.parts.filter(p => !p.stand).reduce((a, p) => a + p.mass_g, 0).toFixed(0));
// geometry facts used in the text
const A5 = Math.PI * (P.rNozzleExit ** 2 - P.rConeEnd ** 2);
console.log('Nozzle exit annulus area mm2:', A5.toFixed(0));
let aOut = 0, aIn = 0;
for (const [, , n, dOut, dIn] of P._holeRows) { aOut += n * Math.PI / 4 * dOut ** 2; aIn += n * Math.PI / 4 * dIn ** 2; }
console.log('Flame-tube hole area (outer, inner, total) mm2:', aOut.toFixed(0), aIn.toFixed(0), (aOut + aIn).toFixed(0));

/* ---- optional: pairwise interference check  (node build-stl.mjs --check) ---- */
if (process.argv.includes('--check')) {
  console.log('\nInterference check (volume of overlap, mm^3; >2 reported):');
  let bad = 0;
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    const v = a.m.intersect(b.m).volume();
    if (v > 2) { bad++; console.log(`  ${a.id.padEnd(20)} x ${b.id.padEnd(20)} ${v.toFixed(1)}`); }
  }
  console.log(bad ? `${bad} overlapping pair(s)` : 'no interferences');
}
