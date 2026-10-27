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

.size { position: fixed; pointer-events: auto; background: #fff; border: 2px solid #3b82f6; border-radius: 3px; }
.size.w { cursor: ew-resize; width: 10px; height: 22px; }
.size.h { cursor: ns-resize; width: 22px; height: 10px; }
.size.wh { cursor: nwse-resize; width: 12px; height: 12px; }

.dims { position: fixed; background: #3b82f6; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 11px; white-space: nowrap; }
.tip { position: fixed; z-index: 2; background: #1d1d1f; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap; }
.tip .snap { color: #9be38a; }

.panel { position: fixed; z-index: 1; right: 16px; bottom: 16px; width: 320px; max-height: calc(100vh - 32px); overflow: auto;
  pointer-events: auto; background: #fff; border: 1px solid #d2d2d7; border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18); }
.panel.left { right: auto; left: 16px; }
.panel.min .body { display: none; }
.head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #ececf0; }
.head .title { font-weight: 600; flex: 1; white-space: nowrap; }
.body { padding: 10px; display: grid; gap: 10px; }
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.muted { color: #6e6e73; }
.warn { color: #b45309; background: #fef3c7; border-radius: 6px; padding: 6px 8px; }
.empty { color: #6e6e73; font-style: italic; }
code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }

button { font: inherit; border: 1px solid #d2d2d7; background: #f5f5f7; border-radius: 6px; padding: 3px 8px; cursor: pointer; color: inherit; }
button:hover:not(:disabled) { background: #e8e8ed; }
button:disabled { opacity: .45; cursor: default; }
button.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
button.primary:hover:not(:disabled) { background: #2f6fd8; }
button.icon { padding: 2px 6px; }
.toggle { display: inline-flex; border: 1px solid #d2d2d7; border-radius: 6px; overflow: hidden; }
.toggle button { border: 0; border-radius: 0; }
.toggle button.on { background: #3b82f6; color: #fff; }

.tabs { display: flex; }
.tabs button { flex: 1; padding: 4px 2px; }
.toggle.changed { border-color: #3b82f6; }
.form { display: grid; grid-template-columns: 112px 1fr; gap: 6px 8px; align-items: center; }
.scrub { cursor: ew-resize; user-select: none; border-bottom: 1px dashed #9a9aa0; justify-self: start; }
.scrub:hover { color: #3b82f6; border-color: #3b82f6; }
.unit { position: relative; display: block; }
.unit i { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-style: normal; color: #9a9aa0; font-size: 11px; pointer-events: none; }
.unit input { padding-right: 22px; }
select { width: 100%; font: inherit; padding: 2px 4px; border: 1px solid #d2d2d7; border-radius: 4px; background: #fff; color: inherit; }
select.changed { border-color: #3b82f6; background: #eff6ff; }
input[type=color] { width: 32px; height: 22px; padding: 0; border: 1px solid #d2d2d7; border-radius: 4px; background: none; cursor: pointer; }
input[type=color].changed { border-color: #3b82f6; }
.lbl { width: 66px; }
.grid { display: grid; grid-template-columns: 62px repeat(4, 1fr); gap: 4px; align-items: center; }
.grid .h { text-align: center; color: #6e6e73; font-size: 11px; }
input[type=number] { width: 100%; font: inherit; padding: 2px 4px; border: 1px solid #d2d2d7; border-radius: 4px; }
input[type=number].changed { border-color: #3b82f6; background: #eff6ff; }
.dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 4px; }
.dot.margin { background: #e8873a; }
.dot.padding { background: #5a9a3d; }

.changes { display: grid; gap: 4px; max-height: 160px; overflow: auto; }
.change { display: flex; gap: 6px; align-items: center; }
.change .what { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
textarea { width: 100%; height: 120px; font: 11px/1.4 ui-monospace, Menlo, monospace; border: 1px solid #d2d2d7; border-radius: 6px; padding: 6px; resize: vertical; }
`;
