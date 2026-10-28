import { ChangeStore, type Entry } from './changes';
import { measure, zoneRect, dragSign, SIDES, type BoxModel, type Rect, type Side } from './box';
import { collectSpacingValues, snap } from './snapping';
import { selectorFor, defaultScope, classSelector, describe, type Scope } from './selector';
import { UI_CSS } from './styles';
import {
  styleLabel, readValue, originalValue, collectFonts, collectFontSizes, axisProp, isFlex, isGrid,
  isTransparent, NUMERIC, WEIGHTS,
} from './styleprops';

type Mode = 'spacing' | 'size' | 'text' | 'layout';
type Kind = 'margin' | 'padding';

const HIT_MIN = 8;
/** Propiedades que un elemento en línea ignora; al tocarlas se pasa a `inline-block`. */
const BLOCK_ONLY = ['width', 'height', 'margin-top', 'margin-bottom'];

export const needsInlineBlock = (display: string, props: readonly string[]) =>
  display === 'inline' && props.some((p) => BLOCK_ONLY.includes(p));
const STORAGE_PREFIX = 'css-workout:';
const HELP = 'Arrastra una etiqueta subrayada para cambiar su valor\nArrastra con Alt: sin imán\nArrastra con Shift: de 8 en 8\nEsc: soltar la selección\nCtrl+Z / Ctrl+Shift+Z: deshacer y rehacer';

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

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Drag {
  props: string[];
  selector: string;
  before: (Entry | null)[];
  originals: string[];
  /** `display: inline-block` que se añade al arrastrar ancho, alto o márgenes verticales de un elemento en línea. */
  display: { before: Entry | null } | null;
  start: number[];
  pointer: { x: number; y: number };
  compute: (dx: number, dy: number, e: PointerEvent) => { values: number[]; snapped: boolean };
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
  private previewStyle: HTMLStyleElement;
  private layer: HTMLElement;
  private panel: HTMLElement;

  private active = true;
  private mode: Mode = 'spacing';
  private scope: Scope = 'element';
  private hovered: Element | null = null;
  private selected: Element | null = null;
  private candidates: number[] = [];
  private fontSizes: number[] = [];
  private fonts: string[] = [];
  /** Valor previo de un color mientras se elige en el selector, para apuntarlo como un solo paso. */
  private colorBefore = new Map<string, Entry | null>();
  private drag: Drag | null = null;
  private frame = 0;
  private cssOpen = false;
  /** Pestaña y selector dibujados por última vez, para conservar el desplazamiento. */
  private tabView = '';
  private storageKey: string;

  private ov!: {
    hover: HTMLElement; hoverTag: HTMLElement; sel: HTMLElement; dims: HTMLElement; tip: HTMLElement;
    areas: Record<Kind, Record<Side, HTMLElement>>;
    zones: Record<Kind, Record<Side, HTMLElement>>;
    size: { w: HTMLElement; h: HTMLElement; wh: HTMLElement };
    twins: HTMLElement[];
  };

  constructor(private doc: Document = document) {
    this.storageKey = STORAGE_PREFIX + doc.location.pathname;

    this.host = doc.createElement('css-workout');
    this.host.setAttribute('style', 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;');
    this.root = this.host.attachShadow({ mode: 'open' });
    h('style', '', this.root).textContent = UI_CSS;
    this.layer = h('div', 'layer', this.root);
    this.buildOverlay();
    this.panel = h('div', 'panel', this.layer);
    this.buildPanel();
    doc.documentElement.appendChild(this.host);

    this.previewStyle = doc.createElement('style');
    this.previewStyle.id = 'css-workout-preview';
    doc.head.appendChild(this.previewStyle);

    this.restore();
    this.store.onChange(() => {
      this.previewStyle.textContent = this.store.toCss({ important: true });
      this.persist();
      this.renderPanel();
    });
    this.previewStyle.textContent = this.store.toCss({ important: true });

    doc.addEventListener('mousemove', this.onMouseMove, true);
    doc.addEventListener('click', this.onClick, true);
    doc.addEventListener('keydown', this.onKeyDown, true);
    this.collectAll();
    this.renderPanel();
    this.loop();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.doc.removeEventListener('mousemove', this.onMouseMove, true);
    this.doc.removeEventListener('click', this.onClick, true);
    this.doc.removeEventListener('keydown', this.onKeyDown, true);
    this.host.remove();
    this.previewStyle.remove();
  }

  /** CSS listo para copiar, con el valor anterior como comentario. */
  exportCss(): string {
    const n = this.store.size;
    if (n === 0) return '';
    return `/* CSS Workout: ${n} ${n === 1 ? 'cambio' : 'cambios'} */\n${this.store.toCss({ comments: true })}\n`;
  }

  select(el: Element | null): void {
    this.selected = el;
    if (el) this.scope = defaultScope(el);
    this.collectAll();
    this.renderPanel();
  }

  get selector(): string | null {
    return this.selected ? selectorFor(this.selected, this.scope) : null;
  }

  // ---------- Overlay ----------

  private buildOverlay(): void {
    const L = this.layer;
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
      sel: h('div', 'sel', L), dims: h('div', 'dims', L), tip: h('div', 'tip', L),
      areas, zones, size, twins: [],
    };
    this.ov.tip.style.display = 'none';
  }

  private loop = () => {
    this.renderOverlay();
    this.frame = requestAnimationFrame(this.loop);
  };

  private renderOverlay(): void {
    const ov = this.ov;
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
    this.renderTwins(el);
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

  /** Con ámbito "por clase", marca con línea discontinua el resto de elementos afectados. */
  private renderTwins(el: Element): void {
    const twins = this.scope === 'class' ? this.matches().filter((m) => m !== el).slice(0, 50) : [];
    while (this.ov.twins.length < twins.length) this.ov.twins.push(h('div', 'twin', this.layer));
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
    for (const t of this.ov.twins) place(t, null);
  }

  private matches(): Element[] {
    const sel = this.selector;
    if (!sel) return [];
    try { return Array.from(this.doc.querySelectorAll(sel)); } catch { return []; }
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
      return { values: [r.value], snapped: r.snapped };
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
      display: needsInlineBlock(cs.display, props) ? { before: this.store.get(selector, 'display') } : null,
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
    const { values, snapped } = d.compute(e.clientX - d.pointer.x, e.clientY - d.pointer.y, e);
    if (d.display) this.store.preview(d.selector, 'display', 'inline-block', 'inline');
    d.props.forEach((p, i) => this.store.preview(d.selector, p, `${values[i]}px`, d.originals[i]));
    const tip = this.ov.tip;
    tip.style.display = '';
    tip.innerHTML = d.props.map((p, i) => `${propLabel(p)}: <b>${values[i]}px</b>`).join(' · ') +
      (snapped ? ' <span class="snap">· ya usado en la página</span>' : '');
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY + 14}px`;
  }

  private onDragEnd(_e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    this.ov.tip.style.display = 'none';
    if (!d) return;
    const steps = d.props.map((prop, i) => ({ prop, before: d.before[i] }));
    if (d.display) steps.unshift({ prop: 'display', before: d.display.before });
    this.store.recordMany(d.selector, steps);
  }

  // ---------- Eventos de la página ----------

  private isOwn(target: EventTarget | null): boolean {
    return target === this.host;
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.active || this.drag) return;
    const t = e.target as Element | null;
    this.hovered = !t || this.isOwn(t) || t === this.doc.documentElement ? null : t;
  };

  private onClick = (e: MouseEvent) => {
    if (!this.active || this.isOwn(e.target)) return;
    const t = e.target as Element;
    if (t === this.doc.documentElement) return;
    // Mientras se edita, un clic selecciona en vez de seguir enlaces o pulsar botones del prototipo.
    e.preventDefault();
    e.stopPropagation();
    this.select(t);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const inField = this.isOwn(e.target) && this.root.activeElement instanceof HTMLInputElement;
    if (inField) return;
    const mod = e.ctrlKey || e.metaKey;
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

  private isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }

  private collectAll(): void {
    const root = this.doc.body ?? this.doc.documentElement;
    const ignore = (el: Element) => el === this.host;
    this.candidates = collectSpacingValues(root, ignore);
    this.fontSizes = collectFontSizes(root, ignore);
    this.fonts = collectFonts(root, ignore);
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
        <span class="title" title="${HELP}">CSS Workout</span>
        <div class="toggle" title="Mientras editas, los clics seleccionan elementos en vez de usar el prototipo">
          <button data-act="on">Editar</button><button data-act="off">Usar página</button>
        </div>
        <button class="icon" data-act="side" title="Mover el panel al otro lado">⇆</button>
        <button class="icon" data-act="min" title="Minimizar">—</button>
      </div>
      <div class="body">
        <div class="selection" data-part="selection"></div>
        <div class="foot" data-part="changes"></div>
      </div>`;
    this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    this.panel.addEventListener('change', (e) => this.onPanelChange(e));
    this.panel.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === 'color' && t.dataset.prop) this.previewColor(t.dataset.prop, t.value);
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
      case 'side': this.panel.classList.toggle('left'); break;
      case 'min': this.panel.classList.toggle('min'); break;
      case 'parent': {
        const p = this.selected?.parentElement;
        if (p && p !== this.doc.documentElement) this.select(p);
        break;
      }
      case 'deselect': this.select(null); break;
      case 'mode-spacing': this.mode = 'spacing'; break;
      case 'mode-size': this.mode = 'size'; break;
      case 'mode-text': this.mode = 'text'; break;
      case 'mode-layout': this.mode = 'layout'; break;
      case 'set':
        if (btn.dataset.prop === 'text-align') this.alignText(btn.dataset.value!);
        else this.commit(btn.dataset.prop!, btn.dataset.value!);
        break;
      case 'children': this.setChildren(btn.dataset.value!); break;
      case 'scope-class': this.scope = 'class'; break;
      case 'scope-element': this.scope = 'element'; break;
      case 'undo': this.store.undo(); break;
      case 'redo': this.store.redo(); break;
      case 'remove': this.store.remove(btn.dataset.selector!, btn.dataset.prop!); break;
      case 'clear':
        if (confirm('¿Descartar todos los cambios?')) this.store.clear();
        break;
      case 'copy': void this.copy(btn); return;
    }
    this.renderPanel();
  }

  private onPanelChange(e: Event): void {
    const input = e.target as HTMLInputElement | HTMLSelectElement;
    const prop = input.dataset.prop;
    if (!prop || !this.selected) return;
    if (input instanceof HTMLSelectElement) return this.commit(prop, input.value);
    if (input.type === 'color') return this.finishColor(prop);
    if (input.value.trim() === '') return;
    const min = NUMERIC[prop]?.min ?? 0;
    const step = prop === 'letter-spacing' ? 10 : 1;
    const v = Math.max(min, Math.round(Number(input.value) * step) / step);
    if (!Number.isFinite(v)) return;
    this.commit(prop, `${v}px`);
  }

  /** Aplica un valor a la selección como un paso de deshacer. */
  private commit(prop: string, value: string): void {
    if (!this.selected) return;
    const selector = this.selector!;
    const cs = getComputedStyle(this.selected);
    const original = this.store.get(selector, prop)?.original ?? originalValue(cs, prop);
    const items = [{ prop, value, original }];
    if (needsInlineBlock(cs.display, [prop])) items.unshift({ prop: 'display', value: 'inline-block', original: 'inline' });
    this.store.setMany(selector, items);
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
    if (how === 'normal') {
      const items = ['display', 'flex-direction'].filter((p) => this.store.get(selector, p));
      // Si la página ya lo tenía en fila o columna, "uno debajo de otro" es volver a bloque.
      if (items.length === 0) return isFlex(cs.display) ? this.commit('display', 'block') : undefined;
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
    if (!this.colorBefore.has(prop)) this.colorBefore.set(prop, this.store.get(selector, prop));
    const original = this.store.get(selector, prop)?.original ?? originalValue(getComputedStyle(this.selected), prop);
    this.store.preview(selector, prop, value, original);
  }

  private finishColor(prop: string): void {
    if (!this.selected || !this.colorBefore.has(prop)) return;
    this.store.record(this.selector!, prop, this.colorBefore.get(prop) ?? null);
    this.colorBefore.delete(prop);
  }

  /** Arrastrar a izquierda o derecha sobre la etiqueta de un valor numérico lo cambia. */
  private startScrub(e: PointerEvent, prop: string): void {
    if (!this.selected) return;
    const cs = getComputedStyle(this.selected);
    const raw = readValue(cs, prop);
    const start = raw === '' ? Math.round(parseFloat(cs.fontSize) * 1.2) : Number(raw);
    const min = NUMERIC[prop]?.min ?? 0;
    const candidates = prop === 'font-size' ? this.fontSizes : prop === 'gap' ? this.candidates : [];
    // Cada 2 px de ratón cambian 1 px de valor: más preciso que 1:1 en valores pequeños.
    this.beginDrag(e, [prop], [start], (dx, _dy, ev) => {
      const r = snap(start + dx / 2, candidates, { free: ev.altKey, coarse: ev.shiftKey, min });
      return { values: [r.value], snapped: r.snapped };
    });
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
    const count = cls ? this.doc.querySelectorAll(cls).length : 0;
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
      <div class="row"><b class="mono">${escapeHtml(describe(el))}</b>
        <span style="flex:1"></span>
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
      </div>
      </div>
      <div class="tab">
      ${this.mode === 'text' ? this.textSection(el, selector) : this.mode === 'layout' ? this.layoutSection(el, selector) : this.boxSection(el, selector, box, inline, input)}
      <div class="muted mono" title="Selector al que se aplicarán los cambios">${escapeHtml(selector)}</div>
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

  private numberField(prop: string, value: string, placeholder = ''): string {
    const changed = this.store.get(this.selector!, prop) ? 'changed' : '';
    const step = prop === 'letter-spacing' ? '0.1' : '1';
    return `<label class="scrub" data-scrub="${prop}" title="Arrastra a izquierda o derecha para ajustar">${styleLabel(prop)}</label>
      <span class="unit"><input type="number" step="${step}" min="${NUMERIC[prop]?.min ?? 0}" data-prop="${prop}" value="${value}" placeholder="${placeholder}" class="${changed}" aria-label="${styleLabel(prop)}"><i>px</i></span>`;
  }

  private colorField(prop: string, cs: CSSStyleDeclaration): string {
    const changed = this.store.get(this.selector!, prop) ? 'changed' : '';
    const none = !this.store.get(this.selector!, prop) && isTransparent(cs.getPropertyValue(prop));
    return `<span>${styleLabel(prop)}</span>
      <span class="row"><input type="color" data-prop="${prop}" value="${none ? '#ffffff' : readValue(cs, prop)}" class="${changed}" aria-label="${styleLabel(prop)}">
      ${none ? '<span class="muted">sin color</span>' : `<code>${readValue(cs, prop)}</code>`}</span>`;
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

  private layoutSection(el: Element, _selector: string): string {
    const cs = getComputedStyle(el);
    const flex = isFlex(cs.display);
    const grid = isGrid(cs.display);
    const childCount = el.children.length;
    const children = flex ? (cs.flexDirection.startsWith('column') ? 'column' : 'row') : grid ? 'grid' : 'normal';
    const childButtons = `<div class="toggle">${([['normal', 'Uno debajo de otro'], ['row', 'En fila'], ['column', 'En columna']] as const)
      .map(([v, l]) => `<button data-act="children" data-value="${v}" class="${children === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

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
    const gap = flex || grid
      ? `<div class="form">${this.numberField('gap', readValue(cs, 'gap'))}</div>`
      : '';
    if (childCount === 0) {
      return '<div class="empty">Este elemento no contiene otros elementos. Pulsa «↑ Padre» para alinear el contenedor en el que está.</div>';
    }
    return `
      <div class="row"><span class="muted">Colocar ${childCount === 1 ? 'el elemento de dentro' : `los ${childCount} elementos de dentro`}</span></div>
      ${grid ? '<div class="muted">Este elemento usa una cuadrícula (grid). Aquí solo se ajusta la separación.</div>' : childButtons}
      ${alignment}
      ${gap}
      ${!flex && !grid ? '<div class="muted">Elige «En fila» o «En columna» para poder alinear y separar los elementos de dentro.</div>' : ''}`;
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
            <span class="what" title="${escapeHtml(`${r.selector} { ${r.prop}: ${r.value} }`)}">
              <code>${escapeHtml(r.selector)}</code> ${propLabel(r.prop)}: <span class="muted">${escapeHtml(r.original)} →</span> <b>${escapeHtml(r.value)}</b>
            </span>
            <button class="icon" data-act="remove" data-selector="${escapeHtml(r.selector)}" data-prop="${r.prop}" title="Quitar este cambio">✕</button>
          </div>`).join('')}</div>`;
    // Pie de altura fija: la lista y el CSS se despliegan dentro del panel sin cambiar su tamaño.
    const listScroll = part.scrollTop;
    part.innerHTML = `
      <div class="row nowrap"><b>Cambios (${rows.length})</b><span style="flex:1"></span>
        <button class="icon" data-act="undo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" ${this.store.canUndo() ? '' : 'disabled'}>↶</button>
        <button class="icon" data-act="redo" title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer" ${this.store.canRedo() ? '' : 'disabled'}>↷</button>
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
