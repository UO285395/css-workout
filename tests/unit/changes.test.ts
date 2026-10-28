import { ChangeStore } from '../../src/changes';

describe('ChangeStore', () => {
  it('registra un arrastre como un solo paso de deshacer', () => {
    const s = new ChangeStore();
    const before = s.get('.card', 'padding-top');
    s.preview('.card', 'padding-top', '18px', '16px');
    s.preview('.card', 'padding-top', '24px', '16px');
    s.record('.card', 'padding-top', before);
    expect(s.rows()).toEqual([{ selector: '.card', prop: 'padding-top', value: '24px', original: '16px' }]);
    s.undo();
    expect(s.size).toBe(0);
    s.redo();
    expect(s.get('.card', 'padding-top')?.value).toBe('24px');
  });

  it('volver al valor original elimina el cambio', () => {
    const s = new ChangeStore();
    s.set('.card', 'margin-left', '8px', '0px');
    s.set('.card', 'margin-left', '0px', '0px');
    expect(s.size).toBe(0);
    s.undo();
    expect(s.get('.card', 'margin-left')?.value).toBe('8px');
  });

  it('genera CSS copiable con el valor anterior en comentario', () => {
    const s = new ChangeStore();
    s.set('.card', 'padding-top', '24px', '16px');
    s.set('#hero', 'width', '640px', '600px');
    expect(s.toCss({ comments: true })).toBe(
      '.card {\n  padding-top: 24px; /* antes: 16px */\n}\n\n#hero {\n  width: 640px; /* antes: 600px */\n}',
    );
    expect(s.toCss({ important: true })).toContain('padding-top: 24px !important;');
  });

  it('un cambio nuevo vacía el rehacer', () => {
    const s = new ChangeStore();
    s.set('a', 'width', '10px', '0px');
    s.undo();
    s.set('a', 'width', '20px', '0px');
    expect(s.canRedo()).toBe(false);
  });

  it('varias propiedades cambiadas a la vez se deshacen en un solo paso', () => {
    const s = new ChangeStore();
    s.setMany('a', [
      { prop: 'display', value: 'inline-block', original: 'inline' },
      { prop: 'width', value: '120px', original: '80px' },
    ]);
    expect(s.size).toBe(2);
    s.undo();
    expect(s.size).toBe(0);
    s.redo();
    expect(s.get('a', 'display')?.value).toBe('inline-block');
  });
});

describe('ChangeStore.setAcross', () => {
  it('cambia varias reglas en un solo paso de deshacer', () => {
    const s = new ChangeStore();
    s.setAcross([
      { selector: '.a', prop: 'order', value: '1', original: '0' },
      { selector: '.b', prop: 'order', value: '0', original: '0' },
      { selector: '.c', prop: 'order', value: '2', original: '0' },
    ]);
    // El que queda en su valor original no cuenta como cambio.
    expect(s.rows().map((r) => r.selector)).toEqual(['.a', '.c']);
    s.undo();
    expect(s.size).toBe(0);
    s.redo();
    expect(s.get('.c', 'order')?.value).toBe('2');
  });
});
