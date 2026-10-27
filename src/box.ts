export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

export type Sides = Record<Side, number>;

export interface Rect { x: number; y: number; w: number; h: number }

/** Geometría de la caja de un elemento en coordenadas de ventana (como el panel de DevTools). */
export interface BoxModel {
  border: Rect;
  margin: Sides;
  padding: Sides;
  borderWidth: Sides;
  boxSizing: 'content-box' | 'border-box';
  display: string;
  /** Ancho y alto tal como los entiende `width`/`height` según el box-sizing. */
  cssWidth: number;
  cssHeight: number;
}

const px = (v: string) => parseFloat(v) || 0;

function sides(cs: CSSStyleDeclaration, prefix: string, suffix = ''): Sides {
  return {
    top: px(cs.getPropertyValue(`${prefix}-top${suffix}`)),
    right: px(cs.getPropertyValue(`${prefix}-right${suffix}`)),
    bottom: px(cs.getPropertyValue(`${prefix}-bottom${suffix}`)),
    left: px(cs.getPropertyValue(`${prefix}-left${suffix}`)),
  };
}

export function measure(el: Element): BoxModel {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const margin = sides(cs, 'margin');
  const padding = sides(cs, 'padding');
  const borderWidth = sides(cs, 'border', '-width');
  const boxSizing = cs.boxSizing === 'border-box' ? 'border-box' : 'content-box';
  const extraW = boxSizing === 'border-box' ? 0 : padding.left + padding.right + borderWidth.left + borderWidth.right;
  const extraH = boxSizing === 'border-box' ? 0 : padding.top + padding.bottom + borderWidth.top + borderWidth.bottom;
  return {
    border: { x: r.left, y: r.top, w: r.width, h: r.height },
    margin,
    padding,
    borderWidth,
    boxSizing,
    display: cs.display,
    cssWidth: Math.round(r.width - extraW),
    cssHeight: Math.round(r.height - extraH),
  };
}

/** Rectángulo de la zona de margen o relleno de un lado. `min` da grosor a las zonas de 0 px para poder agarrarlas. */
export function zoneRect(box: BoxModel, kind: 'margin' | 'padding', side: Side, min = 0): Rect {
  const b = box.border;
  if (kind === 'margin') {
    const t = Math.max(box.margin[side], min);
    switch (side) {
      case 'top': return { x: b.x, y: b.y - t, w: b.w, h: t };
      case 'bottom': return { x: b.x, y: b.y + b.h, w: b.w, h: t };
      case 'left': return { x: b.x - t, y: b.y, w: t, h: b.h };
      case 'right': return { x: b.x + b.w, y: b.y, w: t, h: b.h };
    }
  }
  const bw = box.borderWidth;
  const inner = { x: b.x + bw.left, y: b.y + bw.top, w: b.w - bw.left - bw.right, h: b.h - bw.top - bw.bottom };
  const t = Math.max(box.padding[side], min);
  switch (side) {
    case 'top': return { x: inner.x, y: inner.y, w: inner.w, h: Math.min(t, inner.h) };
    case 'bottom': return { x: inner.x, y: inner.y + inner.h - Math.min(t, inner.h), w: inner.w, h: Math.min(t, inner.h) };
    case 'left': return { x: inner.x, y: inner.y, w: Math.min(t, inner.w), h: inner.h };
    case 'right': return { x: inner.x + inner.w - Math.min(t, inner.w), y: inner.y, w: Math.min(t, inner.w), h: inner.h };
  }
}

/**
 * Signo con el que el desplazamiento del ratón cambia el valor: el margen crece hacia fuera
 * de la caja y el relleno hacia dentro.
 */
export function dragSign(kind: 'margin' | 'padding', side: Side): { axis: 'x' | 'y'; sign: 1 | -1 } {
  const axis = side === 'top' || side === 'bottom' ? 'y' : 'x';
  const outwardPositive = side === 'bottom' || side === 'right';
  const sign = (kind === 'margin') === outwardPositive ? 1 : -1;
  return { axis, sign };
}
