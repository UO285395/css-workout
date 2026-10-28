import { rgbToHex, axisProp, isTransparent, collectColors } from '../../src/styleprops';

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

describe('collectColors', () => {
  it('devuelve los colores de la página de más a menos usado, sin transparentes', () => {
    document.body.innerHTML = `
      <p style="color: rgb(37, 99, 235)">a</p>
      <p style="color: rgb(37, 99, 235); background: rgba(0, 0, 0, 0)">b</p>
      <div style="border: 1px solid #e5e5e5; color: rgb(37, 99, 235)">c</div>
      <span style="color: #111111">d</span>`;
    const colors = collectColors(document.body);
    expect(colors[0]).toBe('#2563eb');
    expect(colors).toContain('#e5e5e5');
    expect(colors).toContain('#111111');
    expect(colors.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  });
});
