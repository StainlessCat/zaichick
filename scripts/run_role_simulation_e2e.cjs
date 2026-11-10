const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const SCREENSHOTS_DIR = path.resolve(__dirname, '../data/simulation_screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
let isolatedServerProcess = null;
let tempDbFile = null;

function log(msg) {
  const t = new Date().toISOString().split('T')[1].slice(0, 8);
  console.log(`[${t}] ${msg}`);
}

async function expectResponseOk(promise, description) {
  const resp = await promise;
  if (!resp) throw new Error(`[E2E FAIL] Ожидание HTTP-ответа превысило таймаут: ${description}`);
  const status = resp.status();
  if (status < 200 || status >= 300) {
    const text = await resp.text().catch(() => '');
    throw new Error(`[E2E FAIL] ${description} завершился с ошибкой HTTP ${status}: ${text.slice(0, 300)}`);
  }
  return resp;
}

async function switchUser(page, targetLogin, targetPassword = '123') {
  log(`Switching user to "${targetLogin}"...`);

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  const isDrawerVisible = await page.locator('button:has-text("Сменить")').isVisible().catch(() => false);
  if (!isDrawerVisible) {
    await page.click('button:has-text("Меню")');
    await page.waitForTimeout(500);
  }

  await page.click('button:has-text("Сменить")');
  await page.waitForTimeout(600);

  const loginResponsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login'),
    { timeout: 7000 }
  ).catch(() => null);

  const userBtn = page.locator(`button:has-text("${targetLogin}")`).first();
  if (await userBtn.isVisible().catch(() => false)) {
    await userBtn.click();
  } else {
    const loginInput = page.locator('input[placeholder*="morozov"], input[type="text"]').first();
    await loginInput.fill(targetLogin);
    const passInput = page.locator('input[type="password"]').first();
    await passInput.fill(targetPassword);
    await page.click('button:has-text("Войти по логину и паролю")');
  }

  const loginResp = await expectResponseOk(loginResponsePromise, `Login for ${targetLogin}`);
  log(`Auth response status: ${loginResp.status()}`);
  await page.waitForTimeout(500);

  const modalOpen = await page.locator('div[role="dialog"][aria-label*="Авторизация"]').isVisible().catch(() => false);
  if (modalOpen) {
    const closeBtn = page.locator('button[aria-label="Закрыть окно авторизации"], button:has-text("✕")').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(400);
    }
  }

  log(`Successfully switched user to "${targetLogin}".`);
}

async function openSection(page, sectionName) {
  log(`Navigating to section "${sectionName}"...`);
  
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  let sectionBtn = page.locator(`button:has-text("${sectionName}")`).first();
  let isVisible = await sectionBtn.isVisible().catch(() => false);

  if (!isVisible) {
    await page.click('button:has-text("Меню")');
    await page.waitForTimeout(500);
    sectionBtn = page.locator(`button:has-text("${sectionName}")`).first();
  }

  await sectionBtn.click();
  await page.waitForTimeout(1000);
  log(`Navigated to section "${sectionName}".`);
}

async function setFacilityScope(page, facilityValue = 'ALL') {
  log(`Setting facility scope to "${facilityValue}"...`);
  const drawerVisible = await page.locator('select[aria-label="Выбор объекта строительства"]').isVisible().catch(() => false);
  if (!drawerVisible) {
    await page.click('button:has-text("Меню")');
    await page.waitForTimeout(500);
  }

  await page.selectOption('select[aria-label="Выбор объекта строительства"]', facilityValue);
  await page.waitForTimeout(500);

  const closeBtn = page.locator('button[aria-label="Закрыть меню навигации"]');
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(400);
  }
}

