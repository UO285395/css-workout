import { describe, it, expect } from 'vitest';
import { classify, lengthVar, collectVariables } from '../../src/variables';

describe('variables CSS', () => {
  it('clasifica longitudes, colores y el resto', () => {
    expect(classify('24px')).toEqual({ kind: 'length', px: 24 });
    expect(classify(' 1.5rem ', 16)).toEqual({ kind: 'length', px: 24 });
    expect(classify('#2563eb')).toEqual({ kind: 'color' });
    expect(classify('rgb(0, 0, 0)')).toEqual({ kind: 'color' });
    expect(classify('system-ui, sans-serif')).toEqual({ kind: 'other' });
  });

  it('encuentra la variable que vale lo mismo', () => {
    const vars = [{ name: '--s', value: '8px', kind: 'length' as const, px: 8 }, { name: '--m', value: '16px', kind: 'length' as const, px: 16 }];
    expect(lengthVar(vars, 16)?.name).toBe('--m');
    expect(lengthVar(vars, 12)).toBeUndefined();
  });

  it('recoge las variables declaradas en las hojas de la página', () => {
    document.head.innerHTML = '<style>:root { --espacio-m: 16px; --azul: #2563eb; }</style>';
    const names = collectVariables(document).map((v) => v.name);
    expect(names).toEqual(expect.arrayContaining(['--espacio-m', '--azul']));
  });
});
