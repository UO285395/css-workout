/** A qué elementos afecta un cambio: solo al seleccionado o a todos los que comparten sus clases. */
export type Scope = 'element' | 'class';

// CSS.escape existe en todos los navegadores; la alternativa cubre entornos de prueba como jsdom.
const esc = (s: string) =>
  typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&').replace(/^(\d)/, '\\3$1 ');

/** Clases "de autor": se descartan las que añade el propio editor. */
export function authorClasses(el: Element): string[] {
  return Array.from(el.classList).filter((c) => !c.startsWith('cssw-'));
}

/** Selector por clases, p. ej. `.card.card--big`. Devuelve null si el elemento no tiene clases. */
export function classSelector(el: Element): string | null {
  const classes = authorClasses(el);
  if (classes.length === 0) return null;
  return classes.map((c) => '.' + esc(c)).join('');
}

function segment(el: Element): string {
  let seg = el.tagName.toLowerCase();
  const cls = classSelector(el);
  if (cls) seg += cls;
  const parent = el.parentElement;
  if (parent) {
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    if (sameTag.length > 1) seg += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
  }
  return seg;
}

/** Selector que identifica solo a este elemento, lo más corto posible y legible. */
export function uniqueSelector(el: Element, doc: Document = el.ownerDocument): string {
  if (el.id && doc.querySelectorAll('#' + esc(el.id)).length === 1) return '#' + esc(el.id);

  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== doc.documentElement) {
    if (current !== el && current.id && doc.querySelectorAll('#' + esc(current.id)).length === 1) {
      parts.unshift('#' + esc(current.id));
      break;
    }
    parts.unshift(segment(current));
    const candidate = parts.join(' > ');
    if (doc.querySelectorAll(candidate).length === 1) return candidate;
    current = current.parentElement;
  }
  return parts.join(' > ');
}

export function selectorFor(el: Element, scope: Scope): string {
  if (scope === 'class') return classSelector(el) ?? uniqueSelector(el);
  return uniqueSelector(el);
}

/** Ámbito por defecto: por clase si el elemento tiene clases, si no, solo el elemento. */
export function defaultScope(el: Element): Scope {
  return classSelector(el) ? 'class' : 'element';
}

/** Nombre corto para mostrar al usuario, p. ej. `div.card`. */
export function describe(el: Element): string {
  const cls = authorClasses(el);
  return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls.map((c) => '.' + c).join('');
}
