import type { CarState } from '../vehicle/carPhysics';
import { questText, questTarget, type Quest } from '../quest/quest';
import { nearestEdge, type City } from '../world/city';
import { routeField, pathFrom, type RouteField } from '../world/routing';
import { labelSpots } from './mapLabels';

const KMH_PER_UNIT = 3.6; // 1 unit = 1 m
const MAP_PX = 200;
const MAP_M = 400; // window width in metres

export function createHud(city: City) {
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
      #street { bottom: 16px; left: 50%; transform: translateX(-50%); font-size: 16px; font-weight: 600; white-space: nowrap; }
      #map { position: absolute; top: 16px; right: 16px; border-radius: 12px; background: rgba(8,12,24,.55); }
    </style>
    <div id="q" class="box"></div>
    <div id="speed" class="box"></div>
    <div id="toast" class="box"></div>
    <div id="help" class="box">WASD / panah · Spasi rem · R ulang</div>
    <div id="street" class="box" hidden></div>
    <canvas id="map" width="${MAP_PX}" height="${MAP_PX}"></canvas>`;
  const q = root.querySelector<HTMLElement>('#q')!;
  const speed = root.querySelector<HTMLElement>('#speed')!;
  const toast = root.querySelector<HTMLElement>('#toast')!;
  const street = root.querySelector<HTMLElement>('#street')!;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const mg = root.querySelector<HTMLCanvasElement>('#map')!.getContext('2d')!;
  const SCALE = MAP_PX / MAP_M;
  const { nodes, ways } = city.data;
  let field: RouteField | null = null;

  return {
    update(quest: Quest, car: CarState) {
      const timer = quest.phase === 'delivering' ? ` · ⏱ ${fmt(quest.timeLeft)}` : '';
      q.innerHTML = `${questText(quest)}<small>Ronde ${quest.round} · Skor ${quest.score}${timer}</small>`;
      speed.innerHTML = `${Math.round(Math.abs(car.speed) * KMH_PER_UNIT)}<span>km/j</span>`;
      toast.textContent = quest.toast;
      toast.style.opacity = quest.toastTtl > 0 ? '1' : '0';

      const ne = nearestEdge(city, car.x, car.z);
      const edge = city.edges[ne.edge];
      const name = ways[edge.way].name;
      street.textContent = name ?? '';
      street.hidden = !name;

      mg.clearRect(0, 0, MAP_PX, MAP_PX);
      mg.save();
      mg.translate(MAP_PX / 2, MAP_PX / 2);
      mg.scale(SCALE, SCALE);
      mg.translate(-car.x, -car.z);
      mg.lineCap = 'round';
      mg.lineJoin = 'round';
      mg.strokeStyle = '#9aa5a0';
      for (const w of ways) {
        // ponytail: draws every way each frame (~2k polylines, ~1 ms); cull by bbox if the minimap ever shows in a profile
        mg.lineWidth = w.w;
        mg.beginPath();
        w.n.forEach((n, i) => (i ? mg.lineTo(nodes[n][0], nodes[n][1]) : mg.moveTo(nodes[n][0], nodes[n][1])));
        mg.stroke();
      }
      const target = questTarget(quest);
      if (target) {
        if (field?.target !== target.stop.node) field = routeField(city, target.stop.node);
        const path = pathFrom(field, ne.t < 0.5 ? edge.a : edge.b);
        mg.strokeStyle = '#ffd43b';
        mg.lineWidth = 5;
        mg.beginPath();
        mg.moveTo(car.x, car.z);
        for (const n of path) mg.lineTo(nodes[n][0], nodes[n][1]);
        mg.lineTo(target.stop.x, target.stop.z);
        mg.stroke();
        mg.fillStyle = '#ffd43b';
        mg.beginPath();
        mg.arc(target.stop.x, target.stop.z, 10, 0, Math.PI * 2);
        mg.fill();
      }
      mg.restore();
      mg.font = 'bold 10px system-ui, sans-serif';
      mg.textAlign = 'center';
      mg.textBaseline = 'middle';
      mg.lineWidth = 3;
      mg.strokeStyle = 'rgba(8,12,24,.9)';
      mg.fillStyle = '#fff';
      for (const l of labelSpots(city.data, car.x, car.z, MAP_M / 2)) {
        if (mg.measureText(l.text).width > l.len * SCALE) continue; // label longer than its road: skip
        mg.save();
        mg.translate(MAP_PX / 2 + (l.x - car.x) * SCALE, MAP_PX / 2 + (l.z - car.z) * SCALE);
        mg.rotate(l.angle);
        mg.strokeText(l.text, 0, 0);
        mg.fillText(l.text, 0, 0);
        mg.restore();
      }
      mg.save();
      mg.translate(MAP_PX / 2, MAP_PX / 2);
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
