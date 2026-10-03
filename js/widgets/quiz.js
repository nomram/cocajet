// Generic self-check quiz. Content lives in a <script type="application/json"> child of the host element:
//   [{"q":"…","o":["a","b","c"],"a":1,"why":"…"}, …]
import { h, shell } from '../ui.js';

export default function init(el) {
  const data = JSON.parse(el.querySelector('script[type="application/json"]').textContent);
  const { body } = shell(el, { title: 'Check yourself', badge: 'Quiz' });
  let score = 0, answered = 0;
  const tally = h('div', { style: { fontSize: '.86rem', color: 'var(--muted)', marginTop: '10px' } }, `0 / ${data.length} answered`);
  data.forEach((it, qi) => {
    const fb = h('div', { style: { fontSize: '.86rem', margin: '6px 0 0', color: 'var(--text-2)', display: 'none' }, html: '' });
    const opts = h('div', { style: { display: 'grid', gap: '6px' } });
    it.o.forEach((txt, oi) => {
      const b = h('button', { class: 'btn', type: 'button', style: { justifyContent: 'flex-start', textAlign: 'left' }, html: txt });
      b.addEventListener('click', () => {
        if (opts.dataset.done) return; opts.dataset.done = '1'; answered++;
        const ok = oi === it.a; if (ok) score++;
        b.classList.add(ok ? 'primary' : 'fire');
        if (!ok) opts.children[it.a].classList.add('primary');
        fb.style.display = 'block'; fb.innerHTML = (ok ? '<b style="color:var(--ok)">Correct.</b> ' : '<b style="color:var(--bad)">Not quite.</b> ') + (it.why || '');
        tally.textContent = `${score} / ${data.length} correct · ${answered} answered`;
        if (window.renderMath) window.renderMath(fb);
      });
      opts.append(b);
    });
    body.append(h('div', { style: { margin: qi ? '16px 0 0' : '0' } }, h('div', { style: { fontWeight: 700, margin: '0 0 8px' }, html: `${qi + 1}. ${it.q}` }), opts, fb));
  });
  body.append(tally);
}
