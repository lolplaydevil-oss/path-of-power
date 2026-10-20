const app = document.getElementById('app');
let token = localStorage.getItem('token');
let state = null;
let tab = 'home';
let bgm = null;

const TRAIN = {
  strength: { title: '💪 Силовая (подходы)', def: 3 },
  cardio:   { title: '🏃 Кардио (минуты)',  def: 20 },
  puzzle:   { title: '🧩 Головоломка (шт.)', def: 1 },
};

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- API ----------
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}

// ---------- Звуки (синтез через Web Audio, файлов не нужно) ----------
let actx;
function audioCtx() {
  actx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
  const c = audioCtx(), t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur);
}
const sfx = {
  hit()     { tone(220, 0.18, 'square', 0.35, 40); tone(90, 0.25, 'sawtooth', 0.3, 30); },
  crit()    { tone(700, 0.1, 'triangle', 0.3, 200); tone(150, 0.35, 'sawtooth', 0.4, 30); },
  victory() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.3, null, i * 0.12)); },
};

// ---------- Музыка боссов ----------
function playMusic(src) {
  stopMusic();
  bgm = new Audio(src);
  bgm.loop = true;
  bgm.volume = 0.35;
  bgm.play().catch(() => toast('Нажми ещё раз, чтобы включить музыку'));
}
function stopMusic() {
  if (bgm) { bgm.pause(); bgm = null; }
}

// ---------- Вспомогательное ----------
function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}
function hitEffect() {
  app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake');
}
function showVictory(r) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `
    <div class="card modal-box">
      <h2>🏆 Победа!</h2>
      <p>${esc(r.bossName)} повержен!</p>
      <p class="phrase">«${esc(r.phrase)}»</p>
      <button class="primary">Продолжить</button>
    </div>`;
  m.querySelector('button').onclick = () => m.remove();
  document.body.appendChild(m);
}

// ---------- Вход / регистрация ----------
function renderAuth(mode = 'login') {
  app.innerHTML = `
    <div class="card auth">
      <h1>⚔️ Путь Силы</h1>
      <div class="tabs">
        <button data-m="login" class="${mode === 'login' ? 'active' : ''}">Вход</button>
        <button data-m="register" class="${mode === 'register' ? 'active' : ''}">Регистрация</button>
      </div>
      <form id="authForm">
        <input name="username" placeholder="Логин" required minlength="3" maxlength="32">
        <input name="password" type="password" placeholder="Пароль (от 6 символов)" required minlength="6">
        <button class="primary">${mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
        <p class="err" id="err"></p>
      </form>
    </div>`;
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => renderAuth(b.dataset.m));
  document.getElementById('authForm').onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      const d = await api(mode === 'login' ? '/api/login' : '/api/register', { method: 'POST', body });
      token = d.token;
      localStorage.setItem('token', token);
      await loadGame();
    } catch (err) {
      document.getElementById('err').textContent = err.message;
    }
  };
}

function logout() {
  token = null;
  localStorage.removeItem('token');
  stopMusic();
  renderAuth('login');
}

async function loadGame() {
  try {
    state = await api('/api/me');
    renderGame();
  } catch {
    logout();
  }
}

