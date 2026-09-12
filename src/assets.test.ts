import { describe, it, expect } from 'vitest';
import { packOf } from './assets';

describe('packOf', () => {
  it('maps model names to their Kenney pack folder', () => {
    expect(packOf('road-straight')).toBe('roads');
    expect(packOf('tile-low')).toBe('roads');
    expect(packOf('light-curved')).toBe('roads');
    expect(packOf('building-a')).toBe('commercial');
    expect(packOf('building-skyscraper-c')).toBe('commercial');
    expect(packOf('building-type-d')).toBe('suburban');
    expect(packOf('tree-large')).toBe('suburban');
    expect(packOf('delivery')).toBe('cars');
    expect(packOf('hatchback-sports')).toBe('cars');
  });
});
