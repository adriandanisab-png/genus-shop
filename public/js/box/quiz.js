import { renderBoxChrome, escapeHtml } from './shared.js';

renderBoxChrome('quiz');

const KEY = 'genusBoxQuiz';
const Q = [
  { k: 'Metodă', multi: true, q: 'Cum îți prepari cafeaua de obicei?', o: [['V60 / filtru', 'Pour-over, Chemex'], ['Espresso', 'Mașină acasă'], ['AeroPress', 'Rapid, versatil'], ['Moka', 'Ibric italian']] },
  { k: 'Prăjire', multi: true, only: 'Nu știu încă', q: 'Ce gust îți place?', o: [['Fructat, luminos', 'Citrice, fructe roșii'], ['Echilibrat', 'Caramel, nuci'], ['Intens, ciocolatos', 'Corp plin'], ['Nu știu încă', 'Vrem să descoperim împreună']] },
  { k: 'Lapte', q: 'O bei cu lapte?', o: [['Neagră', 'Fără nimic'], ['Cu lapte', 'Flat white, cappuccino'], ['Și, și', 'Depinde de zi']] },
  { k: 'Cantitate', q: 'Câtă cafea bei pe săptămână?', o: [['1–4 cești', 'Ocazional'], ['5–10 cești', 'Zilnic, o cană'], ['10+ cești', 'Doi oameni sau mai mult']] },
  { k: 'Stil', q: 'Cât de aventuros vrei să fie?', o: [['Surprinde-mă', 'Origini și procese noi'], ['Pe gustul meu', 'Aproape de ce îmi place'], ['Un pic din ambele', 'O cafea nouă pe lună']] },
];

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let state = { step: 0, answers: {} };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && typeof s.step === 'number' && s.answers && typeof s.answers === 'object') {
    state = { step: Math.max(0, Math.min(Q.length, s.step | 0)), answers: s.answers };
  }
} catch { /* storage unavailable */ }

// Multi-choice questions store an array; older saved answers were single strings.
const picked = (x) => [].concat(state.answers[x.k] || []);
const hasAnswer = (x) => picked(x).length > 0;

function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }

function renderProfile() {
  $('profile').innerHTML = Q.map((x) =>
    `<div class="profile__row"><dt>${x.k}</dt><dd>${escapeHtml(picked(x).join(', ') || '—')}</dd></div>`).join('');
}

function renderProgress() {
  const pct = Math.round((Math.min(state.step, Q.length) / Q.length) * 100);
  $('progress').setAttribute('aria-valuenow', String(pct));
  $('progress-bar').style.width = pct + '%';
  $('eyebrow').textContent = state.step >= Q.length ? 'REZULTAT' : `ÎNTREBAREA ${state.step + 1} DIN ${Q.length}`;
}

function recommendation() {
  const few = state.answers['Cantitate'] === Q[3].o[0][0];
  return few ? { box: 'duo', freq: 2, name: 'Duo', freqText: 'la 2 luni' } : { box: 'trio', freq: 1, name: 'Trio', freqText: 'lunar' };
}

function renderStep() {
  const el = $('step');
  if (state.step >= Q.length) {
    const r = recommendation();
    const methods = picked(Q[0]);
    const method = methods.length ? new Intl.ListFormat('ro', { type: 'conjunction' }).format(methods) : 'metoda ta';
    el.innerHTML = `
      <h1 id="q-title" tabindex="-1">Recomandarea ta: ${r.name}, ${r.freqText}</h1>
      <p class="quiz__lead">Alegem cafele pentru ${escapeHtml(method)}. Poți schimba oricând cutia, frecvența sau orice cafea cu 5 zile înainte de livrare.</p>
      <div class="quiz__nav">
        <a class="btn btn--primary" href="/box/plan.html?box=${r.box}&freq=${r.freq}">Continuă cu ${r.name}</a>
        <button type="button" class="btn btn--secondary" id="reset">Refă quiz-ul</button>
      </div>`;
    $('reset').addEventListener('click', () => { state = { step: 0, answers: {} }; save(); go(); });
    return;
  }
  const cur = Q[state.step];
  const chosen = picked(cur);
  el.innerHTML = `
    <h1 id="q-title" tabindex="-1">${cur.q}</h1>
    ${cur.multi ? '<p class="quiz__hint" id="q-hint">Poți alege mai multe variante.</p>' : ''}
    <div class="quiz__opts" role="group" aria-labelledby="q-title"${cur.multi ? ' aria-describedby="q-hint"' : ''}>
      ${cur.o.map(([label, hint]) => `
        <button type="button" class="opt-card" aria-pressed="${chosen.includes(label)}" data-v="${escapeHtml(label)}">
          <span class="opt-card__title">${escapeHtml(label)}</span>
          <span class="opt-card__hint">${escapeHtml(hint)}</span>
        </button>`).join('')}
    </div>
    <div class="quiz__nav">
      <button type="button" class="btn btn--secondary" id="back"${state.step === 0 ? ' disabled' : ''}>Înapoi</button>
      <button type="button" class="btn btn--primary" id="next"${chosen.length ? '' : ' disabled'}>Înainte</button>
    </div>`;
  el.querySelectorAll('.opt-card').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.v;
    if (!cur.multi) {
      state.answers[cur.k] = v;
    } else {
      let list = picked(cur);
      list = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
      // "Nu știu încă" excludes the specific tastes, and the other way round.
      if (cur.only) list = v === cur.only ? list.filter((x) => x === cur.only) : list.filter((x) => x !== cur.only);
      state.answers[cur.k] = list;
    }
    save();
    const now = picked(cur);
    el.querySelectorAll('.opt-card').forEach((x) => x.setAttribute('aria-pressed', String(now.includes(x.dataset.v))));
    $('next').disabled = !now.length;
    renderProfile();
  }));
  $('back').addEventListener('click', () => { state.step = Math.max(0, state.step - 1); save(); go(); });
  $('next').addEventListener('click', () => { if (!hasAnswer(cur)) return; state.step += 1; save(); go(); });
}

function draw(focus) {
  renderProgress();
  renderProfile();
  renderStep();
  if (focus) $('q-title')?.focus({ preventScroll: false });
}

function go() {
  const el = $('step');
  if (reduced) { draw(true); return; }
  el.classList.add('is-fading');
  setTimeout(() => { draw(true); requestAnimationFrame(() => el.classList.remove('is-fading')); }, 160);
}

draw(false);
