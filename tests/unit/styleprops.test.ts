import { rgbToHex, axisProp, isTransparent } from '../../src/styleprops';

describe('styleprops', () => {
  it('convierte colores rgb a hexadecimal', () => {
    expect(rgbToHex('rgb(34, 34, 34)')).toBe('#222222');
    expect(rgbToHex('rgba(255, 0, 128, 0.5)')).toBe('#ff0080');
  });

  it('detecta fondos transparentes', () => {
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true);
    expect(isTransparent('rgb(0, 0, 0)')).toBe(false);
  });

  it('horizontal y vertical dependen de la dirección', () => {
    expect(axisProp('row', 'horizontal')).toBe('justify-content');
    expect(axisProp('row', 'vertical')).toBe('align-items');
    expect(axisProp('column', 'horizontal')).toBe('align-items');
    expect(axisProp('column-reverse', 'vertical')).toBe('justify-content');
  });
});
