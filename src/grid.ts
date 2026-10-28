import type { Rect } from './box';

/** Pistas de una cuadrícula ya resueltas en píxeles (getComputedStyle devuelve "120px 120px …"). */
export function trackSizes(template: string): number[] {
  if (!template || template === 'none') return [];
  return template.split(/\s+/).map(parseFloat).filter((n) => Number.isFinite(n));
}

/**
 * Huecos entre columnas y entre filas, en coordenadas de ventana, para dibujarlos y arrastrarlos.
 * `origin` es la esquina de la caja de contenido del contenedor.
 */
export function gapRects(
  cols: readonly number[], rows: readonly number[], colGap: number, rowGap: number,
  origin: { x: number; y: number }, min = 0,
): { columns: Rect[]; rows: Rect[] } {
  const width = cols.reduce((a, b) => a + b, 0) + colGap * Math.max(0, cols.length - 1);
  const height = rows.reduce((a, b) => a + b, 0) + rowGap * Math.max(0, rows.length - 1);
  const between = (sizes: readonly number[], gap: number) => {
    const out: { start: number; size: number }[] = [];
    let pos = 0;
    sizes.forEach((s, i) => {
      pos += s;
      if (i < sizes.length - 1) {
        const size = Math.max(gap, min);
        out.push({ start: pos + gap / 2 - size / 2, size });
        pos += gap;
      }
    });
    return out;
  };
  return {
    columns: between(cols, colGap).map((g) => ({ x: origin.x + g.start, y: origin.y, w: g.size, h: height })),
    rows: between(rows, rowGap).map((g) => ({ x: origin.x, y: origin.y + g.start, w: width, h: g.size })),
  };
}
