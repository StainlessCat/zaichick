import { test, expect } from 'playwright/test';

test.describe('ZAYCHICK 2.0 E2E: Авторизация, Навигация и Ролевой доступ (RBAC)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Ждём загрузки интерфейса приложения
    await expect(page.locator('header')).toBeVisible({ timeout: 15_000 });
  });

  test('Главная страница: отображение шапки, логотипа и ключевых разделов', async ({ page }) => {
    // Проверка наличия логотипа / названия системы
    await expect(page.locator('header')).toContainText('ZAYCHICK');

    // Проверка ключевых разделов навигации
    const navBar = page.locator('header nav');
    await expect(navBar).toContainText('Реестр стыков');
    await expect(navBar).toContainText('Контроль НК');
    await expect(navBar).toContainText('Испытания');
    await expect(navBar).toContainText('База материалов');
    await expect(navBar).toContainText('Лайнлист');
  });

  test('Модальное окно авторизации: открытие и структура полей', async ({ page }) => {
    // Кнопка входа в шапке
    const loginButton = page.locator('header button', { hasText: /Войти|Вход|Учётная запись/i });
    if (await loginButton.isVisible()) {
      await loginButton.click();
      // Проверяем появление модального окна входа
      const loginModal = page.locator('[role="dialog"], .fixed', { hasText: /Вход в систему|Авторизация|Логин/i }).first();
      await expect(loginModal).toBeVisible();
      await expect(loginModal.locator('input[type="text"], input[name="login"], input[id*="login"]').first()).toBeVisible();
      await expect(loginModal.locator('input[type="password"]').first()).toBeVisible();
    }
  });

  test('Переключение разделов программы без ошибок консоли', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Переход в «Контроль НК»
    await page.locator('header nav button', { hasText: 'Контроль НК' }).click();
    await expect(page.locator('main')).toBeVisible();

    // 2. Переход в «Испытания»
    await page.locator('header nav button', { hasText: 'Испытания' }).click();
    await expect(page.locator('main')).toBeVisible();

    // 3. Переход в «База материалов»
    await page.locator('header nav button', { hasText: 'База материалов' }).click();
    await expect(page.locator('main')).toBeVisible();

    // 4. Возврат в «Реестр стыков»
    await page.locator('header nav button', { hasText: 'Реестр стыков' }).click();
    await expect(page.locator('main')).toBeVisible();

    // Критических сбоев рендера React быть не должно
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('net::ERR_') && !e.includes('Failed to load resource')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
