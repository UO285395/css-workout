/**
 * Tamaños de pantalla. Funciona como Webflow: lo que se cambia en escritorio vale para todos los
 * tamaños; lo que se cambia en tableta o móvil va dentro de su @media y vale para ese tamaño y los menores.
 */
export interface Screen {
  id: 'desktop' | 'tablet' | 'mobile';
  label: string;
  /** Ancho con el que se previsualiza. */
  width: number;
  /** Condición del @media; null en escritorio, que no lleva @media. */
  media: string | null;
  /** Ancho máximo al que se aplica, para ordenar los @media de mayor a menor. */
  max: number;
}

export const SCREENS: readonly Screen[] = [
  { id: 'desktop', label: 'Escritorio', width: 1280, media: null, max: Infinity },
  { id: 'tablet', label: 'Tableta', width: 768, media: '(max-width: 1023px)', max: 1023 },
  { id: 'mobile', label: 'Móvil', width: 375, media: '(max-width: 767px)', max: 767 },
];

/** El tamaño al que corresponde un ancho de ventana. */
export function screenFor(width: number): Screen {
  return SCREENS.filter((s) => width <= s.max).at(-1)!;
}

/**
 * Clave de una regla en el historial de cambios: el selector, precedido de su @media si lo tiene.
 * Se separan con «{», que nunca aparece en un selector.
 */
export function ruleKey(selector: string, screen: Screen): string {
  return screen.media ? `@media ${screen.media}{${selector}` : selector;
}

export function parseKey(key: string): { selector: string; screen: Screen } {
  const i = key.indexOf('{');
  if (!key.startsWith('@media ') || i < 0) return { selector: key, screen: SCREENS[0] };
  const media = key.slice(7, i);
  return { selector: key.slice(i + 1), screen: SCREENS.find((s) => s.media === media) ?? SCREENS[0] };
}
