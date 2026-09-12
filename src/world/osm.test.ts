import { describe, it, expect } from 'vitest';
import { CENTER, project, bbox, widthOf, heightOf, buildCityData, type OsmElement } from './osm';

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

describe('widthOf / heightOf', () => {
  it('classifies highways and skips footways', () => {
    expect(widthOf('primary')).toBe(12);
    expect(widthOf('primary_link')).toBe(12);
    expect(widthOf('residential')).toBe(6);
    expect(widthOf('service')).toBe(4);
    expect(widthOf('road')).toBe(6);
    expect(widthOf('footway')).toBeNull();
    expect(widthOf('steps')).toBeNull();
  });
  it('uses building:levels, tall tags, else 1-3 floors', () => {
    expect(heightOf({ 'building:levels': '4' }, 0, 0)).toBeCloseTo(12.8);
    const tall = heightOf({ building: 'hotel' }, 5, 5);
    expect(tall).toBeGreaterThanOrEqual(16);
    expect(tall).toBeLessThanOrEqual(25.6);
    const low = heightOf({ building: 'yes' }, 5, 5);
    expect(low).toBeGreaterThanOrEqual(3.2);
    expect(low).toBeLessThanOrEqual(9.6);
    expect(heightOf({ building: 'yes' }, 5, 5)).toBe(low); // deterministic
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
    { type: 'way', id: 12, nodes: [3, 2], tags: { highway: 'service' } },
    { type: 'way', id: 20, nodes: [1, 2, 4, 1], tags: { building: 'yes' } },
    { type: 'way', id: 21, nodes: [1, 2], tags: { building: 'yes' } }, // not closed → skipped
  ];
  const data = buildCityData(elements);
  it('keeps only drivable ways, sharing node indices', () => {
    expect(data.ways).toHaveLength(2);
    expect(data.ways[0]).toEqual({ n: [0, 1], w: 6, name: 'Jalan A' });
    expect(data.ways[1]).toEqual({ n: [2, 1], w: 4 });
    expect(data.nodes).toHaveLength(3);
    expect(data.nodes[0]).toEqual([0, 0]);
    expect(data.nodes[1][0]).toBeCloseTo(110.4, 0);
  });
  it('emits closed buildings without the repeated last point', () => {
    expect(data.buildings).toHaveLength(1);
    expect(data.buildings[0].p).toHaveLength(3);
    expect(data.buildings[0].h).toBeGreaterThan(0);
  });
  it('projects the hardcoded POIs', () => {
    expect(data.pois.map((p) => p.id)).toEqual(['K', '1', '2', '3', 'A', 'M', 'S', 'G']);
    const k = data.pois[0];
    expect(k.kind).toBe('kitchen');
    expect(k.z).toBeLessThan(-1000); // Polresta is north of centre
  });
});
