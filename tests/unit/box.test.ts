import { dragSign } from '../../src/box';

describe('dragSign', () => {
  it('el margen crece hacia fuera y el relleno hacia dentro', () => {
    expect(dragSign('margin', 'top')).toEqual({ axis: 'y', sign: -1 });
    expect(dragSign('margin', 'right')).toEqual({ axis: 'x', sign: 1 });
    expect(dragSign('padding', 'top')).toEqual({ axis: 'y', sign: 1 });
    expect(dragSign('padding', 'left')).toEqual({ axis: 'x', sign: 1 });
    expect(dragSign('padding', 'right')).toEqual({ axis: 'x', sign: -1 });
  });
});
