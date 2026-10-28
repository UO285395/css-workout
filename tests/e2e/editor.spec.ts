import { test, expect, type Page, type Locator } from '@playwright/test';

const ui = (page: Page, sel: string) => page.locator(`css-workout ${sel}`);
const style = (loc: Locator, prop: string) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function dragBy(page: Page, handle: Locator, dx: number, dy: number) {
  // La capa se recoloca en el siguiente frame: hay que esperar a que el tirador aparezca.
  await expect(handle).toBeVisible();
  const b = (await handle.boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(ui(page, '.panel')).toBeVisible();
});

test('arrastrar el relleno de una tarjeta cambia todas las .card y se puede deshacer', async ({ page }) => {
  const cards = page.locator('.card');
  await cards.nth(1).click({ position: { x: 6, y: 6 } });
  await expect(ui(page, '.panel')).toContainText('Todos los .card (3)');

  await dragBy(page, ui(page, '.zone[data-prop="padding-top"]'), 0, 8);
  for (let i = 0; i < 3; i++) expect(await style(cards.nth(i), 'padding-top')).toBe('24px');

  await ui(page, 'details summary').click();
  // 24 px es lo que vale --espacio-l en la demo: se usa la variable.
  await expect(ui(page, 'textarea')).toHaveValue(/\.card \{\n  padding-top: var\(--espacio-l\); \/\* antes: 16px \*\/\n\}/);

  await page.keyboard.press('Control+z');
  expect(await style(cards.nth(0), 'padding-top')).toBe('16px');
});

test('el arrastre se pega a los espaciados que ya usa la página', async ({ page }) => {
  const card = page.locator('.card').first();
  await card.click({ position: { x: 6, y: 6 } });
  // 16 + 10 = 26, pero 24 está a menos de 3 px y ya lo usa la página.
  await dragBy(page, ui(page, '.zone[data-prop="padding-left"]'), 10, 0);
  expect(await style(card, 'padding-left')).toBe('24px');
});

test('«Solo este» cambia un único elemento', async ({ page }) => {
  const cards = page.locator('.card');
  await cards.nth(2).click({ position: { x: 6, y: 6 } });
  await ui(page, 'button[data-act="scope-element"]').click();
  // La tercera tarjeta queda bajo el panel: se pasa al otro lado, como haría el usuario.
  await ui(page, 'button[data-act="side"]').click();
  await dragBy(page, ui(page, '.zone[data-prop="margin-top"]'), 0, -20);
  expect(await style(cards.nth(2), 'margin-top')).toBe('20px');
  expect(await style(cards.nth(0), 'margin-top')).toBe('0px');
});

test('modo tamaño: arrastrar el tirador cambia el ancho', async ({ page }) => {
  const btn = page.locator('.btn');
  await btn.click();
  const before = Math.round((await btn.boundingBox())!.width);
  await ui(page, 'button[data-act="mode-size"]').click();
  await dragBy(page, ui(page, '.size.w'), 40, 0);
  expect(Math.round((await btn.boundingBox())!.width)).toBe(before + 40);
});

