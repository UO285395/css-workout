import { Editor } from './editor';

declare global {
  interface Window { cssWorkout?: Editor }
}

/**
 * Abre el editor sobre la página. Cargar el script una segunda vez (p. ej. pulsando otra vez
 * el bookmarklet) lo cierra.
 */
function toggle(): Editor | undefined {
  // Dentro del marco de móvil o tableta ya edita el editor de la página de fuera.
  if (window.name === 'css-workout-frame') return undefined;
  if (window.cssWorkout) {
    window.cssWorkout.destroy();
    window.cssWorkout = undefined;
    return undefined;
  }
  window.cssWorkout = new Editor(document);
  return window.cssWorkout;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => toggle(), { once: true });
} else {
  toggle();
}

export { Editor, toggle };
