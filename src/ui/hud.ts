import type { CarState } from '../vehicle/carPhysics';
import { questText, questTarget, type Quest } from '../quest/quest';
import { MAP, TILE, roadTiles } from '../world/cityMap';

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
      #map { position: absolute; top: 16px; right: 16px; border-radius: 12px; background: rgba(8,12,24,.55); }
    </style>
    <div id="q" class="box"></div>
    <div id="speed" class="box"></div>
    <div id="toast" class="box"></div>
    <div id="help" class="box">WASD / panah · Spasi rem · R ulang</div>
    <canvas id="map" width="200" height="200"></canvas>`;
  const q = root.querySelector<HTMLElement>('#q')!;
  const speed = root.querySelector<HTMLElement>('#speed')!;
  const toast = root.querySelector<HTMLElement>('#toast')!;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const map = root.querySelector<HTMLCanvasElement>('#map')!;
  const mg = map.getContext('2d')!;
  const SCALE = map.width / (MAP.length * TILE); // world units -> px
  const toPx = (v: number) => (v + TILE / 2) * SCALE;
  const bg = document.createElement('canvas');
  bg.width = map.width;
  bg.height = map.height;
  const bgCtx = bg.getContext('2d')!;
  bgCtx.fillStyle = '#9aa5a0';
  for (const { row, col } of roadTiles(MAP)) bgCtx.fillRect(col * TILE * SCALE, row * TILE * SCALE, TILE * SCALE + 0.5, TILE * SCALE + 0.5);
  return {
    update(quest: Quest, car: CarState) {
      const timer = quest.phase === 'delivering' ? ` · ⏱ ${fmt(quest.timeLeft)}` : '';
      q.innerHTML = `${questText(quest)}<small>Ronde ${quest.round} · Skor ${quest.score}${timer}</small>`;
      speed.innerHTML = `${Math.round(Math.abs(car.speed) * KMH_PER_UNIT)}<span>km/j</span>`;
      toast.textContent = quest.toast;
      toast.style.opacity = quest.toastTtl > 0 ? '1' : '0';

      mg.clearRect(0, 0, map.width, map.height);
      mg.drawImage(bg, 0, 0);
      const target = questTarget(quest);
      if (target) {
        mg.fillStyle = '#ffd43b';
        mg.beginPath();
        mg.arc(toPx(target.stop.x), toPx(target.stop.z), 5, 0, Math.PI * 2);
        mg.fill();
      }
      mg.save();
      mg.translate(toPx(car.x), toPx(car.z));
      mg.rotate(-car.heading); // canvas y-down flips the rotation direction
      mg.fillStyle = '#4dabf7';
      mg.beginPath();
      mg.moveTo(0, 6);
      mg.lineTo(-4, -4);
      mg.lineTo(4, -4);
      mg.closePath();
      mg.fill();
      mg.restore();
    },
  };
}
