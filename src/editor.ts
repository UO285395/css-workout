import { ChangeStore, type Entry } from './changes';
import { measure, zoneRect, dragSign, SIDES, type BoxModel, type Rect, type Side } from './box';
import { collectSpacingValues, snap } from './snapping';
import { selectorFor, defaultScope, classSelector, describe, type Scope } from './selector';
import { UI_CSS } from './styles';

type Mode = 'spacing' | 'size';
type Kind = 'margin' | 'padding';

const HIT_MIN = 8;
/** Propiedades que un elemento en línea ignora; al tocarlas se pasa a `inline-block`. */
const BLOCK_ONLY = ['width', 'height', 'margin-top', 'margin-bottom'];

export const needsInlineBlock = (display: string, props: readonly string[]) =>
  display === 'inline' && props.some((p) => BLOCK_ONLY.includes(p));
const STORAGE_PREFIX = 'css-workout:';

const SIDE_LABEL: Record<Side, string> = { top: 'superior', right: 'derecho', bottom: 'inferior', left: 'izquierdo' };
const KIND_LABEL: Record<Kind, string> = { margin: 'Margen', padding: 'Relleno' };

export function propLabel(prop: string): string {
  if (prop === 'width') return 'Ancho';
  if (prop === 'height') return 'Alto';
  if (prop === 'display') return 'Tipo de caja';
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
  private drag: Drag | null = null;
  private frame = 0;
  private cssOpen = false;
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
    this.candidates = this.collect();
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
    this.candidates = this.collect();
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
    for (const kind of ['margin', 'padding'] as Kind[]) {
      for (const side of SIDES) {
        place(ov.areas[kind][side], zoneRect(box, kind, side));
        place(ov.zones[kind][side], spacing ? zoneRect(box, kind, side, HIT_MIN) : null);
      }
    }
    this.placeSizeHandles(spacing ? null : box);
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

  private collect(): number[] {
    return collectSpacingValues(this.doc.body ?? this.doc.documentElement, (el) => el === this.host);
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
        <span class="title">CSS Workout</span>
        <div class="toggle" title="Mientras editas, los clics seleccionan elementos en vez de usar el prototipo">
          <button data-act="on">Editar</button><button data-act="off">Usar página</button>
        </div>
        <button class="icon" data-act="side" title="Mover el panel al otro lado">⇆</button>
        <button class="icon" data-act="min" title="Minimizar">—</button>
      </div>
      <div class="body">
        <div data-part="selection"></div>
        <div data-part="changes"></div>
        <div class="muted">Alt: sin imán · Shift: de 8 en 8 · Esc: soltar selección · Ctrl+Z: deshacer</div>
      </div>`;
    this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    this.panel.addEventListener('change', (e) => this.onPanelChange(e));
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
    const input = e.target as HTMLInputElement;
    const prop = input.dataset.prop;
    if (!prop || !this.selected) return;
    const v = Math.max(0, Math.round(Number(input.value)));
    if (!Number.isFinite(v)) return;
    const selector = this.selector!;
    const cs = getComputedStyle(this.selected);
    const original = this.store.get(selector, prop)?.original ?? cs.getPropertyValue(prop);
    const items = [{ prop, value: `${v}px`, original }];
    if (needsInlineBlock(cs.display, [prop])) items.unshift({ prop: 'display', value: 'inline-block', original: 'inline' });
    this.store.setMany(selector, items);
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
    const focused = this.root.activeElement as HTMLInputElement | null;
    if (!el) {
      part.innerHTML = `<div class="empty">${this.active ? 'Haz clic en un elemento de la página para ajustarlo.' : 'Pulsa «Editar» para seleccionar elementos.'}</div>`;
      return;
    }
    // No se reconstruye mientras el usuario escribe en un campo, para no perder el foco.
    if (focused?.dataset?.prop && part.contains(focused)) {
      this.syncInputs(part, focused);
      return;
    }
    const selector = this.selector!;
    const cls = classSelector(el);
    const count = cls ? this.doc.querySelectorAll(cls).length : 0;
    const box = measure(el);
    const inline = box.display === 'inline';
    const input = (prop: string, value: number) =>
      `<input type="number" min="0" data-prop="${prop}" value="${value}" class="${this.store.get(selector, prop) ? 'changed' : ''}" aria-label="${propLabel(prop)}">`;

    part.innerHTML = `
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
      <div class="row">
        <div class="toggle">
          <button data-act="mode-spacing" class="${this.mode === 'spacing' ? 'on' : ''}">Espaciado</button>
          <button data-act="mode-size" class="${this.mode === 'size' ? 'on' : ''}">Tamaño</button>
        </div>
        <span class="muted">${this.mode === 'spacing' ? 'Arrastra las zonas de color' : 'Arrastra los tiradores azules'}</span>
      </div>
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
      </div>
      <div class="muted mono" title="Selector al que se aplicarán los cambios">${escapeHtml(selector)}</div>`;
  }

  private syncInputs(part: HTMLElement, except: HTMLInputElement): void {
    if (!this.selected) return;
    const box = measure(this.selected);
    for (const inp of Array.from(part.querySelectorAll<HTMLInputElement>('input[data-prop]'))) {
      if (inp === except) continue;
      const prop = inp.dataset.prop!;
      const v = prop === 'width' ? box.cssWidth : prop === 'height' ? box.cssHeight
        : box[prop.split('-')[0] as Kind][prop.split('-')[1] as Side];
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
    part.innerHTML = `
      <div class="row"><b>Cambios (${rows.length})</b><span style="flex:1"></span>
        <button data-act="undo" ${this.store.canUndo() ? '' : 'disabled'}>Deshacer</button>
        <button data-act="redo" ${this.store.canRedo() ? '' : 'disabled'}>Rehacer</button>
      </div>
      ${list}
      ${rows.length ? `<details ${this.cssOpen ? 'open' : ''}><summary class="muted">Ver CSS</summary><textarea readonly>${escapeHtml(this.exportCss())}</textarea></details>` : ''}
      <div class="row">
        <button class="primary" data-act="copy" ${rows.length ? '' : 'disabled'}>Copiar CSS</button>
        <button data-act="clear" ${rows.length ? '' : 'disabled'}>Descartar todo</button>
      </div>`;
  }
}
