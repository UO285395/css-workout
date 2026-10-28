# CSS Workout

Editor visual para ajustar los espaciados y tamaños de un prototipo arrastrando con el ratón, sin escribir CSS. Al terminar, copias el CSS generado y lo pegas en el prototipo.

Pensado para gente que entiende qué es un margen o un relleno pero no escribe CSS a diario.

## Cómo se usa

1. Carga el script en el prototipo (ver abajo). Aparece un panel abajo a la derecha.
2. Haz clic en cualquier elemento para seleccionarlo. «↑ Padre» sube al contenedor.
3. Elige una pestaña:
   - **Espaciado:** arrastra las zonas naranjas (margen) y verdes (relleno) de cada lado.
   - **Tamaño:** arrastra los tiradores azules del borde derecho, inferior o la esquina.
   - **Texto:** tamaño de letra, grosor, fuente, interlineado, espacio entre letras, color del texto y del fondo, alineación, cursiva, subrayado y mayúsculas. Si el elemento mide lo mismo que su texto (un botón, un enlace, un logo), alinear mueve el elemento entero dentro de su contenedor.
   - **Alineación:** coloca los elementos de dentro uno debajo de otro, en fila o en columna; repártelos y alinéalos en horizontal y vertical, y ajusta la separación entre ellos.

   Los valores numéricos se pueden escribir o ajustar arrastrando a izquierda o derecha sobre su nombre.
4. Elige si el cambio se aplica a **todos los elementos con esa clase** o **solo a ese**.
5. Pulsa **Copiar CSS** y pégalo al final de la hoja de estilos del prototipo.

Atajos: `Alt` arrastra sin imán · `Shift` va de 8 en 8 px · `Esc` suelta la selección · `Ctrl+Z` / `Ctrl+Shift+Z` deshacer y rehacer.

«Usar página» desactiva la selección para poder navegar el prototipo con normalidad.

### Móvil y tableta

Los botones **Escritorio · Tableta 768 · Móvil 375** del panel eligen para qué tamaño de pantalla ajustas. Funciona como Webflow:

- **Escritorio** edita la página en la ventana real, y los cambios valen para todos los tamaños.
- **Tableta** y **Móvil** muestran la página a 768 o 375 px dentro de un marco, y editas ahí. Los cambios se guardan dentro de su `@media` (`max-width: 1023px` y `max-width: 767px`) y valen para ese tamaño y los menores.

El elemento seleccionado se mantiene al cambiar de tamaño. En la lista de cambios, los de tableta y móvil llevan su etiqueta, y el CSS copiado los agrupa en sus `@media` después de las reglas generales.

«Antes», junto a Copiar CSS, muestra la página original sin tus cambios y oculta el panel, para enseñar la diferencia. «Volver a mis cambios» o `Esc` los vuelve a mostrar; no se pierde nada.

### El imán

Como los prototipos no siempre tienen una escala de espaciado fija, al arrastrar el valor se «pega» a los espaciados que ya usa la página (márgenes, rellenos y gaps de todos sus elementos) cuando pasa a menos de 3 px. Así no aparecen valores sueltos como 17 px. El aviso «ya usado en la página» indica cuándo ha ocurrido.

### Qué CSS se genera

```css
/* CSS Workout: 2 cambios */
.card {
  padding-top: 24px; /* antes: 16px */
}

#hero {
  width: 640px; /* antes: 600px */
}
```

Mientras editas, los cambios se aplican con `!important` en una hoja de estilos aparte para verse por encima del CSS del prototipo. El CSS copiado no lleva `!important`: si al pegarlo no se aplica, es que otra regla del prototipo es más específica.

Los cambios se guardan en el navegador por cada URL, así que sobreviven a recargas.

## Cargar el script en un prototipo

La versión publicada vive en GitHub Pages: <https://uo285395.github.io/css-workout/>. Allí está el botón para arrastrar a la barra de marcadores y una demo.

- **Como marcador:** arrastra el botón de la portada a la barra de marcadores y púlsalo en cualquier prototipo. Pulsarlo otra vez cierra el editor.
- **Dentro del prototipo:** añade al HTML

  ```html
  <script src="https://uo285395.github.io/css-workout/css-workout.js"></script>
  ```

Cada push a `main` vuelve a publicar la web (`.github/workflows/pages.yml`, que usa `scripts/build-site.mjs`).

## Desarrollo

```bash
npm run dev          # abre demo/index.html con el editor cargado desde src/
npm test             # pruebas unitarias (Vitest)
npm run test:e2e     # pruebas en navegador (Playwright) sobre la demo
```

| Archivo | Qué hace |
| --- | --- |
| `src/editor.ts` | Selección, capa de tiradores, arrastre y panel |
| `src/box.ts` | Medidas de la caja (margen, relleno, borde) de un elemento |
| `src/snapping.ts` | Imán a los espaciados de la página |
| `src/styleprops.ts` | Propiedades de texto y alineación: etiquetas, lectura de valores, fuentes y tamaños de la página |
| `src/changes.ts` | Cambios, deshacer/rehacer y generación del CSS |
| `src/selector.ts` | Selectores por clase o únicos para un elemento |
| `src/styles.ts` | Estilos del panel (dentro de un Shadow DOM) |

## Límites conocidos

- Los valores numéricos se generan en píxeles.
- En contenedores con cuadrícula (`grid`) solo se ajusta la separación.
- Los cambios no se aplican dentro de iframes ni de Shadow DOM del prototipo.
- En elementos en línea (`display: inline`, como un `span` o un enlace suelto) el ancho, el alto y los márgenes verticales no tienen efecto. Al cambiarlos, el editor añade `display: inline-block` en el mismo paso de deshacer y lo incluye en el CSS copiado.
