export const STATS = ['strength', 'agility', 'intellect'];

// Как каждая активность превращается в очки характеристик
export const ACTIVITY = {
  strength: { stat: 'strength', perUnit: 5, label: 'Силовая (подходы)' },
  cardio:   { stat: 'agility',  perUnit: 2, label: 'Кардио (минуты)' },
  puzzle:   { stat: 'intellect', perUnit: 3, label: 'Головоломка (решено)' },
};

// 10 боссов: HP растёт с уровнем, требования к характеристикам тоже
export const BOSSES = [
  { id: 1,  name: 'Слизистый Страж', emoji: '🟢', color: '#2ecc71', hp: 300,
    req: { strength: 0,  agility: 0,  intellect: 0  }, music: '/music/boss1.mp3',
    phrase: 'Первая победа! Ты доказал, что можешь. Завтра — ещё один шаг вперёд!' },
  { id: 2,  name: 'Каменный Голем', emoji: '🗿', color: '#95a5a6', hp: 700,
    req: { strength: 10, agility: 8,  intellect: 6  }, music: '/music/boss2.mp3',
    phrase: 'Голем рассыпался в пыль, а ты стал крепче. Сила растёт с каждым днём!' },
  { id: 3,  name: 'Огненный Волк', emoji: '🐺', color: '#e67e22', hp: 1100,
    req: { strength: 20, agility: 16, intellect: 12 }, music: '/music/boss3.mp3',
    phrase: 'Волк повержен! Сердце бьётся быстрее — значит, ты на верном пути!' },
  { id: 4,  name: 'Ледяной Маг', emoji: '❄️', color: '#74b9ff', hp: 1600,
    req: { strength: 30, agility: 24, intellect: 18 }, music: '/music/boss4.mp3',
    phrase: 'Лёд растаял. Твои тело и разум теперь действуют как один кулак. Продолжай!' },
  { id: 5,  name: 'Тень Ветра', emoji: '🌪️', color: '#a29bfe', hp: 2200,
    req: { strength: 40, agility: 32, intellect: 24 }, music: '/music/boss5.mp3',
    phrase: 'Тень развеяна. Ты быстрее любого врага — и становишься ещё быстрее!' },
  { id: 6,  name: 'Чёрный Рыцарь', emoji: '🛡️', color: '#636e72', hp: 2800,
    req: { strength: 50, agility: 40, intellect: 30 }, music: '/music/boss6.mp3',
    phrase: 'Рыцарь пал с честью. Ты заслужил право на следующий бой — держи темп!' },
  { id: 7,  name: 'Громовой Дракон', emoji: '🐉', color: '#f1c40f', hp: 3500,
    req: { strength: 60, agility: 48, intellect: 36 }, music: '/music/boss7.mp3',
    phrase: 'Дракон побеждён! Гром затих, а ты стал грозой для собственных слабостей!' },
  { id: 8,  name: 'Титан Бездны', emoji: '🌑', color: '#6c5ce7', hp: 4300,
    req: { strength: 70, agility: 56, intellect: 42 }, music: '/music/boss8.mp3',
    phrase: 'Титан пал. Ты заглянул в самую глубину себя и вышел сильнее!' },
  { id: 9,  name: 'Призрак Времени', emoji: '⌛', color: '#dfe6e9', hp: 5200,
    req: { strength: 80, agility: 64, intellect: 48 }, music: '/music/boss9.mp3',
    phrase: 'Призрак растворился. Ни один день не потрачен зря — ты это доказал!' },
  { id: 10, name: 'Повелитель Тьмы', emoji: '👿', color: '#d63031', hp: 6000,
    req: { strength: 90, agility: 72, intellect: 54 }, music: '/music/boss10.mp3',
    phrase: 'Повелитель Тьмы повержен! Ты — легенда. Но настоящий бой всегда внутри тебя!' },
];

export function meets(stats, req) {
  return STATS.every(s => stats[s] >= req[s]);
}

// Урон зависит от характеристик + 10% шанс крита ×2
export function damageFor(stats) {
  const base = 10 + stats.strength * 1 + stats.agility * 0.8 + stats.intellect * 0.6;
  let damage = Math.round(base * (0.8 + Math.random() * 0.4));
  const crit = Math.random() < 0.1;
  if (crit) damage *= 2;
  return { damage, crit };
}
