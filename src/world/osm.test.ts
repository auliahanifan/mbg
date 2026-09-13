import { describe, it, expect } from 'vitest';
import { CENTER, project, bbox, widthOf, area, orientedBox, classify, propagateNames, buildCityData, areaKind, lineKind, pointInRing, scatter, clearRoads, type OsmElement } from './osm';

describe('project', () => {
  it('maps the centre to the origin, north to -z, east to +x', () => {
    expect(project(CENTER.lat, CENTER.lon)).toEqual([0, 0]);
    const [x, z] = project(CENTER.lat + 0.001, CENTER.lon + 0.001);
    expect(z).toBeCloseTo(-110.574, 1);
    expect(x).toBeCloseTo(111.32 * Math.cos((CENTER.lat * Math.PI) / 180), 1);
  });
  it('bbox is centred and 3400 m wide', () => {
    const b = bbox();
    expect((b.north + b.south) / 2).toBeCloseTo(CENTER.lat, 6);
    expect((b.north - b.south) * 110574).toBeCloseTo(3400, 0);
  });
});

describe('widthOf', () => {
  it('classifies highways and skips footways', () => {
    expect(widthOf('primary')).toBe(12);
    expect(widthOf('primary_link')).toBe(12);
    expect(widthOf('residential')).toBe(6);
    expect(widthOf('service')).toBe(4);
    expect(widthOf('road')).toBe(6);
    expect(widthOf('footway')).toBeNull();
    expect(widthOf('steps')).toBeNull();
  });
});

const SQ: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]; // 100 m² house
const BIG: [number, number][] = [[0, 0], [30, 0], [30, 30], [0, 30]]; // 900 m², short side 30 > 18
const HOUSE_BIG: [number, number][] = [[0, 0], [25, 0], [25, 16], [0, 16]]; // 400 m² but still roofable (short 16)
const L: [number, number][] = [[0, 0], [20, 0], [20, 4], [4, 4], [4, 20], [0, 20]]; // 144 m² in a 400 m² box → fill 0.36

describe('area / orientedBox', () => {
  it('area is orientation independent', () => {
    expect(area(SQ)).toBe(100);
    expect(area([...SQ].reverse())).toBe(100);
    expect(area(L)).toBe(144);
  });
  it('finds the rotated minimum box', () => {
    const b = orientedBox([[0, 0], [10, 10], [5, 15], [-5, 5]]); // 14.14 × 7.07 rectangle at 45°
    expect(b.long).toBeCloseTo(Math.sqrt(200), 3);
    expect(b.short).toBeCloseTo(Math.sqrt(50), 3);
    expect(b.cx).toBeCloseTo(2.5, 3);
    expect(b.cz).toBeCloseTo(7.5, 3);
    expect(Math.abs(b.ux)).toBeCloseTo(Math.SQRT1_2, 3);
    expect(Math.abs(b.uz)).toBeCloseTo(Math.SQRT1_2, 3);
  });
});

describe('classify', () => {
  it('explicit levels/height win', () => {
    expect(classify({ building: 'yes', 'building:levels': '4' }, BIG)).toEqual({ h: 12.8 });
    expect(classify({ building: 'yes', height: '15' }, BIG)).toEqual({ h: 15 });
    expect(classify({ building: 'yes', 'building:levels': '2' }, SQ).h).toBe(6.4); // a 2-storey house keeps its roof
    expect(['hip', 'gable']).toContain(classify({ building: 'yes', 'building:levels': '2' }, SQ).r);
  });
  it('small plain footprints are 1-2 storey hip-roofed houses', () => {
    const c = classify({ building: 'yes' }, SQ);
    expect([3.2, 6.4]).toContain(c.h);
    expect(['hip', 'gable']).toContain(c.r);
    expect(classify({ building: 'yes' }, HOUSE_BIG).r).toBeUndefined(); // 400 m² plain box: not a house
    expect(['hip', 'gable']).toContain(classify({ building: 'house' }, HOUSE_BIG).r); // explicit house tag ignores the area cap
    expect(classify({ building: 'yes' }, SQ)).toEqual(c); // deterministic
  });
  it('L-shapes and big plain boxes get flat roofs', () => {
    expect(classify({ building: 'yes' }, L).r).toBeUndefined();
    const big = classify({ building: 'yes' }, BIG);
    expect([3.2, 6.4]).toContain(big.h);
    expect(big.r).toBeUndefined();
  });
  it('shops are 2-3 storey ruko, hotels 4-6, mosques domed', () => {
    const ruko = classify({ building: 'yes', shop: 'bakery' }, SQ);
    expect([6.4, 9.6]).toContain(ruko.h);
    expect(ruko.r).toBeUndefined();
    const hotel = classify({ building: 'yes', tourism: 'hotel' }, BIG);
    expect(hotel.h).toBeGreaterThanOrEqual(12.8);
    expect(hotel.h).toBeLessThanOrEqual(19.2);
    expect(classify({ building: 'mosque' }, SQ)).toEqual({ h: 4.8, r: 'dome' });
    expect(classify({ building: 'yes', amenity: 'place_of_worship' }, SQ).r).toBe('dome');
    expect(classify({ building: 'yes', amenity: 'place_of_worship', religion: 'christian' }, SQ).r).toBeUndefined();
    expect(classify({ building: 'yes', name: 'Mushola Darul Hikmah' }, SQ).r).toBe('dome');
  });
});

