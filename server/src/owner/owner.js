// The owner's page: sign in with the key, see reports, handle them. Plain script, no build.
// Everything from the server goes in as text (textContent), never as HTML. The session lives only
// in this tab (sessionStorage): the web app on the same address can't keep reading it.
(() => {
  'use strict';
  const KEY = 'oyuur-owner';
  const $ = (id) => document.getElementById(id);

  const REASONS = { spam: 'Спам', abuse: 'Оскорбления', name: 'Ник или имя', other: 'Другое' };
  const RESOLVED = { dismissed: 'Отклонена', name_hidden: 'Название скрыто', banned: 'Аккаунт заблокирован' };
  const WHO = { owner: 'владелец' };

  let token = null;
  try { token = sessionStorage.getItem(KEY); } catch {}
  let status = 'open';
  let section = location.hash === '#stats' ? 'stats' : 'reports';
  const PERIOD_KEY = 'oyuur-owner-period';
  let period = '30';
  try { period = ['7', '30', 'all'].includes(sessionStorage.getItem(PERIOD_KEY)) ? sessionStorage.getItem(PERIOD_KEY) : '30'; } catch {}

  const remember = (t) => {
    token = t;
    try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch {}
  };

  async function api(method, path) {
    const res = await fetch(path, { method, headers: token ? { authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/owner/login') {
      remember(null);
      show('signin');
      throw new Error('signed_out');
    }
    if (!res.ok) throw Object.assign(new Error(body.error || 'server'), { status: res.status });
    return body;
  }

  function show(which) {
    $('signin').hidden = which !== 'signin';
    $('reports').hidden = which !== 'reports';
    if (which === 'signin') setTimeout(() => $('key').focus(), 0);
  }

  // ---- Sign in ----
  $('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = $('key').value;
    if (!key) return;
    $('signin-button').disabled = true;
    $('signin-error').textContent = '';
    try {
      const res = await fetch('/api/owner/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error('Слишком много попыток. Подождите 10 минут.');
      if (!res.ok || !body.token) throw new Error('Неверный ключ.');
      remember(body.token);
      $('key').value = '';
      show('reports');
      openSection(section);
      loadBackup();
    } catch (err) {
      $('signin-error').textContent = err instanceof TypeError ? 'Нет связи с сервером.' : err.message;
    } finally {
      $('signin-button').disabled = false;
    }
  });

  $('signout').addEventListener('click', async () => {
    try { await api('POST', '/api/owner/logout'); } catch {}
    remember(null);
    show('signin');
  });
  $('refresh').addEventListener('click', () => { refreshSection(); loadBackup(); });

  // ---- Reports or numbers ----
  const refreshSection = () => {
    if (section === 'stats') loadStats();
    load(); // the count of new reports, on both
  };
  function openSection(which) {
    section = which;
    $('sec-reports').hidden = which !== 'reports';
    $('sec-stats').hidden = which !== 'stats';
    $('title').textContent = which === 'stats' ? 'Аналитика' : 'Жалобы';
    for (const b of document.querySelectorAll('.sections button')) {
      if (b.dataset.section === which) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    try { history.replaceState(null, '', which === 'stats' ? '#stats' : location.pathname); } catch {}
    if (which === 'stats') loadStats();
    load(); // the count of new reports stays fresh on both
  }
  for (const b of document.querySelectorAll('.sections button')) b.addEventListener('click', () => openSection(b.dataset.section));
  for (const tab of document.querySelectorAll('.tabs button')) {
    tab.addEventListener('click', () => {
      status = tab.dataset.status;
      for (const t of document.querySelectorAll('.tabs button')) t.setAttribute('aria-selected', String(t === tab));
      load();
    });
  }

  // ---- The list ----
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  };
  const when = (ms) => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const reports = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'жалоба' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'жалобы' : 'жалоб'}`;

  function personLine(label, p) {
    const row = el('p', 'row');
    row.append(el('span', 'label', `${label}: `));
    if (!p || p.deleted) {
      row.append(el('span', 'nick', 'удалённый аккаунт'));
      return row;
    }
    row.append(el('span', 'nick', `@${p.nick}`));
    if (p.name) row.append(document.createTextNode(` (${p.name})`));
    if (p.banned) row.append(el('span', 'badge bad', 'заблокирован'));
    return row;
  }

  function card(r) {
    const li = el('li', 'card');
    li.dataset.id = String(r.id);
    const head = el('div', 'card-head');
    head.append(el('span', 'chip', r.tree ? 'Название дерева' : REASONS[r.reason] || r.reason), el('span', 'when', when(r.at)));
    li.append(head);

    const about = personLine('На кого', r.target);
    if (r.target && !r.target.deleted) {
      about.append(' · ', el('span', 'nowrap', `всего ${reports(r.aboutTarget.total)}${r.aboutTarget.open ? `, новых ${r.aboutTarget.open}` : ''}`));
    }
    li.append(about);
    if (r.tree) {
      const row = el('p', 'row');
      row.append(el('span', 'label', 'Дерево: '));
      if (r.tree.found) {
        row.append(el('span', 'nick', `«${r.tree.nickname || r.tree.habit || '—'}»`));
        if (r.tree.nickname && r.tree.habit) row.append(document.createTextNode(` · привычка «${r.tree.habit}»`));
      } else {
        row.append(el('span', null, 'уже не открыто друзьям'));
      }
      if (r.tree.hidden) row.append(el('span', 'badge', 'название скрыто'));
      li.append(row);
    }
    li.append(personLine('Пожаловался', r.reporter));
    if (r.text) li.append(el('blockquote', 'quote', r.text));
    if (r.resolution) {
      // How it was handled, and what is true now if the owner undid it later.
      const undone = (r.resolution === 'name_hidden' && r.tree && !r.tree.hidden && 'сейчас название снова видно')
        || (r.resolution === 'banned' && r.target && !r.target.deleted && !r.target.banned && 'сейчас разблокирован');
      li.append(el('p', 'resolved', `${RESOLVED[r.resolution] || r.resolution} · ${WHO[r.resolvedBy] || r.resolvedBy || '—'} · ${when(r.resolvedAt)}${undone ? ` · ${undone}` : ''}`));
    }

    const actions = el('div', 'actions');
    const target = r.target && !r.target.deleted ? `@${r.target.nick}` : 'этот аккаунт';
    const treeName = r.tree ? `«${r.tree.nickname || r.tree.habit || 'дерево'}»` : '';
    const button = (text, cls, ask, run) => {
      const b = el('button', cls, text);
      b.type = 'button';
      b.addEventListener('click', () => confirmThen(ask, () => act(b, r.id, run)));
      actions.append(b);
    };
    if (!r.resolution) {
      button('Отклонить', 'ghost', { title: `Отклонить жалобу на ${target}?`, text: 'Ничего не изменится, жалоба уйдёт в разобранные.', yes: 'Отклонить', tone: 'primary' }, 'dismiss');
      if (r.tree) {
        button('Скрыть название', 'ghost', { title: 'Скрыть название дерева?', text: `Друзья ${target} увидят вместо ${treeName} нейтральное «…». Вернуть можно в разобранных.`, yes: 'Скрыть', tone: 'primary' }, 'hide-name');
      }
      if (r.target && !r.target.deleted && !r.target.banned) {
        button('Заблокировать', 'danger', { title: `Заблокировать ${target}?`, text: 'Не сможет войти, друзья перестанут его видеть. Данные не удаляются, разблокировать можно в разобранных.', yes: 'Заблокировать', tone: 'danger' }, 'ban');
      }
    } else {
      if (r.tree?.hidden) button('Вернуть название', 'ghost', { title: 'Вернуть название?', text: `Друзья снова увидят ${treeName}.`, yes: 'Вернуть', tone: 'primary' }, 'show-name');
      if (r.target?.banned && !r.target.deleted) button('Разблокировать', 'ghost', { title: `Разблокировать ${target}?`, text: 'Снова сможет входить, друзья снова его увидят.', yes: 'Разблокировать', tone: 'primary' }, 'unban');
    }
    if (actions.childElementCount) li.append(actions);
    return li;
  }

  let loading = 0;
  async function load() {
    const mine = ++loading;
    $('list-error').textContent = '';
    try {
      const body = await api('GET', `/api/owner/reports?status=${status}`);
      if (mine !== loading) return;
      $('count-open').textContent = body.open ? String(body.open) : '';
      $('count-badge').textContent = body.open ? String(body.open) : '';
      $('count-done').textContent = body.done ? String(body.done) : '';
      $('list').replaceChildren(...body.reports.map(card));
      $('empty').hidden = body.reports.length > 0;
      $('empty').textContent = status === 'open' ? 'Новых жалоб нет.' : 'Разобранных жалоб пока нет.';
    } catch (err) {
      if (err.message !== 'signed_out' && mine === loading) $('list-error').textContent = 'Не получилось загрузить. Проверьте связь и нажмите «Обновить».';
    }
  }

  const DONE = { dismiss: 'Жалоба отклонена', 'hide-name': 'Название скрыто', ban: 'Аккаунт заблокирован', 'show-name': 'Название вернули', unban: 'Аккаунт разблокирован' };
  async function act(button, id, action) {
    button.disabled = true;
    try {
      await api('POST', `/api/owner/reports/${id}/${action}`);
      toast(DONE[action]);
    } catch (err) {
      if (err.message === 'signed_out') return;
      toast(err.message === 'resolved' ? 'Эту жалобу уже разобрали' : 'Не получилось, попробуйте ещё раз');
    }
    load();
  }

  // ---- The latest copy of the base ----
  const MB = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const size = (b) => (b >= 1048576 ? `${MB.format(b / 1048576)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
  function whenDay(ms) {
    const d = new Date(ms);
    const time = d.toLocaleTimeString('ru-RU', { hour: 'numeric', minute: '2-digit' });
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const ago = Math.round((start(new Date()) - start(d)) / 86400000);
    const day = ago === 0 ? 'сегодня' : ago === 1 ? 'вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${day} в ${time}`;
  }
  let backupDay = null;
  async function loadBackup() {
    try {
      const { latest } = await api('GET', '/api/owner/backup');
      backupDay = latest?.day ?? null;
      $('backup-line').textContent = latest ? `Последняя копия: ${whenDay(latest.at)}, ${size(latest.size)}` : 'Копий базы пока нет: первая будет после 4:00.';
      $('backup-download').hidden = !latest;
    } catch (err) {
      if (err.message !== 'signed_out') $('backup-line').textContent = 'Не получилось узнать про копию.';
    }
  }
  // The file is encrypted with the owner's key: open it on the computer with tools/backup/restore.ps1.
  $('backup-download').addEventListener('click', async () => {
    const b = $('backup-download');
    b.disabled = true;
    try {
      const res = await fetch('/api/owner/backup/latest', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (res.status === 401) { remember(null); show('signin'); return; }
      if (res.status === 429) throw new Error('Слишком часто. Попробуйте через час.');
      if (!res.ok) throw new Error('Не получилось скачать копию.');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `oyuur-${res.headers.get('x-backup-day') || backupDay || 'backup'}.oyuurbak`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      toast('Копия скачана');
    } catch (err) {
      toast(err instanceof TypeError ? 'Нет связи с сервером.' : err.message);
    } finally {
      b.disabled = false;
    }
  });

  // ---- The numbers (OYUUR-27): everything from /api/owner/stats, drawn as plain rows and bars ----
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const people = (n) => `${n} ${plural(n, 'установка', 'установки', 'установок')}`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const dayOf = (day) => new Date(`${day}T00:00:00Z`);
  const short = (day) => dayOf(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
  const range = (a, b) => {
    if (a === b) return short(a);
    const x = dayOf(a);
    const y = dayOf(b);
    return x.getUTCMonth() === y.getUTCMonth() ? `${x.getUTCDate()}–${short(b)}` : `${short(a)} – ${short(b)}`;
  };
  const addDays = (day, n) => new Date(dayOf(day).getTime() + n * 86400000).toISOString().slice(0, 10);

  // The last thing someone did before they stopped coming.
  const LAST_DONE = {
    first_launch: 'Только открыли в первый раз', app_open: 'Открыли и ничего не сделали', plant: 'Посадили дерево и не полили',
    water: 'Полили дерево', chance_used: 'Сгорел шанс за пропуск', tree_died: 'Дерево погибло', lock_in: 'Закрепили результат',
    signup: 'Создали аккаунт', login: 'Вошли в аккаунт', friend_request: 'Позвали друга', friend_added: 'Добавили друга',
    shared_propose: 'Предложили общее дерево', shared_accept: 'Приняли общее дерево', purchase: 'Купили в магазине',
    install_card_shown: 'Увидели совет «На экран Домой»', install_card_closed: 'Закрыли совет «На экран Домой»',
  };
  const MODE_NAMES = { browser: 'Браузер', standalone: 'Экран «Домой» (iPhone)', android: 'Android-приложение', ios: 'iOS-приложение' };
  const GONE_DAYS = { d0: 'В 1-й день', d1_2: 'На 2–3-й день', d3_6: 'На 4–7-й день', d7: 'Позже недели' };
  /** Fewer coming back than this is a warning (amber). */
  const LOW = 20;

  function statCard(title, note) {
    const box = el('section', 'stat-card');
    box.append(el('h2', null, title));
    if (note) box.append(el('p', 'note', note));
    return box;
  }
  /** One row: the words, the number (or [main, small]), and a bar of `value` out of `max`; tone: '', 'warn', 'gray'. */
  function barRow(label, value, max, right, tone = '') {
    const row = el('div', 'bar-row');
    const top = el('div', 'bar-top');
    const num = el('span', 'bar-value');
    if (Array.isArray(right)) num.append(el('span', 'bar-sub', right[1]), el('span', null, right[0]));
    else num.textContent = right;
    top.append(el('span', 'bar-label', label), num);
    const track = el('div', 'bar-track');
    const fill = el('div', `bar-fill ${tone}`);
    fill.style.width = `${max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0}%`;
    track.append(fill);
    row.append(top, track);
    return row;
  }
  function tile(value, label, sub) {
    const t = el('div', 'tile');
    t.append(el('div', 'tile-value', String(value)), el('div', 'tile-label', label));
    if (sub) t.append(el('div', 'tile-sub', sub));
    return t;
  }

  /** New installs a day (a week, when it's more than 2 months): columns, tap one for its number. */
  function installsChart(s) {
    let cols = s.installsByDay.map((d) => ({ from: d.day, to: d.day, installs: d.installs }));
    if (cols.length > 62) {
      // Weeks from Monday, as in the table by weeks.
      const weeks = [];
      for (const c of cols) {
        const w = weeks[weeks.length - 1];
        if (w && dayOf(c.from).getUTCDay() !== 1) {
          w.to = c.to;
          w.installs += c.installs;
        } else {
          weeks.push({ ...c });
        }
      }
      cols = weeks;
    }
    const weekly = cols[0].from !== cols[0].to;
    const box = statCard(weekly ? 'Новые установки по неделям' : 'Новые установки по дням');
    const max = Math.max(1, ...cols.map((c) => c.installs));
    const best = cols.reduce((a, c) => (c.installs > a.installs ? c : a), cols[0]);
    const say = (c) => `${range(c.from, c.to)}: ${people(c.installs)}`;
    const readout = el('p', 'readout', `Больше всего — ${say(best)}`);
    const chart = el('div', 'columns');
    chart.style.setProperty('--gap', cols.length > 20 ? '2px' : '6px');
    // A finger on any spot of the chart (or sliding along it) picks the column under it.
    const under = (e) => {
      const r = chart.getBoundingClientRect();
      const k = Math.min(cols.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * cols.length)));
      chart.children[k].click();
    };
    chart.addEventListener('pointerdown', under);
    chart.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' && e.buttons) under(e); });
    for (const c of cols) {
      const b = el('button', 'col');
      b.type = 'button';
      b.setAttribute('aria-label', say(c));
      b.title = say(c);
      const fill = el('span', c.installs ? 'col-fill' : 'col-fill zero');
      fill.style.height = c.installs ? `${Math.max(6, (c.installs / max) * 100)}%` : '2px';
      b.append(fill);
      const pick = () => {
        readout.textContent = say(c);
        for (const o of chart.children) o.classList.toggle('on', o === b);
      };
      b.addEventListener('click', pick);
      b.addEventListener('mouseenter', pick);
      b.addEventListener('focus', pick);
      chart.append(b);
    }
    const axis = el('div', 'axis');
    axis.append(el('span', null, short(cols[0].from)), el('span', null, short(cols[cols.length - 1].to)));
    const scale = el('div', 'chart');
    scale.append(el('span', 'chart-max', String(max)), chart);
    box.append(readout, scale, axis, el('p', 'note', 'Нажмите на столбик или проведите пальцем — покажу день.'));
    return box;
  }

  function retentionCard(s) {
    const box = statCard('Возвращаются', 'Открыли снова на N-й день после установки');
    for (const c of s.retention) {
      const p = pct(c.back, c.of);
      const right = c.of ? [`${p}%`, `${c.back} из ${c.of}`] : 'ещё рано';
      box.append(barRow(c.day === 1 ? 'На 1-й день (назавтра)' : `На ${c.day}-й день`, c.back, c.of, right, c.of && p < LOW ? 'warn' : ''));
    }
    return box;
  }

  function cohortCard(s) {
    const box = statCard('По неделям прихода', 'Кто пришёл за неделю — сколько вернулись на N-й день. «·» — ещё рано.');
    const wrap = el('div', 'table-wrap');
    const table = el('table', 'cohorts');
    const head = el('tr');
    head.append(el('th', 'week', 'Неделя с'), el('th', 'num', 'Пришли'));
    for (const c of s.retention) head.append(el('th', 'num', `${c.day}-й`));
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const w of s.cohorts) {
      const tr = el('tr');
      const week = el('td', 'week', short(w.week));
      week.title = range(w.week, addDays(w.week, 6));
      tr.append(week, el('td', 'num', String(w.installs)));
      for (const c of w.cells) {
        const td = el('td', 'num cell');
        if (!c.of) {
          td.append(el('span', 'dim', '·'));
          td.title = 'Ещё рано';
        } else {
          const p = pct(c.back, c.of);
          td.style.setProperty('--p', String(p / 100));
          td.classList.add('heat');
          if (p >= 50) td.classList.add('strong');
          td.append(el('span', 'cell-p', `${p}%`), el('span', 'cell-n', `${c.back}/${c.of}`));
          td.title = `Вернулись на ${c.day}-й день: ${c.back} из ${c.of}`;
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    wrap.append(table);
    box.append(wrap);
    return box;
  }

  function funnelCard(s) {
    const f = s.funnel;
    const box = statCard('Первый день', 'Новые люди, шаг за шагом (без пришедших вчера и сегодня)');
    if (!f.opened) {
      box.append(el('p', 'dim-line', 'Пока некого считать: подождите день-два после первых установок.'));
      return box;
    }
    const steps = [['Открыли приложение', f.opened], ['Посадили дерево', f.planted], ['Полили в тот же день', f.watered], ['И вернулись назавтра', f.returned]];
    steps.forEach(([label, n], k) => {
      const lost = k ? steps[k - 1][1] - n : 0;
      const right = k ? [`${pct(n, f.opened)}%`, `${n} из ${f.opened}`] : String(n);
      const row = barRow(label, n, f.opened, right);
      if (lost) row.append(el('p', 'lost', `−${lost} на этом шаге`));
      box.append(row);
    });
    return box;
  }

  function goneCard(s) {
    const g = s.gone;
    const box = statCard('Где бросают', `Не заходят больше 3 дней: ${g.count} из ${s.installs}`);
    if (!g.count) {
      box.append(el('p', 'dim-line', 'Пока никто не ушёл.'));
      return box;
    }
    box.append(el('h3', null, 'Когда ушли'));
    for (const d of g.days) box.append(barRow(GONE_DAYS[d.key] || d.key, d.count, g.count, String(d.count), 'gray'));
    box.append(el('h3', null, 'Что сделали последним'));
    for (const d of g.last.slice(0, 8)) box.append(barRow(LAST_DONE[d.name] || d.name, d.count, g.count, String(d.count), 'gray'));
    return box;
  }

  function modesCard(s) {
    const box = statCard('Где открывают');
    // No iOS app yet: its row shows only once there is someone in it.
    for (const m of s.modes) if (m.installs || m.mode !== 'ios') box.append(barRow(MODE_NAMES[m.mode] || m.mode, m.installs, s.installs, [`${pct(m.installs, s.installs)}%`, String(m.installs)]));
    return box;
  }

  function socialCard(s) {
    const box = statCard('Аккаунты и друзья');
    box.append(
      barRow('Создали аккаунт', s.social.signup, s.installs, [`${pct(s.social.signup, s.installs)}%`, `${s.social.signup} из ${s.installs}`]),
      barRow('Вошли в свой аккаунт с другого телефона', s.social.login, s.installs, [`${pct(s.social.login, s.installs)}%`, `${s.social.login} из ${s.installs}`]),
      barRow('Добавили хотя бы одного друга', s.social.friend, s.installs, [`${pct(s.social.friend, s.installs)}%`, `${s.social.friend} из ${s.installs}`]),
    );
    return box;
  }

  /** One line in plain words: how many come back after a week (or the latest known day), and where most stop. */
  function summary(s) {
    const known = [...s.retention].reverse().find((c) => c.of && c.day <= 7) || s.retention.find((c) => c.of);
    const parts = [];
    if (known) {
      const p = pct(known.back, known.of);
      const when = known.day === 7 ? 'через неделю' : known.day === 1 ? 'назавтра' : `на ${known.day}-й день`;
      parts.push(`${when[0].toUpperCase()}${when.slice(1)} возвращаются ${p}% (${known.back} из ${known.of}).`);
    } else {
      parts.push(`Пришли ${people(s.installs)} — возвраты будут видны завтра.`);
    }
    const day = [...s.gone.days].sort((a, b) => b.count - a.count)[0];
    const what = s.gone.last[0];
    if (s.gone.count && day && what) {
      parts.push(`Чаще уходят ${(GONE_DAYS[day.key] || '').toLowerCase().replace('в 1-й день', 'в первый же день')}; последнее действие — «${(LAST_DONE[what.name] || what.name).toLowerCase()}».`);
    }
    const box = el('p', `summary${known && pct(known.back, known.of) < LOW ? ' warn' : ''}`, parts.join(' '));
    return box;
  }

  let statsLoading = 0;
  async function loadStats() {
    const mine = ++statsLoading;
    $('stats-error').textContent = '';
    $('stats').classList.add('loading');
    try {
      const s = await api('GET', `/api/owner/stats?period=${period}`);
      if (mine !== statsLoading) return;
      $('stats-empty').hidden = s.installs > 0;
      if (!s.installs) {
        $('stats').replaceChildren();
        return;
      }
      const head = el('p', 'period-line', `Пришли ${range(s.from, s.to)}${s.period === 'all' ? ' (всё время)' : ''}${s.old ? ` · из них ${s.old} обновили старую версию` : ''}`);
      const tiles = el('div', 'tiles');
      tiles.append(
        tile(s.installs, `${plural(s.installs, 'пришёл', 'пришли', 'пришли')} за период`),
        tile(s.active, 'заходили на этой неделе'),
        tile(s.streaks, 'поливают 3+ дня подряд'),
      );
      $('stats').replaceChildren(summary(s), head, tiles, retentionCard(s), goneCard(s), funnelCard(s), cohortCard(s), installsChart(s), modesCard(s), socialCard(s));
    } catch (err) {
      if (err.message !== 'signed_out' && mine === statsLoading) {
        $('stats').replaceChildren();
        $('stats-error').textContent = 'Не получилось загрузить. Проверьте связь и нажмите «Обновить».';
      }
    } finally {
      if (mine === statsLoading) $('stats').classList.remove('loading');
    }
  }
  for (const b of document.querySelectorAll('.period button')) {
    b.addEventListener('click', () => {
      period = b.dataset.period;
      try { sessionStorage.setItem(PERIOD_KEY, period); } catch {}
      markPeriod();
      loadStats();
    });
  }
  function markPeriod() {
    for (const o of document.querySelectorAll('.period button')) o.setAttribute('aria-checked', String(o.dataset.period === period));
  }
  markPeriod();


  // ---- Confirm and toast ----
  let onYes = null;
  function confirmThen(ask, run) {
    $('confirm-title').textContent = ask.title;
    $('confirm-text').textContent = ask.text;
    $('confirm-yes').textContent = ask.yes;
    $('confirm-yes').className = ask.tone;
    onYes = run;
    $('confirm').hidden = false;
    $('confirm-no').focus();
  }
  const closeConfirm = () => {
    $('confirm').hidden = true;
    onYes = null;
  };
  $('confirm-no').addEventListener('click', closeConfirm);
  $('confirm').addEventListener('click', (e) => { if (e.target === $('confirm')) closeConfirm(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('confirm').hidden) closeConfirm(); });
  $('confirm-yes').addEventListener('click', () => {
    const run = onYes;
    closeConfirm();
    if (run) run();
  });

  let toastTimer = 0;
  function toast(text) {
    $('toast').textContent = text;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2500);
  }

  if (token) {
    show('reports');
    openSection(section);
    loadBackup();
  } else {
    show('signin');
  }
})();
