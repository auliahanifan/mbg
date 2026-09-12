import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { paintWhite } from './livery';

function meshWithUvs(name: string, uvs: number[][]): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(uvs.length * 3).fill(0), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  const m = new THREE.Mesh(geo);
  m.name = name;
  return m;
}
const uvsOf = (m: THREE.Mesh) => Array.from((m.geometry.attributes.uv as THREE.BufferAttribute).array);

describe('paintWhite', () => {
  it('moves grey (col3,row2) and green (col3,row1) cells to the white cell (col6,row2), leaves others', () => {
    const body = meshWithUvs('body', [[0.469, 0.7], [0.469, 0.3], [0.1, 0.9]]);
    const g = new THREE.Group().add(body);
    paintWhite(g);
    const uv = uvsOf(body);
    expect(uv[0]).toBeCloseTo(0.844); expect(uv[1]).toBeCloseTo(0.7);   // grey → white, same row
    expect(uv[2]).toBeCloseTo(0.844); expect(uv[3]).toBeCloseTo(0.55);  // green (row1) → white (row2)
    expect(uv[4]).toBeCloseTo(0.1);   expect(uv[5]).toBeCloseTo(0.9);   // untouched
  });
  it('does not mutate the shared source geometry and ignores wheels', () => {
    const body = meshWithUvs('body', [[0.469, 0.7]]);
    const wheel = meshWithUvs('wheel-front-left', [[0.469, 0.7]]);
    const original = body.geometry;
    paintWhite(new THREE.Group().add(body, wheel));
    expect(body.geometry).not.toBe(original);
    expect(uvsOf(wheel)[0]).toBeCloseTo(0.469);
  });
});