describe('classify known landmarks', () => {
  it('Rita Supermall is a 5-storey mall with a 17-storey tower, the station a hip-roofed hall', () => {
    expect(classify({ building: 'yes', name: 'Rita Supermall' }, BIG)).toEqual({ h: 16, t: 54.4 });
    expect(classify({ building: 'yes', name: 'Stasiun Purwokerto' }, BIG)).toEqual({ h: 6.4, r: 'hip' });
    expect(classify({ building: 'yes', 'building:levels': '12', name: 'Aston Imperium Hotel Purwokerto', tourism: 'hotel' }, BIG)).toEqual({ h: 38.4 });
  });
});

describe('buildCityData', () => {
  const lat = CENTER.lat;
  const lon = CENTER.lon;
  const d = 0.001;
  const elements: OsmElement[] = [
    { type: 'node', id: 1, lat, lon },
    { type: 'node', id: 2, lat, lon: lon + d },
    { type: 'node', id: 3, lat: lat + d, lon: lon + d },
    { type: 'node', id: 4, lat: lat - d, lon: lon - d },
    { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential', name: 'Jalan A' } },
    { type: 'way', id: 11, nodes: [2, 3], tags: { highway: 'footway' } },
    { type: 'way', id: 12, nodes: [3, 2], tags: { highway: 'service', alt_name: 'Gang B' } },
    { type: 'way', id: 20, nodes: [1, 2, 4, 1], tags: { building: 'yes' } },
    { type: 'way', id: 21, nodes: [1, 2], tags: { building: 'yes' } }, // not closed → skipped
  ];
  const data = buildCityData(elements);
  it('keeps only drivable ways, sharing node indices', () => {
    expect(data.ways).toHaveLength(2);
    expect(data.ways[0]).toEqual({ n: [0, 1], w: 6, name: 'Jalan A' });
    expect(data.ways[1]).toEqual({ n: [2, 1], w: 4, name: 'Gang B' });
    expect(data.nodes).toHaveLength(3);
    expect(data.nodes[0]).toEqual([0, 0]);
    expect(data.nodes[1][0]).toBeCloseTo(110.4, 0);
  });
  it('emits closed buildings without the repeated last point, classified', () => {
    expect(data.buildings).toHaveLength(1);
    expect(data.buildings[0].p).toHaveLength(3);
    expect(data.buildings[0].h).toBeGreaterThan(0);
    expect(data.buildings[0].r).toBeUndefined(); // 6105 m² triangle: not a house → flat
  });
  it('projects the hardcoded POIs', () => {
    expect(data.pois.map((p) => p.id)).toEqual(['K', '1', '2', '3', 'A', 'M', 'S', 'G']);
    const k = data.pois[0];
    expect(k.kind).toBe('kitchen');
    expect(k.z).toBeLessThan(-1000); // Polresta is north of centre
  });
});

describe('propagateNames', () => {
  const nodes: [number, number][] = [[0, 0], [100, 0], [200, 5], [100, 100], [300, 0]];
  const mk = () => [
    { n: [0, 1], w: 6, name: 'Jalan A' },
    { n: [1, 2], w: 6 }, // continues A almost straight (≈3°)
    { n: [1, 3], w: 6 }, // perpendicular side street
    { n: [4, 2], w: 6 }, // continues the (now named) way 1, reversed direction
  ];
  it('names straight continuations transitively, never side streets', () => {
    const ways = mk();
    propagateNames(nodes, ways);
    expect(ways.map((w) => w.name)).toEqual(['Jalan A', 'Jalan A', undefined, 'Jalan A']);
  });
  it('picks the straightest named neighbour at a junction', () => {
    const ways = [{ n: [0, 1], w: 6, name: 'Jalan A' }, { n: [3, 1], w: 6, name: 'Jalan B' }, { n: [1, 2], w: 6 }];
    propagateNames(nodes, ways);
    expect(ways[2].name).toBe('Jalan A');
  });
});

describe('terrain classification', () => {
  it('maps tags to area / line kinds', () => {
    expect(areaKind({ leisure: 'park' })).toBe('grass');
    expect(areaKind({ natural: 'wood' })).toBe('wood');
    expect(areaKind({ landuse: 'farmland' })).toBe('farm');
    expect(areaKind({ natural: 'water' })).toBe('water');
    expect(areaKind({ landuse: 'residential' })).toBeNull();
    expect(lineKind({ railway: 'rail' })).toBe('rail');
    expect(lineKind({ railway: 'disused' })).toBeNull();
    expect(lineKind({ waterway: 'drain' })).toBe('stream');
  });
  it('scatter stays inside the ring at roughly one point per cell', () => {
    const ring: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const pts = scatter(ring, 10);
    expect(pts.length).toBeGreaterThan(60);
    expect(pts.length).toBeLessThanOrEqual(100);
    for (const [x, z] of pts) expect(pointInRing(x, z, ring)).toBe(true);
    expect(pointInRing(150, 50, ring)).toBe(false);
    expect(scatter(ring, 10)).toEqual(pts); // deterministic
  });
});

describe('clearRoads', () => {
  const data = (nodes: [number, number][], p: [number, number][]) =>
    ({ nodes, ways: [{ n: nodes.map((_, i) => i), w: 6 }], buildings: [{ p, h: 3 }], pois: [] });
  const STRAIGHT: [number, number][] = [[-50, 0], [50, 0]];
  const BENT: [number, number][] = [[-50, -20], [0, 0], [50, -20]]; // apex reaches up to the facade below
  /** Closest approach of any wall of `ring` to the road polyline, sampled every 0.25 m. */
  const clearance = (ring: [number, number][], road: [number, number][]) => {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 4);
      for (let k = 0; k <= steps; k++) {
        const x = ax + ((bx - ax) * k) / steps;
        const z = az + ((bz - az) * k) / steps;
        for (let j = 0; j + 1 < road.length; j++) {
          const [cx, cz] = road[j];
          const dx = road[j + 1][0] - cx;
          const dz = road[j + 1][1] - cz;
          const t = Math.max(0, Math.min(1, ((x - cx) * dx + (z - cz) * dz) / (dx * dx + dz * dz)));
          best = Math.min(best, Math.hypot(cx + dx * t - x, cz + dz * t - z));
        }
      }
    }
    return best;
  };

  it('pushes a footprint overlapping the road back past the kerb', () => {
    const [b] = clearRoads(data(STRAIGHT, [[0, 2], [10, 2], [10, 12], [0, 12]]));
    expect(b.p).toEqual([[0, 3.9], [10, 3.9], [10, 12], [0, 12]]); // front wall out past the 3.8 m corridor, nothing sideways
  });

  it('leaves a footprint clear of the road untouched', () => {
    const p: [number, number][] = [[0, 5], [10, 5], [10, 15], [0, 15]];
    expect(clearRoads(data(STRAIGHT, p))[0].p).toEqual(p);
  });

  it('bends a long facade that only dips into the road mid-wall', () => {
    const p: [number, number][] = [[-40, 2.5], [40, 2.5], [40, 20], [-40, 20]]; // corners clear, middle inside the apex corridor
    expect(clearance(p, BENT)).toBeLessThan(3);
    const [b] = clearRoads(data(BENT, p));
    expect(b.p.length).toBeGreaterThan(4); // the dipping wall got subdivided
    expect(clearance(b.p, BENT)).toBeGreaterThan(3); // and now clears the asphalt
  });

  it('drops a footprint the road runs straight through', () => {
    expect(clearRoads(data(STRAIGHT, [[0, -20], [6, -20], [6, 20], [0, 20]]))).toEqual([]);
  });
});
