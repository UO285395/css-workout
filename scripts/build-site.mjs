// Monta la web de GitHub Pages en site/: el script compilado, la demo y una portada con el marcador.
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const base = process.env.SITE_URL ?? 'https://uo285395.github.io/css-workout/';
const out = 'site';

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/demo`, { recursive: true });

copyFileSync('dist/css-workout.js', `${out}/css-workout.js`);
copyFileSync('demo/prototype.css', `${out}/demo/prototype.css`);
// En la demo publicada se usa el script compilado en lugar del código fuente.
const demo = readFileSync('demo/index.html', 'utf8')
  .replace(/<!--[^>]*-->\s*<script type="module" src="\/src\/index.ts"><\/script>/, '<script src="../css-workout.js"></script>');
writeFileSync(`${out}/demo/index.html`, demo);

const bookmarklet = `javascript:(()=>{const s=document.createElement('script');s.src='${base}css-workout.js?'+Date.now();document.body.appendChild(s)})()`;
writeFileSync(`${out}/index.html`, `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CSS Workout</title>
  <style>
    body { font: 16px/1.6 system-ui, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 16px; color: #222; }
    .bm { display: inline-block; padding: 10px 18px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }
    code { background: #f2f2f5; padding: 1px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>CSS Workout</h1>
  <p>Ajusta espaciados y tamaños de un prototipo arrastrando con el ratón y copia el CSS resultante.</p>
  <h2>Como marcador</h2>
  <p>Arrastra este botón a la barra de marcadores. Púlsalo en cualquier prototipo para abrir el editor; púlsalo otra vez para cerrarlo.</p>
  <p><a class="bm" href="${bookmarklet.replace(/"/g, '&quot;')}">CSS Workout</a></p>
  <h2>Dentro del prototipo</h2>
  <p>Añade al HTML: <code>&lt;script src="${base}css-workout.js"&gt;&lt;/script&gt;</code></p>
  <h2>Probarlo</h2>
  <p><a href="demo/">Abrir la demo</a></p>
</body>
</html>
`);
console.log(`Web generada en ${out}/`);
