(function () {
  'use strict';

  const { ROLE_WEIGHT, ROLE_NAME, GROUPS, MUSCLES, EXERCISES, PRESETS, SCALES } = window.MUSCLE_DATA;
  const ANATOMY = window.ANATOMY;

  const EX = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
  const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
  const MUSCLE_IDS = Object.keys(MUSCLES);
  const BY_GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, MUSCLE_IDS.filter((id) => MUSCLES[id].group === g.id)]));
  const VIEWS_OF = {};
  for (const view of ['front', 'back']) {
    for (const m of ANATOMY[view].muscles) (VIEWS_OF[m.id] = VIEWS_OF[m.id] || new Set()).add(view);
  }

  const ZONES = [
    { name: 'Нет нагрузки', cls: 'none' },
    { name: 'Низкая', cls: 'low' },
    { name: 'Средняя', cls: 'mid' },
    { name: 'Высокая', cls: 'high' },
  ];

  // Короткие подписи для компактных списков
  const SHORT = {
    'sternocleidomastoid': 'ГКС', 'trap-upper': 'Верх', 'trap-middle': 'Середина', 'trap-lower': 'Низ',
    'delt-front': 'Передняя', 'delt-side': 'Средняя', 'delt-rear': 'Задняя',
    'infraspinatus': 'Подостная', 'teres-minor': 'Малая круглая',
    'pec-upper': 'Ключичная', 'pec-mid': 'Грудинная', 'pec-lower': 'Брюшная',
    'lats': 'Широчайшая', 'teres-major': 'Большая круглая', 'rhomboids': 'Ромбовидные',
    'erectors': 'Разгибатели спины', 'biceps': 'Бицепс', 'brachialis': 'Плечевая',
    'triceps-long': 'Длинная', 'triceps-lateral': 'Латеральная', 'triceps-medial': 'Медиальная',
    'brachioradialis': 'Плечелучевая', 'forearm-flexors': 'Сгибатели', 'forearm-extensors': 'Разгибатели',
    'rectus-abdominis': 'Прямая', 'obliques': 'Косые', 'serratus': 'Зубчатая',
    'glute-max': 'Большая', 'glute-med': 'Средняя', 'tfl': 'Напрягатель ШФ',
    'iliopsoas': 'Подвздошно-пояснич.', 'adductors': 'Приводящие', 'adductor-magnus': 'Большая приводящая', 'sartorius': 'Портняжная',
    'rectus-femoris': 'Прямая', 'vastus-lateralis': 'Латеральная', 'vastus-medialis': 'Медиальная',
    'biceps-femoris': 'Двуглавая', 'semitendinosus': 'Полусухожильная', 'semimembranosus': 'Полуперепончатая',
    'gastrocnemius': 'Икроножная', 'soleus': 'Камбаловидная', 'tibialis': 'Большеберцовая', 'peroneus': 'Малоберцовые',
  };

  // ------------------------------------------------------------ Состояние
  const STORE_KEY = 'muscle-load-map:v1';
  const DEFAULT_STATE = {
    mode: 'workout',
    workout: PRESETS[0].items.map(([ex, sets]) => ({ ex, sets })),
    manual: {},
    scale: 'session',
    thresholds: {
      session: { t1: SCALES.session.t1, t2: SCALES.session.t2 },
      week: { t1: SCALES.week.t1, t2: SCALES.week.t2 },
    },
    colorMode: 'zones',
    view: 'both',
    brush: 3,
    theme: 'auto',
  };

  const state = loadState();
  let selected = null;
  let loads = {};
  let palette = null;

  function loadState() {
    const s = structuredClone(DEFAULT_STATE);
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return s;
      const saved = JSON.parse(raw);
      if (saved.mode === 'workout' || saved.mode === 'manual') s.mode = saved.mode;
      if (Array.isArray(saved.workout)) {
        s.workout = saved.workout
          .filter((w) => w && EX[w.ex] && Number.isFinite(w.sets))
          .map((w) => ({ ex: w.ex, sets: clamp(Math.round(w.sets), 1, 99) }));
      }
      if (saved.manual && typeof saved.manual === 'object') {
        for (const [id, lvl] of Object.entries(saved.manual)) {
          if (MUSCLES[id] && [1, 2, 3].includes(lvl)) s.manual[id] = lvl;
        }
      }
      if (SCALES[saved.scale]) s.scale = saved.scale;
      for (const k of Object.keys(SCALES)) {
        const t = saved.thresholds && saved.thresholds[k];
        if (t && t.t1 > 0 && t.t2 > t.t1) s.thresholds[k] = { t1: +t.t1, t2: +t.t2 };
      }
      if (saved.colorMode === 'zones' || saved.colorMode === 'gradient') s.colorMode = saved.colorMode;
      if (['both', 'front', 'back'].includes(saved.view)) s.view = saved.view;
      if ([0, 1, 2, 3].includes(saved.brush)) s.brush = saved.brush;
      if (['auto', 'light', 'dark'].includes(saved.theme)) s.theme = saved.theme;
    } catch (e) { /* хранилище недоступно — работаем с настройками по умолчанию */ }
    return s;
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ Утилиты
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function fmt(v) {
    const r = Math.round(v * 100) / 100;
    return String(r).replace('.', ',');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function hexToRgb(h) {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // ------------------------------------------------------------ Расчёт нагрузки
  function thr() { return state.thresholds[state.scale]; }

  function computeLoads() {
    const res = {};
    for (const id of MUSCLE_IDS) res[id] = { eff: 0, contribs: [] };
    for (const item of state.workout) {
      const ex = EX[item.ex];
      for (const role of ['p', 's', 't']) {
        for (const m of ex[role]) {
          const eff = item.sets * ROLE_WEIGHT[role];
          res[m].eff += eff;
          res[m].contribs.push({ ex, role, sets: item.sets, eff });
        }
      }
    }
    return res;
  }

  function zoneOfValue(v) {
    const t = thr();
    if (v <= 0) return 0;
    if (v < t.t1) return 1;
    if (v < t.t2) return 2;
    return 3;
  }
  function valueOf(id) { return state.mode === 'manual' ? (state.manual[id] || 0) : loads[id].eff; }
  function zoneOf(id) { return state.mode === 'manual' ? (state.manual[id] || 0) : zoneOfValue(loads[id].eff); }

  function gradientStops(pal) {
    const t = thr();
    return [[0, pal.low], [(t.t1 + t.t2) / 2, pal.mid], [t.t2 * 1.5, pal.high]];
  }
  function gradientColor(v, pal) {
    const stops = gradientStops(pal);
    if (v >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i];
        return mix(ca, cb, (v - a) / (b - a));
      }
    }
    return stops[0][1];
  }
  function colorOf(id, pal) {
    const z = zoneOf(id);
    if (z === 0) return pal.none;
    if (state.mode === 'workout' && state.colorMode === 'gradient') return gradientColor(loads[id].eff, pal);
    return [pal.none, pal.low, pal.mid, pal.high][z];
  }

  // ------------------------------------------------------------ Палитра / тема
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      low: v('--low'), mid: v('--mid'), high: v('--high'),
      none: v('--muscle-none'), muscleLine: v('--muscle-line'),
      skin: v('--skin'), skinLine: v('--skin-line'), detail: v('--detail-line'),
    };
  }
  const EXPORT_PALETTE = {
    low: '#2fb35a', mid: '#f4c20d', high: '#e5383b',
    none: '#e3c3b6', muscleLine: '#9c6f60', skin: '#f3e3d8', skinLine: '#8a6a5c', detail: '#a9887a',
  };

  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.theme);
    const btn = $('#theme-btn');
    btn.textContent = { auto: '◐', light: '☀', dark: '☾' }[state.theme];
    btn.title = 'Тема: ' + { auto: 'как в системе', light: 'светлая', dark: 'тёмная' }[state.theme];
    palette = readPalette();
  }

  // ------------------------------------------------------------ SVG
  const EAR = 'M168,54 C162,52 159,60 161,69 C162,76 166,79 169,77';
  const VIEWBOX = '62 10 276 882';

  function figureMarkup(view, pal, interactive) {
    const A = ANATOMY[view];
    const half = (primary) => {
      let s = `<path d="${ANATOMY.outline} L202,478 L202,22 Z" fill="${pal.skin}"/>`;
      s += `<path d="${EAR}" fill="${pal.skin}" stroke="${pal.skinLine}" stroke-width="1.1"/>`;
      for (const m of A.muscles) {
        const attrs = interactive && primary
          ? ` tabindex="0" role="button" aria-label="${esc(MUSCLES[m.id].name)}"`
          : '';
        s += `<path class="m" data-id="${m.id}" d="${m.d}" fill="${colorOf(m.id, pal)}" stroke="${pal.muscleLine}" stroke-width=".7"${attrs}/>`;
      }
      for (const m of A.muscles) s += `<path class="shade" d="${m.d}" fill="url(#shade-${view})"/>`;
      for (const d of A.details) {
        s += `<path d="${d}" fill="none" stroke="${pal.detail}" stroke-width=".9" stroke-linecap="round" pointer-events="none"/>`;
      }
      s += `<path d="${ANATOMY.outline}" fill="none" stroke="${pal.skinLine}" stroke-width="1.5" stroke-linejoin="round" pointer-events="none"/>`;
      return s;
    };
    return `<defs><linearGradient id="shade-${view}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".20"/>` +
      `</linearGradient></defs>` +
      `<ellipse cx="200" cy="880" rx="78" ry="7" fill="${pal.skinLine}" opacity=".15"/>` +
      `<g>${half(true)}</g><g transform="matrix(-1 0 0 1 400 0)">${half(false)}</g>`;
  }

  function renderFigures() {
    for (const view of ['front', 'back']) {
      $('#svg-' + view).innerHTML =
        `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${view === 'front' ? 'Мышцы, вид спереди' : 'Мышцы, вид сзади'}">` +
        figureMarkup(view, palette, true) + '</svg>';
    }
    markSelected();
  }

  function paintFigures() {
    for (const el of $$('#figures .m')) el.setAttribute('fill', colorOf(el.dataset.id, palette));
  }

  function musclePaths(id) { return $$(`#figures .m[data-id="${id}"]`); }

  function markSelected() {
    for (const el of $$('#figures .m.is-selected')) el.classList.remove('is-selected');
    if (selected) for (const el of musclePaths(selected)) el.classList.add('is-selected');
  }

  function setPreview(roles) {
    for (const svg of $$('#figures svg')) svg.classList.toggle('previewing', !!roles);
    for (const el of $$('#figures .m')) {
      el.classList.remove('role-p', 'role-s', 'role-t');
      const r = roles && roles[el.dataset.id];
      if (r) el.classList.add('role-' + r);
    }
  }
  function exerciseRoles(ex) {
    const roles = {};
    for (const r of ['t', 's', 'p']) for (const m of ex[r]) roles[m] = r;
    return roles;
  }

  // ------------------------------------------------------------ Подсказка
  const tooltip = $('#tooltip');
  let hoverId = null;

  function showTooltip(id, x, y) {
    const m = MUSCLES[id];
    const z = zoneOf(id);
    const val = state.mode === 'manual'
      ? ZONES[z].name
      : `${ZONES[z].name} · ${fmt(loads[id].eff)} эфф. ${plural(Math.ceil(loads[id].eff), 'подход', 'подхода', 'подходов')}`;
    tooltip.innerHTML =
      `<div class="tt-name">${esc(m.name)}</div><div class="tt-latin">${esc(m.latin)}</div>` +
      `<div class="tt-load"><span class="dot ${ZONES[z].cls}"></span>${esc(val)}</div>`;
    tooltip.hidden = false;
    moveTooltip(x, y);
  }
  function moveTooltip(x, y) {
    const r = tooltip.getBoundingClientRect();
    let left = x + 14, top = y + 16;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 12;
    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top = Math.max(8, top) + 'px';
  }
  function setHover(id) {
    if (hoverId === id) return;
    if (hoverId) for (const el of musclePaths(hoverId)) el.classList.remove('is-hover');
    hoverId = id;
    if (id) for (const el of musclePaths(id)) el.classList.add('is-hover');
  }

  // ------------------------------------------------------------ Действия
  function selectMuscle(id) {
    selected = id;
    markSelected();
    renderDetails();
    renderGroups();
  }

  function paintManual(id) {
    const cur = state.manual[id] || 0;
    const next = cur === state.brush ? 0 : state.brush;
    if (next) state.manual[id] = next; else delete state.manual[id];
    update();
  }

  function addExercise(exId, sets = 3) {
    const item = state.workout.find((w) => w.ex === exId);
    if (item) {
      item.sets = clamp(item.sets + 1, 1, 99);
      toast(`«${EX[exId].name}»: ${item.sets} ${plural(item.sets, 'подход', 'подхода', 'подходов')}`);
    } else {
      state.workout.push({ ex: exId, sets });
      toast(`Добавлено: «${EX[exId].name}»`);
    }
    if (state.mode !== 'workout') setMode('workout');
    update();
  }

  function setMode(mode) {
    state.mode = mode;
    update();
  }

  let toastTimer = null;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  // ------------------------------------------------------------ Рендер панелей
  function renderToolbar() {
    for (const b of $$('#scale-seg button')) b.setAttribute('aria-checked', String(b.dataset.scale === state.scale));
    for (const b of $$('#color-seg button')) b.setAttribute('aria-checked', String(b.dataset.color === state.colorMode));
    for (const b of $$('#view-seg button')) b.setAttribute('aria-checked', String(b.dataset.view === state.view));
    const manual = state.mode === 'manual';
    $('#scale-field').hidden = manual;
    $('#threshold-field').hidden = manual;
    $('#color-field').hidden = manual;
    const t = thr();
    if (document.activeElement !== $('#t1')) $('#t1').value = t.t1;
    if (document.activeElement !== $('#t2')) $('#t2').value = t.t2;
    $('#figures').dataset.view = state.view;

    for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.mode === state.mode));
    $('#body-workout').hidden = manual;
    $('#body-manual').hidden = !manual;
  }

  function renderLegend() {
    const t = thr();
    const el = $('#legend');
    if (state.mode === 'workout' && state.colorMode === 'gradient') {
      const stops = gradientStops(palette);
      const max = stops[stops.length - 1][0];
      const css = stops.map(([v, c]) => `${c} ${(v / max) * 100}%`).join(', ');
      const pos = (v) => `${(v / max) * 100}%`;
      el.innerHTML =
        `<span class="legend-item"><span class="dot none"></span>0</span>` +
        `<div class="legend-gradient"><div class="legend-bar" style="background:linear-gradient(90deg, ${css})"></div>` +
        `<div class="legend-ticks"><span style="left:0">&gt;0</span><span style="left:${pos(t.t1)}">${fmt(t.t1)}</span>` +
        `<span style="left:${pos(t.t2)}">${fmt(t.t2)}</span><span style="left:100%">${fmt(max)}+</span></div></div>` +
        `<span class="legend-item range">эфф. подходы</span>`;
      return;
    }
    const ranges = state.mode === 'manual'
      ? ['', '', '', '']
      : ['0', `&lt; ${fmt(t.t1)}`, `${fmt(t.t1)}–${fmt(t.t2)}`, `≥ ${fmt(t.t2)}`];
    el.innerHTML = [3, 2, 1, 0].map((z) =>
      `<span class="legend-item"><span class="dot ${ZONES[z].cls}"></span>${ZONES[z].name}` +
      (ranges[z] ? ` <span class="range">${ranges[z]}</span>` : '') + '</span>'
    ).join('') + (state.mode === 'manual' ? '' : '<span class="legend-item range">эфф. подходы</span>');
  }

  function renderPresets() {
    $('#presets').innerHTML = PRESETS.map((p) =>
      `<button type="button" class="chip" data-preset="${p.id}">${esc(p.name)}</button>`).join('');
  }

  function renderWorkout() {
    const list = $('#workout');
    const total = state.workout.reduce((a, w) => a + w.sets, 0);
    $('#workout-count').textContent = state.workout.length
      ? `· ${state.workout.length} упр., ${total} ${plural(total, 'подход', 'подхода', 'подходов')}`
      : '';
    $('#workout-empty').hidden = state.workout.length > 0;
    $('#clear-workout').hidden = state.workout.length === 0;
    list.innerHTML = state.workout.map((w, i) =>
      `<li data-ex="${w.ex}">` +
      `<span class="w-name">${esc(EX[w.ex].name)}</span>` +
      `<span class="stepper"><button type="button" data-act="dec" data-i="${i}" aria-label="Меньше подходов">−</button>` +
      `<output>${w.sets} подх.</output>` +
      `<button type="button" data-act="inc" data-i="${i}" aria-label="Больше подходов">+</button></span>` +
      `<button type="button" class="remove" data-act="del" data-i="${i}" aria-label="Удалить">×</button></li>`
    ).join('');
  }

  function renderLibraryFilters() {
    const cats = GROUPS.filter((g) => EXERCISES.some((e) => e.cat === g.id));
    $('#lib-cat').innerHTML = '<option value="">Все группы</option>' +
      cats.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  }

  function renderLibrary() {
    const q = $('#lib-search').value.trim().toLowerCase();
    const cat = $('#lib-cat').value;
    const inWorkout = new Set(state.workout.map((w) => w.ex));
    const items = EXERCISES.filter((e) => {
      if (cat && e.cat !== cat && !e.p.some((m) => MUSCLES[m].group === cat)) return false;
      if (!q) return true;
      const hay = [e.name, ...e.p.map((m) => MUSCLES[m].name), ...e.s.map((m) => MUSCLES[m].name), GROUP[e.cat].name]
        .join(' ').toLowerCase();
      return q.split(/\s+/).every((word) => hay.includes(word));
    });
    $('#library').innerHTML = items.length
      ? items.map((e) => {
        const added = inWorkout.has(e.id);
        return `<li data-ex="${e.id}"><div><div class="lib-name">${esc(e.name)}</div>` +
          `<div class="lib-sub">${esc(e.p.map((m) => MUSCLES[m].name).join(', '))}</div></div>` +
          `<button type="button" class="add${added ? ' added' : ''}" data-add="${e.id}" ` +
          `title="${added ? 'Уже в тренировке — нажмите, чтобы добавить подход' : 'Добавить в тренировку'}" ` +
          `aria-label="Добавить «${esc(e.name)}»">${added ? '✓' : '+'}</button></li>`;
      }).join('')
      : '<li class="empty">Ничего не найдено</li>';
  }

  function renderManual() {
    $('#brushes').innerHTML = [3, 2, 1, 0].map((z) =>
      `<button type="button" class="brush" data-brush="${z}" aria-pressed="${state.brush === z}">` +
      `<span class="dot ${ZONES[z].cls}"></span>${z === 0 ? 'Ластик' : ZONES[z].name}</button>`).join('');
    $('#manual-groups').innerHTML = GROUPS.map((g) =>
      `<button type="button" class="chip" data-mgroup="${g.id}">${esc(g.name)}</button>`).join('');
  }

  function renderStats() {
    const counts = [0, 0, 0, 0];
    for (const id of MUSCLE_IDS) counts[zoneOf(id)]++;
    $('#stats').innerHTML = [3, 2, 1, 0].map((z) =>
      `<div class="stat"><div class="stat-value"><span class="dot ${ZONES[z].cls}"></span>${counts[z]}</div>` +
      `<div class="stat-label">${z === 0 ? 'без нагрузки' : ZONES[z].name.toLowerCase() + ' нагрузка'}</div></div>`).join('');
  }

  function valueLabel(id) {
    return state.mode === 'manual' ? ZONES[zoneOf(id)].name : fmt(loads[id].eff);
  }

  function renderDetails() {
    const el = $('#details');
    if (!selected) {
      const ranked = MUSCLE_IDS.filter((id) => zoneOf(id) > 0)
        .sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 6);
      const idle = MUSCLE_IDS.filter((id) => zoneOf(id) === 0);
      el.innerHTML =
        `<h2 class="block-title">Обзор</h2>` +
        `<p class="hint">Наведите курсор на мышцу, чтобы увидеть нагрузку, или нажмите — чтобы открыть подробности.` +
        (state.mode === 'workout' ? ' При наведении на упражнение карта подсветит задействованные мышцы.' : '') + '</p>' +
        (ranked.length
          ? `<h3>Самые нагруженные</h3><div class="g-muscles">${ranked.map((id) => chip(id, true)).join('')}</div>`
          : '') +
        (idle.length && idle.length < MUSCLE_IDS.length
          ? `<h3>Без нагрузки (${idle.length})</h3><div class="g-muscles">${idle.map((id) => chip(id, true)).join('')}</div>`
          : '');
      return;
    }
    const m = MUSCLES[selected];
    const z = zoneOf(selected);
    const views = [...(VIEWS_OF[selected] || [])].map((v) => (v === 'front' ? 'спереди' : 'сзади')).join(' и ');
    let html =
      `<button type="button" class="link-btn close" data-close>Закрыть</button>` +
      `<h2 class="d-title">${esc(m.name)}</h2><p class="d-latin">${esc(m.latin)}</p>` +
      `<div class="d-meta"><span class="badge zone-${z}"><span class="dot ${ZONES[z].cls}"></span>${ZONES[z].name}` +
      (state.mode === 'workout' ? ` · ${fmt(loads[selected].eff)} эфф. подх.` : '') + `</span>` +
      `<span class="badge">${esc(GROUP[m.group].name)}</span><span class="badge">вид ${views}</span></div>` +
      `<p class="d-fn">${esc(m.fn)}</p>`;

    if (state.mode === 'workout') {
      const c = loads[selected].contribs;
      if (c.length) {
        html += `<h3>Вклад упражнений</h3><table class="contrib">` +
          c.slice().sort((a, b) => b.eff - a.eff).map((x) =>
            `<tr><td>${esc(x.ex.name)}<span class="role">${ROLE_NAME[x.role]}</span></td>` +
            `<td class="num">${x.sets} × ${fmt(ROLE_WEIGHT[x.role])} = ${fmt(x.eff)}</td></tr>`).join('') +
          `<tr><td>Итого</td><td class="num">${fmt(loads[selected].eff)}</td></tr></table>`;
      } else {
        html += `<p class="hint">В текущей тренировке эта мышца не задействована.</p>`;
      }
    }

    const best = EXERCISES.filter((e) => e.p.includes(selected))
      .concat(EXERCISES.filter((e) => e.s.includes(selected))).slice(0, 7);
    if (best.length) {
      html += `<h3>Упражнения для этой мышцы</h3><ul class="suggest">` +
        best.map((e) => `<li data-ex="${e.id}"><span>${esc(e.name)}<span class="role">${e.p.includes(selected) ? 'основная' : 'вспомогательная'}</span></span>` +
          `<button type="button" class="add" data-add="${e.id}" aria-label="Добавить «${esc(e.name)}»">+</button></li>`).join('') +
        `</ul>`;
    }
    el.innerHTML = html;
  }

  function chip(id, full) {
    const z = zoneOf(id);
    const val = state.mode === 'manual' ? '' : ` <b>${fmt(loads[id].eff)}</b>`;
    return `<button type="button" class="g-chip${selected === id ? ' is-selected' : ''}" data-muscle="${id}" ` +
      `title="${esc(MUSCLES[id].name)} — ${esc(valueLabel(id))}"><span class="dot ${ZONES[z].cls}"></span>` +
      `${esc(full ? MUSCLES[id].name : SHORT[id] || MUSCLES[id].name)}${val}</button>`;
  }

  function renderGroups() {
    $('#groups').innerHTML = GROUPS.map((g) => {
      const ids = BY_GROUP[g.id];
      const zones = ids.map(zoneOf);
      const maxZ = Math.max(...zones);
      const counts = [0, 0, 0, 0];
      zones.forEach((z) => counts[z]++);
      const bar = [3, 2, 1, 0].filter((z) => counts[z])
        .map((z) => `<i style="width:${(counts[z] / ids.length) * 100}%;background:var(--${z ? ZONES[z].cls : 'muscle-none'})"></i>`).join('');
      const val = state.mode === 'manual'
        ? ZONES[maxZ].name.toLowerCase()
        : `макс. ${fmt(Math.max(...ids.map((id) => loads[id].eff)))}`;
      return `<div class="group" data-group="${g.id}">` +
        `<div class="group-head"><span class="g-name"><span class="dot ${ZONES[maxZ].cls}"></span>${esc(g.name)}</span>` +
        `<span class="g-val">${val}</span></div>` +
        `<div class="g-bar" aria-hidden="true">${bar}</div>` +
        `<div class="g-muscles">${ids.map((id) => chip(id)).join('')}</div></div>`;
    }).join('');
  }

  // ------------------------------------------------------------ Общий апдейт
  function update() {
    loads = computeLoads();
    renderToolbar();
    renderLegend();
    renderWorkout();
    renderLibrary();
    renderManual();
    renderStats();
    renderDetails();
    renderGroups();
    paintFigures();
    saveState();
  }

  // ------------------------------------------------------------ Экспорт PNG
  function exportPng() {
    const pal = EXPORT_PALETTE;
    const W = 1500, H = 1120;
    const figW = 470, figH = figW * 882 / 276;
    const figTop = 110;
    const figH2 = Math.min(figH, H - figTop - 80);
    const figW2 = figH2 * 276 / 882;
    const t = thr();
    const date = new Date().toLocaleDateString('ru-RU');
    const sub = state.mode === 'manual'
      ? `Ручная разметка · ${date}`
      : `${SCALES[state.scale].name}: ${state.workout.length} упр., ${state.workout.reduce((a, w) => a + w.sets, 0)} подх. · ${date}`;

    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif">`;
    s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
    s += `<text x="40" y="56" font-size="30" font-weight="700" fill="#1f1b18">Мышечная карта нагрузки</text>`;
    s += `<text x="40" y="86" font-size="16" fill="#6b625b">${esc(sub)}</text>`;
    ['front', 'back'].forEach((view, i) => {
      const x = 40 + i * (figW2 + 20);
      s += `<svg x="${x}" y="${figTop}" width="${figW2}" height="${figH2}" viewBox="${VIEWBOX}">${figureMarkup(view, pal, false)}</svg>`;
      s += `<text x="${x + figW2 / 2}" y="${figTop + figH2 + 22}" font-size="14" fill="#6b625b" text-anchor="middle" letter-spacing="1.5">${view === 'front' ? 'ВИД СПЕРЕДИ' : 'ВИД СЗАДИ'}</text>`;
    });

    // Легенда
    const zoneColor = [pal.none, pal.low, pal.mid, pal.high];
    let lx = 40;
    const ly = H - 26;
    [3, 2, 1, 0].forEach((z) => {
      const range = state.mode === 'manual' ? '' : [' 0', ` < ${fmt(t.t1)}`, ` ${fmt(t.t1)}–${fmt(t.t2)}`, ` ≥ ${fmt(t.t2)}`][z];
      const label = ZONES[z].name + range;
      s += `<circle cx="${lx + 7}" cy="${ly - 5}" r="7" fill="${zoneColor[z]}" stroke="${z ? 'none' : pal.muscleLine}"/>`;
      s += `<text x="${lx + 20}" y="${ly}" font-size="15" fill="#1f1b18">${esc(label)}</text>`;
      lx += 36 + label.length * 8.2;
    });
    if (state.mode === 'workout') s += `<text x="${lx}" y="${ly}" font-size="15" fill="#6b625b">эфф. подходы${state.colorMode === 'gradient' ? ' · заливка градиентом' : ''}</text>`;

    // Сводка по группам
    const gx = 40 + 2 * (figW2 + 20) + 30;
    const colW = (W - gx - 40) / 2;
    s += `<text x="${gx}" y="${figTop + 4}" font-size="14" font-weight="700" fill="#6b625b" letter-spacing="1.5">НАГРУЗКА ПО ГРУППАМ</text>`;
    let gy = figTop + 36;
    GROUPS.forEach((g, gi) => {
      const col = gi < 8 ? 0 : 1;
      if (gi === 8) gy = figTop + 36;
      const x = gx + col * colW;
      const ids = BY_GROUP[g.id];
      const maxZ = Math.max(...ids.map(zoneOf));
      s += `<circle cx="${x + 6}" cy="${gy - 5}" r="6" fill="${zoneColor[maxZ]}"/>`;
      s += `<text x="${x + 18}" y="${gy}" font-size="15" font-weight="700" fill="#1f1b18">${esc(g.name)}</text>`;
      gy += 22;
      ids.forEach((id) => {
        const zz = zoneOf(id);
        const fill = state.mode === 'workout' && state.colorMode === 'gradient' && zz ? gradientColor(loads[id].eff, pal) : zoneColor[zz];
        s += `<rect x="${x + 18}" y="${gy - 11}" width="12" height="12" rx="3" fill="${fill}" stroke="${zz ? 'none' : pal.muscleLine}" stroke-width=".8"/>`;
        s += `<text x="${x + 38}" y="${gy}" font-size="13" fill="#3d3530">${esc(SHORT[id] || MUSCLES[id].name)}</text>`;
        if (state.mode === 'workout') s += `<text x="${x + colW - 20}" y="${gy}" font-size="13" fill="#6b625b" text-anchor="end">${fmt(loads[id].eff)}</text>`;
        gy += 19;
      });
      gy += 12;
    });
    s += '</svg>';

    const img = new Image();
    const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `muscle-map-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('PNG сохранён');
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Не удалось сформировать изображение'); };
    img.src = url;
  }

  // ------------------------------------------------------------ События
  function bindEvents() {
    const figures = $('#figures');
    let lastPointer = 'mouse';

    figures.addEventListener('pointerover', (e) => {
      const el = e.target.closest('.m');
      lastPointer = e.pointerType;
      if (!el) return;
      setHover(el.dataset.id);
      showTooltip(el.dataset.id, e.clientX, e.clientY);
    });
    figures.addEventListener('pointermove', (e) => {
      if (!tooltip.hidden) moveTooltip(e.clientX, e.clientY);
    });
    figures.addEventListener('pointerout', (e) => {
      const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.m');
      if (to) return;
      setHover(null);
      tooltip.hidden = true;
    });
    figures.addEventListener('click', (e) => {
      const el = e.target.closest('.m');
      if (!el) return;
      const id = el.dataset.id;
      if (state.mode === 'manual') {
        selected = id;
        paintManual(id);
        markSelected();
      } else {
        selectMuscle(selected === id ? null : id);
      }
      if (!tooltip.hidden) showTooltip(id, e.clientX, e.clientY);
      if (lastPointer === 'touch') setTimeout(() => { tooltip.hidden = true; setHover(null); }, 1600);
    });
    figures.addEventListener('keydown', (e) => {
      const el = e.target.closest('.m');
      if (!el || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    figures.addEventListener('focusin', (e) => {
      const el = e.target.closest('.m');
      if (!el) return;
      setHover(el.dataset.id);
      const r = el.getBoundingClientRect();
      showTooltip(el.dataset.id, r.right, r.top);
    });
    figures.addEventListener('focusout', () => { setHover(null); tooltip.hidden = true; });

    // Шапка
    $('#scale-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { state.scale = b.dataset.scale; update(); }
    });
    $('#color-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { state.colorMode = b.dataset.color; update(); }
    });
    $('#view-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { state.view = b.dataset.view; update(); }
    });
    const onThreshold = () => {
      const t = thr();
      let t1 = parseFloat($('#t1').value.replace(',', '.'));
      let t2 = parseFloat($('#t2').value.replace(',', '.'));
      if (!(t1 > 0)) t1 = t.t1;
      if (!(t2 > 0)) t2 = t.t2;
      if (t2 <= t1) t2 = t1 + 0.5;
      state.thresholds[state.scale] = { t1, t2 };
      update();
    };
    $('#t1').addEventListener('change', onThreshold);
    $('#t2').addEventListener('change', onThreshold);
    $('#theme-btn').addEventListener('click', () => {
      state.theme = { auto: 'light', light: 'dark', dark: 'auto' }[state.theme];
      applyTheme();
      renderFigures();
      update();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.theme !== 'auto') return;
      palette = readPalette();
      renderFigures();
      update();
    });
    $('#export-btn').addEventListener('click', exportPng);

    // Вкладки
    $('.tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setMode(b.dataset.mode);
    });

    // Программы
    $('#presets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      const p = PRESETS.find((x) => x.id === b.dataset.preset);
      state.workout = p.items.map(([ex, sets]) => ({ ex, sets }));
      state.scale = p.scale || 'session';
      toast(`Программа «${p.name}» загружена`);
      update();
    });

    // Тренировка
    const workout = $('#workout');
    workout.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const i = +b.dataset.i;
      const item = state.workout[i];
      if (b.dataset.act === 'inc') item.sets = clamp(item.sets + 1, 1, 99);
      if (b.dataset.act === 'dec') item.sets = clamp(item.sets - 1, 1, 99);
      if (b.dataset.act === 'del') { state.workout.splice(i, 1); setPreview(null); }
      update();
    });
    $('#clear-workout').addEventListener('click', () => { state.workout = []; update(); });

    // Библиотека
    $('#lib-search').addEventListener('input', renderLibrary);
    $('#lib-cat').addEventListener('change', renderLibrary);

    // Кнопки «+» (библиотека и подсказки)
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]');
      if (b) addExercise(b.dataset.add);
    });

    // Предпросмотр упражнения при наведении
    const previewHost = (e) => {
      const li = e.target.closest('[data-ex]');
      setPreview(li ? exerciseRoles(EX[li.dataset.ex]) : null);
    };
    for (const sel of ['#library', '#workout', '#details']) {
      $(sel).addEventListener('pointerover', previewHost);
      $(sel).addEventListener('pointerleave', () => setPreview(null));
    }

    // Сводка по группам и чипы мышц
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-muscle]');
      if (c) selectMuscle(selected === c.dataset.muscle ? null : c.dataset.muscle);
      if (e.target.closest('[data-close]')) selectMuscle(null);
    });
    const groups = $('#groups');
    groups.addEventListener('pointerover', (e) => {
      const chipEl = e.target.closest('[data-muscle]');
      if (chipEl) { setPreview({ [chipEl.dataset.muscle]: 'p' }); return; }
      const g = e.target.closest('[data-group]');
      setPreview(g ? Object.fromEntries(BY_GROUP[g.dataset.group].map((id) => [id, 'p'])) : null);
    });
    groups.addEventListener('pointerleave', () => setPreview(null));

    // Ручная разметка
    $('#brushes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-brush]');
      if (b) { state.brush = +b.dataset.brush; update(); }
    });
    $('#manual-groups').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mgroup]');
      if (!b) return;
      for (const id of BY_GROUP[b.dataset.mgroup]) {
        if (state.brush) state.manual[id] = state.brush; else delete state.manual[id];
      }
      update();
    });
    $('#manual-groups').addEventListener('pointerover', (e) => {
      const b = e.target.closest('[data-mgroup]');
      setPreview(b ? Object.fromEntries(BY_GROUP[b.dataset.mgroup].map((id) => [id, 'p'])) : null);
    });
    $('#manual-groups').addEventListener('pointerleave', () => setPreview(null));
    $('#manual-from-workout').addEventListener('click', () => {
      state.manual = {};
      for (const id of MUSCLE_IDS) {
        const z = zoneOfValue(loads[id].eff);
        if (z) state.manual[id] = z;
      }
      toast('Разметка скопирована из конструктора');
      update();
    });
    $('#manual-clear').addEventListener('click', () => { state.manual = {}; update(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && selected) selectMuscle(null);
    });
  }

  // ------------------------------------------------------------ Старт
  applyTheme();
  loads = computeLoads();
  renderPresets();
  renderLibraryFilters();
  renderFigures();
  bindEvents();
  update();
})();