// ---------- Главный экран ----------
function renderGame() {
  const { user } = state;
  const tabs = [
    ['home', '🏠 Герой'],
    ['bosses', '👹 Боссы'],
    ['top', '🏆 Рейтинг'],
    ...(user.role === 'admin' ? [['admin', '🛠 Админ']] : []),
  ];
  app.innerHTML = `
    <header class="top">
      <span class="avatar">${AVATARS[user.avatar_id - 1]}</span>
      <b>${esc(user.username)}</b>
      ${user.role === 'admin' ? '<span class="badge">ADMIN</span>' : ''}
      <button id="logout" class="small">Выйти</button>
    </header>
    <nav class="tabs">
      ${tabs.map(([k, t]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${t}</button>`).join('')}
    </nav>
    <main id="content"></main>`;
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderGame(); });
  document.getElementById('logout').onclick = logout;

  const c = document.getElementById('content');
  const views = { home: renderHome, bosses: renderBosses, top: renderTop, admin: renderAdmin };
  views[tab](c);
}

// ----- Герой -----
function renderHome(c) {
  const s = state.stats;
  const bar = (name, v) => `<div class="row"><span>${name}</span><b>${v}</b></div>`;
  c.innerHTML = `
    <div class="card">
      <h2>Характеристики</h2>
      ${bar('💪 Сила', s.strength)}
      ${bar('🏃 Ловкость', s.agility)}
      ${bar('🧠 Интеллект', s.intellect)}
    </div>
    <div class="card">
      <h2>Тренировка ${state.trainedToday ? '✅ сегодня есть' : '❌ сегодня нет'}</h2>
      ${Object.entries(TRAIN).map(([k, t]) => `
        <div class="row">
          <span>${t.title}</span>
          <input type="number" min="1" max="100" value="${t.def}" id="amt-${k}">
          <button data-train="${k}" class="primary small">Записать</button>
        </div>`).join('')}
    </div>
    <div class="card">
      <h2>Выбери аватар</h2>
      <div class="avatars">
        ${AVATARS.map((a, i) => `<button class="av ${state.user.avatar_id === i + 1 ? 'sel' : ''}" data-av="${i + 1}">${a}</button>`).join('')}
      </div>
    </div>`;

  c.querySelectorAll('[data-train]').forEach(b => b.onclick = async () => {
    const kind = b.dataset.train;
    const amount = Number(document.getElementById('amt-' + kind).value);
    try {
      const r = await api('/api/train', { method: 'POST', body: { kind, amount } });
      toast(`+${r.points} очков к характеристике`);
      await loadGame();
    } catch (e) { toast('⛔ ' + e.message); }
  });
  c.querySelectorAll('[data-av]').forEach(b => b.onclick = async () => {
    try {
      await api('/api/avatar', { method: 'POST', body: { avatarId: Number(b.dataset.av) } });
      await loadGame();
    } catch (e) { toast('⛔ ' + e.message); }
  });
}

// ----- Боссы -----
function renderBosses(c) {
  const isAdmin = state.user.role === 'admin';
  const status = `Тренировка: ${state.trainedToday ? '✅' : '❌ нужна'} · Атака: ${state.attackedToday ? '⛔ использована' : '⚔️ доступна'}`;
  c.innerHTML = `
    <div class="card"><p>${status}</p>
      ${isAdmin ? '<label><input type="checkbox" id="testMode" style="width:auto"> Тестовый режим (без ограничений)</label>' : ''}
    </div>
    ${state.bosses.map(b => {
      const pct = Math.round(b.hpLeft / b.hp * 100);
      const req = `💪${b.req.strength} 🏃${b.req.agility} 🧠${b.req.intellect}`;
      return `
        <div class="card boss ${b.unlocked || b.defeated ? '' : 'locked'}" style="border-color:${b.color}">
          <h3>${b.id}. ${b.emoji} ${b.name} ${b.defeated ? '🏆' : ''}</h3>
          <div class="hp"><div style="width:${pct}%"></div></div>
          <small>HP: ${b.hpLeft}/${b.hp} · Нужно: ${req}</small>
          <div class="row">
            <button data-music="${b.id}" class="small">🎵 Тема</button>
            ${b.defeated ? '<span>Побеждён!</span>'
              : b.unlocked ? `<button data-attack="${b.id}" class="primary">⚔️ Атаковать</button>`
              : '<span>🔒 Закрыт</span>'}
          </div>
        </div>`;
    }).join('')}`;

  c.querySelectorAll('[data-music]').forEach(btn => btn.onclick = () => {
    const boss = state.bosses.find(x => x.id === Number(btn.dataset.music));
    playMusic(boss.music);
    toast('🎵 ' + boss.name);
  });

  c.querySelectorAll('[data-attack]').forEach(btn => btn.onclick = async () => {
    const test = !!document.getElementById('testMode')?.checked;
    try {
      const r = await api('/api/attack', { method: 'POST', body: { bossId: Number(btn.dataset.attack), test } });
      if (r.crit) sfx.crit(); else sfx.hit();
      hitEffect();
      toast(`${r.crit ? '💥 КРИТ! ' : ''}−${r.damage} HP · осталось ${r.hpLeft}`);
      if (r.killed) { sfx.victory(); showVictory(r); }
      await loadGame();
    } catch (e) { toast('⛔ ' + e.message); }
  });
}

// ----- Таблица лидеров -----
async function renderTop(c) {
  c.innerHTML = 'Загрузка...';
  try {
    const rows = await api('/api/leaderboard');
    c.innerHTML = `
      <div class="card">
        <h2>🏆 Таблица лидеров</h2>
        <table>
          <tr><th>#</th><th></th><th>Игрок</th><th>Боссы</th><th>Очки</th></tr>
          ${rows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${AVATARS[r.avatar_id - 1]}</td>
              <td>${esc(r.username)}</td>
              <td>${r.bosses_killed}/10</td>
              <td>${r.total}</td>
            </tr>`).join('')}
        </table>
      </div>`;
  } catch (e) { c.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ----- Админ-панель -----
async function renderAdmin(c) {
  try {
    const users = await api('/api/admin/users');
    c.innerHTML = `
      <div class="card">
        <h2>🛠 Игроки</h2>
        <table>
          <tr><th>ID</th><th>Логин</th><th>💪</th><th>🏃</th><th>🧠</th><th>Действия</th></tr>
          ${users.map(u => `
            <tr>
              <td>${u.id}</td>
              <td>${esc(u.username)} ${u.role === 'admin' ? '👑' : ''}</td>
              <td>${u.strength}</td><td>${u.agility}</td><td>${u.intellect}</td>
              <td class="acts">
                <button class="small" data-a="stats" data-id="${u.id}">Изменить</button>
                <button class="small" data-a="hist" data-id="${u.id}">История</button>
                <button class="small" data-a="boss" data-id="${u.id}">Босс</button>
                <button class="small danger" data-a="reset" data-id="${u.id}">Сброс</button>
              </td>
            </tr>`).join('')}
        </table>
      </div>
      <div id="adminOut"></div>`;
    c.querySelectorAll('[data-a]').forEach(b =>
      b.onclick = () => adminAction(b.dataset.a, b.dataset.id, users));
  } catch (e) { c.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

async function adminAction(action, id, users) {
  const u = users.find(x => String(x.id) === String(id));
  const out = document.getElementById('adminOut');
  try {
    if (action === 'hist') {
      const h = await api(`/api/admin/users/${id}/history`);
      out.innerHTML = `
        <div class="card">
          <h3>История изменений: ${esc(u.username)}</h3>
          <table>
            <tr><th>Дата</th><th>Что</th><th>Было</th><th>Стало</th><th>Кто</th><th>Причина</th></tr>
            ${h.map(r => `
              <tr>
                <td>${new Date(r.created_at).toLocaleString('ru')}</td>
                <td>${r.stat}</td><td>${r.old_value}</td><td>${r.new_value}</td>
                <td>${esc(r.changed_by)}</td><td>${esc(r.reason || '')}</td>
              </tr>`).join('') || '<tr><td colspan="6">Пусто</td></tr>'}
          </table>
        </div>`;
      return;
    }
    if (action === 'stats') {
      const stat = prompt('Характеристика: strength / agility / intellect', 'strength');
      if (!stat) return;
      const value = Number(prompt('Новое значение', '10'));
      if (Number.isNaN(value)) return;
      const reason = prompt('Причина изменения', 'Коррекция администратором') || '';
      await api(`/api/admin/users/${id}/stats`, { method: 'POST', body: { stat, value, reason } });
    } else if (action === 'boss') {
      const bossId = Number(prompt('Номер босса (1–10)', '1'));
      if (!bossId) return;
      const act = prompt('kill — победить босса, reset — сбросить его прогресс', 'kill');
      await api(`/api/admin/users/${id}/boss`, { method: 'POST', body: { bossId, action: act } });
    } else if (action === 'reset') {
      if (!confirm(`Обнулить прогресс игрока ${u.username}?`)) return;
      await api(`/api/admin/users/${id}/reset`, { method: 'POST' });
    }
    toast('✅ Готово');
    renderGame();
  } catch (e) { toast('⛔ ' + e.message); }
}

// ---------- Старт ----------
if (token) loadGame(); else renderAuth('login');
