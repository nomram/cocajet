// Pre-run checklist, remembered in this browser only.
import { h, shell } from '../ui.js';

const GROUPS = [
  ['The site', ['Outdoors, open ground, nothing flammable within 10 m; no roof, no wind blowing exhaust onto you', 'Exhaust points at open space; nothing (people, pets, cars) within 30 m of the jet line or the wheel planes', 'Stand bolted to a heavy base; the engine cannot walk or tip over', 'Fire extinguisher (CO₂ or dry powder) within reach, and a bucket of water or sand', 'A phone and a second person who knows the shut-down procedure']],
  ['People & protection', ['Hearing: plugs <em>and</em> muffs on everyone within 30 m', 'Face shield or safety glasses; no loose clothing, hair tied back, no gloves near the intake', 'Everyone stands behind a barrier and outside the ±15° wheel planes', 'Spectators briefed on where not to stand: nobody walks behind the engine while it runs']],
  ['Fuel & gas', ['Hoses and fittings leak-tested with soapy water, outdoors, before every session', 'Cylinder upright, 3+ m away, behind the engine and off the axis', 'Fail-closed solenoid valve fitted; regulator set; no naked flame near gas', 'A flame/flashback arrestor in the line']],
  ['The engine', ['Rotor spins freely by hand, no rub, no end-play', 'Both wheels balanced and inspected; no cracks, no bent blades', 'Bearings oiled; tip clearances checked with a feeler gauge', 'All flange bolts tight, studs in good condition, gasket seated', 'Intake clear (no rag, no gloves, no debris); nozzle clear', 'Flame tube inspected: holes clear, no burn-through, no distortion']],
  ['Controls & emergencies', ['Thermocouple (EGT) and tachometer read sensible values with the starter on', 'Emergency <strong>fuel-cut switch</strong> within arm’s reach and tested', 'Shut-down plan: close the gas valve, keep the starter running to cool, stay away until EGT &lt; 100 °C', 'I know what a wet start, hot start and surge look like and have a response ready']],
];
const KEY = 'cj-checklist-v1';
export default function init(el) {
  const { body } = shell(el, { title: 'Pre-run checklist', badge: 'Safety', note: 'Your ticks are saved only in this browser. The checklist is not exhaustive: it is the minimum, not the guarantee.' });
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* private mode */ }
  const status = h('div', { style: { padding: '10px 14px', borderRadius: '10px', fontWeight: 800, margin: '0 0 12px' } });
  const bar = h('div', { class: 'dmg' }, h('i', {})); body.append(status, bar);
  const boxes = [];
  GROUPS.forEach(([title, items], gi) => {
    body.append(h('h4', { style: { margin: '14px 0 6px' } }, title));
    items.forEach((t, i) => {
      const id = gi + '-' + i, input = h('input', { type: 'checkbox' }); input.checked = !!saved[id];
      input.addEventListener('change', () => { saved[id] = input.checked; try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* ignore */ } upd(); });
      boxes.push(input); body.append(h('label', { class: 'tgl', style: { margin: '4px 0', alignItems: 'flex-start' } }, input, h('span', { html: t })));
    });
  });
  body.append(h('div', { class: 'btn-row', style: { marginTop: '14px' } }, h('button', { class: 'btn small', type: 'button', onclick: () => { boxes.forEach(b => { b.checked = false; }); saved = {}; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } upd(); } }, 'Clear all')));
  function upd() {
    const n = boxes.filter(b => b.checked).length, all = n === boxes.length;
    status.textContent = all ? '✔ All checks done: you are ready to consider a run (with a second person present).' : `${n} / ${boxes.length} checks done. Do not start the engine until every box is ticked.`;
    status.style.background = all ? 'color-mix(in srgb, var(--ok) 15%, var(--panel))' : 'color-mix(in srgb, var(--bad) 10%, var(--panel))'; status.style.color = all ? 'var(--ok)' : 'var(--bad)'; status.style.border = '1px solid ' + (all ? 'var(--ok)' : 'var(--bad)');
    bar.firstChild.style.width = (n / boxes.length * 100) + '%';
  }
  upd();
}
