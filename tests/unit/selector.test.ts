import { uniqueSelector, classSelector, selectorFor, defaultScope } from '../../src/selector';

describe('selectores', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="app">
        <section class="cards">
          <article class="card"><p>a</p></article>
          <article class="card"><p>b</p></article>
        </section>
      </main>
      <footer><p>c</p><p>d</p></footer>`;
  });

  it('usa la clase como ámbito por defecto si existe', () => {
    const card = document.querySelectorAll('.card')[1];
    expect(defaultScope(card)).toBe('class');
    expect(selectorFor(card, 'class')).toBe('.card');
  });

  it('el selector de un solo elemento es único', () => {
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (el === document.documentElement) continue;
      const sel = uniqueSelector(el);
      expect(document.querySelectorAll(sel)).toHaveLength(1);
      expect(document.querySelector(sel)).toBe(el);
    }
  });

  it('es lo más corto posible', () => {
    const p = document.querySelectorAll('.card p')[1];
    expect(uniqueSelector(p)).toBe('article.card:nth-of-type(2) > p');
  });

  it('usa el id si lo hay', () => {
    expect(uniqueSelector(document.querySelector('main')!)).toBe('#app');
  });

  it('sin clases no hay selector de clase', () => {
    expect(classSelector(document.querySelector('footer')!)).toBeNull();
  });
});
