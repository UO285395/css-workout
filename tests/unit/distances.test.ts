import { describe, it, expect } from 'vitest';
import { distances } from '../../src/distances';

describe('medir distancias', () => {
  it('entre dos elementos en la misma fila mide el hueco horizontal', () => {
    const m = distances({ x: 0, y: 0, w: 100, h: 50 }, { x: 124, y: 10, w: 100, h: 50 });
    expect(m).toEqual([{ x1: 100, y1: 30, x2: 124, y2: 30, value: 24 }]);
  });

  it('en diagonal mide el hueco horizontal y el vertical', () => {
    const m = distances({ x: 0, y: 0, w: 100, h: 50 }, { x: 110, y: 70, w: 20, h: 20 });
    expect(m.map((x) => x.value)).toEqual([10, 20]);
  });

  it('dentro de su contenedor mide hasta cada borde', () => {
    const m = distances({ x: 20, y: 10, w: 60, h: 30 }, { x: 0, y: 0, w: 100, h: 50 });
    expect(m.map((x) => x.value)).toEqual([20, 20, 10, 10]);
  });

  it('si el otro está dentro del seleccionado, mide desde el interior', () => {
    const m = distances({ x: 0, y: 0, w: 100, h: 50 }, { x: 20, y: 10, w: 60, h: 30 });
    expect(m.map((x) => x.value)).toEqual([20, 20, 10, 10]);
  });
});
