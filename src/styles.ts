/** Estilos de la interfaz. Viven dentro del Shadow DOM, así que no chocan con los del prototipo. */
export const UI_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }

.layer { position: fixed; inset: 0; pointer-events: none; font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1d1f; }

.hover { position: fixed; outline: 1px solid #3b82f6; background: rgba(59,130,246,.06); }
.hover-tag { position: fixed; background: #3b82f6; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 11px; white-space: nowrap; }

.sel { position: fixed; outline: 2px solid #3b82f6; }
.twin { position: fixed; outline: 1px dashed #3b82f6; }
.area { position: fixed; }
.area.margin { background: rgba(246,178,107,.45); }
.area.padding { background: rgba(147,196,125,.5); }

.zone { position: fixed; pointer-events: auto; display: flex; align-items: center; justify-content: center; }
.zone::after { content: ""; display: block; border-radius: 3px; opacity: .9; }
.zone.y { cursor: ns-resize; }
.zone.x { cursor: ew-resize; }
.zone.y::after { width: 18px; height: 4px; }
.zone.x::after { width: 4px; height: 18px; }
.zone.margin::after { background: #e8873a; }
.zone.padding::after { background: #5a9a3d; }
.zone:hover { background: rgba(0,0,0,.06); }
.grid-gap { position: fixed; pointer-events: auto; background: rgba(168,85,247,.28); }
.grid-gap.x { cursor: ew-resize; z-index: 1; }
.grid-gap.y { cursor: ns-resize; }
.grid-gap:hover { background: rgba(168,85,247,.5); }
.stepper b { min-width: 18px; text-align: center; }
.stepper.changed b { color: #3b82f6; }

.size { position: fixed; pointer-events: auto; background: #fff; border: 2px solid #3b82f6; border-radius: 3px; }
.size.w { cursor: ew-resize; width: 10px; height: 22px; }
.size.h { cursor: ns-resize; width: 22px; height: 10px; }
.size.wh { cursor: nwse-resize; width: 12px; height: 12px; }

.dims { position: fixed; background: #3b82f6; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 11px; white-space: nowrap; }
.measure-line { position: fixed; background: #e5484d; }
.measure-label { position: fixed; transform: translate(-50%, -50%); background: #e5484d; color: #fff; padding: 0 5px; border-radius: 3px; font-size: 11px; white-space: nowrap; }
.tip { position: fixed; z-index: 2; background: #1d1d1f; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap; }
.tip .snap { color: #9be38a; }

/* Tamaño fijo: cambiar de pestaña o de elemento no lo redimensiona. Solo se desplaza la zona de la pestaña. */
.panel { position: fixed; z-index: 1; right: 16px; bottom: 16px; width: 320px; height: min(680px, calc(100vh - 32px));
  display: flex; flex-direction: column; overflow: hidden;
  pointer-events: auto; background: #fff; border: 1px solid #d2d2d7; border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18); }
.panel.left { right: auto; left: 16px; }
/* Antes y después: solo queda a la vista el botón para volver. */
.layer.comparing > :not(.compare-pill):not(.stage) { display: none !important; }
.compare-pill { display: none; position: fixed; right: 16px; bottom: 16px; z-index: 1; pointer-events: auto; padding: 8px 14px;
  border-radius: 999px; background: #fff; border: 1px solid #d2d2d7; box-shadow: 0 6px 20px rgba(0,0,0,.18); }
.compare-pill b { color: #3b82f6; }
.layer.comparing > .compare-pill { display: block; }
.panel.min { height: auto; }
.panel.min .body { display: none; }
.head { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #ececf0; }
.head .title { font-weight: 600; flex: 1; white-space: nowrap; cursor: help; }
.head { flex-wrap: wrap; }
.head .screens { flex: 1 0 100%; display: flex; }
.head .screens button { flex: 1; }
.head .screens .px { opacity: .7; font-size: 10px; }

/* Marco para móvil y tableta: la página a ese ancho, centrada en el hueco que deja el panel. */
.stage { display: none; position: fixed; inset: 0; background: #e8e8ed; pointer-events: auto;
  justify-content: safe center; align-items: flex-start; overflow: auto; padding: 36px 352px 16px 16px; }
.layer.panel-left .stage { padding: 36px 16px 16px 352px; }
.layer.framed .stage { display: flex; }
.stage::before { content: attr(data-label); position: absolute; top: 10px; left: 0; right: 0; text-align: center; color: #6e6e73; font-size: 12px; }
.frame { flex: none; height: 100%; border: 0; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
.badge { display: inline-block; font-size: 10px; padding: 0 5px; border-radius: 4px; background: #fef3c7; color: #b45309; }
.body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.selection { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.sel-head { flex: none; display: grid; gap: 8px; padding: 10px 10px 8px; border-bottom: 1px solid #ececf0; }
.tab { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-gutter: stable;
  display: flex; flex-direction: column; gap: 8px; padding: 10px 4px 10px 10px; }
.tab > * { flex: none; }
.help { margin: 0; padding-left: 16px; display: grid; gap: 2px; }
/* Pie: la fila de Cambios y Copiar siempre a la vista; la lista desplegada se desplaza bajo ella. */
.foot { flex: none; max-height: 55%; overflow-y: auto; scrollbar-width: thin; padding: 0 10px 8px; border-top: 1px solid #ececf0; background: #fafafc; }
.foot > .row:first-child { position: sticky; top: 0; z-index: 1; padding: 8px 0 6px; background: #fafafc; }
.foot summary { cursor: pointer; }
.foot-more { display: grid; gap: 6px; padding-top: 6px; }
.field { display: grid; gap: 4px; }
.field .toggle { display: flex; }
.field .toggle button { flex: 1; }
.note { color: #6e6e73; font-size: 11px; }
button.link { border: 0; background: none; padding: 0; color: #3b82f6; text-decoration: underline; font-size: inherit; }
button.link:hover:not(:disabled) { background: none; }
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.row.nowrap { flex-wrap: nowrap; }
.sel-head > * { min-width: 0; }
.el-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muted { color: #6e6e73; }
.warn { color: #b45309; background: #fef3c7; border-radius: 6px; padding: 6px 8px; }
.hint-box { color: #1e40af; background: #eff6ff; border-radius: 6px; padding: 6px 8px; }
.empty { color: #6e6e73; font-style: italic; }
code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }

button { white-space: nowrap; font: inherit; border: 1px solid #d2d2d7; background: #f5f5f7; border-radius: 6px; padding: 3px 8px; cursor: pointer; color: inherit; }
button:hover:not(:disabled) { background: #e8e8ed; }
button:disabled { opacity: .45; cursor: default; }
button.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
button.primary:hover:not(:disabled) { background: #2f6fd8; }
button.icon { padding: 2px 6px; }
button.on-state { background: #fef3c7; border-color: #f59e0b; color: #92400e; }
.toggle { display: inline-flex; border: 1px solid #d2d2d7; border-radius: 6px; overflow: hidden; }
.toggle button { border: 0; border-radius: 0; }
.toggle button.on { background: #3b82f6; color: #fff; }

.tabs { display: flex; }
.tabs button { flex: 1; padding: 4px 2px; }
.toggle.changed { border-color: #3b82f6; }
.form { display: grid; grid-template-columns: 122px 1fr; gap: 6px 8px; align-items: center; }
.scrub { cursor: ew-resize; user-select: none; border-bottom: 1px dashed #9a9aa0; justify-self: start; }
.scrub:hover { color: #3b82f6; border-color: #3b82f6; }
.unit { position: relative; display: block; }
.unit i { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-style: normal; color: #9a9aa0; font-size: 11px; pointer-events: none; }
.unit input { padding-right: 22px; }
select { width: 100%; font: inherit; padding: 2px 4px; border: 1px solid #d2d2d7; border-radius: 4px; background: #fff; color: inherit; }
select.changed { border-color: #3b82f6; background: #eff6ff; }
input[type=color] { width: 32px; height: 22px; padding: 0; border: 1px solid #d2d2d7; border-radius: 4px; background: none; cursor: pointer; }
input[type=color].changed { border-color: #3b82f6; }
.color-row { display: flex; gap: 6px; align-items: flex-start; }
.swatches { display: flex; gap: 3px; flex-wrap: wrap; }
.swatch.var { border-radius: 50%; }
.swatch { width: 18px; height: 18px; padding: 0; border: 1px solid rgba(0,0,0,.18); border-radius: 4px; }
.swatch.on { outline: 2px solid #3b82f6; outline-offset: 1px; }
.corners { display: grid; grid-template-columns: 16px 1fr 16px 1fr; gap: 6px 8px; align-items: center; margin-bottom: 10px; }
.corners .muted { text-align: center; }
.shadow-swatch { width: 26px; height: 20px; padding: 0; margin: 6px 4px; border: 1px solid #e5e5e5; border-radius: 4px; background: #fff; }
.shadow-swatch.on { outline: 2px solid #3b82f6; outline-offset: 2px; }
.lbl { width: 66px; }
.hint { color: #6e6e73; font-size: 11px; margin: -4px 0 0 72px; }
.grid { display: grid; grid-template-columns: 62px repeat(4, 1fr); gap: 4px; align-items: center; }
.grid .h { text-align: center; color: #6e6e73; font-size: 11px; }
input[type=number] { width: 100%; font: inherit; padding: 2px 4px; border: 1px solid #d2d2d7; border-radius: 4px; }
input[type=number].changed { border-color: #3b82f6; background: #eff6ff; }
.dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 4px; }
.dot.margin { background: #e8873a; }
.dot.padding { background: #5a9a3d; }

.changes { display: grid; gap: 4px; }
.change { display: flex; gap: 6px; align-items: center; }
.change .what { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
textarea { width: 100%; height: 96px; flex: none; font: 11px/1.4 ui-monospace, Menlo, monospace; border: 1px solid #d2d2d7; border-radius: 6px; padding: 6px; resize: none; }
`;
