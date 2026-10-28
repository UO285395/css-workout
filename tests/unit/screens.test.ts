import { describe, it, expect } from 'vitest';
import { SCREENS, screenFor, ruleKey, parseKey } from '../../src/screens';
import { ChangeStore } from '../../src/changes';

const [desktop, tablet, mobile] = SCREENS;

describe('tamaños de pantalla', () => {
  it('elige el tamaño por el ancho de la ventana', () => {
    expect(screenFor(1440).id).toBe('desktop');
    expect(screenFor(1024).id).toBe('desktop');
    expect(screenFor(1023).id).toBe('tablet');
    expect(screenFor(768).id).toBe('tablet');
    expect(screenFor(767).id).toBe('mobile');
    expect(screenFor(375).id).toBe('mobile');
  });

  it('la clave de una regla guarda el selector y su @media', () => {
    expect(ruleKey('.card', desktop)).toBe('.card');
    expect(parseKey(ruleKey('.card > a', mobile))).toEqual({ selector: '.card > a', screen: mobile });
    expect(parseKey('.card')).toEqual({ selector: '.card', screen: desktop });
  });

  it('el CSS pone primero escritorio y luego los @media del más ancho al más estrecho', () => {
    const s = new ChangeStore();
    s.set(ruleKey('.card', mobile), 'padding-top', '8px', '16px');
    s.set(ruleKey('.card', desktop), 'padding-top', '24px', '16px');
    s.set(ruleKey('h1', tablet), 'font-size', '32px', '40px');
    expect(s.toCss()).toBe([
      '.card {\n  padding-top: 24px;\n}',
      '@media (max-width: 1023px) {\n  h1 {\n    font-size: 32px;\n  }\n}',
      '@media (max-width: 767px) {\n  .card {\n    padding-top: 8px;\n  }\n}',
    ].join('\n\n'));
  });
});
