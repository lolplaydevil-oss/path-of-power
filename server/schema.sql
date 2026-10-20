CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'player',   -- 'player' | 'admin'
  avatar_id     INT NOT NULL DEFAULT 1,
  strength      INT NOT NULL DEFAULT 0,
  agility       INT NOT NULL DEFAULT 0,
  intellect     INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Прогресс по каждому боссу (у каждого игрока свой)
CREATE TABLE IF NOT EXISTS boss_progress (
  user_id   INT REFERENCES users(id) ON DELETE CASCADE,
  boss_id   INT NOT NULL,
  damage    INT NOT NULL DEFAULT 0,
  defeated  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, boss_id)
);

-- Журнал тренировок
CREATE TABLE IF NOT EXISTS activity_log (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(10) NOT NULL,
  amount     INT NOT NULL,
  points     INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Журнал атак (лимит 1 атака в день)
CREATE TABLE IF NOT EXISTS attack_log (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  boss_id    INT NOT NULL,
  damage     INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- История изменения характеристик
CREATE TABLE IF NOT EXISTS stat_history (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  stat        VARCHAR(12) NOT NULL,
  old_value   INT NOT NULL,
  new_value   INT NOT NULL,
  changed_by  VARCHAR(32) NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
