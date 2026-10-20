import express from 'express';
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BOSSES, ACTIVITY, STATS, damageFor, meets } from './bosses.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { DATABASE_URL, JWT_SECRET = 'dev-secret-change-me', PORT = 3000 } = process.env;
const { Pool } = pg;

import cors from 'cors';

app.use(cors());

// ---------- База данных ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});



// ---------- Утилиты ----------
const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = fn => (req, res) =>
  fn(req, res).catch(e => {
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Ошибка сервера' });
  });
const sign = u => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '30d' });

async function auth(req, res, next) {
  try {
    const { id } = jwt.verify((req.headers.authorization || '').slice(7), JWT_SECRET);
    const { rows } = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [id]);
    if (!rows[0]) throw new Error();
    req.user = rows[0]; // роль берём из БД, поэтому смена роли действует сразу
    next();
  } catch {
    res.status(401).json({ error: 'Войдите в аккаунт' });
  }
}
const admin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Только для администратора' });

// Изменение характеристики с записью в историю
async function changeStat(uid, stat, calc, changedBy, reason) {
  if (!STATS.includes(stat)) throw fail(400, 'Неизвестная характеристика');
  const { rows: [u] } = await pool.query(`SELECT ${stat} AS v FROM users WHERE id = $1`, [uid]);
  if (!u) throw fail(404, 'Игрок не найден');
  const newV = Math.max(0, Math.round(calc(u.v)));
  await pool.query(`UPDATE users SET ${stat} = $2 WHERE id = $1`, [uid, newV]);
  await pool.query(
    `INSERT INTO stat_history (user_id, stat, old_value, new_value, changed_by, reason)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [uid, stat, u.v, newV, changedBy, reason]
  );
}

// Полное состояние игрока для клиента
async function getState(uid) {
  const { rows: [u] } = await pool.query(
    'SELECT id, username, role, avatar_id, strength, agility, intellect FROM users WHERE id = $1', [uid]);
  const { rows: bp } = await pool.query(
    'SELECT boss_id, damage, defeated FROM boss_progress WHERE user_id = $1', [uid]);
  const { rows: [t] } = await pool.query(`
    SELECT
      EXISTS(SELECT 1 FROM activity_log WHERE user_id = $1 AND created_at::date = CURRENT_DATE) AS trained,
      EXISTS(SELECT 1 FROM attack_log   WHERE user_id = $1 AND created_at::date = CURRENT_DATE) AS attacked`,
    [uid]);

  const stats = { strength: u.strength, agility: u.agility, intellect: u.intellect };
  const bosses = BOSSES.map(b => {
    const p = bp.find(x => x.boss_id === b.id) || { damage: 0, defeated: false };
    const prevDone = b.id === 1 || bp.some(x => x.boss_id === b.id - 1 && x.defeated);
    return {
      ...b,
      damage: p.damage,
      defeated: p.defeated,
      hpLeft: Math.max(0, b.hp - p.damage),
      unlocked: prevDone && meets(stats, b.req),
    };
  });
  return { user: u, stats, bosses, trainedToday: t.trained, attackedToday: t.attacked };
}

// ---------- Express ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ----- Регистрация и вход -----
app.post('/api/register', wrap(async (req, res) => {
  const { username = '', password = '' } = req.body;
  if (!/^[\w.-]{3,32}$/.test(username) || password.length < 6)
    throw fail(400, 'Логин 3–32 символа (буквы, цифры, . _ -), пароль от 6 символов');
  const hash = await bcrypt.hash(password, 10);
  const { rows: [u] } = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, role',
    [username, hash]
  ).catch(e => { throw e.code === '23505' ? fail(409, 'Такой логин уже занят') : e; });
  res.json({ token: sign(u) });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { username = '', password = '' } = req.body;
  const { rows: [u] } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    throw fail(401, 'Неверный логин или пароль');
  res.json({ token: sign(u) });
}));

app.get('/api/me', auth, wrap(async (req, res) => res.json(await getState(req.user.id))));

app.post('/api/avatar', auth, wrap(async (req, res) => {
  const id = Number(req.body.avatarId);
  if (!Number.isInteger(id) || id < 1 || id > 30) throw fail(400, 'Аватар от 1 до 30');
  await pool.query('UPDATE users SET avatar_id = $2 WHERE id = $1', [req.user.id, id]);
  res.json({ ok: true });
}));

// ----- Тренировки -----
app.post('/api/train', auth, wrap(async (req, res) => {
  const { kind, amount } = req.body;
  const a = ACTIVITY[kind];
  const n = Number(amount);
  if (!a || !Number.isInteger(n) || n < 1 || n > 100) throw fail(400, 'Некорректные данные');
  const points = n * a.perUnit;
  await changeStat(req.user.id, a.stat, v => v + points, 'self', `Тренировка: ${a.label} × ${n}`);
  await pool.query(
    'INSERT INTO activity_log (user_id, kind, amount, points) VALUES ($1,$2,$3,$4)',
    [req.user.id, kind, n, points]
  );
  res.json({ ok: true, points });
}));

// ----- Атака на босса -----
app.post('/api/attack', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const bossId = Number(req.body.bossId);
  const test = req.user.role === 'admin' && req.body.test === true; // тестовый режим админа

  const st = await getState(uid);
  const b = st.bosses.find(x => x.id === bossId);
  if (!b) throw fail(400, 'Нет такого босса');
  if (b.defeated) throw fail(400, 'Босс уже побеждён');

  if (!test) {
    if (!b.unlocked) throw fail(403, 'Босс закрыт: нужны предыдущий босс и нужные характеристики');
    if (!st.trainedToday) throw fail(403, 'Сначала сделай тренировку сегодня');
    if (st.attackedToday) throw fail(403, 'Сегодня атака уже использована. Возвращайся завтра!');
  }

  const { damage, crit } = test
    ? { damage: Math.min(Number(req.body.damage) || 100, 1e6), crit: false }
    : damageFor(st.stats);

  await pool.query(
    `INSERT INTO boss_progress (user_id, boss_id, damage) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, boss_id) DO UPDATE SET damage = boss_progress.damage + EXCLUDED.damage`,
    [uid, bossId, damage]
  );
  if (!test)
    await pool.query('INSERT INTO attack_log (user_id, boss_id, damage) VALUES ($1,$2,$3)', [uid, bossId, damage]);

  const total = b.damage + damage;
  const killed = total >= b.hp;
  if (killed)
    await pool.query('UPDATE boss_progress SET defeated = TRUE WHERE user_id = $1 AND boss_id = $2', [uid, bossId]);

  const boss = BOSSES.find(x => x.id === bossId);
  res.json({
    damage, crit,
    hpLeft: Math.max(0, b.hp - total),
    killed,
    bossName: boss.name,
    phrase: killed ? boss.phrase : null,
  });
}));

// ----- Таблица лидеров -----
app.get('/api/leaderboard', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.username, u.avatar_id, u.strength, u.agility, u.intellect,
           (u.strength + u.agility + u.intellect) AS total,
           COUNT(bp.boss_id) FILTER (WHERE bp.defeated) AS bosses_killed
    FROM users u
    LEFT JOIN boss_progress bp ON bp.user_id = u.id
    GROUP BY u.id
    ORDER BY bosses_killed DESC, total DESC
    LIMIT 50`);
  res.json(rows);
}));

