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
  await expect(ui(page, 'textarea')).toHaveValue(/\.card \{\n  padding-top: 24px; \/\* antes: 16px \*\/\n\}/);

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
