/** Bordes, esquinas y sombras: lectura de la sombra, su CSS y los valores que ya usa la página. */

import { rgbToHex } from './styleprops';

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  /** Color sin transparencia, en hexadecimal. */
  color: string;
  /** Opacidad del color, de 0 a 100. */
  alpha: number;
  inset: boolean;
}

/** Sombra con la que se empieza al pulsar «Añadir sombra»: suave y hacia abajo. */
export const DEFAULT_SHADOW: Shadow = { x: 0, y: 4, blur: 12, spread: 0, color: '#000000', alpha: 15, inset: false };

/** Partes de la sombra que el panel ajusta por separado. */
export const SHADOW_PARTS = ['shadow-x', 'shadow-y', 'shadow-blur', 'shadow-spread', 'shadow-alpha'] as const;
export type ShadowPart = (typeof SHADOW_PARTS)[number] | 'shadow-color' | 'shadow-inset';

/**
 * Lee la primera sombra de un `box-shadow` calculado por el navegador
 * ("rgba(0, 0, 0, 0.15) 0px 4px 12px 0px", con "inset" opcional al final).
 */
export function parseShadow(value: string): Shadow | null {
  if (!value || value === 'none') return null;
  const first = splitShadows(value)[0];
  const color = first.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i)?.[0] ?? 'rgb(0, 0, 0)';
  const nums = first.replace(color, ' ').match(/-?[\d.]+(?=px|\b)/g)?.map(Number) ?? [];
  if (nums.length < 2) return null;
  const a = color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
  return {
    x: Math.round(nums[0]),
    y: Math.round(nums[1]),
    blur: Math.round(nums[2] ?? 0),
    spread: Math.round(nums[3] ?? 0),
    color: rgbToHex(color),
    alpha: a ? Math.round(Number(a[1]) * 100) : 100,
    inset: /\binset\b/.test(first),
  };
}

export function formatShadow(s: Shadow): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(s.color.slice(i, i + 2), 16) || 0);
  const color = s.alpha >= 100 ? s.color : `rgba(${r}, ${g}, ${b}, ${Math.round(s.alpha) / 100})`;
  return `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${color}`;
}

/** Cambia una parte de la sombra y devuelve el `box-shadow` completo. */
export function withPart(s: Shadow, part: ShadowPart, value: string): string {
  const next = { ...s };
  switch (part) {
    case 'shadow-color': next.color = value; break;
    case 'shadow-inset': next.inset = value === 'inset'; break;
    case 'shadow-alpha': next.alpha = Math.min(100, Math.max(0, Number(value))); break;
    default: next[part.slice(7) as 'x' | 'y' | 'blur' | 'spread'] = Math.round(Number(value));
  }
  return formatShadow(next);
}

/** Valor de una parte de la sombra tal como lo muestra el panel. */
export function shadowPart(s: Shadow, part: ShadowPart): string {
  if (part === 'shadow-color') return s.color;
  if (part === 'shadow-inset') return s.inset ? 'inset' : 'outset';
  return String(s[part.slice(7) as 'x' | 'y' | 'blur' | 'spread' | 'alpha']);
}

/** Separa sombras por comas, sin cortar las comas de dentro de rgba(). */
function splitShadows(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export interface BorderValues {
  widths: number[];
  radii: number[];
  /** Sombras completas que ya usa la página, para reutilizarlas de un clic. */
  shadows: string[];
}

const RADII = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
const WIDTHS = ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'];

/** Grosores de borde, radios de esquina y sombras de la página: hacen de imán y de atajos. */
export function collectBorderValues(root: ParentNode, ignore?: (el: Element) => boolean): BorderValues {
  const widths = new Set<number>();
  const radii = new Set<number>();
  const shadows = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (ignore?.(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    for (const p of WIDTHS) {
      const style = cs.getPropertyValue(p.replace('width', 'style'));
      const v = parseFloat(cs.getPropertyValue(p));
      if (style !== 'none' && v > 0) widths.add(Math.round(v));
    }
    for (const p of RADII) {
      const raw = cs.getPropertyValue(p);
      const v = parseFloat(raw);
      // Los radios en porcentaje dependen del tamaño de cada elemento: no sirven de imán.
      if (v > 0 && !raw.includes('%')) radii.add(Math.round(v));
    }
    if (cs.boxShadow && cs.boxShadow !== 'none' && shadows.size < 6) {
      const s = parseShadow(cs.boxShadow);
      if (s) shadows.add(formatShadow(s));
    }
  }
  const sorted = (set: Set<number>) => Array.from(set).sort((a, b) => a - b);
  return { widths: sorted(widths), radii: sorted(radii), shadows: Array.from(shadows) };
}
