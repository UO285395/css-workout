/** Variables CSS del prototipo (--azul, --espacio-m): se proponen en vez de valores sueltos. */
export interface CssVariable {
  name: string;
  /** Valor resuelto en la raíz del documento. */
  value: string;
  kind: 'length' | 'color' | 'other';
  /** Para longitudes, su valor en píxeles. */
  px?: number;
}

/** Clasifica un valor: longitud en px o rem (con el tamaño de letra de la raíz), color u otro. */
export function classify(value: string, rootFontSize = 16): Pick<CssVariable, 'kind' | 'px'> {
  const v = value.trim();
  const len = v.match(/^(-?\d*\.?\d+)(px|rem)$/);
  if (len) return { kind: 'length', px: Math.round(parseFloat(len[1]) * (len[2] === 'rem' ? rootFontSize : 1) * 100) / 100 };
  if (v === '0') return { kind: 'length', px: 0 };
  if (/^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(.+\))$/i.test(v)) return { kind: 'color' };
  return { kind: 'other' };
}

/** Nombres de las variables definidas en las hojas de estilo legibles del documento. */
function declaredNames(doc: Document): string[] {
  const names = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      const style = (r as CSSStyleRule).style;
      if (style) for (const p of Array.from(style)) if (p.startsWith('--')) names.add(p);
      const inner = (r as CSSGroupingRule).cssRules;
      if (inner) walk(inner);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    if ((sheet.ownerNode as Element | null)?.id?.startsWith('css-workout')) continue;
    try { walk(sheet.cssRules); } catch { /* hoja de otro dominio */ }
  }
  return Array.from(names);
}

export function collectVariables(doc: Document): CssVariable[] {
  const root = getComputedStyle(doc.documentElement);
  const rootFont = parseFloat(root.fontSize) || 16;
  return declaredNames(doc)
    .map((name) => {
      const value = root.getPropertyValue(name).trim();
      return { name, value, ...classify(value, rootFont) };
    })
    .filter((v) => v.value !== '');
}

/** La variable de longitud que vale exactamente `px`, si la hay. */
export function lengthVar(vars: readonly CssVariable[], px: number): CssVariable | undefined {
  return vars.find((v) => v.kind === 'length' && v.px === px);
}
