import { describe, it, expect } from 'vitest';
import { trackSizes, gapRects } from '../../src/grid';

describe('cuadrícula', () => {
  it('lee las pistas resueltas', () => {
    expect(trackSizes('120px 120.5px 80px')).toEqual([120, 120.5, 80]);
    expect(trackSizes('none')).toEqual([]);
  });

  it('coloca los huecos entre columnas y entre filas', () => {
    const g = gapRects([100, 100, 100], [50, 50], 20, 10, { x: 10, y: 5 });
    expect(g.columns).toEqual([
      { x: 110, y: 5, w: 20, h: 110 },
      { x: 230, y: 5, w: 20, h: 110 },
    ]);
    expect(g.rows).toEqual([{ x: 10, y: 55, w: 340, h: 10 }]);
  });

  it('da un grosor mínimo a los huecos de 0 px para poder agarrarlos', () => {
    const g = gapRects([100, 100], [50], 0, 0, { x: 0, y: 0 }, 8);
    expect(g.columns[0]).toEqual({ x: 96, y: 0, w: 8, h: 50 });
  });
});
