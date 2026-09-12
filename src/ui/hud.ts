import type { CarState } from '../vehicle/carPhysics';
import { questText, type Quest } from '../quest/quest';

const KMH_PER_UNIT = 4;

export function createHud() {
  const root = document.getElementById('hud')!;
  root.innerHTML = `
    <style>
      #hud .box { position: absolute; background: rgba(8,12,24,.55); border-radius: 12px; padding: 10px 14px; backdrop-filter: blur(4px); }
      #q { top: 16px; left: 16px; max-width: 420px; font-size: 18px; font-weight: 600; }
      #q small { display: block; font-weight: 400; opacity: .85; margin-top: 4px; }
      #speed { bottom: 16px; left: 16px; font-size: 34px; font-weight: 800; }
      #speed span { font-size: 14px; font-weight: 400; margin-left: 4px; }
      #toast { top: 18%; left: 50%; transform: translateX(-50%); font-size: 26px; font-weight: 700; color: #ffe066; transition: opacity .3s; }
      #help { bottom: 16px; right: 16px; font-size: 13px; opacity: .8; }
    </style>
    <div id="q" class="box"></div>
    <div id="speed" class="box"></div>
    <div id="toast" class="box"></div>
    <div id="help" class="box">WASD / panah · Spasi rem · R ulang</div>`;
  const q = root.querySelector<HTMLElement>('#q')!;
  const speed = root.querySelector<HTMLElement>('#speed')!;
  const toast = root.querySelector<HTMLElement>('#toast')!;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return {
    update(quest: Quest, car: CarState) {
      const timer = quest.phase === 'delivering' ? ` · ⏱ ${fmt(quest.timeLeft)}` : '';
      q.innerHTML = `${questText(quest)}<small>Ronde ${quest.round} · Skor ${quest.score}${timer}</small>`;
      speed.innerHTML = `${Math.round(Math.abs(car.speed) * KMH_PER_UNIT)}<span>km/j</span>`;
      toast.textContent = quest.toast;
      toast.style.opacity = quest.toastTtl > 0 ? '1' : '0';
    },
  };
}
