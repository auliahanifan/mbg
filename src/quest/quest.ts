import type { Poi } from '../world/cityMap';

export const STOP_RADIUS = 5;
export const STOP_SPEED = 1.5;
const SCHOOL_SCORE = 100;
const TOAST_SECONDS = 3;

export const roundTime = (round: number) => Math.max(60, 150 - 20 * (round - 1));

export interface Quest {
  phase: 'toKitchen' | 'delivering' | 'done' | 'failed';
  round: number;
  kitchen: Poi;
  schools: Poi[];
  next: number;
  timeLeft: number;
  score: number;
  toast: string;
  toastTtl: number;
}

export function createQuest(kitchen: Poi, schools: Poi[], round = 1): Quest {
  return { phase: 'toKitchen', round, kitchen, schools, next: 0, timeLeft: roundTime(round), score: 0, toast: '', toastTtl: 0 };
}

export function questTarget(q: Quest): Poi | null {
  if (q.phase === 'toKitchen') return q.kitchen;
  if (q.phase === 'delivering') return q.schools[q.next];
  return null;
}

export function questText(q: Quest): string {
  switch (q.phase) {
    case 'toKitchen': return 'Ambil paket MBG di Dapur SPPG';
    case 'delivering': return `Antar ke ${q.schools[q.next].name} (${q.next + 1}/${q.schools.length})`;
    case 'done': return 'Misi selesai! Semua anak sudah makan 🍱 — tekan R untuk ronde berikutnya';
    case 'failed': return 'Waktu habis! Tekan R untuk mengulang';
  }
}

const atStop = (q: Quest, car: { x: number; z: number; speed: number }) => {
  const t = questTarget(q);
  return !!t && Math.hypot(car.x - t.stop.x, car.z - t.stop.z) <= STOP_RADIUS && Math.abs(car.speed) < STOP_SPEED;
};

/** Advances the quest by dt. Pure. */
export function stepQuest(q: Quest, car: { x: number; z: number; speed: number }, dt: number): Quest {
  const n: Quest = { ...q, toastTtl: Math.max(0, q.toastTtl - dt) };
  if (n.phase === 'delivering') {
    n.timeLeft = Math.max(0, n.timeLeft - dt);
    if (n.timeLeft === 0) return { ...n, phase: 'failed', toast: 'Waktu habis!', toastTtl: TOAST_SECONDS };
  }
  if (!atStop(n, car)) return n;
  if (n.phase === 'toKitchen') {
    return { ...n, phase: 'delivering', toast: `Paket MBG dimuat untuk ${n.schools.length} sekolah`, toastTtl: TOAST_SECONDS };
  }
  if (n.phase === 'delivering') {
    const school = n.schools[n.next];
    const next = n.next + 1;
    const finished = next >= n.schools.length;
    const bonus = finished ? Math.round(n.timeLeft) : 0;
    return {
      ...n,
      next,
      phase: finished ? 'done' : 'delivering',
      score: n.score + SCHOOL_SCORE + bonus,
      toast: finished ? `Bonus waktu +${bonus}` : `+${SCHOOL_SCORE} · Terkirim ke ${school.name}`,
      toastTtl: TOAST_SECONDS,
    };
  }
  return n;
}
