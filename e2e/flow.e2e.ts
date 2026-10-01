import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { loadSteps } from '../src/lib/steps';

const steps = loadSteps();
const items = steps.flatMap((step) => step.items.map((item) => ({ key: `${step.id}.${item.id}`, id: item.id })));
const FIRST = items[0]!;

const answer = (page: Page, key: string, value: 'yes' | 'no' | 'unchecked') =>
  page.locator(`input[name="${key}"][value="${value}"]`);
const evidence = (page: Page, id: string) => page.locator(`#evidence-${id}`);
const preview = (page: Page) => page.locator('#report-preview');

async function fillWholeFlow(page: Page) {
  for (const [index, { key, id }] of items.entries()) {
    if (index % 2 === 0) {
      await answer(page, key, 'no').check();
      await evidence(page, id).fill(`лог ${id}: нашли | проблему`);
    } else {
      await answer(page, key, 'yes').check();
    }
  }

  await page.getByLabel('Вероятность прохождения проверки p').fill('0.1');
  await page.locator('#appendix-leadLag-0').fill('deploys ↔ defects');
}

test('empty state gives an honest all-unchecked report and no critical axe violations', async ({ page }) => {
  await page.goto('./');

  await expect(preview(page)).toContainText('p не введено');
  await expect(preview(page)).not.toContainText('Провалено:');
  expect((await preview(page).textContent())!.match(/Не проверено:/g)).toHaveLength(items.length);
  await expect(page.getByRole('status', { name: 'Прогресс' })).toContainText(`0 из ${items.length}`);

  for (const path of ['./', './audit/']) {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
  }
});

test('"no" without evidence is reported as unchecked, not failed', async ({ page }) => {
  await page.goto('./');
  await answer(page, FIRST.key, 'no').check();

  await expect(preview(page)).toContainText('без свидетельства понижен');
  await expect(preview(page)).not.toContainText('Провалено:');
});

test('filled flow: progress, calculator, appendix and a download equal to the preview', async ({ page }) => {
  await page.goto('./');
  await fillWholeFlow(page);

  await expect(page.getByRole('status', { name: 'Прогресс' })).toContainText(`${items.length} из ${items.length}`);
  await expect(page.locator('#calculator-result')).toContainText('1.11');
  await expect(preview(page)).toContainText('экономия 63%');
  await expect(preview(page)).toContainText(`Провалено:`);
  await expect(preview(page)).toContainText('| deploys ↔ defects |');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать .md' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^harness-audit-\d{4}-\d{2}-\d{2}\.md$/);
  expect(await readFile((await download.path())!, 'utf8')).toBe(await preview(page).textContent());
});

test('a shared URL restores the same answers in a fresh browser', async ({ page, browser }) => {
  await page.goto('./');
  await fillWholeFlow(page);
  const sharedUrl = page.url();
  const expectedReport = await preview(page).textContent();
  expect(sharedUrl).toMatch(/#v1\./);

  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto(sharedUrl);

  await expect(answer(fresh, FIRST.key, 'no')).toBeChecked();
  await expect(evidence(fresh, FIRST.id)).toHaveValue(`лог ${FIRST.id}: нашли | проблему`);
  await expect(fresh.getByLabel('Вероятность прохождения проверки p')).toHaveValue('0.1');
  await expect(preview(fresh)).toHaveText(expectedReport!);
});

test('a broken shared URL shows a plain warning and an empty checklist', async ({ page }) => {
  await page.goto('./#v1.%%%');

  await expect(page.getByRole('alert')).toContainText('начните заново');
  await expect(preview(page)).not.toContainText('Провалено:');
});

test('works with storage denied: answers still go to the URL and survive reload', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('denied', 'SecurityError'); } });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');
  await answer(page, FIRST.key, 'yes').check();
  await expect(page).toHaveURL(/#v1\./);
  await page.reload();

  await expect(answer(page, FIRST.key, 'yes')).toBeChecked();
  await expect(page.getByRole('alert')).toBeHidden();
  expect(errors).toEqual([]);
});

test('keyboard only: answer, give evidence and copy the report', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');

  const tabUntil = async (isTarget: () => Promise<boolean>) => {
    for (let presses = 0; presses < 200 && !(await isTarget()); presses += 1) {
      await page.keyboard.press('Tab');
    }
    expect(await isTarget()).toBe(true);
  };

  await tabUntil(() => answer(page, FIRST.key, 'yes').evaluate((el) => el === document.activeElement));
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');

  await page.keyboard.press('ArrowDown');
  await expect(answer(page, FIRST.key, 'no')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(evidence(page, FIRST.id)).toBeFocused();
  await page.keyboard.type('конфиг: tool_choice any');

  const copy = page.getByRole('button', { name: 'Скопировать' });
  await tabUntil(() => copy.evaluate((el) => el === document.activeElement));
  await page.keyboard.press('Enter');

  await expect(page.locator('#copy-status')).toHaveText('Скопировано');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('конфиг: tool_choice any');
  expect(clipboard).toBe(await preview(page).textContent());
});

test('audit page lists the conditions and offers mail without sending anything', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /Аудит на ваших трейсах/ }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Аудит');
  for (const condition of [/трейс/i, /конфиг/i, /2 часа/]) {
    await expect(page.locator('main')).toContainText(condition);
  }
  await expect(page.getByRole('link', { name: /Написать/ })).toHaveAttribute('href', /^mailto:/);
});

test('fits a 375px phone screen without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  for (const path of ['./', './audit/']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
});
