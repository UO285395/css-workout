import { ChangeStore, type Entry } from './changes';
import { measure, zoneRect, dragSign, SIDES, type BoxModel, type Rect, type Side } from './box';
import { collectSpacingValues, snap } from './snapping';
import { selectorFor, defaultScope, classSelector, describe, type Scope } from './selector';
import { UI_CSS } from './styles';
import { collectVariables, lengthVar, type CssVariable } from './variables';
import { trackSizes, gapRects } from './grid';
import { distances } from './distances';
import { collectBorderValues, parseShadow, formatShadow, withPart, shadowPart, DEFAULT_SHADOW, type BorderValues, type ShadowPart } from './borders';
import { SCREENS, screenFor, ruleKey, parseKey, type Screen } from './screens';
import {
  styleLabel, readValue, originalValue, collectFonts, collectFontSizes, axisProp, isFlex, isGrid,
  isTransparent, NUMERIC, WEIGHTS,
} from './styleprops';

type Mode = 'spacing' | 'size' | 'text' | 'layout' | 'border';
type Kind = 'margin' | 'padding';

const HIT_MIN = 8;
/** Propiedades que un elemento en línea ignora; al tocarlas se pasa a `inline-block`. */
const BLOCK_ONLY = ['width', 'height', 'margin-top', 'margin-bottom'];

export const needsInlineBlock = (display: string, props: readonly string[]) =>
  display === 'inline' && props.some((p) => BLOCK_ONLY.includes(p));
const STORAGE_PREFIX = 'css-workout:';
const HELP = 'Arrastra una etiqueta subrayada para cambiar su valor\nAlt sobre otro elemento: medir distancias\nArrastra con Alt: sin imán\nArrastra con Shift: de 8 en 8\nEsc: soltar la selección\nCtrl+Z / Ctrl+Shift+Z: deshacer y rehacer';

const SIDE_LABEL: Record<Side, string> = { top: 'superior', right: 'derecho', bottom: 'inferior', left: 'izquierdo' };
const KIND_LABEL: Record<Kind, string> = { margin: 'Margen', padding: 'Relleno' };

export function propLabel(prop: string): string {
  if (prop === 'width') return 'Ancho';
  if (prop === 'height') return 'Alto';
  if (prop === 'display') return 'Tipo de caja';
  const label = styleLabel(prop);
  if (label) return label;
  const [kind, side] = prop.split('-') as [Kind, Side];
  return KIND_LABEL[kind] && SIDE_LABEL[side] ? `${KIND_LABEL[kind]} ${SIDE_LABEL[side]}` : prop;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: Node): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  parent?.appendChild(el);
  return el;
};

