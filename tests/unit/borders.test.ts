import { describe, it, expect } from 'vitest';
import { parseShadow, formatShadow, withPart, DEFAULT_SHADOW } from '../../src/borders';

describe('parseShadow', () => {
  it('lee la sombra calculada por el navegador', () => {
    expect(parseShadow('rgba(37, 99, 235, 0.15) 0px 8px 24px 0px')).toEqual({
      x: 0, y: 8, blur: 24, spread: 0, color: '#2563eb', alpha: 15, inset: false,
    });
  });

  it('se queda con la primera de varias sombras y detecta inset', () => {
    const s = parseShadow('rgb(0, 0, 0) 1px -2px 3px 4px inset, rgba(0, 0, 0, 0.5) 0px 0px 2px 0px');
    expect(s).toMatchObject({ x: 1, y: -2, blur: 3, spread: 4, alpha: 100, inset: true });
  });

  it('sin sombra devuelve null', () => {
    expect(parseShadow('none')).toBeNull();
  });
});

describe('formatShadow y withPart', () => {
  it('escribe el color con su opacidad', () => {
    expect(formatShadow(DEFAULT_SHADOW)).toBe('0px 4px 12px 0px rgba(0, 0, 0, 0.15)');
    expect(formatShadow({ ...DEFAULT_SHADOW, alpha: 100, color: '#2563eb' })).toBe('0px 4px 12px 0px #2563eb');
  });

  it('cambia una sola parte de la sombra', () => {
    expect(withPart(DEFAULT_SHADOW, 'shadow-blur', '20')).toBe('0px 4px 20px 0px rgba(0, 0, 0, 0.15)');
    expect(withPart(DEFAULT_SHADOW, 'shadow-inset', 'inset')).toBe('inset 0px 4px 12px 0px rgba(0, 0, 0, 0.15)');
    expect(withPart(DEFAULT_SHADOW, 'shadow-alpha', '150')).toBe('0px 4px 12px 0px #000000');
  });

  it('la sombra escrita se vuelve a leer igual', () => {
    const s = { x: -3, y: 6, blur: 10, spread: 2, color: '#ff0000', alpha: 40, inset: true };
    expect(parseShadow(formatShadow(s))).toEqual(s);
  });
});
