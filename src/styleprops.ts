/** Propiedades de texto y alineación: etiquetas, lectura de valores y controles del panel. */

const LABELS: Record<string, string> = {
  'font-size': 'Tamaño de letra',
  'font-weight': 'Grosor',
  'font-family': 'Fuente',
  'font-style': 'Cursiva',
  'line-height': 'Interlineado',
  'letter-spacing': 'Espacio entre letras',
  'text-align': 'Alineación del texto',
  'text-decoration-line': 'Subrayado',
  'text-transform': 'Mayúsculas',
  color: 'Color del texto',
  'background-color': 'Color de fondo',
  'flex-direction': 'Dirección',
  'justify-content': 'Reparto',
  'align-items': 'Alineación de los hijos',
  gap: 'Separación entre hijos',
  'column-gap': 'Separación entre columnas',
  'row-gap': 'Separación entre filas',
  'grid-template-columns': 'Columnas',
  'grid-column': 'Columnas que ocupa',
  'align-self': 'Posición en el contenedor',
  'justify-self': 'Posición en el contenedor',
  'border-width': 'Grosor',
  'border-style': 'Línea',
  'border-color': 'Color del borde',
  'border-radius': 'Todas',
  'border-top-left-radius': 'Esquina superior izquierda',
  'border-top-right-radius': 'Esquina superior derecha',
  'border-bottom-right-radius': 'Esquina inferior derecha',
  'border-bottom-left-radius': 'Esquina inferior izquierda',
  'box-shadow': 'Sombra',
  'shadow-x': 'Horizontal',
  'shadow-y': 'Vertical',
  'shadow-blur': 'Difuminado',
  'shadow-spread': 'Tamaño',
  'shadow-alpha': 'Opacidad',
  'shadow-color': 'Color de la sombra',
};

export const styleLabel = (prop: string): string | undefined => LABELS[prop];

export const WEIGHTS: readonly [string, string][] = [
  ['100', 'Muy fina'], ['200', 'Extrafina'], ['300', 'Fina'], ['400', 'Normal'], ['500', 'Media'],
  ['600', 'Seminegrita'], ['700', 'Negrita'], ['800', 'Extranegrita'], ['900', 'Muy negrita'],
];

const GENERIC_FONTS = ['system-ui, sans-serif', 'Georgia, serif', 'ui-monospace, monospace'];

/** Propiedades numéricas en píxeles que se pueden arrastrar desde su etiqueta. */
export const NUMERIC: Record<string, { min: number; max?: number }> = {
  'font-size': { min: 1 },
  'line-height': { min: 0 },
  'letter-spacing': { min: -20 },
  gap: { min: 0 },
  'column-gap': { min: 0 },
  'row-gap': { min: 0 },
  'border-width': { min: 0 },
  'border-radius': { min: 0 },
  'border-top-left-radius': { min: 0 },
  'border-top-right-radius': { min: 0 },
  'border-bottom-right-radius': { min: 0 },
  'border-bottom-left-radius': { min: 0 },
  'shadow-x': { min: -100 },
  'shadow-y': { min: -100 },
  'shadow-blur': { min: 0 },
  'shadow-spread': { min: -50 },
  'shadow-alpha': { min: 0, max: 100 },
};

export const isFlex = (display: string) => display === 'flex' || display === 'inline-flex';
export const isGrid = (display: string) => display === 'grid' || display === 'inline-grid';

export function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (!m) return rgb.startsWith('#') ? rgb : '#000000';
  return '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

export const isTransparent = (color: string) => color === 'transparent' || /rgba\(.*,\s*0\s*\)$/.test(color);

/** Valor actual de una propiedad tal como se muestra en el panel. */
export function readValue(cs: CSSStyleDeclaration, prop: string): string {
  const v = cs.getPropertyValue(prop === 'gap' ? 'column-gap' : prop).trim();
  switch (prop) {
    case 'font-size': return String(Math.round(parseFloat(v)));
    case 'line-height':
      // "normal" depende de la fuente: se muestra vacío y el valor aproximado como pista.
      return v === 'normal' ? '' : String(Math.round(parseFloat(v)));
    case 'letter-spacing': return v === 'normal' ? '0' : String(Math.round(parseFloat(v) * 10) / 10);
    case 'gap':
    case 'column-gap':
    case 'row-gap': return v === 'normal' ? '0' : String(Math.round(parseFloat(v)));
    case 'color':
    case 'background-color': return rgbToHex(v);
    case 'border-color': return rgbToHex(cs.borderTopColor);
    case 'border-style': return ['top', 'right', 'bottom', 'left'].map((s) => cs.getPropertyValue(`border-${s}-style`)).find((v) => v !== 'none') ?? 'none';
    // Con lados distintos (p. ej. solo borde inferior) se muestra el mayor.
    case 'border-width': return String(Math.round(Math.max(...['top', 'right', 'bottom', 'left'].map((s) =>
      cs.getPropertyValue(`border-${s}-style`) === 'none' ? 0 : parseFloat(cs.getPropertyValue(`border-${s}-width`)) || 0))));
    case 'border-radius': return radius(cs.borderTopLeftRadius);
    case 'border-top-left-radius':
    case 'border-top-right-radius':
    case 'border-bottom-right-radius':
    case 'border-bottom-left-radius': return radius(v);
    case 'text-align': return v === 'start' ? 'left' : v === 'end' ? 'right' : v;
    default: return v;
  }
}

/** Radio en px; uno en porcentaje no se puede mostrar como px y se deja vacío. */
const radius = (v: string) => (v.includes('%') ? '' : String(Math.round(parseFloat(v) || 0)));

/** Valor real de la página para el comentario "antes:" del CSS exportado. */
export function originalValue(cs: CSSStyleDeclaration, prop: string): string {
  if (prop === 'gap') return cs.getPropertyValue('column-gap');
  const v = cs.getPropertyValue(prop);
  if (prop === 'border-color') return rgbToHex(cs.borderTopColor);
  return prop === 'color' || prop === 'background-color' ? (isTransparent(v) ? 'transparent' : rgbToHex(v)) : v;
}

/** Fuentes que ya usa la página más unas genéricas, para el desplegable. */
export function collectFonts(root: ParentNode, ignore?: (el: Element) => boolean): string[] {
  const fonts = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (ignore?.(el)) continue;
    fonts.add(getComputedStyle(el).fontFamily);
    if (fonts.size >= 12) break;
  }
  for (const f of GENERIC_FONTS) fonts.add(f);
  return Array.from(fonts).filter(Boolean);
}

/** Tamaños de letra que ya usa la página: hacen de imán al ajustar el tamaño. */
export function collectFontSizes(root: ParentNode, ignore?: (el: Element) => boolean): number[] {
  const sizes = new Set<number>();
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (ignore?.(el)) continue;
    sizes.add(Math.round(parseFloat(getComputedStyle(el).fontSize)));
  }
  return Array.from(sizes).filter((n) => n > 0).sort((a, b) => a - b);
}

/**
 * Traduce "horizontal" y "vertical" (lo que entiende cualquiera) a justify-content o align-items
 * según la dirección del contenedor.
 */
export function axisProp(direction: string, axis: 'horizontal' | 'vertical'): 'justify-content' | 'align-items' {
  const row = !direction.startsWith('column');
  return (axis === 'horizontal') === row ? 'justify-content' : 'align-items';
}
