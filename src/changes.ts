export interface Entry {
  value: string;
  /** Valor que tenía la página antes del primer cambio, para el comentario "antes:". */
  original: string;
}

interface Command {
  selector: string;
  prop: string;
  before: Entry | null;
  after: Entry | null;
}

export interface ChangeRow {
  selector: string;
  prop: string;
  value: string;
  original: string;
}

/**
 * Guarda los cambios por selector y propiedad, con historial para deshacer y rehacer.
 * No toca el DOM: quien lo usa decide cómo aplicar el CSS (ver `toCss`).
 */
export class ChangeStore {
  private rules = new Map<string, Map<string, Entry>>();
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get(selector: string, prop: string): Entry | null {
    const entry = this.rules.get(selector)?.get(prop);
    return entry ? { ...entry } : null;
  }

  /** Cambia un valor sin apuntarlo en el historial (se usa durante un arrastre). */
  preview(selector: string, prop: string, value: string, original: string): void {
    const prev = this.get(selector, prop);
    this.write(selector, prop, { value, original: prev?.original ?? original });
  }

  /** Cambia un valor y lo apunta en el historial. */
  set(selector: string, prop: string, value: string, original: string): void {
    const before = this.get(selector, prop);
    this.preview(selector, prop, value, original);
    this.record(selector, prop, before);
  }

  /** Apunta en el historial el paso de `before` al valor actual (al soltar un arrastre). */
  record(selector: string, prop: string, before: Entry | null): void {
    const after = this.get(selector, prop);
    if (before?.value === after?.value) return;
    // Un cambio que vuelve al valor original deja de ser un cambio.
    if (after && after.value === after.original) {
      this.write(selector, prop, null);
      this.pushCommand({ selector, prop, before, after: null });
      return;
    }
    this.pushCommand({ selector, prop, before, after });
  }

  remove(selector: string, prop: string): void {
    const before = this.get(selector, prop);
    if (!before) return;
    this.write(selector, prop, null);
    this.pushCommand({ selector, prop, before, after: null });
  }

  /** Restaura cambios guardados (sin historial). */
  load(rows: readonly ChangeRow[]): void {
    for (const r of rows) {
      let props = this.rules.get(r.selector);
      if (!props) this.rules.set(r.selector, (props = new Map()));
      props.set(r.prop, { value: r.value, original: r.original });
    }
    this.emit();
  }

  clear(): void {
    this.rules.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    this.write(cmd.selector, cmd.prop, cmd.before);
    this.redoStack.push(cmd);
    this.emit();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    this.write(cmd.selector, cmd.prop, cmd.after);
    this.undoStack.push(cmd);
    this.emit();
  }

  rows(): ChangeRow[] {
    const out: ChangeRow[] = [];
    for (const [selector, props] of this.rules) {
      for (const [prop, e] of props) out.push({ selector, prop, value: e.value, original: e.original });
    }
    return out;
  }

  get size(): number {
    let n = 0;
    for (const props of this.rules.values()) n += props.size;
    return n;
  }

  /**
   * CSS de los cambios. Con `important` se usa para la vista previa (gana a las reglas del
   * prototipo); sin él es el CSS que el usuario copia.
   */
  toCss({ important = false, comments = false } = {}): string {
    const blocks: string[] = [];
    for (const [selector, props] of this.rules) {
      if (props.size === 0) continue;
      const lines = Array.from(props, ([prop, e]) => {
        const decl = `  ${prop}: ${e.value}${important ? ' !important' : ''};`;
        return comments && e.original ? `${decl} /* antes: ${e.original} */` : decl;
      });
      blocks.push(`${selector} {\n${lines.join('\n')}\n}`);
    }
    return blocks.join('\n\n');
  }

  private write(selector: string, prop: string, entry: Entry | null): void {
    let props = this.rules.get(selector);
    if (entry) {
      if (!props) this.rules.set(selector, (props = new Map()));
      props.set(prop, entry);
    } else if (props) {
      props.delete(prop);
      if (props.size === 0) this.rules.delete(selector);
    }
    this.emit();
  }

  private pushCommand(cmd: Command): void {
    this.undoStack.push(cmd);
    this.redoStack = [];
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
