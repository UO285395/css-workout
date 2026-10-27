/** Distancia en píxeles a la que el arrastre se "pega" a un valor que ya usa la página. */
export const SNAP_THRESHOLD = 3;
/** Paso al mantener Shift. */
export const SHIFT_STEP = 8;

export interface SnapOptions {
  /** Alt: sin imán, valor libre. */
  free?: boolean;
  /** Shift: saltos fijos de SHIFT_STEP. */
  coarse?: boolean;
  min?: number;
}

export interface SnapResult {
  value: number;
  /** true si el valor coincide con uno que ya usa la página. */
  snapped: boolean;
}

const SPACING_PROPS = [
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'row-gap', 'column-gap',
] as const;

/**
 * Recoge los espaciados en píxeles que ya usa la página (márgenes, rellenos y gaps).
 * Como los prototipos no tienen una escala fija, esos valores hacen de escala implícita.
 */
export function collectSpacingValues(root: ParentNode, ignore?: (el: Element) => boolean): number[] {
  const values = new Set<number>();
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (ignore?.(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    for (const prop of SPACING_PROPS) {
      const v = parseFloat(cs.getPropertyValue(prop));
      if (Number.isFinite(v) && v > 0) values.add(Math.round(v));
    }
  }
  return Array.from(values).sort((a, b) => a - b);
}

export function snap(raw: number, candidates: readonly number[], opts: SnapOptions = {}): SnapResult {
  const min = opts.min ?? 0;
  const clamp = (v: number) => Math.max(min, v);

  if (opts.free) return { value: clamp(Math.round(raw)), snapped: false };
  if (opts.coarse) {
    const value = clamp(Math.round(raw / SHIFT_STEP) * SHIFT_STEP);
    return { value, snapped: candidates.includes(value) };
  }

  let best: number | null = null;
  // El 0 siempre cuenta como valor válido aunque la página no lo "use".
  for (const c of [0, ...candidates]) {
    if (c < min) continue;
    if (Math.abs(c - raw) <= SNAP_THRESHOLD && (best === null || Math.abs(c - raw) < Math.abs(best - raw))) best = c;
  }
  if (best !== null) return { value: best, snapped: best !== 0 || candidates.includes(0) };
  return { value: clamp(Math.round(raw)), snapped: false };
}
