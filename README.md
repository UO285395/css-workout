# CSS Workout

Editor visual para ajustar los espaciados y tamaños de un prototipo arrastrando con el ratón, sin escribir CSS. Al terminar, copias el CSS generado y lo pegas en el prototipo.

Pensado para gente que entiende qué es un margen o un relleno pero no escribe CSS a diario.

## Cómo se usa

1. Carga el script en el prototipo (ver abajo). Aparece un panel abajo a la derecha.
2. Haz clic en cualquier elemento para seleccionarlo. «↑ Padre» sube al contenedor.
3. **Espaciado:** arrastra las zonas naranjas (margen) y verdes (relleno) de cada lado.
   **Tamaño:** arrastra los tiradores azules del borde derecho, inferior o la esquina.
   También puedes escribir los valores en el panel.
4. Elige si el cambio se aplica a **todos los elementos con esa clase** o **solo a ese**.
5. Pulsa **Copiar CSS** y pégalo al final de la hoja de estilos del prototipo.

Atajos: `Alt` arrastra sin imán · `Shift` va de 8 en 8 px · `Esc` suelta la selección · `Ctrl+Z` / `Ctrl+Shift+Z` deshacer y rehacer.

«Usar página» desactiva la selección para poder navegar el prototipo con normalidad.

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

```bash
npm install
npm run build        # genera dist/css-workout.js
```

Añade al HTML del prototipo:

```html
<script src="ruta/a/css-workout.js"></script>
```

O crea un marcador (bookmarklet) con esta URL, cambiando la dirección del script por donde lo tengas publicado:

```text
javascript:(()=>{const s=document.createElement('script');s.src='https://TU-SERVIDOR/css-workout.js?'+Date.now();document.body.appendChild(s)})()
```

Pulsar el marcador otra vez cierra el editor.

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
| `src/changes.ts` | Cambios, deshacer/rehacer y generación del CSS |
| `src/selector.ts` | Selectores por clase o únicos para un elemento |
| `src/styles.ts` | Estilos del panel (dentro de un Shadow DOM) |

## Límites conocidos

- Solo margen, relleno, ancho y alto en píxeles.
- Los cambios no se aplican dentro de iframes ni de Shadow DOM del prototipo.
- En elementos en línea (`display: inline`) el ancho, el alto y los márgenes verticales no tienen efecto; el panel lo avisa.