test('en un elemento en línea, cambiar el ancho añade inline-block', async ({ page }) => {
  const link = page.locator('.card code').first();
  await link.click();
  await expect(ui(page, '.warn')).toContainText('inline-block');
  const before = Math.round((await link.boundingBox())!.width);
  await ui(page, 'button[data-act="mode-size"]').click();
  await dragBy(page, ui(page, '.size.w'), 30, 0);
  expect(await style(link, 'display')).toBe('inline-block');
  expect(Math.round((await link.boundingBox())!.width)).toBe(before + 30);
  await ui(page, 'details summary').click();
  await expect(ui(page, 'textarea')).toHaveValue(/display: inline-block; \/\* antes: inline \*\//);
  await page.keyboard.press('Control+z');
  expect(await style(link, 'display')).toBe('inline');
});

test('escribir un valor en el panel también aplica el cambio', async ({ page }) => {
  const hero = page.locator('.hero');
  await hero.click({ position: { x: 10, y: 10 } });
  const input = ui(page, 'input[data-prop="padding-top"]');
  await input.fill('80');
  await input.press('Enter');
  expect(await style(hero, 'padding-top')).toBe('80px');
});

test('los cambios sobreviven a una recarga', async ({ page }) => {
  const hero = page.locator('.hero');
  await hero.click({ position: { x: 10, y: 10 } });
  await dragBy(page, ui(page, '.zone[data-prop="padding-bottom"]'), 0, -16);
  await page.reload();
  expect(await style(hero, 'padding-bottom')).toBe('64px');
  await expect(ui(page, '.panel')).toContainText('Cambios (1)');
});

test('el modo «Usar página» deja usar el prototipo', async ({ page }) => {
  await ui(page, 'button[data-act="off"]').click();
  await page.locator('.btn').click();
  await expect(ui(page, '.panel')).toContainText('Pulsa «Editar»');
});

test('pestaña Texto: tamaño arrastrando la etiqueta, grosor, alineación y color', async ({ page }) => {
  const h1 = page.locator('.hero h1');
  await h1.click();
  await ui(page, 'button[data-act="mode-text"]').click();

  await dragBy(page, ui(page, '[data-scrub="font-size"]'), 20, 0);
  expect(await style(h1, 'font-size')).toBe('50px');

  await ui(page, 'select[data-prop="font-weight"]').selectOption('400');
  expect(await style(h1, 'font-weight')).toBe('400');

  await ui(page, 'button[data-prop="text-align"][data-value="right"]').click();
  expect(await style(h1, 'text-align')).toBe('right');

  await ui(page, 'input[type="color"][data-prop="color"]').fill('#ff0000');
  expect(await style(h1, 'color')).toBe('rgb(255, 0, 0)');

  await ui(page, 'details summary').click();
  const css = await ui(page, 'textarea').inputValue();
  expect(css).toContain('font-size: 50px; /* antes: 40px */');
  expect(css).toContain('font-weight: 400; /* antes: 700 */');
  expect(css).toContain('text-align: right;');
  expect(css).toContain('color: #ff0000; /* antes: #222222 */');

  await page.keyboard.press('Control+z');
  expect(await style(h1, 'color')).toBe('rgb(34, 34, 34)');
});

test('pestaña Alineación: colocar en fila, centrar y separar', async ({ page }) => {
  const hero = page.locator('.hero');
  await hero.click({ position: { x: 10, y: 10 } });
  await ui(page, 'button[data-act="mode-layout"]').click();
  await ui(page, 'button[data-act="children"][data-value="row"]').click();
  expect(await style(hero, 'display')).toBe('flex');
  expect(await style(hero, 'flex-direction')).toBe('row');

  await ui(page, 'button[data-prop="justify-content"][data-value="center"]').click();
  expect(await style(hero, 'justify-content')).toBe('center');

  const gap = ui(page, 'input[data-prop="gap"]');
  await gap.fill('16');
  await gap.press('Enter');
  expect(await style(hero, 'column-gap')).toBe('16px');
  await gap.blur();

  // Tres pasos: separación, centrado y, de una vez, display y dirección.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await style(hero, 'display')).toBe('block');
});

test('pestaña Alineación en un elemento sin hijos sugiere subir al contenedor', async ({ page }) => {
  await page.locator('.btn').click();
  await ui(page, 'button[data-act="mode-layout"]').click();
  await expect(ui(page, '.panel')).toContainText('«↑ Padre»');
});

test('al pulsar una opción se marca como activa', async ({ page }) => {
  await page.locator('.hero h1').click();
  await ui(page, 'button[data-act="mode-text"]').click();
  await ui(page, 'button[data-prop="text-decoration-line"][data-value="underline"]').click();
  await expect(ui(page, 'button[data-prop="text-decoration-line"].on')).toHaveText('Subrayado');
  await ui(page, 'button[data-prop="text-decoration-line"][data-value="none"]').click();
  await expect(ui(page, 'button[data-prop="text-decoration-line"].on')).toHaveText('Sin subrayar');
});

test('alinear un contenedor que ya es flex mueve a sus hijos y marca la opción', async ({ page }) => {
  await page.locator('.nav').click({ position: { x: 600, y: 5 } });
  await ui(page, 'button[data-act="mode-layout"]').click();
  const logo = page.locator('.logo');
  const x0 = (await logo.boundingBox())!.x;
  await ui(page, 'button[data-prop="justify-content"][data-value="center"]').click();
  expect((await logo.boundingBox())!.x).toBeGreaterThan(x0 + 100);
  await expect(ui(page, 'button[data-prop="justify-content"].on')).toHaveText('Centro');
});

test('avisa cuando no hay espacio libre para alinear', async ({ page }) => {
  await page.locator('.card').first().click({ position: { x: 6, y: 6 } });
  await ui(page, 'button[data-act="mode-layout"]').click();
  await ui(page, 'button[data-act="children"][data-value="column"]').click();
  await expect(ui(page, '.hint')).toHaveText(/^Sin espacio libre en vertical/);
});

test('alinear texto: funciona en un bloque y avisa si el elemento mide lo mismo que su texto', async ({ page }) => {
  const h2 = page.locator('.card h2').first();
  await h2.click();
  await ui(page, 'button[data-act="mode-text"]').click();
  await expect(ui(page, '[data-hint="text-align"]')).toHaveCount(0);
  await ui(page, 'button[data-prop="text-align"][data-value="right"]').click();
  expect(await style(h2, 'text-align')).toBe('right');
  await expect(ui(page, 'button[data-prop="text-align"].on')).toHaveText('Derecha');

  await page.locator('.btn').click();
  await expect(ui(page, '[data-hint="text-align"]')).toBeVisible();
});

test('alinear un botón que mide lo mismo que su texto mueve el botón entero', async ({ page }) => {
  const btn = page.locator('.btn');
  const hero = page.locator('.hero');
  await btn.click();
  await ui(page, 'button[data-act="mode-text"]').click();
  await expect(ui(page, '[data-hint="text-align"]')).toContainText('se moverá el elemento entero');

  await ui(page, 'button[data-prop="text-align"][data-value="right"]').click();
  const h = (await hero.boundingBox())!;
  const pad = parseFloat(await style(hero, 'padding-right'));
  let b = (await btn.boundingBox())!;
  expect(Math.round(b.x + b.width)).toBe(Math.round(h.x + h.width - pad));
  await expect(ui(page, 'button[data-prop="text-align"].on')).toHaveText('Derecha');

  await ui(page, 'button[data-prop="text-align"][data-value="left"]').click();
  b = (await btn.boundingBox())!;
  expect(Math.round(b.x)).toBe(Math.round(h.x + parseFloat(await style(hero, 'padding-left'))));

  // Todo el movimiento es un único paso de deshacer.
  await ui(page, 'button[data-act="undo"]').click();
  b = (await btn.boundingBox())!;
  expect(Math.round(b.x + b.width)).toBe(Math.round(h.x + h.width - pad));
});

test('alinear un elemento dentro de una fila flex lo mueve con márgenes automáticos', async ({ page }) => {
  const logo = page.locator('.logo');
  await logo.click();
  await ui(page, 'button[data-act="mode-text"]').click();
  const x0 = (await logo.boundingBox())!.x;
  await ui(page, 'button[data-prop="text-align"][data-value="center"]').click();
  expect((await logo.boundingBox())!.x).toBeGreaterThan(x0 + 100);
});

test('el panel no cambia de tamaño al cambiar de pestaña ni de elemento', async ({ page }) => {
  const panel = ui(page, '.panel');
  const height = async () => (await panel.boundingBox())!.height;
  const h0 = await height();
  await page.locator('.card').nth(1).click({ position: { x: 6, y: 6 } });
  for (const mode of ['size', 'text', 'layout', 'spacing']) {
    await ui(page, `button[data-act="mode-${mode}"]`).click();
    expect(await height()).toBe(h0);
  }
  await page.locator('.btn').click();
  await ui(page, 'button[data-act="mode-text"]').click();
  expect(await height()).toBe(h0);
  // Sin desplazamiento horizontal ni barra en el panel entero: solo se desplaza la zona de la pestaña.
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
  await expect(ui(page, '.tab')).toHaveCount(1);
});

test('la pestaña Texto cabe sin desplazarse en una pantalla de 800 px de alto', async ({ page }) => {
  await page.locator('.card h2').first().click();
  await ui(page, 'button[data-act="mode-text"]').click();
  expect(await ui(page, '.tab').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
});

test('alinear el texto de una tarjeta no la mueve: su título deja hueco', async ({ page }) => {
  const card = page.locator('.card').first();
  const before = (await card.boundingBox())!;
  await card.click({ position: { x: 6, y: 6 } });
  await ui(page, 'button[data-act="mode-text"]').click();
  await expect(ui(page, '[data-hint="text-align"]')).toHaveCount(0);
  await ui(page, 'button[data-prop="text-align"][data-value="center"]').click();
  expect(await style(card, 'text-align')).toBe('center');
  expect(await card.boundingBox()).toEqual(before);
});

test('«Antes» muestra la página original sin perder los cambios', async ({ page }) => {
  const h1 = page.locator('.hero h1');
  await h1.click();
  await ui(page, 'button[data-act="mode-text"]').click();
  await ui(page, 'button[data-prop="font-style"][data-value="italic"]').click();
  expect(await style(h1, 'font-style')).toBe('italic');

  await ui(page, 'button[data-act="compare"]').click();
  expect(await style(h1, 'font-style')).toBe('normal');
  await expect(ui(page, '.panel')).toBeHidden();
  await expect(ui(page, '.sel')).toBeHidden();
  // Mientras se compara, un clic en la página no selecciona nada.
  await page.locator('.card').first().click({ position: { x: 6, y: 6 } });

  await ui(page, '.compare-pill').click();
  expect(await style(h1, 'font-style')).toBe('italic');
  await expect(ui(page, '.panel')).toBeVisible();
  await expect(ui(page, '.panel')).toContainText('h1');

  await ui(page, 'button[data-act="compare"]').click();
  await page.keyboard.press('Escape');
  expect(await style(h1, 'font-style')).toBe('italic');
  await expect(ui(page, '.compare-pill')).toBeHidden();
});

test('en Móvil se edita la página a 375 px y el cambio va dentro de su @media', async ({ page }) => {
  const cards = page.locator('.card');
  await cards.nth(1).click({ position: { x: 6, y: 6 } });
  await ui(page, 'button[data-act="screen"][data-value="mobile"]').click();

  const frame = page.frameLocator('css-workout iframe.frame');
  await expect(frame.locator('.card').first()).toBeVisible();
  // La selección pasa al mismo elemento dentro del marco.
  await expect(ui(page, '.panel')).toContainText('article.card');
  expect(await ui(page, 'iframe.frame').evaluate((f) => (f as HTMLIFrameElement).contentWindow!.innerWidth)).toBe(375);

  await dragBy(page, ui(page, '.zone[data-prop="padding-top"]'), 0, 8);
  expect(await style(frame.locator('.card').nth(1), 'padding-top')).toBe('24px');
  expect(await style(cards.nth(1), 'padding-top')).toBe('16px');
  expect(await page.evaluate(() => window.cssWorkout!.exportCss())).toContain('@media (max-width: 767px) {\n  .card {\n    padding-top: var(--espacio-l);');
  await expect(ui(page, '.change .badge')).toHaveText('Móvil');

  await ui(page, 'button[data-act="screen"][data-value="desktop"]').click();
  await expect(ui(page, 'iframe.frame')).toHaveCount(0);
  await expect(ui(page, '.panel')).toContainText('article.card');
  // En escritorio el cambio de móvil no se aplica.
  expect(await style(cards.nth(1), 'padding-top')).toBe('16px');
});

test('en Tableta un clic dentro del marco selecciona y el cambio va a su @media', async ({ page }) => {
  await ui(page, 'button[data-act="screen"][data-value="tablet"]').click();
  const frame = page.frameLocator('css-workout iframe.frame');
  await frame.locator('.hero h1').click();
  await expect(ui(page, '.panel')).toContainText('h1');
  await ui(page, 'button[data-act="mode-text"]').click();
  await ui(page, 'button[data-prop="font-style"][data-value="italic"]').click();
  expect(await style(frame.locator('.hero h1'), 'font-style')).toBe('italic');
  expect(await page.evaluate(() => window.cssWorkout!.exportCss())).toContain('@media (max-width: 1023px)');
});

test('reordenar una tarjeta dentro de la cuadrícula con order', async ({ page }) => {
  const cards = page.locator('.card');
  const x = async (i: number) => (await cards.nth(i).boundingBox())!.x;
  const [x0, x1] = [await x(0), await x(1)];
  await cards.nth(2).click({ position: { x: 6, y: 6 } });
  await ui(page, 'button[data-act="mode-layout"]').click();
  await expect(ui(page, '.panel')).toContainText('3.º de 3');

  await ui(page, 'button[data-act="order"][data-value="first"]').click();
  expect(await x(2)).toBe(x0);
  expect(await x(0)).toBe(x1);
  await expect(ui(page, '.panel')).toContainText('1.º de 3');
  // Solo una regla, para este elemento aunque el ámbito sea la clase.
  await expect(ui(page, '.change')).toHaveCount(1);

  await ui(page, 'button[data-act="order"][data-value="next"]').click();
  expect(await x(0)).toBe(x0);
  expect(await x(2)).toBe(x1);
  await expect(ui(page, '.panel')).toContainText('2.º de 3');

  await page.keyboard.press('Control+z');
  expect(await x(2)).toBe(x0);
  await ui(page, 'button[data-act="order"][data-value="reset"]').click();
  await expect(ui(page, '.panel')).toContainText('3.º de 3');
});

test('si el contenedor no está en fila o columna, explica cómo reordenar', async ({ page }) => {
  await page.locator('.hero h1').click();
  await ui(page, 'button[data-act="mode-layout"]').click();
  await expect(ui(page, '.panel')).toContainText('Para cambiar el orden');
});

test('«Hover» edita cómo se ve al pasar el ratón y lo muestra forzado', async ({ page }) => {
  const btn = page.locator('.btn');
  await btn.click();
  await ui(page, 'button[data-act="hover"]').click();
  // Se ve como al pasar el ratón: con la regla :hover del prototipo.
  expect(await style(btn, 'background-color')).toBe('rgb(29, 78, 216)');
  await expect(ui(page, '.panel')).toContainText('.btn:hover');

  await ui(page, 'button[data-act="mode-text"]').click();
  await ui(page, 'button[data-prop="font-style"][data-value="italic"]').click();
  expect(await style(btn, 'font-style')).toBe('italic');
  expect(await page.evaluate(() => window.cssWorkout!.exportCss())).toContain('.btn:hover {\n  font-style: italic;');

  // Fuera del estado hover, el botón vuelve a su aspecto normal y no lleva clases del editor.
  await ui(page, 'button[data-act="hover"]').click();
  expect(await style(btn, 'font-style')).toBe('normal');
  expect(await style(btn, 'background-color')).toBe('rgb(37, 99, 235)');
  expect(await btn.getAttribute('class')).toBe('btn');
  // Con el ratón encima de verdad, se aplica el cambio.
  await ui(page, 'button[data-act="off"]').click();
  await btn.hover();
  expect(await style(btn, 'font-style')).toBe('italic');
});

test('las variables CSS del prototipo se usan al arrastrar y como muestras de color', async ({ page }) => {
  const card = page.locator('.card').first();
  await card.click({ position: { x: 6, y: 6 } });
  await dragBy(page, ui(page, '.zone[data-prop="padding-top"]'), 0, 8);
  expect(await page.evaluate(() => window.cssWorkout!.exportCss())).toContain('padding-top: var(--espacio-l);');

  await ui(page, 'button[data-act="mode-text"]').click();
  await ui(page, 'button.swatch[data-prop="background-color"][data-value="var(--azul)"]').click();
  expect(await style(card, 'background-color')).toBe('rgb(37, 99, 235)');
  expect(await page.evaluate(() => window.cssWorkout!.exportCss())).toContain('background-color: var(--azul);');
  await expect(ui(page, 'button.swatch.on[data-prop="background-color"]')).toHaveAttribute('data-value', 'var(--azul)');
});
