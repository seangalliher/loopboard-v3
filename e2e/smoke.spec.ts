import { expect, test, type Page } from '@playwright/test';

// The project has no Node type definitions; this is all of `Buffer` the tests use.
declare const Buffer: { from(text: string): Uint8Array };

const STORAGE_KEY = 'loopboard:v1';

const card = (page: Page, title: string) => page.locator('[data-card-id]', { hasText: title });
const column = (page: Page, id: 'todo' | 'doing' | 'done') => page.locator(`[data-column-id="${id}"]`);
const storedBoard = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
const boardTitles = (page: Page) =>
  page.locator('[data-column-id]').evaluateAll((columns) =>
    columns.map((c) => [...c.querySelectorAll('.card-title')].map((t) => t.textContent)),
  );

async function chooseDataItem(page: Page, name: 'Import board…' | 'Export board') {
  await page.getByRole('button', { name: 'Import / Export' }).click();
  await page.getByRole('menuitem', { name }).click();
}

async function exportTo(page: Page, path: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), chooseDataItem(page, 'Export board')]);
  expect(download.suggestedFilename()).toBe('loopboard.json');
  await download.saveAs(path);
}

async function importFrom(page: Page, file: string | { name: string; mimeType: string; buffer: Uint8Array }) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), chooseDataItem(page, 'Import board…')]);
  // The type of `buffer` comes from Node's Buffer, which this project does not have types for.
  await chooser.setFiles(file as string);
}

async function deleteCard(page: Page, title: string) {
  await card(page, title).hover(); // the card's menu button shows on hover or focus
  await page.getByRole('button', { name: `Card actions: ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(card(page, title)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(card(page, 'Open Loopboard')).toBeVisible();
});

test('adds a card and moves it to another column with the keyboard; it survives a reload', async ({ page }) => {
  await expect(page.locator('[data-card-id]')).toHaveCount(3); // the sample cards of a fresh browser

  await page.getByRole('button', { name: 'Add card to To do' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Water the plants');
  await page.keyboard.press('Enter');
  await expect(column(page, 'todo').locator('[data-card-id]', { hasText: 'Water the plants' })).toBeVisible();

  // Tab from the column's own button into its cards until the new card has focus, then grab it.
  const added = card(page, 'Water the plants');
  await page.getByRole('button', { name: 'Column actions: To do' }).focus();
  for (let i = 0; i < 6 && !(await added.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(added).toBeFocused();
  await page.keyboard.press('Space');
  await expect(added).toHaveAttribute('data-grabbed', '');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(added).not.toHaveAttribute('data-grabbed', '');
  await expect(column(page, 'doing').locator('[data-card-id]', { hasText: 'Water the plants' })).toBeVisible();

  await page.reload();
  await expect(column(page, 'doing').locator('[data-card-id]', { hasText: 'Water the plants' })).toBeVisible();
  await expect(column(page, 'todo').locator('[data-card-id]', { hasText: 'Water the plants' })).toHaveCount(0);
});

test('the file input is never visible or tabbable', async ({ page }) => {
  const input = page.locator('input[type="file"]');
  await expect(input).toBeHidden();
  await expect(input).toHaveAttribute('tabindex', '-1');
  await page.getByRole('button', { name: 'Import / Export' }).click();
  await expect(page.getByRole('menuitem', { name: 'Import board…' })).toBeVisible();
  await expect(input).toBeHidden();
});

test('export, delete a card, import: the card and the stored board come back', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('loopboard.json');
  const before = await boardTitles(page);
  await exportTo(page, file);

  await deleteCard(page, 'Open Loopboard');
  expect(await boardTitles(page)).not.toEqual(before);

  const messages: string[] = [];
  page.on('dialog', (dialog) => {
    messages.push(dialog.message());
    void dialog.accept();
  });
  await importFrom(page, file);
  await expect(card(page, 'Open Loopboard')).toBeVisible();
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain('replaces the whole board');
  expect(await boardTitles(page)).toEqual(before);
  await page.reload(); // the imported board was saved
  expect(await boardTitles(page)).toEqual(before);
  await expect(card(page, 'Open Loopboard')).toBeVisible();

  // The input was reset, so the same file can be chosen again.
  await deleteCard(page, 'Open Loopboard');
  await importFrom(page, file);
  await expect(card(page, 'Open Loopboard')).toBeVisible();
});

test('cancelling the confirmation leaves the board unchanged', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('loopboard.json');
  await exportTo(page, file);
  await deleteCard(page, 'Open Loopboard');
  const stored = await storedBoard(page);

  let asked = 0;
  page.on('dialog', (dialog) => {
    asked++;
    void dialog.dismiss();
  });
  await importFrom(page, file);
  await expect.poll(() => asked).toBe(1);
  await expect(card(page, 'Open Loopboard')).toHaveCount(0);
  expect(await storedBoard(page)).toBe(stored);
});

test('an invalid file shows the error and leaves the board unchanged', async ({ page }) => {
  const stored = await storedBoard(page);
  let asked = 0;
  page.on('dialog', (dialog) => {
    asked++;
    void dialog.dismiss();
  });

  await importFrom(page, { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
  const banner = page.locator('.status-banner');
  await expect(banner).toContainText('Could not import: The text is not valid JSON');
  await expect(page.locator('[data-card-id]')).toHaveCount(3);
  expect(await storedBoard(page)).toBe(stored);
  expect(asked).toBe(0);

  await banner.getByRole('button', { name: 'Dismiss message' }).click();
  await expect(banner).toHaveCount(0);
});