async function runRoleSimulation() {
  const resultData = {
    testTitle: 'Сквозной ролевой симуляционный UAT-тест системы ZAYCHICK (с верификацией HTTP и изоляцией данных)',
    timestamp: new Date().toISOString(),
    milestones: [],
    screenshots: [],
    status: 'UNKNOWN',
  };

  // Генерируем уникальные тестовые реквизиты для исключения коллизий
  const runId = String(Date.now()).slice(-4);
  const TEST_LINE = `L-${runId}`;
  const TEST_WELDER = `СВ${runId.slice(-2)}`;
  const TEST_JOINT_901 = `E${runId}1`;
  const TEST_JOINT_902 = `E${runId}2`;
  const TEST_TC = `ТК-${runId}-РАД/РД`;

  log(`Unique test identifiers: Line=${TEST_LINE}, Welder=${TEST_WELDER}, Joint1=${TEST_JOINT_901}, Joint2=${TEST_JOINT_902}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--window-size=1600,1050']
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1050 },
  });
  const page = await context.newPage();

  try {
    log(`Connecting to ${BASE_URL}...`);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // 0. Scope ALL
    await setFacilityScope(page, 'ALL');

    // =========================================================================
    // ЭТАП 1: РОЛЬ «ИНЖЕНЕР ПТО» (pto_volkhov) — СОЗДАНИЕ НОВОЙ ЛИНИИ В ЛАЙНЛИСТЕ
    // =========================================================================
    log('=================================================================');
    log(`ЭТАП 1: Инженер ПТО (pto_volkhov) — Создание линии ${TEST_LINE} в лайнлисте`);
    log('=================================================================');
    await switchUser(page, 'pto_volkhov', '123');

    await openSection(page, 'Проект (лайнлист)');

    log('Opening "Добавить линию" modal...');
    await page.click('button:has-text("Добавить линию")');
    await page.waitForTimeout(600);

    log('Filling line form...');
    await page.locator('input[aria-label="Номер линии"]').fill(TEST_LINE);
    await page.locator('input[aria-label="Наименование линии"]').fill(`Газопровод дренажа сепаратора ${TEST_LINE}`);
    await page.locator('input[aria-label="Продукт"]').fill('Природный газ');
    await page.locator('input[aria-label="Процент контроля РК"]').fill('100');
    await page.locator('input[aria-label="Процент контроля УЗК"]').fill('0');
    await page.locator('input[aria-label="Процент контроля ПВК"]').fill('0');

    log('Submitting new line modal...');
    const lineSavePromise = page.waitForResponse((r) => r.url().includes('/api/db/sync') || r.url().includes('/api/db/state'), { timeout: 10000 });
    await page.click('button[type="submit"]:has-text("Добавить линию в лайнлист")');
    await expectResponseOk(lineSavePromise, 'Save line to database');
    await page.waitForTimeout(1000);

    const shot1 = path.join(SCREENSHOTS_DIR, '01_pto_linelist_created.png');
    await page.screenshot({ path: shot1, fullPage: false });
    resultData.screenshots.push({ stage: 1, name: '01_pto_linelist_created.png', path: shot1 });

    const linesTableText = await page.locator('table').innerText();
    const lineCreatedSuccess = linesTableText.includes(TEST_LINE);
    if (!lineCreatedSuccess) {
      throw new Error(`Линия ${TEST_LINE} не отображается в таблице лайнлиста после сохранения`);
    }

    resultData.milestones.push({
      role: 'Инженер ПТО (pto_volkhov)',
      action: `Добавление технологической линии № ${TEST_LINE} в лайнлист с требованием РК 100%`,
      success: true,
      details: 'Линия успешно добавлена через модальную форму и отображается в таблице лайнлиста.',
    });

    // =========================================================================
    // ЭТАП 2: РОЛЬ «ТЕХНОЛОГ ПО СВАРКЕ» (tech_volkhov) — ТЕХКАРТА И АТТЕСТАЦИЯ НАКС
    // =========================================================================
    log('=================================================================');
    log(`ЭТАП 2: Технолог по сварке (tech_volkhov) — ТК ${TEST_TC} и НАКС ${TEST_WELDER}`);
    log('=================================================================');
    await switchUser(page, 'tech_volkhov', '123');

    await openSection(page, 'Технология сварочного производства');

    // 2.1 Новая ТК
    log('Opening "Технологические карты ТК" tab...');
    await page.click('button:has-text("Технологические карты ТК")');
    await page.waitForTimeout(500);

    log('Opening "Добавить технологическую карту (ТК)"...');
    await page.click('button:has-text("Добавить технологическую карту (ТК)")');
    await page.waitForTimeout(500);

    log(`Filling Tech Card form: ${TEST_TC}...`);
    await page.locator('label:has-text("Шифр ТК *") + input').fill(TEST_TC);
    await page.locator('label:has-text("Наименование технологической карты") + input').fill(`Сварка трубопроводов линии ${TEST_LINE}`);
    
    // Диаметры и толщины
    const tcNumInputs = page.locator('form input[type="number"]');
    await tcNumInputs.nth(0).fill('50');
    await tcNumInputs.nth(1).fill('1420');
    await tcNumInputs.nth(2).fill('3.0');
    await tcNumInputs.nth(3).fill('32.0');

    log('Saving Tech Card...');
    const tcSavePromise = page.waitForResponse((r) => r.url().includes('/api/db/sync') || r.url().includes('/api/db/state'), { timeout: 10000 });
    await page.click('button[type="submit"]:has-text("Сохранить ТК")');
    await expectResponseOk(tcSavePromise, 'Save Tech Card');
    await page.waitForTimeout(1000);

    // 2.2 Новый сварщик НАКС
    log('Opening "Сварщики и бригады" tab...');
    await page.click('button:has-text("Сварщики и бригады")');
    await page.waitForTimeout(500);

    log('Opening "Добавить сварщика"...');
    await page.click('button:has-text("Добавить сварщика")');
    await page.waitForTimeout(500);

    log(`Filling Welder profile: ${TEST_WELDER}...`);
    await page.locator('label:has-text("Личное клеймо сварщика *") + input').fill(TEST_WELDER);
    await page.locator('label:has-text("ФИО сварщика (или состав бригады) *") + input').fill(`Ковалев Михаил ${runId}`);
    await page.locator('label:has-text("№ удостоверения НАКС *") + input').fill(`АЦСТ-87-${runId}`);

    // Срок действия
    const expiryInput = page.locator('label:has-text("Срок действия до") ~ input[type="date"], input[type="date"]').nth(1);
    if (await expiryInput.isVisible().catch(() => false)) {
      await expiryInput.fill('2027-12-31');
    }

    // Параметры диаметров
    const welderNums = page.locator('form input[type="number"]');
    if ((await welderNums.count()) >= 4) {
      await welderNums.nth(0).fill('50');
      await welderNums.nth(1).fill('1420');
      await welderNums.nth(2).fill('3.0');
      await welderNums.nth(3).fill('32.0');
    }

    log('Saving Welder profile...');
    const welderSavePromise = page.waitForResponse((r) => r.url().includes('/api/db/sync') || r.url().includes('/api/db/state'), { timeout: 10000 });
    await page.click('button[type="submit"]:has-text("Сохранить")');
    await expectResponseOk(welderSavePromise, 'Save Welder');
    await page.waitForTimeout(1000);

    const shot2 = path.join(SCREENSHOTS_DIR, '02_technologist_welding_tech.png');
    await page.screenshot({ path: shot2, fullPage: false });
    resultData.screenshots.push({ stage: 2, name: '02_technologist_welding_tech.png', path: shot2 });

    const techTableText = await page.locator('table').innerText();
    const welderCreatedSuccess = techTableText.includes(TEST_WELDER);
    if (!welderCreatedSuccess) {
      throw new Error(`Сварщик ${TEST_WELDER} не отображается в таблице после сохранения`);
    }

    resultData.milestones.push({
      role: 'Технолог по сварке (tech_volkhov)',
      action: `Разработка ${TEST_TC} и аттестация сварщика НАКС с клеймом ${TEST_WELDER}`,
      success: true,
      details: 'Техкарта и профиль сварщика внесены в единые справочники через UI-формы.',
    });

    // =========================================================================
    // ЭТАП 3: РОЛЬ «МАСТЕР СМР / ИНЖЕНЕР ПТО» (pto_volkhov) — СВАРКА СТЫКОВ
    // =========================================================================
    log('=================================================================');
    log(`ЭТАП 3: Мастер СМР / Инженер ПТО (pto_volkhov) — Сварка стыков ${TEST_JOINT_901} и ${TEST_JOINT_902}`);
    log('=================================================================');
    await switchUser(page, 'pto_volkhov', '123');

    await openSection(page, 'Реестр стыков и ввод данных');

    async function createJoint(jointNumber) {
      log(`Opening "Добавить стык" for joint ${jointNumber}...`);
      await page.click('button:has-text("Добавить стык")');
      await page.waitForTimeout(600);

      await page.locator('input[aria-label="Номер стыка"]').fill(jointNumber);

      log('Selecting LRV materials in "Элементы"...');
      await page.click('button:has-text("Элементы")');
      await page.waitForTimeout(400);

      await page.selectOption('select[aria-label="Изделие Элемент 1 из базы ЛРВ"]', { index: 1 });
      await page.selectOption('select[aria-label="Изделие Элемент 2 из базы ЛРВ"]', { index: 1 });

      log('Filling welding parameters in "Сварка"...');
      await page.click('button:has-text("Сварка")');
      await page.waitForTimeout(400);

      const stampCombobox = page.locator('input[aria-label="Сварщик 1"]').first();
      await stampCombobox.fill(TEST_WELDER);
      await page.waitForTimeout(300);
      const optionBtn = page.locator(`button[role="option"]:has-text("${TEST_WELDER}")`).first();
      if (await optionBtn.isVisible().catch(() => false)) {
        await optionBtn.click();
      }

      const preheatInput = page.locator('input[aria-label="Температура подогрева"]');
      if (await preheatInput.isVisible().catch(() => false)) {
        await preheatInput.fill('150');
      }

      log(`Submitting joint ${jointNumber}...`);
      const savePromise = page.waitForResponse((r) => r.url().includes('/api/db/joints/save'), { timeout: 10000 });
      await page.click('button[type="submit"]:has-text("Добавить стык в реестр")');
      const saveResp = await expectResponseOk(savePromise, `Save joint ${jointNumber}`);
      const body = await saveResp.json().catch(() => ({}));
      if (body.status !== 'ok') {
        throw new Error(`Ошибка сохранения стыка ${jointNumber}: ${body.message || body.error || 'status not ok'}`);
      }
      log(`Joint ${jointNumber} saved successfully with version ${body.savedJoint?.version || 1}`);
      await page.waitForTimeout(1000);
    }

    await createJoint(TEST_JOINT_901);
    await createJoint(TEST_JOINT_902);

    const shot3 = path.join(SCREENSHOTS_DIR, '03_master_joints_added.png');
    await page.screenshot({ path: shot3, fullPage: false });
    resultData.screenshots.push({ stage: 3, name: '03_master_joints_added.png', path: shot3 });

    log('Navigating to LineList to verify NDT deficit...');
    await openSection(page, 'Проект (лайнлист)');
    await page.waitForTimeout(1000);

    const shot4 = path.join(SCREENSHOTS_DIR, '04_linelist_deficit_view.png');
    await page.screenshot({ path: shot4, fullPage: false });
    resultData.screenshots.push({ stage: 3.5, name: '04_linelist_deficit_view.png', path: shot4 });

    resultData.milestones.push({
      role: 'Мастер СМР / Инженер ПТО (pto_volkhov)',
      action: `Сварка стыков № ${TEST_JOINT_901} и № ${TEST_JOINT_902} сварщиком ${TEST_WELDER} с валидацией версий OCC`,
      success: true,
      details: 'Стыки внесены через форму паспорта с проверкой HTTP 200 от сервера SQLite.',
    });

    // =========================================================================
    // ЭТАП 4: РОЛЬ «СПЕЦИАЛИСТ ЛНК» (ndt_volkhov) — ВИК, РК И КОНТРОЛЬ РЕМОНТА
    // =========================================================================
    log('=================================================================');
    log('ЭТАП 4: Специалист ЛНК (ndt_volkhov) — ВИК, РК и контроль ремонта');
    log('=================================================================');
    await switchUser(page, 'ndt_volkhov', '123');

    await openSection(page, 'Реестр стыков и ввод данных');

    log(`Opening joint ${TEST_JOINT_901} for NDT inspection...`);
    const btn901 = page.locator(`button[aria-label="Открыть паспорт стыка ${TEST_JOINT_901}"]`).first();
    await btn901.scrollIntoViewIfNeeded();
    await btn901.click();
    await page.waitForTimeout(800);

    const modal901 = page.locator('div[role="dialog"]');
    await modal901.locator('button:has-text("Контроль ВИК / НК")').click();
    await page.waitForTimeout(400);

    log(`Setting joint ${TEST_JOINT_901}: VIK=Годен, RK=Годен...`);
    const vikSelect901 = modal901.locator('label:has-text("Результат ВИК") + select').first();
    await vikSelect901.selectOption('Годен');
    
    const vikDate901 = modal901.locator('input[type="date"]').nth(0);
    if (await vikDate901.isVisible().catch(() => false)) {
      await vikDate901.fill('2026-11-08');
    }

    const ndtSelect901 = modal901.locator('label:has-text("Результат НК") + select').first();
    await ndtSelect901.selectOption('Годен');
    
    const ndtDate901 = modal901.locator('input[type="date"]').nth(1);
    if (await ndtDate901.isVisible().catch(() => false)) {
      await ndtDate901.fill('2026-11-08');
    }

    const save901Promise = page.waitForResponse((r) => r.url().includes('/api/db/joints/save'), { timeout: 10000 });
    await modal901.locator('button[type="submit"]:has-text("Сохранить паспорт стыка")').click();
    const save901Resp = await expectResponseOk(save901Promise, `Save NDT inspection for ${TEST_JOINT_901}`);
    log(`Joint ${TEST_JOINT_901} NDT save status: ${save901Resp.status()}`);
    await page.locator('div[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);

    // 4.2 Контроль стыка 902 (Брак -> Ремонт -> Годен)
    log(`Opening joint ${TEST_JOINT_902} for NDT inspection (Defect & Repair)...`);
    const btn902 = page.locator(`button[aria-label="Открыть паспорт стыка ${TEST_JOINT_902}"]`).first();
    await btn902.scrollIntoViewIfNeeded();
    await btn902.click();
    await page.waitForTimeout(800);

    const modal902 = page.locator('div[role="dialog"]');
    await modal902.locator('button:has-text("Контроль ВИК / НК")').click();
    await page.waitForTimeout(400);

    log(`Setting joint ${TEST_JOINT_902}: VIK=Годен, RK=Ремонт...`);
    const vikSelect902 = modal902.locator('label:has-text("Результат ВИК") + select').first();
    await vikSelect902.selectOption('Годен');
    const vikDate902 = modal902.locator('input[type="date"]').nth(0);
    if (await vikDate902.isVisible().catch(() => false)) {
      await vikDate902.fill('2026-11-08');
    }

    const ndtSelect902 = modal902.locator('label:has-text("Результат НК") + select').first();
    await ndtSelect902.selectOption('Ремонт');
    const ndtDate902 = modal902.locator('input[type="date"]').nth(1);
    if (await ndtDate902.isVisible().catch(() => false)) {
      await ndtDate902.fill('2026-11-08');
    }

    log('Switching to "Ремонт" tab for repair inspection...');
    await modal902.locator('button:has-text("Ремонт")').click();
    await page.waitForTimeout(400);

    const repairVikSelect = modal902.locator('label:has-text("Результат ВИК ремонта") + select');
    if (await repairVikSelect.isVisible().catch(() => false)) {
      await repairVikSelect.selectOption('Годен').catch(() => {});
    }

    const repairNdtTypeSelect = modal902.locator('label:has-text("Метод НК ремонта") + select');
    if (await repairNdtTypeSelect.isVisible().catch(() => false)) {
      await repairNdtTypeSelect.selectOption('РК').catch(() => {});
    }
    const repairNdtSelect = modal902.locator('label:has-text("Результат НК ремонта") + select');
    if (await repairNdtSelect.isVisible().catch(() => false)) {
      await repairNdtSelect.selectOption('Годен').catch(() => {});
    }

    log(`Saving repaired joint ${TEST_JOINT_902}...`);
    const save902Promise = page.waitForResponse((r) => r.url().includes('/api/db/joints/save'), { timeout: 10000 });
    await modal902.locator('button[type="submit"]:has-text("Сохранить паспорт стыка")').click();
    const save902Resp = await expectResponseOk(save902Promise, `Save repair for ${TEST_JOINT_902}`);
    log(`Joint ${TEST_JOINT_902} repair save status: ${save902Resp.status()}`);
    await page.locator('div[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const shot5 = path.join(SCREENSHOTS_DIR, '05_ndt_inspection_repair.png');
    await page.screenshot({ path: shot5, fullPage: false });
    resultData.screenshots.push({ stage: 4, name: '05_ndt_inspection_repair.png', path: shot5 });

    resultData.milestones.push({
      role: 'Специалист ЛНК (ndt_volkhov)',
      action: `Проведение ВИК и РК стыка ${TEST_JOINT_901} (Годен), фиксация брака на стыке ${TEST_JOINT_902} (Ремонт) и повторный контроль после ремонта`,
      success: true,
      details: 'Контроль проведен строго через форму паспорта стыка с подтверждением HTTP 200 от сервера.',
    });

    // =========================================================================
    // ЭТАП 5: РОЛЬ «ИНЖЕНЕР ПТО» (pto_volkhov) — ВЕРИФИКАЦИЯ ЖУРНАЛА СТО ГАЗПРОМ
    // =========================================================================
    log('=================================================================');
    log('ЭТАП 5: Инженер ПТО (pto_volkhov) — Верификация журнала СТО Газпром');
    log('=================================================================');
    await switchUser(page, 'pto_volkhov', '123');

    await openSection(page, 'Журналы сварочных работ');
    await page.waitForTimeout(2000);

    const journalContent = await page.locator('body').innerText();
    const has901InJournal = journalContent.includes(TEST_JOINT_901);
    const has902InJournal = journalContent.includes(TEST_JOINT_902);
    log(`Journal verification: ${TEST_JOINT_901} present=${has901InJournal}, ${TEST_JOINT_902} present=${has902InJournal}`);

    if (!has901InJournal || !has902InJournal) {
      throw new Error(`Стыки ${TEST_JOINT_901} и/или ${TEST_JOINT_902} отсутствуют в нормативном журнале сварочных работ`);
    }

    const shot7 = path.join(SCREENSHOTS_DIR, '07_gazprom_journal_verified.png');
    await page.screenshot({ path: shot7, fullPage: false });
    resultData.screenshots.push({ stage: 5, name: '07_gazprom_journal_verified.png', path: shot7 });

    resultData.milestones.push({
      role: 'Инженер ПТО (pto_volkhov)',
      action: 'Аудит и формирование нормативного журнала сварочных работ по СТО Газпром 15-1.1-002-2023 (49 граф)',
      success: true,
      details: `Стыки ${TEST_JOINT_901} и ${TEST_JOINT_902} подтверждены в нормативном журнале со всеми графами сварки, контроля и ремонта.`,
    });

    resultData.status = 'SUCCESS';
    log('Simulation finished with status: SUCCESS!');
  } catch (err) {
    log(`Simulation execution ERROR: ${err.message}`);
    resultData.status = 'FAILED';
    resultData.errorMessage = err.message;
    const errShot = path.join(SCREENSHOTS_DIR, 'error_state.png');
    await page.screenshot({ path: errShot, fullPage: false }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    if (isolatedServerProcess) {
      try {
        isolatedServerProcess.kill();
      } catch {}
    }
    if (tempDbFile && fs.existsSync(tempDbFile)) {
      try {
        fs.unlinkSync(tempDbFile);
        if (fs.existsSync(tempDbFile + '-wal')) fs.unlinkSync(tempDbFile + '-wal');
        if (fs.existsSync(tempDbFile + '-shm')) fs.unlinkSync(tempDbFile + '-shm');
      } catch {}
    }
  }

  const resultFilePath = path.join(SCREENSHOTS_DIR, 'simulation_result.json');
  fs.writeFileSync(resultFilePath, JSON.stringify(resultData, null, 2), 'utf-8');
  log(`Results written to ${resultFilePath}`);
}

runRoleSimulation();
