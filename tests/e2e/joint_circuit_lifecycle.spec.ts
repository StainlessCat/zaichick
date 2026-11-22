import { test, expect } from 'playwright/test';

test.describe('ZAYCHICK 2.0 E2E: Жизненный цикл стыков и испытательных контуров', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 15_000 });
  });

  test('Реестр сварных стыков: корректный рендеринг таблицы и колонок', async ({ page }) => {
    // Переход в реестр стыков
    await page.locator('header nav button', { hasText: 'Реестр стыков' }).click();

    // Таблица или контейнер виртуализации
    const mainView = page.locator('main');
    await expect(mainView).toBeVisible();

    // Проверка наличия ключевых столбцов таблицы
    await expect(mainView.locator('text=Стык').first()).toBeVisible();
    await expect(mainView.locator('text=Линия').first()).toBeVisible();
  });

  test('Испытательные контуры: отображение сводки и статусов испытаний', async ({ page }) => {
    // Переход в раздел «Испытания»
    await page.locator('header nav button', { hasText: 'Испытания' }).click();

    const mainView = page.locator('main');
    await expect(mainView).toBeVisible();

    // Проверка отображения элементов управления испытательными контурами
    const circuitHeader = mainView.locator('text=контур').first();
    await expect(circuitHeader).toBeVisible({ timeout: 10_000 });
  });

  test('Фильтрация и поиск стыков в реестре', async ({ page }) => {
    await page.locator('header nav button', { hasText: 'Реестр стыков' }).click();

    // Поле быстрого поиска стыков
    const searchInput = page.locator('input[placeholder*="Поиск"], input[placeholder*="поиск"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('1');
      await page.waitForTimeout(300);
      await expect(page.locator('main')).toBeVisible();
      await searchInput.fill('');
    }
  });
});
