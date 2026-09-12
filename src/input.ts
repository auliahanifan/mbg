import type { CarInput } from './vehicle/carPhysics';

const down = new Set<string>();
const pressed = new Set<string>();

addEventListener('keydown', (e) => {
  if (!down.has(e.code)) pressed.add(e.code);
  down.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());

const axis = (a: string, b: string) => (down.has(a) || down.has(b) ? 1 : 0);

export function readCarInput(): CarInput {
  return {
    throttle: axis('KeyW', 'ArrowUp') - axis('KeyS', 'ArrowDown'),
    steer: axis('KeyA', 'ArrowLeft') - axis('KeyD', 'ArrowRight'),
    brake: down.has('Space'),
    nos: down.has('ShiftLeft') || down.has('ShiftRight'),
  };
}

/** True exactly once per physical key press. */
export function consumeKey(code: string): boolean {
  return pressed.delete(code);
}

export const isDown = (code: string) => down.has(code);