// ----- Админ-панель -----
app.get('/api/admin/users', auth, admin, wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, role, avatar_id, strength, agility, intellect, created_at FROM users ORDER BY id');
  res.json(rows);
}));

app.get('/api/admin/users/:id/history', auth, admin, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT stat, old_value, new_value, changed_by, reason, created_at
     FROM stat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 300`, [req.params.id]);
  res.json(rows);
}));

app.post('/api/admin/users/:id/stats', auth, admin, wrap(async (req, res) => {
  const value = Number(req.body.value);
  if (!Number.isInteger(value) || value < 0 || value > 100000) throw fail(400, 'Некорректное значение');
  await changeStat(req.params.id, req.body.stat, () => value, req.user.username,
    req.body.reason || 'Изменено администратором');
  res.json({ ok: true });
}));

app.post('/api/admin/users/:id/reset', auth, admin, wrap(async (req, res) => {
  const id = req.params.id;
  for (const stat of STATS)
    await changeStat(id, stat, () => 0, req.user.username, 'Сброс прогресса администратором');
  await pool.query('DELETE FROM boss_progress WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM activity_log  WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM attack_log    WHERE user_id = $1', [id]);
  res.json({ ok: true });
}));

app.post('/api/admin/users/:id/boss', auth, admin, wrap(async (req, res) => {
  const bossId = Number(req.body.bossId);
  const boss = BOSSES.find(b => b.id === bossId);
  if (!boss) throw fail(400, 'Нет такого босса');
  if (req.body.action === 'kill') {
    await pool.query(
      `INSERT INTO boss_progress (user_id, boss_id, damage, defeated) VALUES ($1,$2,$3,TRUE)
       ON CONFLICT (user_id, boss_id) DO UPDATE SET defeated = TRUE, damage = $3`,
      [req.params.id, bossId, boss.hp]);
  } else if (req.body.action === 'reset') {
    await pool.query('DELETE FROM boss_progress WHERE user_id = $1 AND boss_id = $2', [req.params.id, bossId]);
  } else throw fail(400, 'action: kill или reset');
  res.json({ ok: true });
}));

app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
 export default app;
  