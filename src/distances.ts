import type { Rect } from './box';

/** Una cota: segmento horizontal o vertical y los píxeles que mide. */
export interface Measure { x1: number; y1: number; x2: number; y2: number; value: number }

const contains = (o: Rect, i: Rect) => o.x <= i.x && o.y <= i.y && o.x + o.w >= i.x + i.w && o.y + o.h >= i.y + i.h;

/** Distancias desde `inner` hasta los cuatro bordes de `outer`, que lo contiene. */
function inside(inner: Rect, outer: Rect): Measure[] {
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return [
    { x1: outer.x, y1: cy, x2: inner.x, y2: cy },
    { x1: inner.x + inner.w, y1: cy, x2: outer.x + outer.w, y2: cy },
    { x1: cx, y1: outer.y, x2: cx, y2: inner.y },
    { x1: cx, y1: inner.y + inner.h, x2: cx, y2: outer.y + outer.h },
  ].map((m) => ({ ...m, value: Math.round(Math.abs(m.x2 - m.x1) + Math.abs(m.y2 - m.y1)) })).filter((m) => m.value > 0);
}

/** Centro del tramo que comparten dos intervalos, o el centro del primero si no se solapan. */
const shared = (a0: number, a1: number, b0: number, b1: number) => {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return lo <= hi ? (lo + hi) / 2 : (a0 + a1) / 2;
};

/**
 * Cotas entre el elemento seleccionado (`a`) y otro (`b`), como en Figma: si uno contiene al otro,
 * la distancia a cada borde; si no, el hueco horizontal y el vertical entre ellos.
 */
export function distances(a: Rect, b: Rect): Measure[] {
  if (contains(b, a)) return inside(a, b);
  if (contains(a, b)) return inside(b, a);
  const out: Measure[] = [];
  const y = shared(a.y, a.y + a.h, b.y, b.y + b.h);
  const x = shared(a.x, a.x + a.w, b.x, b.x + b.w);
  if (b.x >= a.x + a.w) out.push({ x1: a.x + a.w, y1: y, x2: b.x, y2: y, value: 0 });
  else if (b.x + b.w <= a.x) out.push({ x1: b.x + b.w, y1: y, x2: a.x, y2: y, value: 0 });
  if (b.y >= a.y + a.h) out.push({ x1: x, y1: a.y + a.h, x2: x, y2: b.y, value: 0 });
  else if (b.y + b.h <= a.y) out.push({ x1: x, y1: b.y + b.h, x2: x, y2: a.y, value: 0 });
  return out.map((m) => ({ ...m, value: Math.round(Math.abs(m.x2 - m.x1) + Math.abs(m.y2 - m.y1)) }));
}