const place = (el: HTMLElement, r: Rect | null) => {
  if (!r) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${Math.max(0, r.w)}px`;
  el.style.height = `${Math.max(0, r.h)}px`;
};

/** Etiqueta del tamaño en la lista de cambios; escritorio no la lleva. */
const screenTag = (key: string) => {
  const { screen } = parseKey(key);
  return screen.media ? `<span class="badge">${screen.label}</span> ` : '';
};
const FRAME_NAME = 'css-workout-frame';

/** Posición de un elemento como índices de hijos desde <html>, para encontrarlo en la copia del marco. */
const pathOf = (el: Element): number[] => {
  const path: number[] = [];
  for (let e: Element | null = el; e?.parentElement; e = e.parentElement) path.unshift(Array.from(e.parentElement.children).indexOf(e));
  return path;
};
const resolvePath = (doc: Document, path: number[]): Element | null => {
  let e: Element | null = doc.documentElement;
  for (const i of path) e = e?.children[i] ?? null;
  return e && e !== doc.documentElement ? e : null;
};
/** Hijos que ocupan sitio en el flujo, en el orden en que se ven (propiedad `order` y luego el HTML). */
const orderedSiblings = (parent: Element): Element[] => Array.from(parent.children)
  .map((el, i) => ({ el, i, cs: getComputedStyle(el) }))
  .filter(({ cs }) => cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed')
  .sort((a, b) => (Number(a.cs.order) || 0) - (Number(b.cs.order) || 0) || a.i - b.i)
  .map(({ el }) => el);
const HOVER_CLASS = 'cssw-hover';
const withForcedHover = (sel: string) => (sel.includes(':hover') ? `${sel}, ${sel.replace(/:hover/g, `.${HOVER_CLASS}`)}` : sel);

/** Copia de las reglas :hover de la página para la clase que fuerza ese estado. */
function hoverRulesCopy(doc: Document): string {
  const out: string[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      const style = r as CSSStyleRule;
      const group = r as CSSGroupingRule & { conditionText?: string };
      if (style.selectorText?.includes(':hover')) {
        out.push(`${style.selectorText.replace(/:hover/g, `.${HOVER_CLASS}`)} { ${style.style.cssText} }`);
      } else if (group.cssRules && group.conditionText != null && r.cssText.startsWith('@media')) {
        const start = out.length;
        walk(group.cssRules);
        if (out.length > start) out.splice(start, out.length - start, `@media ${group.conditionText} { ${out.slice(start).join(' ')} }`);
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    if ((sheet.ownerNode as Element | null)?.id?.startsWith('css-workout')) continue;
    try { walk(sheet.cssRules); } catch { /* hoja de otro dominio: no se puede leer */ }
  }
  return out.join('\n');
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type Item = { prop: string; value: string; original: string };
/** Cambio añadido para que otro se vea, con lo que había antes para deshacerlo junto. */
type Implied = Item & { before: Entry | null };

interface Drag {
  props: string[];
  selector: string;
  before: (Entry | null)[];
  originals: string[];
  /** Cambios que hacen falta para que el arrastre se vea (ver `impliedItems`). */
  extra: Implied[];
  start: number[];
  pointer: { x: number; y: number };
  /**
   * `vars`: la variable CSS que vale lo mismo que cada valor, si el imán ha caído en una.
   * `css` y `tip`: valor y aviso ya compuestos, para propiedades que no son un número en px (la sombra).
   */
  compute: (dx: number, dy: number, e: PointerEvent) => { values: number[]; snapped: boolean; vars?: (string | undefined)[]; css?: string[]; tip?: string };
}

/**
 * Espacio que sobra dentro de un contenedor flex en cada eje. Si no sobra nada, alinear o
 * repartir no tiene efecto visible, y conviene decírselo al usuario.
 */
function freeSpace(el: Element, cs: CSSStyleDeclaration): { horizontal: number; vertical: number } {
  const px = (v: string) => parseFloat(v) || 0;
  const r = el.getBoundingClientRect();
  const innerW = r.width - px(cs.paddingLeft) - px(cs.paddingRight) - px(cs.borderLeftWidth) - px(cs.borderRightWidth);
  const innerH = r.height - px(cs.paddingTop) - px(cs.paddingBottom) - px(cs.borderTopWidth) - px(cs.borderBottomWidth);
  const kids = Array.from(el.children).map((c) => {
    const k = c.getBoundingClientRect();
    const m = getComputedStyle(c);
    return { w: k.width + px(m.marginLeft) + px(m.marginRight), h: k.height + px(m.marginTop) + px(m.marginBottom) };
  });
  const gaps = (n: number, gap: string) => Math.max(0, n - 1) * px(gap);
  const row = !cs.flexDirection.startsWith('column');
  const sumW = kids.reduce((a, k) => a + k.w, 0) + gaps(kids.length, cs.columnGap);
  const sumH = kids.reduce((a, k) => a + k.h, 0) + gaps(kids.length, cs.rowGap);
  const maxW = Math.max(0, ...kids.map((k) => k.w));
  const maxH = Math.max(0, ...kids.map((k) => k.h));
  // Con align-items: stretch los hijos llenan el eje cruzado, pero alinearlos los encoge a su
  // contenido: ahí sí habrá efecto, así que no se cuenta como falta de espacio.
  const stretched = cs.alignItems === 'stretch' || cs.alignItems === 'normal';
  const cross = (v: number) => (stretched ? Infinity : v);
  return {
    horizontal: row ? innerW - sumW : cross(innerW - maxW),
    vertical: row ? cross(innerH - maxH) : innerH - sumH,
  };
}

/** true si el elemento va en medio de una línea de texto (p. ej. un enlace dentro de un párrafo). */
function inTextLine(el: Element): boolean {
  if (getComputedStyle(el).display !== 'inline') return false;
  return Array.from(el.parentElement?.childNodes ?? []).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '');
}

/** true si el texto ya ocupa todo el ancho disponible: entonces text-align no tiene efecto visible. */
function textFitsBox(el: Element, cs: CSSStyleDeclaration): boolean {
  if (cs.display === 'inline') return true;
  const px = (v: string) => parseFloat(v) || 0;
  const content = el.getBoundingClientRect().width - px(cs.paddingLeft) - px(cs.paddingRight)
    - px(cs.borderLeftWidth) - px(cs.borderRightWidth);
  // Se mide cada línea de texto: si alguna deja hueco (un título corto dentro de una tarjeta,
  // la última línea de un párrafo), alinear sí se nota.
  const lines = new Map<number, number>();
  const range = el.ownerDocument.createRange();
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent!.trim()) continue;
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) {
      const top = Math.round(r.top);
      lines.set(top, (lines.get(top) ?? 0) + r.width);
    }
  }
  return lines.size > 0 && Array.from(lines.values()).every((w) => content - w < 1);
}

export class Editor {
  readonly store = new ChangeStore();

  private host: HTMLElement;
  private root: ShadowRoot;
  private layer: HTMLElement;
  private panel: HTMLElement;

  private active = true;
  private mode: Mode = 'spacing';
  private scope: Scope = 'element';
  private hovered: Element | null = null;
  private selected: Element | null = null;
  private candidates: number[] = [];
  private fontSizes: number[] = [];
  private borderValues: BorderValues = { widths: [], radii: [], shadows: [] };
  private fonts: string[] = [];
  private vars: CssVariable[] = [];
  /** Valor previo de un color mientras se elige en el selector, para apuntarlo como un solo paso. */
  private colorBefore = new Map<string, { before: Entry | null; extra: Implied[] }>();
  private drag: Drag | null = null;
  private frame = 0;
  private cssOpen = false;
  /** Mostrando la página original: los cambios siguen guardados, solo se apaga la vista previa. */
  private comparing = false;
  /** Tamaño de pantalla según el ancho de la ventana: decide en qué @media van los cambios. */
  private screen: Screen;
  /** Documento que se edita: la propia página o, en móvil y tableta, la copia dentro del marco. */
  private page: Document;
  /** Marco con la página a otro ancho (móvil o tableta); null cuando se edita la ventana real. */
  private frameScreen: Screen | null = null;
  private stage!: HTMLElement;
  private iframe: HTMLIFrameElement | null = null;
  /** Capa de contornos y tiradores; en el marco se desplaza para coincidir con él. */
  private ovRoot!: HTMLElement;
  /** Una hoja de vista previa por documento (la página y, si está abierto, el marco). */
  private previews = new Set<HTMLStyleElement>();
  /** Editando cómo se ve al pasar el ratón: los elementos afectados se fuerzan a ese estado. */
  private hoverState = false;
  /** Alt pulsado con algo seleccionado: se miden distancias hasta lo que hay bajo el ratón. */
  private measuring = false;
  private forced = new Set<Element>();
  private comparePill!: HTMLButtonElement;
  /** Pestaña y selector dibujados por última vez, para conservar el desplazamiento. */
  private tabView = '';
  private storageKey: string;

  private ov!: {
    hover: HTMLElement; hoverTag: HTMLElement; sel: HTMLElement; dims: HTMLElement; tip: HTMLElement;
    areas: Record<Kind, Record<Side, HTMLElement>>;
    zones: Record<Kind, Record<Side, HTMLElement>>;
    size: { w: HTMLElement; h: HTMLElement; wh: HTMLElement };
    twins: HTMLElement[];
    gaps: HTMLElement[];
    measures: { line: HTMLElement; label: HTMLElement }[];
  };

  constructor(private doc: Document = document) {
    this.page = doc;
    this.storageKey = STORAGE_PREFIX + doc.location.pathname;
    this.screen = screenFor(this.viewportWidth());

    this.host = doc.createElement('css-workout');
    this.host.setAttribute('style', 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;');
    this.root = this.host.attachShadow({ mode: 'open' });
    h('style', '', this.root).textContent = UI_CSS;
    this.layer = h('div', 'layer', this.root);
    this.stage = h('div', 'stage', this.layer);
    this.ovRoot = h('div', 'ov-root', this.layer);
    this.buildOverlay();
    this.panel = h('div', 'panel', this.layer);
    this.buildPanel();
    this.comparePill = h('button', 'compare-pill', this.layer);
    this.comparePill.innerHTML = '<span class="muted">Viendo el original</span> <b>Volver a mis cambios</b>';
    this.comparePill.title = 'Volver a mostrar tus cambios (Esc)';
    this.comparePill.addEventListener('click', () => this.setComparing(false));
    doc.documentElement.appendChild(this.host);

    this.restore();
    this.store.onChange(() => {
      if (this.store.size === 0 && this.comparing) this.setComparing(false);
      this.updatePreviews();
      this.persist();
      this.renderPanel();
    });
    this.attachPage(doc);
    doc.addEventListener('keydown', this.onKeyDown, true);
    doc.addEventListener('keyup', this.onKeyUp, true);
    doc.defaultView?.addEventListener('resize', this.onResize);
    this.collectAll();
    this.renderPanel();
    this.loop();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.detachPage(this.page);
    if (this.page !== this.doc) this.detachPage(this.doc);
    this.doc.removeEventListener('keydown', this.onKeyDown, true);
    this.doc.removeEventListener('keyup', this.onKeyUp, true);
    this.doc.defaultView?.removeEventListener('resize', this.onResize);
    this.host.remove();
  }

  /** Empieza a escuchar y previsualizar en un documento (la página o la del marco). */
  private attachPage(page: Document): void {
    const style = page.createElement('style');
    style.id = 'css-workout-preview';
    page.head.appendChild(style);
    this.previews.add(style);
    this.updatePreviews();
    page.addEventListener('mousemove', this.onMouseMove, true);
    page.addEventListener('click', this.onClick, true);
    if (page !== this.doc) { page.addEventListener('keydown', this.onKeyDown, true); page.addEventListener('keyup', this.onKeyUp, true); }
  }

  private detachPage(page: Document): void {
    for (const el of this.forced) if (el.ownerDocument === page) { el.classList.remove(HOVER_CLASS); this.forced.delete(el); }
    page.getElementById('css-workout-hover')?.remove();
    page.removeEventListener('mousemove', this.onMouseMove, true);
    page.removeEventListener('click', this.onClick, true);
    if (page !== this.doc) { page.removeEventListener('keydown', this.onKeyDown, true); page.removeEventListener('keyup', this.onKeyUp, true); }
    for (const st of this.previews) if (st.ownerDocument === page) { st.remove(); this.previews.delete(st); }
  }

  private updatePreviews(): void {
    // Las reglas :hover también se aplican a los elementos forzados con la clase cssw-hover.
    const css = this.store.toCss({ important: true, mapSelector: withForcedHover });
    for (const st of this.previews) {
      st.textContent = css;
      st.media = this.comparing ? 'not all' : '';
    }
  }

  /**
   * Fuerza el estado «al pasar el ratón» en los elementos afectados: les pone la clase cssw-hover
   * y copia las reglas :hover del prototipo para esa clase (un script no puede activar :hover).
   */
  private syncForcedHover(): void {
    const want = new Set(this.hoverState && this.selected && !this.comparing ? [this.selected, ...this.matches()] : []);
    for (const el of this.forced) if (!want.has(el)) el.classList.remove(HOVER_CLASS);
    for (const el of want) if (!this.forced.has(el)) el.classList.add(HOVER_CLASS);
    this.forced = want;
    let copy = this.page.getElementById('css-workout-hover');
    if (want.size && !copy) {
      copy = this.page.createElement('style');
      copy.id = 'css-workout-hover';
      copy.textContent = hoverRulesCopy(this.page);
      // Antes de la vista previa, para que los cambios del usuario ganen.
      this.page.head.insertBefore(copy, Array.from(this.previews).find((st) => st.ownerDocument === this.page) ?? null);
    } else if (!want.size && copy) copy.remove();
  }

  /**
   * Móvil o tableta: muestra la página a ese ancho en un marco y edita dentro de él, para que sus
   * @media se apliquen de verdad. Escritorio vuelve a la ventana real.
   */
  private setFrameScreen(screen: Screen | null): void {
    if (screen === this.frameScreen) return;
    const path = this.selected ? pathOf(this.selected) : null;
    this.frameScreen = screen;
    this.hovered = null;
    this.selected = null;
    if (this.page !== this.doc) this.detachPage(this.page);
    this.page = this.doc;
    this.iframe?.remove();
    this.iframe = null;
    this.layer.classList.toggle('framed', !!screen);
    if (!screen) {
      this.screen = screenFor(this.viewportWidth());
      if (path) this.select(resolvePath(this.doc, path));
      else this.renderPanel();
      return;
    }
    this.screen = screen;
    const frame = h('iframe', 'frame');
    // Con este nombre el script, si el prototipo lo carga por su cuenta, no abre otro editor dentro.
    // Tiene que ir antes de insertar el marco: después ya no cambia el nombre de su ventana.
    frame.name = FRAME_NAME;
    this.stage.appendChild(frame);
    frame.title = `Página a ${screen.width} px`;
    frame.style.width = `${screen.width}px`;
    frame.addEventListener('load', () => {
      const page = frame.contentDocument;
      if (!page || frame !== this.iframe) return;
      if (this.page !== this.doc) this.detachPage(this.page);
      this.page = page;
      this.attachPage(page);
      this.selected = null;
      this.collectAll();
      if (path) { const el = resolvePath(page, path); if (el) this.select(el); }
      this.renderPanel();
    });
    frame.src = this.doc.location.href;
    this.iframe = frame;
    this.stage.dataset.label = `${screen.label} · ${screen.width} px`;
    this.renderPanel();
  }

  /** En el marco, la capa de contornos se coloca encima de él (sus coordenadas son las del marco). */
  private placeOverlayRoot(): void {
    const st = this.ovRoot.style;
    if (!this.iframe || this.page === this.doc) { st.cssText = ''; return; }
    const r = this.iframe.getBoundingClientRect();
    st.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;transform:translateZ(0);overflow:hidden;`;
  }

  /** CSS listo para copiar, con el valor anterior como comentario. */
  exportCss(): string {
    const n = this.store.size;
    if (n === 0) return '';
    return `/* CSS Workout: ${n} ${n === 1 ? 'cambio' : 'cambios'} */\n${this.store.toCss({ comments: true })}\n`;
  }

  select(el: Element | null): void {
    if (el !== this.selected) this.hoverState = false;
    this.selected = el;
    if (el) this.scope = defaultScope(el);
    this.collectAll();
    this.renderPanel();
  }

  /** Clave de la regla donde se guardan los cambios: el selector y, fuera de escritorio, su @media. */
  get selector(): string | null {
    return this.selected ? ruleKey(this.ruleSelector!, this.screen) : null;
  }

  /** Selector de la regla tal como saldrá en el CSS, con `:hover` si se edita ese estado. */
  get ruleSelector(): string | null {
    return this.cssSelector && (this.hoverState ? `${this.cssSelector}:hover` : this.cssSelector);
  }

  get cssSelector(): string | null {
    return this.selected ? selectorFor(this.selected, this.scope) : null;
  }

  // ---------- Overlay ----------

  private buildOverlay(): void {
    const L = this.ovRoot;
    const areas = {} as Record<Kind, Record<Side, HTMLElement>>;
    const zones = {} as Record<Kind, Record<Side, HTMLElement>>;
    for (const kind of ['margin', 'padding'] as Kind[]) {
      areas[kind] = {} as Record<Side, HTMLElement>;
      zones[kind] = {} as Record<Side, HTMLElement>;
      for (const side of SIDES) {
        areas[kind][side] = h('div', `area ${kind}`, L);
        const zone = h('div', `zone ${kind} ${side === 'top' || side === 'bottom' ? 'y' : 'x'}`, L);
        zone.dataset.prop = `${kind}-${side}`;
        zone.title = `${propLabel(`${kind}-${side}`)}: arrastra para ajustar`;
        zone.addEventListener('pointerdown', (e) => this.startSpacingDrag(e, kind, side));
        zones[kind][side] = zone;
      }
    }
    const size = { w: h('div', 'size w', L), h: h('div', 'size h', L), wh: h('div', 'size wh', L) };
    size.w.dataset.prop = 'width';
    size.h.dataset.prop = 'height';
    size.wh.dataset.prop = 'width height';
    size.w.title = 'Ancho: arrastra para ajustar';
    size.h.title = 'Alto: arrastra para ajustar';
    size.wh.title = 'Ancho y alto: arrastra para ajustar';
    size.w.addEventListener('pointerdown', (e) => this.startSizeDrag(e, true, false));
    size.h.addEventListener('pointerdown', (e) => this.startSizeDrag(e, false, true));
    size.wh.addEventListener('pointerdown', (e) => this.startSizeDrag(e, true, true));

    this.ov = {
      hover: h('div', 'hover', L), hoverTag: h('div', 'hover-tag', L),
      sel: h('div', 'sel', L), dims: h('div', 'dims', L), tip: h('div', 'tip', this.layer),
      areas, zones, size, twins: [], gaps: [], measures: [],
    };
    this.ov.tip.style.display = 'none';
  }

  private loop = () => {
    this.renderOverlay();
    this.frame = requestAnimationFrame(this.loop);
  };

  private renderOverlay(): void {
    const ov = this.ov;
    this.placeOverlayRoot();
    this.syncForcedHover();
    const showHover = this.active && this.hovered && this.hovered !== this.selected && !this.drag;
    if (showHover) {
      const r = this.hovered!.getBoundingClientRect();
      place(ov.hover, { x: r.left, y: r.top, w: r.width, h: r.height });
      ov.hoverTag.style.display = '';
      ov.hoverTag.textContent = describe(this.hovered!);
      ov.hoverTag.style.left = `${r.left}px`;
      ov.hoverTag.style.top = `${Math.max(0, r.top - 20)}px`;
    } else {
      place(ov.hover, null);
      ov.hoverTag.style.display = 'none';
    }

    const el = this.selected;
    if (!el || !el.isConnected) {
      if (el && !el.isConnected) this.select(null);
      this.hideSelection();
      return;
    }
    const box = measure(el);
    place(ov.sel, box.border);
    ov.dims.style.display = '';
    ov.dims.textContent = `${box.cssWidth} × ${box.cssHeight}`;
    ov.dims.style.left = `${box.border.x}px`;
    ov.dims.style.top = `${box.border.y + box.border.h + box.margin.bottom + 4}px`;

    const spacing = this.mode === 'spacing';
    const sizing = this.mode === 'size';
    for (const kind of ['margin', 'padding'] as Kind[]) {
      for (const side of SIDES) {
        place(ov.areas[kind][side], spacing || sizing ? zoneRect(box, kind, side) : null);
        place(ov.zones[kind][side], spacing ? zoneRect(box, kind, side, HIT_MIN) : null);
      }
    }
    this.placeSizeHandles(sizing ? box : null);
    this.renderMeasures(el);
    this.renderTwins(el);
    this.renderGridGaps(this.mode === 'layout' ? el : null);
  }

  private placeSizeHandles(box: BoxModel | null): void {
    const { w, h: hh, wh } = this.ov.size;
    if (!box) { for (const e of [w, hh, wh]) e.style.display = 'none'; return; }
    const b = box.border;
    for (const e of [w, hh, wh]) e.style.display = '';
    w.style.left = `${b.x + b.w - 5}px`; w.style.top = `${b.y + b.h / 2 - 11}px`;
    hh.style.left = `${b.x + b.w / 2 - 11}px`; hh.style.top = `${b.y + b.h - 5}px`;
    wh.style.left = `${b.x + b.w - 6}px`; wh.style.top = `${b.y + b.h - 6}px`;
  }

  /**
   * Con Alt: cotas entre la selección y el elemento bajo el ratón (su contenedor incluido),
   * o hasta los bordes de la ventana si no hay ninguno.
   */
  private renderMeasures(el: Element | null): void {
    let lines: ReturnType<typeof distances> = [];
    if (el && this.measuring && !this.drag) {
      const a = el.getBoundingClientRect();
      const other = this.hovered && this.hovered !== el && this.hovered !== this.page.body ? this.hovered.getBoundingClientRect() : null;
      const view = this.page.documentElement;
      const b = other ?? new DOMRect(0, 0, view.clientWidth, view.clientHeight);
      lines = distances({ x: a.left, y: a.top, w: a.width, h: a.height }, { x: b.left, y: b.top, w: b.width, h: b.height });
    }
    while (this.ov.measures.length < lines.length) {
      this.ov.measures.push({ line: h('div', 'measure-line', this.ovRoot), label: h('div', 'measure-label', this.ovRoot) });
    }
    this.ov.measures.forEach(({ line, label }, i) => {
      const m = lines[i];
      if (!m) { place(line, null); label.style.display = 'none'; return; }
      const horizontal = m.y1 === m.y2;
      place(line, horizontal
        ? { x: Math.min(m.x1, m.x2), y: m.y1, w: Math.abs(m.x2 - m.x1), h: 1 }
        : { x: m.x1, y: Math.min(m.y1, m.y2), w: 1, h: Math.abs(m.y2 - m.y1) });
      label.style.display = '';
      label.textContent = `${m.value}`;
      label.style.left = `${(m.x1 + m.x2) / 2}px`;
      label.style.top = `${(m.y1 + m.y2) / 2}px`;
    });
  }

  /** En una cuadrícula, los huecos entre columnas y filas se ven y se arrastran para cambiar la separación. */
  private renderGridGaps(el: Element | null): void {
    const cs = el ? getComputedStyle(el) : null;
    let rects: { r: Rect; prop: 'column-gap' | 'row-gap' }[] = [];
    if (el && cs && isGrid(cs.display)) {
      const box = measure(el);
      const origin = { x: box.border.x + box.borderWidth.left + box.padding.left, y: box.border.y + box.borderWidth.top + box.padding.top };
      const g = gapRects(trackSizes(cs.gridTemplateColumns), trackSizes(cs.gridTemplateRows),
        parseFloat(cs.columnGap) || 0, parseFloat(cs.rowGap) || 0, origin, HIT_MIN);
      rects = [...g.columns.map((r) => ({ r, prop: 'column-gap' as const })), ...g.rows.map((r) => ({ r, prop: 'row-gap' as const }))];
    }
    while (this.ov.gaps.length < rects.length) {
      const z = h('div', 'grid-gap', this.ovRoot);
      z.addEventListener('pointerdown', (e) => this.startGapDrag(e, z.dataset.prop as 'column-gap' | 'row-gap'));
      this.ov.gaps.push(z);
    }
    this.ov.gaps.forEach((z, i) => {
      const it = rects[i];
      if (!it) return place(z, null);
      z.dataset.prop = it.prop;
      z.className = `grid-gap ${it.prop === 'column-gap' ? 'x' : 'y'}`;
      z.title = `${propLabel(it.prop)}: arrastra para ajustar`;
      place(z, it.r);
    });
  }

  private startGapDrag(e: PointerEvent, prop: 'column-gap' | 'row-gap'): void {
    if (!this.selected) return;
    const start = parseFloat(getComputedStyle(this.selected).getPropertyValue(prop)) || 0;
    this.beginDrag(e, [prop], [start], (dx, dy, ev) => {
      const r = snap(start + (prop === 'column-gap' ? dx : dy), this.candidates, { free: ev.altKey, coarse: ev.shiftKey, min: 0 });
      return { values: [r.value], snapped: r.snapped, vars: [this.varFor(r.value, r.snapped && !ev.altKey)] };
    });
  }

  /** Con ámbito "por clase", marca con línea discontinua el resto de elementos afectados. */
  private renderTwins(el: Element): void {
    const twins = this.scope === 'class' ? this.matches().filter((m) => m !== el).slice(0, 50) : [];
    while (this.ov.twins.length < twins.length) this.ov.twins.push(h('div', 'twin', this.ovRoot));
    this.ov.twins.forEach((t, i) => {
      const m = twins[i];
      if (!m) return place(t, null);
      const r = m.getBoundingClientRect();
      place(t, { x: r.left, y: r.top, w: r.width, h: r.height });
    });
  }

  private hideSelection(): void {
    const ov = this.ov;
    place(ov.sel, null);
    ov.dims.style.display = 'none';
    for (const kind of ['margin', 'padding'] as Kind[]) {
      for (const side of SIDES) { place(ov.areas[kind][side], null); place(ov.zones[kind][side], null); }
    }
    this.placeSizeHandles(null);
    this.renderMeasures(null);
    for (const t of this.ov.twins) place(t, null);
    this.renderGridGaps(null);
  }

  private matches(): Element[] {
    const sel = this.cssSelector;
    if (!sel) return [];
    try { return Array.from(this.page.querySelectorAll(sel)); } catch { return []; }
  }

  // ---------- Arrastre ----------

  private startSpacingDrag(e: PointerEvent, kind: Kind, side: Side): void {
    if (!this.selected) return;
    const prop = `${kind}-${side}`;
    const start = measure(this.selected)[kind][side];
    const { axis, sign } = dragSign(kind, side);
    this.beginDrag(e, [prop], [start], (dx, dy, ev) => {
      const raw = start + sign * (axis === 'x' ? dx : dy);
      const r = snap(raw, this.candidates, { free: ev.altKey, coarse: ev.shiftKey, min: 0 });
      return { values: [r.value], snapped: r.snapped, vars: [this.varFor(r.value, r.snapped && !ev.altKey)] };
    });
  }

  private startSizeDrag(e: PointerEvent, width: boolean, height: boolean): void {
    if (!this.selected) return;
    const box = measure(this.selected);
    const props: string[] = [];
    const start: number[] = [];
    if (width) { props.push('width'); start.push(box.cssWidth); }
    if (height) { props.push('height'); start.push(box.cssHeight); }
    this.beginDrag(e, props, start, (dx, dy, ev) => ({
      values: props.map((p, i) => snap(start[i] + (p === 'width' ? dx : dy), [], { free: ev.altKey, coarse: ev.shiftKey, min: 0 }).value),
      snapped: false,
    }));
  }

  private beginDrag(e: PointerEvent, props: string[], start: number[], compute: Drag['compute']): void {
    e.preventDefault();
    e.stopPropagation();
    const selector = this.selector!;
    const cs = getComputedStyle(this.selected!);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    this.drag = {
      props, selector, start, compute,
      before: props.map((p) => this.store.get(selector, p)),
      originals: props.map((p) => this.store.get(selector, p)?.original ?? cs.getPropertyValue(p)),
      extra: this.impliedItems(cs, props).map((it) => ({ ...it, before: this.store.get(selector, it.prop) })),
      pointer: { x: e.clientX, y: e.clientY },
    };
    const move = (ev: PointerEvent) => this.onDragMove(ev);
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      this.onDragEnd(ev);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  private onDragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const { values, snapped, vars, css, tip: text } = d.compute(e.clientX - d.pointer.x, e.clientY - d.pointer.y, e);
    for (const x of d.extra) this.store.preview(d.selector, x.prop, x.value, x.original);
    d.props.forEach((p, i) => this.store.preview(d.selector, p, css?.[i] ?? (vars?.[i] ? `var(${vars[i]})` : `${values[i]}px`), d.originals[i]));
    const tip = this.ov.tip;
    tip.style.display = '';
    const named = vars?.find(Boolean);
    tip.innerHTML = (text ?? d.props.map((p, i) => `${propLabel(p)}: <b>${values[i]}px</b>`).join(' · ')) +
      (named ? ` <span class="snap">· ${escapeHtml(named)}</span>` : snapped ? ' <span class="snap">· ya usado en la página</span>' : '');
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY + 14}px`;
  }

  private onDragEnd(_e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    this.ov.tip.style.display = 'none';
    if (!d) return;
    const steps = d.props.map((prop, i) => ({ prop, before: d.before[i] }));
    this.store.recordMany(d.selector, [...d.extra.map((x) => ({ prop: x.prop, before: x.before })), ...steps]);
  }

  // ---------- Eventos de la página ----------

  private isOwn(target: EventTarget | null): boolean {
    return target === this.host;
  }

  /** Antes y después: apaga la vista previa y oculta toda la interfaz salvo el botón para volver. */
  private setComparing(on: boolean): void {
    if (on && this.store.size === 0) return;
    this.comparing = on;
    this.updatePreviews();
    this.layer.classList.toggle('comparing', on);
    if (on) this.hovered = null;
  }

  private viewportWidth(): number {
    if (this.frameScreen) return this.frameScreen.width;
    return this.page.documentElement.clientWidth || this.page.defaultView?.innerWidth || 1280;
  }

  private onResize = () => {
    if (this.frameScreen) return;
    const screen = screenFor(this.viewportWidth());
    if (screen !== this.screen) { this.screen = screen; this.renderPanel(); }
  };

  private onMouseMove = (e: MouseEvent) => {
    this.measuring = e.altKey;
    if (!this.active || this.drag || this.comparing) return;
    const t = e.target as Element | null;
    this.hovered = !t || this.isOwn(t) || t === this.page.documentElement ? null : t;
  };

  private onClick = (e: MouseEvent) => {
    if (!this.active || this.comparing || this.isOwn(e.target)) return;
    const t = e.target as Element;
    if (t === this.page.documentElement) return;
    // Mientras se edita, un clic selecciona en vez de seguir enlaces o pulsar botones del prototipo.
    e.preventDefault();
    e.stopPropagation();
    this.select(t);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const inField = this.isOwn(e.target) && this.root.activeElement instanceof HTMLInputElement;
    if (inField) return;
    if (e.key === 'Alt' && this.selected) { this.measuring = true; e.preventDefault(); }
    const mod = e.ctrlKey || e.metaKey;
    if (this.comparing) {
      if (e.key === 'Escape') { this.setComparing(false); e.preventDefault(); }
      return;
    }
    if (e.key === 'Escape' && this.selected) { this.select(null); e.preventDefault(); return; }
    if (!this.active || this.isTyping(e.target)) return;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.store.redo(); else this.store.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.store.redo();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Alt') this.measuring = false;
  };

  private isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }

  private collectAll(): void {
    const root = this.page.body ?? this.page.documentElement;
    const ignore = (el: Element) => el === this.host;
    this.candidates = collectSpacingValues(root, ignore);
    this.fontSizes = collectFontSizes(root, ignore);
    this.borderValues = collectBorderValues(root, ignore);
    this.fonts = collectFonts(root, ignore);
    this.vars = collectVariables(this.page);
    // Los valores de las variables de longitud también hacen de imán.
    const lengths = this.vars.filter((v) => v.kind === 'length' && v.px! > 0).map((v) => v.px!);
    this.candidates = Array.from(new Set([...this.candidates, ...lengths])).sort((a, b) => a - b);
  }

  // ---------- Persistencia (por URL, en este navegador) ----------

  private persist(): void {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.store.rows())); } catch { /* sin almacenamiento */ }
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) this.store.load(JSON.parse(raw));
    } catch { /* datos corruptos o sin almacenamiento: se empieza de cero */ }
  }

  // ---------- Panel ----------

  private buildPanel(): void {
    this.panel.innerHTML = `
      <div class="head">
        <span class="title" data-part="title">CSS Workout</span>
        <div class="toggle" title="Mientras editas, los clics seleccionan elementos en vez de usar el prototipo">
          <button data-act="on">Editar</button><button data-act="off">Usar página</button>
        </div>
        <button class="icon" data-act="side" title="Mover el panel al otro lado">⇆</button>
        <button class="icon" data-act="min" title="Minimizar">—</button>
        <div class="toggle screens" data-part="screens">${SCREENS.map((sc) =>
          `<button data-act="screen" data-value="${sc.id}" title="${sc.media ? `Ver y editar la página a ${sc.width} px. Los cambios valen para ${sc.label.toLowerCase()} y tamaños menores.` : 'Editar la página en la ventana real. Los cambios valen para todos los tamaños.'}">${sc.label}${sc.media ? ` <span class="px">${sc.width}</span>` : ''}</button>`).join('')}</div>
      </div>
      <div class="body">
        <div class="selection" data-part="selection"></div>
        <div class="foot" data-part="changes"></div>
      </div>`;
    this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    this.panel.addEventListener('change', (e) => this.onPanelChange(e));
    this.panel.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type !== 'color' || !t.dataset.prop) return;
      if (t.dataset.prop === 'shadow-color') this.previewColor('box-shadow', this.shadowWith('shadow-color', t.value));
      else this.previewColor(t.dataset.prop, t.value);
    });
    this.panel.addEventListener('pointerdown', (e) => {
      const label = (e.target as Element).closest('[data-scrub]') as HTMLElement | null;
      if (label) this.startScrub(e, label.dataset.scrub!);
    });
    this.panel.addEventListener('toggle', (e) => {
      if (e.target instanceof HTMLDetailsElement) this.cssOpen = e.target.open;
    }, true);
  }

  private onPanelClick(e: MouseEvent): void {
    const btn = (e.target as Element).closest('button') as HTMLButtonElement | null;
    if (!btn) return;
    const act = btn.dataset.act;
    switch (act) {
      case 'on': this.active = true; break;
      case 'off': this.active = false; this.hovered = null; break;
      case 'side': this.layer.classList.toggle('panel-left', this.panel.classList.toggle('left')); break;
      case 'screen': {
        const sc = SCREENS.find((x) => x.id === btn.dataset.value)!;
        this.setFrameScreen(sc.media ? sc : null);
        return;
      }
      case 'min': this.panel.classList.toggle('min'); break;
      case 'parent': {
        const p = this.selected?.parentElement;
        if (p && p !== this.page.documentElement) this.select(p);
        break;
      }
      case 'deselect': this.select(null); break;
      case 'mode-spacing': this.mode = 'spacing'; break;
      case 'mode-size': this.mode = 'size'; break;
      case 'mode-text': this.mode = 'text'; break;
      case 'mode-layout': this.mode = 'layout'; break;
      case 'mode-border': this.mode = 'border'; break;
      case 'shadow-add': this.commit('box-shadow', formatShadow(DEFAULT_SHADOW)); break;
      case 'set':
        if (btn.dataset.prop === 'text-align') this.alignText(btn.dataset.value!);
        else if (btn.dataset.prop!.startsWith('shadow-')) this.commit('box-shadow', this.shadowWith(btn.dataset.prop as ShadowPart, btn.dataset.value!));
        else this.commit(btn.dataset.prop!, btn.dataset.value!);
        break;
      case 'children': this.setChildren(btn.dataset.value!); break;
      case 'order': this.reorder(btn.dataset.value!); break;
      case 'grid-cols': this.setGridColumns(Number(btn.dataset.value)); break;
      case 'hover':
        this.hoverState = !this.hoverState;
        this.tabView = '';
        // En el acto, sin esperar al siguiente frame: quien mire el elemento justo después ya lo ve en su estado.
        this.syncForcedHover();
        break;
      case 'scope-class': this.scope = 'class'; break;
      case 'scope-element': this.scope = 'element'; break;
      case 'undo': this.store.undo(); break;
      case 'redo': this.store.redo(); break;
      case 'remove': this.store.remove(btn.dataset.selector!, btn.dataset.prop!); break;
      case 'clear':
        if (confirm('¿Descartar todos los cambios?')) this.store.clear();
        break;
      case 'copy': void this.copy(btn); return;
      case 'compare': this.setComparing(true); return;
    }
    this.renderPanel();
  }

  private onPanelChange(e: Event): void {
    const input = e.target as HTMLInputElement | HTMLSelectElement;
    const prop = input.dataset.prop;
    if (!prop || !this.selected) return;
    if (input instanceof HTMLSelectElement) return this.commit(prop, input.value);
    if (input.type === 'color') return this.finishColor(prop === 'shadow-color' ? 'box-shadow' : prop);
    if (input.value.trim() === '') return;
    const { min, max = Infinity } = NUMERIC[prop] ?? { min: 0 };
    const step = prop === 'letter-spacing' ? 10 : 1;
    const v = Math.min(max, Math.max(min, Math.round(Number(input.value) * step) / step));
    if (!Number.isFinite(v)) return;
    if (prop.startsWith('shadow-')) return this.commit('box-shadow', this.shadowWith(prop as ShadowPart, String(v)));
    this.commit(prop, `${v}px`);
  }

  /** Aplica un valor a la selección como un paso de deshacer. */
  private commit(prop: string, value: string): void {
    if (!this.selected) return;
    const selector = this.selector!;
    const cs = getComputedStyle(this.selected);
    const original = this.store.get(selector, prop)?.original ?? originalValue(cs, prop);
    // Quitar el borde (sin línea o grosor 0) no necesita nada más.
    const removing = (prop === 'border-style' && value === 'none') || (prop === 'border-width' && parseFloat(value) === 0);
    this.store.setMany(selector, [...this.impliedItems(cs, removing ? [] : [prop]), { prop, value, original }]);
  }

  /**
   * Cambios que hacen falta para que otro se vea: `inline-block` al dar ancho, alto o márgenes verticales
   * a un elemento en línea, y una línea continua de 1 px al tocar un borde que no se ve.
   */
  private impliedItems(cs: CSSStyleDeclaration, props: readonly string[]): Item[] {
    const items: Item[] = [];
    if (needsInlineBlock(cs.display, props)) items.push({ prop: 'display', value: 'inline-block', original: 'inline' });
    const border = props.filter((p) => p === 'border-width' || p === 'border-style' || p === 'border-color');
    if (border.length && readValue(cs, 'border-width') === '0') {
      const orig = (p: string) => this.store.get(this.selector!, p)?.original ?? originalValue(cs, p);
      if (!border.includes('border-style') && SIDES.every((s) => cs.getPropertyValue(`border-${s}-style`) === 'none')) {
        items.push({ prop: 'border-style', value: 'solid', original: orig('border-style') });
      }
      if (!border.includes('border-width')) items.push({ prop: 'border-width', value: '1px', original: orig('border-width') });
    }
    return items;
  }

  /** `box-shadow` completo con una de sus partes cambiada; sin sombra, se parte de la sombra por defecto. */
  private shadowWith(part: ShadowPart, value: string): string {
    const current = this.selected ? parseShadow(getComputedStyle(this.selected).boxShadow) : null;
    return withPart(current ?? DEFAULT_SHADOW, part, value);
  }

  /**
   * Alinear texto. Si el elemento mide lo mismo que su texto, text-align no movería nada:
   * entonces se mueve el elemento dentro de su contenedor, que es lo que el usuario espera.
   */
  private alignText(value: string): void {
    const el = this.selected;
    if (!el) return;
    const cs = getComputedStyle(el);
    const parent = el.parentElement;
    if (value === 'justify' || !parent || !textFitsBox(el, cs) || inTextLine(el)) return this.commit('text-align', value);

    const selector = this.selector!;
    const orig = (prop: string) => this.store.get(selector, prop)?.original ?? originalValue(cs, prop);
    const item = (prop: string, v: string) => ({ prop, value: v, original: orig(prop) });
    const pcs = getComputedStyle(parent);
    const items = [item('text-align', value)];
    const pos = value === 'left' ? 'flex-start' : value === 'right' ? 'flex-end' : 'center';
    // Márgenes automáticos: el hueco libre se va al lado contrario de donde se quiere el elemento.
    const autoMargins = () => {
      const keep = (prop: string) => (orig(prop) === 'auto' ? '0px' : orig(prop));
      items.push(item('margin-left', value === 'left' ? keep('margin-left') : 'auto'));
      items.push(item('margin-right', value === 'right' ? keep('margin-right') : 'auto'));
    };

    if (isFlex(pcs.display)) {
      if (pcs.flexDirection.startsWith('column')) items.push(item('align-self', pos));
      else autoMargins();
    } else if (isGrid(pcs.display)) {
      items.push(item('justify-self', pos.replace('flex-', '')));
    } else {
      // En un bloque normal, el elemento pasa a ocupar su propia línea con el ancho de su contenido.
      if (cs.display !== 'block' || cs.width === pcs.width) {
        items.push(item('display', 'block'));
        items.push(item('width', 'fit-content'));
      }
      autoMargins();
    }
    this.store.setMany(selector, items);
  }

  /** «Colocar hijos»: normal, en fila o en columna (flexbox). */
  private setChildren(how: string): void {
    if (!this.selected) return;
    const selector = this.selector!;
    const cs = getComputedStyle(this.selected);
    const orig = (prop: string) => this.store.get(selector, prop)?.original ?? cs.getPropertyValue(prop);
    if (how === 'grid') {
      const n = Math.min(3, Math.max(1, this.selected.children.length));
      this.store.setMany(selector, [
        { prop: 'display', value: 'grid', original: orig('display') },
        { prop: 'grid-template-columns', value: `repeat(${n}, 1fr)`, original: orig('grid-template-columns') },
      ]);
      return;
    }
    if (how === 'normal') {
      const items = ['display', 'flex-direction', 'grid-template-columns'].filter((p) => this.store.get(selector, p));
      // Si la página ya lo tenía en fila o columna, "uno debajo de otro" es volver a bloque.
      if (items.length === 0) return isFlex(cs.display) || isGrid(cs.display) ? this.commit('display', 'block') : undefined;
      // Volver a la caja original es quitar los cambios de display y dirección.
      this.store.setMany(selector, items.map((p) => ({ prop: p, value: orig(p), original: orig(p) })));
      return;
    }
    this.store.setMany(selector, [
      { prop: 'display', value: 'flex', original: orig('display') },
      { prop: 'flex-direction', value: how, original: orig('flex-direction') },
    ]);
  }

  private previewColor(prop: string, value: string): void {
    if (!this.selected) return;
    const selector = this.selector!;
    const cs = getComputedStyle(this.selected);
    if (!this.colorBefore.has(prop)) {
      const extra = this.impliedItems(cs, [prop]).map((it) => ({ ...it, before: this.store.get(selector, it.prop) }));
      this.colorBefore.set(prop, { before: this.store.get(selector, prop), extra });
    }
    const original = this.store.get(selector, prop)?.original ?? originalValue(cs, prop);
    for (const x of this.colorBefore.get(prop)!.extra) this.store.preview(selector, x.prop, x.value, x.original);
    this.store.preview(selector, prop, value, original);
  }

  private finishColor(prop: string): void {
    const c = this.colorBefore.get(prop);
    if (!this.selected || !c) return;
    this.store.recordMany(this.selector!, [...c.extra.map((x) => ({ prop: x.prop, before: x.before })), { prop, before: c.before }]);
    this.colorBefore.delete(prop);
  }

  /** Arrastrar a izquierda o derecha sobre la etiqueta de un valor numérico lo cambia. */
  private startScrub(e: PointerEvent, prop: string): void {
    if (!this.selected) return;
    const cs = getComputedStyle(this.selected);
    if (prop.startsWith('shadow-')) return this.startShadowScrub(e, prop as ShadowPart, cs);
    const raw = readValue(cs, prop);
    const start = raw === '' ? (prop === 'line-height' ? Math.round(parseFloat(cs.fontSize) * 1.2) : 0) : Number(raw);
    const min = NUMERIC[prop]?.min ?? 0;
    const border = prop.startsWith('border-');
    const candidates = prop === 'font-size' ? this.fontSizes : prop.endsWith('gap') ? this.candidates
      : prop === 'border-width' ? this.borderValues.widths : prop.endsWith('radius') ? this.borderValues.radii : [];
    // Cada 2 px de ratón cambian 1 px de valor: más preciso que 1:1 en valores pequeños.
    this.beginDrag(e, [prop], [start], (dx, _dy, ev) => {
      const r = snap(start + dx / 2, candidates, { free: ev.altKey, coarse: ev.shiftKey, min });
      // Las variables de la página son de espaciado: no se usan para bordes ni esquinas.
      return { values: [r.value], snapped: r.snapped, vars: [this.varFor(r.value, r.snapped && !ev.altKey && prop !== 'line-height' && !border)] };
    });
  }

  /** Arrastrar una parte de la sombra: cambia solo esa parte del `box-shadow`. */
  private startShadowScrub(e: PointerEvent, part: ShadowPart, cs: CSSStyleDeclaration): void {
    const base = parseShadow(cs.boxShadow) ?? DEFAULT_SHADOW;
    const key = part.slice(7) as 'x' | 'y' | 'blur' | 'spread' | 'alpha';
    const start = base[key];
    const { min, max = Infinity } = NUMERIC[part];
    const unit = part === 'shadow-alpha' ? '%' : 'px';
    this.beginDrag(e, ['box-shadow'], [start], (dx, _dy, ev) => {
      const v = Math.min(max, snap(start + dx / 2, [], { free: true, coarse: ev.shiftKey, min }).value);
      return { values: [v], snapped: false, css: [withPart(base, part, String(v))], tip: `${styleLabel(part)} de la sombra: <b>${v}${unit}</b>` };
    });
  }

  /** Nombre de la variable de longitud que vale `px`, solo si el imán ha caído en ese valor. */
  private varFor(px: number, snapped: boolean): string | undefined {
    return snapped ? lengthVar(this.vars, px)?.name : undefined;
  }

  private async copy(btn: HTMLButtonElement): Promise<void> {
    const css = this.exportCss();
    let ok = false;
    try {
      await navigator.clipboard.writeText(css);
      ok = true;
    } catch {
      const ta = this.root.querySelector('textarea');
      if (ta) { ta.focus(); ta.select(); ok = this.doc.execCommand('copy'); }
    }
    const label = btn.textContent;
    btn.textContent = ok ? 'Copiado' : 'Selecciona y copia abajo';
    setTimeout(() => { btn.textContent = label; }, 1500);
  }

  private renderPanel(): void {
    const q = (s: string) => this.panel.querySelector(s) as HTMLElement;
    q('[data-act="on"]').classList.toggle('on', this.active);
    q('[data-act="off"]').classList.toggle('on', !this.active);
    q('[data-part="title"]').title = `Editando a ${this.viewportWidth()} px: ${this.screen.media
      ? `los cambios se guardan solo para ${this.screen.label.toLowerCase()} y tamaños menores (@media ${this.screen.media})`
      : 'los cambios valen para todos los tamaños'}\n\n${HELP}`;
    for (const b of Array.from(this.panel.querySelectorAll<HTMLElement>('[data-act="screen"]'))) {
      b.classList.toggle('on', b.dataset.value === this.screen.id);
    }
    this.renderSelectionPart(q('[data-part="selection"]'));
    this.renderChangesPart(q('[data-part="changes"]'));
  }

  private renderSelectionPart(part: HTMLElement): void {
    const el = this.selected;
    const focused = this.root.activeElement;
    if (!el) {
      part.innerHTML = `<div class="tab"><div class="empty">${this.active ? 'Haz clic en un elemento de la página para ajustarlo.' : 'Pulsa «Editar» para seleccionar elementos.'}</div>
        <ul class="muted help">${HELP.split('\n').map((l) => `<li>${l}</li>`).join('')}</ul></div>`;
      return;
    }
    // No se reconstruye mientras el usuario escribe en un campo o arrastra, para no perder el foco.
    // Los botones también llevan data-prop, pero esos sí deben redibujarse para marcar la opción activa.
    const typing = (focused instanceof HTMLInputElement || focused instanceof HTMLSelectElement) && part.contains(focused);
    if (this.drag || typing) {
      this.syncInputs(part, typing ? (focused as HTMLInputElement) : null);
      return;
    }
    const selector = this.selector!;
    const cls = classSelector(el);
    const count = cls ? this.page.querySelectorAll(cls).length : 0;
    const box = measure(el);
    const inline = box.display === 'inline';
    const input = (prop: string, value: number) =>
      `<input type="number" min="0" data-prop="${prop}" value="${value}" class="${this.store.get(selector, prop) ? 'changed' : ''}" aria-label="${propLabel(prop)}">`;

    // Al redibujar la misma pestaña se conserva el desplazamiento, para no saltar arriba tras cada clic.
    const view = `${this.mode}|${selector}`;
    const scroll = view === this.tabView ? part.querySelector('.tab')?.scrollTop ?? 0 : 0;
    this.tabView = view;
    part.innerHTML = `
      <div class="sel-head">
      <div class="row nowrap"><b class="mono el-name" title="${escapeHtml(describe(el))}">${escapeHtml(describe(el))}</b>
        <span style="flex:1"></span>
        <button data-act="hover" class="${this.hoverState ? 'on-state' : ''}" aria-pressed="${this.hoverState}" title="Editar cómo se ve al pasar el ratón por encima (:hover)">Hover</button>
        <button data-act="parent" title="Seleccionar el contenedor">↑ Padre</button>
        <button data-act="deselect" title="Soltar selección (Esc)">✕</button>
      </div>
      ${cls ? `<div class="row"><span class="muted">Aplicar a</span>
        <div class="toggle">
          <button data-act="scope-class" class="${this.scope === 'class' ? 'on' : ''}">Todos los <code>${escapeHtml(cls)}</code> (${count})</button>
          <button data-act="scope-element" class="${this.scope === 'element' ? 'on' : ''}">Solo este</button>
        </div></div>` : ''}
      <div class="toggle tabs">
        <button data-act="mode-spacing" class="${this.mode === 'spacing' ? 'on' : ''}">Espaciado</button>
        <button data-act="mode-size" class="${this.mode === 'size' ? 'on' : ''}">Tamaño</button>
        <button data-act="mode-text" class="${this.mode === 'text' ? 'on' : ''}">Texto</button>
        <button data-act="mode-layout" class="${this.mode === 'layout' ? 'on' : ''}">Alineación</button>
        <button data-act="mode-border" class="${this.mode === 'border' ? 'on' : ''}">Bordes</button>
      </div>
      </div>
      <div class="tab">
      ${this.mode === 'text' ? this.textSection(el, selector) : this.mode === 'layout' ? this.layoutSection(el, selector)
        : this.mode === 'border' ? this.borderSection(el) : this.boxSection(el, selector, box, inline, input)}
      <div class="muted mono" title="Selector al que se aplicarán los cambios">${escapeHtml(this.ruleSelector!)}${this.screen.media ? ` · solo ${this.screen.label.toLowerCase()} y menores` : ''}</div>
      </div>`;
    part.querySelector('.tab')!.scrollTop = scroll;
  }

  private boxSection(_el: Element, _selector: string, box: BoxModel, inline: boolean, input: (prop: string, value: number) => string): string {
    return `
      <div class="muted">${this.mode === 'spacing' ? 'Arrastra las zonas de color sobre el elemento' : 'Arrastra los tiradores azules del borde'}</div>
      ${inline ? `<div class="warn">Es un elemento en línea. Si cambias su ancho, alto o márgenes de arriba y abajo, se convertirá en <code>inline-block</code> para que se apliquen.</div>` : ''}
      <div class="grid">
        <span></span><span class="h">Arriba</span><span class="h">Derecha</span><span class="h">Abajo</span><span class="h">Izq.</span>
        <span><i class="dot margin"></i>Margen</span>
        ${SIDES.map((s) => input(`margin-${s}`, box.margin[s])).join('')}
        <span><i class="dot padding"></i>Relleno</span>
        ${SIDES.map((s) => input(`padding-${s}`, box.padding[s])).join('')}
      </div>
      <div class="grid" style="grid-template-columns: 62px 1fr 62px 1fr">
        <span>Ancho</span>${input('width', box.cssWidth)}
        <span>Alto</span>${input('height', box.cssHeight)}
      </div>`;
  }

  /** Botones de opción: el activo es el valor actual de la propiedad. */
  private choice(prop: string, current: string, options: readonly [string, string][]): string {
    const changed = this.store.get(this.selector!, prop) ? ' changed' : '';
    return `<div class="toggle${changed}">${options.map(([value, label]) =>
      `<button data-act="set" data-prop="${prop}" data-value="${escapeHtml(value)}" class="${current === value ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }

  private numberField(prop: string, value: string, placeholder = '', opts: { unit?: string; changed?: boolean } = {}): string {
    const changed = opts.changed ?? !!this.store.get(this.selector!, prop) ? 'changed' : '';
    const step = prop === 'letter-spacing' ? '0.1' : '1';
    const max = NUMERIC[prop]?.max;
    return `<label class="scrub" data-scrub="${prop}" title="Arrastra a izquierda o derecha para ajustar">${styleLabel(prop)}</label>
      <span class="unit"><input type="number" step="${step}" min="${NUMERIC[prop]?.min ?? 0}"${max === undefined ? '' : ` max="${max}"`} data-prop="${prop}" value="${value}" placeholder="${placeholder}" class="${changed}" aria-label="${styleLabel(prop)}"><i>${opts.unit ?? 'px'}</i></span>`;
  }

  private colorField(prop: string, cs: CSSStyleDeclaration): string {
    const changed = this.store.get(this.selector!, prop) ? 'changed' : '';
    const none = !this.store.get(this.selector!, prop) && isTransparent(cs.getPropertyValue(prop));
    // Con variables de color en la página, se ofrecen como muestras en lugar del código del color.
    const colors = this.vars.filter((v) => v.kind === 'color').slice(0, 7);
    const current = this.store.get(this.selector!, prop)?.value;
    const hex = none ? 'sin color' : readValue(cs, prop);
    const swatches = colors.map((v) => `<button class="swatch${current === `var(${v.name})` ? ' on' : ''}" data-act="set" data-prop="${prop}" data-value="var(${escapeHtml(v.name)})" title="${escapeHtml(v.name)}: ${escapeHtml(v.value)}" aria-label="${escapeHtml(v.name)}" style="background:${escapeHtml(v.value)}"></button>`).join('');
    return `<span>${styleLabel(prop)}</span>
      <span class="row nowrap"><input type="color" data-prop="${prop}" value="${none ? '#ffffff' : readValue(cs, prop)}" class="${changed}" aria-label="${styleLabel(prop)}" title="${hex}">
      ${colors.length ? `<span class="swatches">${swatches}</span>` : none ? '<span class="muted">sin color</span>' : `<code>${hex}</code>`}</span>`;
  }

  private textSection(el: Element, _selector: string): string {
    const cs = getComputedStyle(el);
    const weight = readValue(cs, 'font-weight');
    const family = cs.fontFamily;
    const fonts = this.fonts.includes(family) ? this.fonts : [family, ...this.fonts];
    const fontChanged = this.store.get(this.selector!, 'font-family') ? 'changed' : '';
    const weightChanged = this.store.get(this.selector!, 'font-weight') ? 'changed' : '';
    const lineHint = String(Math.round(parseFloat(cs.fontSize) * 1.2));
    return `
      <div class="form">
        ${this.numberField('font-size', readValue(cs, 'font-size'))}
        <span>Grosor</span>
        <select data-prop="font-weight" class="${weightChanged}" aria-label="Grosor">${WEIGHTS.map(([v, l]) =>
          `<option value="${v}" ${v === weight ? 'selected' : ''}>${l} (${v})</option>`).join('')}
          ${WEIGHTS.some(([v]) => v === weight) ? '' : `<option selected value="${escapeHtml(weight)}">${escapeHtml(weight)}</option>`}</select>
        <span>Fuente</span>
        <select data-prop="font-family" class="${fontChanged}" aria-label="Fuente">${fonts.map((f) =>
          `<option value="${escapeHtml(f)}" ${f === family ? 'selected' : ''}>${escapeHtml(f.split(',')[0].replace(/["']/g, ''))}</option>`).join('')}</select>
        ${this.numberField('line-height', readValue(cs, 'line-height'), `auto (~${lineHint})`)}
        ${this.numberField('letter-spacing', readValue(cs, 'letter-spacing'))}
        ${this.colorField('color', cs)}
        ${this.colorField('background-color', cs)}
      </div>
      <div class="field"><span>Alinear texto</span>
        ${this.choice('text-align', readValue(cs, 'text-align'), [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha'], ['justify', 'Justificado']])}
      </div>
      ${textFitsBox(el, cs) ? (inTextLine(el)
        ? `<div class="warn" data-hint="text-align">Este elemento forma parte de una línea de texto. Para alinearlo, pulsa «↑ Padre» y alinea el párrafo entero.</div>`
        : `<div class="hint-box" data-hint="text-align">Mide lo mismo que su texto: al alinear se moverá el elemento entero dentro de su contenedor.</div>`) : ''}
      <div class="row">
        ${this.choice('font-style', cs.fontStyle === 'italic' ? 'italic' : 'normal', [['normal', 'Normal'], ['italic', '<i>Cursiva</i>']])}
        ${this.choice('text-decoration-line', cs.textDecorationLine.includes('underline') ? 'underline' : 'none', [['none', 'Sin subrayar'], ['underline', '<u>Subrayado</u>']])}
      </div>
      <div class="field"><span>Mayúsculas</span>
        ${this.choice('text-transform', cs.textTransform, [['none', 'Como está'], ['uppercase', 'TODO'], ['capitalize', 'Cada Palabra']])}
      </div>`;
  }

  private borderSection(el: Element): string {
    const cs = getComputedStyle(el);
    const changed = (prop: string) => (this.store.get(this.selector!, prop) ? 'changed' : '');
    const corners: [string, string][] = [
      ['border-top-left-radius', '↖'], ['border-top-right-radius', '↗'],
      ['border-bottom-left-radius', '↙'], ['border-bottom-right-radius', '↘'],
    ];
    const pct = cs.borderTopLeftRadius.includes('%') ? cs.borderTopLeftRadius : '';
    const shadow = parseShadow(cs.boxShadow);
    const shadowChanged = !!this.store.get(this.selector!, 'box-shadow');
    const presets = this.borderValues.shadows.map((v) =>
      `<button class="shadow-swatch${shadow && formatShadow(shadow) === v ? ' on' : ''}" data-act="set" data-prop="box-shadow" data-value="${escapeHtml(v)}" title="Sombra usada en la página: ${escapeHtml(v)}" aria-label="Sombra de la página" style="box-shadow:${escapeHtml(v)}"></button>`).join('');
    return `
      <div class="field"><span>Borde</span>
        ${this.choice('border-style', readValue(cs, 'border-style'), [['none', 'Sin borde'], ['solid', 'Continuo'], ['dashed', 'Discontinuo'], ['dotted', 'Puntos']])}
      </div>
      <div class="form">
        ${this.numberField('border-width', readValue(cs, 'border-width'))}
        ${this.colorField('border-color', cs)}
      </div>
      <div class="field"><span>Esquinas redondeadas</span></div>
      <div class="form">${this.numberField('border-radius', readValue(cs, 'border-radius'), pct)}</div>
      <div class="corners">${corners.map(([p, icon]) =>
        `<span class="muted" title="${styleLabel(p)}">${icon}</span><span class="unit"><input type="number" min="0" data-prop="${p}" value="${readValue(cs, p)}" class="${changed(p)}" aria-label="${styleLabel(p)}"><i>px</i></span>`).join('')}
      </div>
      <div class="field"><span>Sombra</span>
        ${shadow ? `<div class="row">
          ${this.choice('shadow-inset', shadow.inset ? 'inset' : 'outset', [['outset', 'Fuera'], ['inset', 'Dentro']])}
          <button data-act="set" data-prop="box-shadow" data-value="none">Quitar sombra</button></div>`
          : `<div class="row"><button data-act="shadow-add">Añadir sombra</button></div>`}
      </div>
      ${shadow ? `<div class="form">
        ${this.numberField('shadow-x', String(shadow.x), '', { changed: shadowChanged })}
        ${this.numberField('shadow-y', String(shadow.y), '', { changed: shadowChanged })}
        ${this.numberField('shadow-blur', String(shadow.blur), '', { changed: shadowChanged })}
        ${this.numberField('shadow-spread', String(shadow.spread), '', { changed: shadowChanged })}
        ${this.numberField('shadow-alpha', String(shadow.alpha), '', { changed: shadowChanged, unit: '%' })}
        <span>Color</span><span class="row nowrap"><input type="color" data-prop="shadow-color" value="${shadow.color}" class="${shadowChanged ? 'changed' : ''}" aria-label="Color de la sombra"><code>${shadow.color}</code></span>
      </div>` : ''}
      ${presets ? `<div class="field"><span class="muted">Sombras de la página</span><span class="swatches">${presets}</span></div>` : ''}`;
  }

  /** Orden entre sus hermanos: solo existe si el contenedor los coloca en fila, columna o cuadrícula. */
  private orderSection(el: Element): string {
    const parent = el.parentElement;
    const sibs = parent ? orderedSiblings(parent) : [];
    if (!parent || sibs.length < 2 || !sibs.includes(el)) return '';
    const pcs = getComputedStyle(parent);
    if (!isFlex(pcs.display) && !isGrid(pcs.display)) {
      return `<div class="note">Para cambiar el orden de este elemento, pon su contenedor («↑ Padre») en fila, columna o cuadrícula.</div>`;
    }
    const i = sibs.indexOf(el);
    const span = isGrid(pcs.display) ? this.spanField(el, pcs) : '';
    const where = isGrid(pcs.display) ? 'la cuadrícula' : pcs.flexDirection.startsWith('column') ? 'su columna' : 'su fila';
    const changed = this.store.get(this.orderKey(el), 'order');
    const btn = (how: string, label: string, off: boolean, title: string) =>
      `<button data-act="order" data-value="${how}" title="${title}" ${off ? 'disabled' : ''}>${label}</button>`;
    return `
      <div class="field"><span>Orden <span class="muted">· ${i + 1}.º de ${sibs.length} en ${where}</span></span>
        <div class="toggle${changed ? ' changed' : ''}">
          ${btn('first', '⇤ Primero', i === 0, 'Mover al principio')}
          ${btn('prev', '← Antes', i === 0, 'Una posición antes')}
          ${btn('next', 'Después →', i === sibs.length - 1, 'Una posición después')}
          ${btn('last', 'Último ⇥', i === sibs.length - 1, 'Mover al final')}
        </div>
        <div class="note">Se aplica solo a este elemento, aunque arriba esté elegido «Todos».${changed ? ' <button class="link" data-act="order" data-value="reset">Orden original</button>' : ''}</div>
      </div>${span}`;
  }

  /** En una cuadrícula: cuántas columnas ocupa el elemento. */
  private spanField(el: Element, pcs: CSSStyleDeclaration): string {
    const cols = trackSizes(pcs.gridTemplateColumns).length;
    if (cols < 2) return '';
    const m = getComputedStyle(el).gridColumnEnd.match(/span (\d+)/);
    const current = m ? m[1] : '1';
    const opts = Array.from({ length: Math.min(cols, 4) }, (_, k) => String(k + 1));
    return `<div class="field"><span>Ocupa <span class="muted">columnas de la cuadrícula</span></span>
      ${this.choice('grid-column', current === '1' ? 'auto' : `span ${current}`, opts.map((n) => [n === '1' ? 'auto' : `span ${n}`, n === '1' ? '1 columna' : `${n} columnas`]))}</div>`;
  }

  private setGridColumns(delta: number): void {
    if (!this.selected) return;
    const n = Math.min(12, Math.max(1, trackSizes(getComputedStyle(this.selected).gridTemplateColumns).length + delta));
    this.commit('grid-template-columns', `repeat(${n}, 1fr)`);
  }

  /** El orden siempre va por elemento: con la misma regla para todos los hermanos no cambiaría nada. */
  private orderKey(el: Element): string {
    return ruleKey(selectorFor(el, 'element'), this.screen);
  }

  /** Cambia el orden con la propiedad `order`, sin tocar el HTML. */
  private reorder(how: string): void {
    const el = this.selected;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const sibs = orderedSiblings(parent);
    const i = sibs.indexOf(el);
    if (i < 0) return;
    const key = this.orderKey(el);
    const item = (sib: Element, value: number) => {
      const k = this.orderKey(sib);
      return { selector: k, prop: 'order', value: String(value), original: this.store.get(k, 'order')?.original ?? getComputedStyle(sib).order };
    };
    if (how === 'reset') return this.store.remove(key, 'order');
    const others = sibs.filter((s) => s !== el).map((s) => Number(getComputedStyle(s).order) || 0);
    if (how === 'first') return this.store.setAcross([item(el, Math.min(...others) - 1)]);
    if (how === 'last') return this.store.setAcross([item(el, Math.max(...others) + 1)]);
    // Un paso: se intercambia con el vecino y se numeran todos los hermanos en el orden nuevo.
    const j = how === 'prev' ? i - 1 : i + 1;
    if (j < 0 || j >= sibs.length) return;
    const next = sibs.slice();
    [next[i], next[j]] = [next[j], next[i]];
    this.store.setAcross(next.map((sib, n) => item(sib, n)).filter((it, n) => getComputedStyle(next[n]).order !== it.value || this.store.get(it.selector, 'order')));
  }

  private layoutSection(el: Element, _selector: string): string {
    const cs = getComputedStyle(el);
    const flex = isFlex(cs.display);
    const grid = isGrid(cs.display);
    const childCount = el.children.length;
    const children = flex ? (cs.flexDirection.startsWith('column') ? 'column' : 'row') : grid ? 'grid' : 'normal';
    const childButtons = `<div class="field"><div class="toggle">${([['normal', 'Apilados'], ['row', 'En fila'], ['column', 'En columna'], ['grid', 'Cuadrícula']] as const)
      .map(([v, l]) => `<button data-act="children" data-value="${v}" class="${children === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;

    let alignment = '';
    if (flex) {
      const h = axisProp(cs.flexDirection, 'horizontal');
      const v = axisProp(cs.flexDirection, 'vertical');
      // Los valores "normal", "start", "end"... se muestran como su equivalente en los botones.
      const norm = (prop: string) => {
        const val = cs.getPropertyValue(prop);
        if (val === 'normal') return prop === 'align-items' ? 'stretch' : 'flex-start';
        return val.replace(/^(start|left)$/, 'flex-start').replace(/^(end|right)$/, 'flex-end');
      };
      const opts = (prop: string): [string, string][] => prop === 'justify-content'
        ? [['flex-start', 'Inicio'], ['center', 'Centro'], ['flex-end', 'Final'], ['space-between', 'Repartir']]
        : [['flex-start', 'Inicio'], ['center', 'Centro'], ['flex-end', 'Final'], ['stretch', 'Estirar']];
      const free = freeSpace(el, cs);
      const tight = (axis: 'horizontal' | 'vertical') => free[axis] < 1
        ? `<div class="hint">Sin espacio libre en ${axis}: no se notará hasta que el contenedor sea más ${axis === 'horizontal' ? 'ancho' : 'alto'} (pestaña Tamaño) que su contenido.</div>`
        : '';
      alignment = `
        <div class="row"><span class="muted lbl">Horizontal</span>${this.choice(h, norm(h), opts(h))}</div>
        ${tight('horizontal')}
        <div class="row"><span class="muted lbl">Vertical</span>${this.choice(v, norm(v), opts(v))}</div>
        ${tight('vertical')}`;
    }
    const cols = trackSizes(cs.gridTemplateColumns).length;
    const gap = flex
      ? `<div class="form">${this.numberField('gap', readValue(cs, 'gap'))}</div>`
      : grid
        ? `<div class="form">
            <span>Columnas</span>
            <span class="row nowrap stepper${this.store.get(this.selector!, 'grid-template-columns') ? ' changed' : ''}">
              <button data-act="grid-cols" data-value="-1" ${cols <= 1 ? 'disabled' : ''} aria-label="Una columna menos">−</button>
              <b>${cols}</b>
              <button data-act="grid-cols" data-value="1" ${cols >= 12 ? 'disabled' : ''} aria-label="Una columna más">+</button>
              <span class="muted">iguales</span></span>
            ${this.numberField('column-gap', readValue(cs, 'column-gap'))}
            ${this.numberField('row-gap', readValue(cs, 'row-gap'))}
          </div>
          <div class="note">También puedes arrastrar los huecos morados entre columnas y filas.</div>`
        : '';
    const order = this.orderSection(el);
    if (childCount === 0) {
      return `${order}<div class="empty">Este elemento no contiene otros elementos. Pulsa «↑ Padre» para alinear el contenedor en el que está.</div>`;
    }
    return `${order}
      <div class="row"><span class="muted">Colocar ${childCount === 1 ? 'el elemento de dentro' : `los ${childCount} elementos de dentro`}</span></div>
      ${childButtons}
      ${alignment}
      ${gap}
      ${!flex && !grid ? '<div class="muted">Elige «En fila», «En columna» o «Cuadrícula» para poder alinear y separar los elementos de dentro.</div>' : ''}`;
  }

  private syncInputs(part: HTMLElement, except: HTMLInputElement | null): void {
    if (!this.selected) return;
    const box = measure(this.selected);
    for (const inp of Array.from(part.querySelectorAll<HTMLInputElement>('input[data-prop]'))) {
      if (inp === except) continue;
      const prop = inp.dataset.prop!;
      const [kind, side] = prop.split('-') as [Kind, Side];
      const v = prop === 'width' ? box.cssWidth : prop === 'height' ? box.cssHeight
        : (kind === 'margin' || kind === 'padding') && SIDES.includes(side) ? box[kind][side]
        : prop.startsWith('shadow-') ? shadowPart(parseShadow(getComputedStyle(this.selected).boxShadow) ?? DEFAULT_SHADOW, prop as ShadowPart)
        : readValue(getComputedStyle(this.selected), prop);
      inp.value = String(v);
    }
  }

  private renderChangesPart(part: HTMLElement): void {
    const rows = this.store.rows();
    const list = rows.length === 0
      ? '<div class="empty">Todavía no hay cambios.</div>'
      : `<div class="changes">${rows.map((r) => `
          <div class="change">
            <span class="what" title="${escapeHtml(`${r.selector.replace('{', ' { ')} { ${r.prop}: ${r.value} }`)}">
              ${screenTag(r.selector)}<code>${escapeHtml(parseKey(r.selector).selector)}</code> ${propLabel(r.prop)}: <span class="muted">${escapeHtml(r.original)} →</span> <b>${escapeHtml(r.value)}</b>
            </span>
            <button class="icon" data-act="remove" data-selector="${escapeHtml(r.selector)}" data-prop="${r.prop}" title="Quitar este cambio">✕</button>
          </div>`).join('')}</div>`;
    // Pie de altura fija: la lista y el CSS se despliegan dentro del panel sin cambiar su tamaño.
    const listScroll = part.scrollTop;
    part.innerHTML = `
      <div class="row nowrap"><b>Cambios (${rows.length})</b><span style="flex:1"></span>
        <button class="icon" data-act="undo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" ${this.store.canUndo() ? '' : 'disabled'}>↶</button>
        <button class="icon" data-act="redo" title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer" ${this.store.canRedo() ? '' : 'disabled'}>↷</button>
        <button data-act="compare" title="Ver la página original, sin tus cambios" ${rows.length ? '' : 'disabled'}>Antes</button>
        <button class="primary" data-act="copy" ${rows.length ? '' : 'disabled'}>Copiar CSS</button>
      </div>
      ${rows.length ? `<details ${this.cssOpen ? 'open' : ''}><summary class="muted">Ver cambios y CSS</summary>
        <div class="foot-more">
          ${list}
          <textarea readonly wrap="off" aria-label="CSS de los cambios">${escapeHtml(this.exportCss())}</textarea>
          <div class="row"><button data-act="clear">Descartar todo</button></div>
        </div></details>` : ''}`;
    part.scrollTop = listScroll;
  }
}
