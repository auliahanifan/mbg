import * as THREE from 'three';

// Kenney colormap.png is an 8x4 grid of 64px cells. delivery.glb paints the cab/frame with
// (col 3,row 2) grey and the cargo box with (col 3,row 1) green; (col 6,row 2) is white.
const SRC_COL = 3;
const WHITE_COL = 6;
const WHITE_ROW = 2;

/** Repaints the truck white by moving body/door UVs into the white palette cell. Clones geometry so the cached model is untouched. */
export function paintWhite(group: THREE.Object3D): void {
  for (const name of ['body', 'door']) {
    const mesh = group.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh) continue;
    const geo = mesh.geometry.clone();
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const col = Math.floor(u * 8);
      const row = Math.floor(v * 4);
      if (col === SRC_COL && (row === 1 || row === 2)) uv.setXY(i, u + (WHITE_COL - SRC_COL) / 8, v + (WHITE_ROW - row) / 4);
    }
    uv.needsUpdate = true;
    mesh.geometry = geo;
  }
}
