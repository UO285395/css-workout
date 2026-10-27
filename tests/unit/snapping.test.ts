import { snap } from '../../src/snapping';

describe('snap', () => {
  const page = [8, 12, 16, 24, 32];

  it('se pega a un valor de la página cercano', () => {
    expect(snap(22.4, page)).toEqual({ value: 24, snapped: true });
  });

  it('redondea a píxel entero si no hay ninguno cerca', () => {
    expect(snap(19.6, page)).toEqual({ value: 20, snapped: false });
  });

  it('con Alt ignora el imán', () => {
    expect(snap(23, page, { free: true })).toEqual({ value: 23, snapped: false });
  });

  it('con Shift va de 8 en 8', () => {
    expect(snap(19, page, { coarse: true }).value).toBe(16);
    expect(snap(21, page, { coarse: true }).value).toBe(24);
  });

  it('nunca baja del mínimo y el 0 siempre atrae', () => {
    expect(snap(-10, page).value).toBe(0);
    expect(snap(2, page).value).toBe(0);
  });
});
