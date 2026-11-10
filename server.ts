import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { serverDb, sanitizeUserAccountForClient } from './src/server/sqliteDb';
import { getUserRolePermissions } from './src/utils/rbac';

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();

// Список подключённых клиентов Server-Sent Events (SSE) для мгновенной синхронизации между вкладками и пользователями
const sseClients = new Set<Response>();

function broadcastDbChange(payload: {
  globalRevision: number;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  lastAction: string;
  sourceClientId?: string;
  meta?: any;
}) {
  const meta = payload.meta || {
    globalRevision: payload.globalRevision,
    lastUpdatedAt: payload.lastUpdatedAt,
    lastUpdatedBy: payload.lastUpdatedBy,
    lastAction: payload.lastAction,
  };
  const json = JSON.stringify({
    type: 'db_updated',
    meta,
    globalRevision: payload.globalRevision,
    sourceClientId: payload.sourceClientId,
  });
  // Отправляем явный event header (event: db_updated) для addEventListener('db_updated') (Замечание аудита №3)
  const msg = `event: db_updated\ndata: ${json}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

/**
 * Извлекает session token из заголовков или тела запроса.
 * Порядок приоритета: x-session-token header > Authorization: Bearer > body.sessionToken
 */
function extractSessionToken(req: Request): string | undefined {
  const fromHeader = req.headers['x-session-token'] as string | undefined;
  if (fromHeader && fromHeader.trim()) return fromHeader.trim();
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const queryToken = req.query?.token || req.query?.sessionToken;
  if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();
  return req.body?.sessionToken as string | undefined;
}

/**
 * Middleware: проверяет session token для операций ЧТЕНИЯ (GET /api/db/state, SSE).
 */
function requireReadAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);

  if (!token) {
    if (REQUIRE_AUTH_FOR_WRITES) {
      res.status(401).json({
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Требуется аутентификация: токен сессии не передан',
      });
      return;
    }
    next();
    return;
  }

  const session = serverDb.validateSessionToken(token);
  if (!session) {
    res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Токен сессии недействителен или истёк',
    });
    return;
  }

  (req as any).authenticatedSession = session;
  next();
}

/**
 * Middleware: проверяет session token для операций ЗАПИСИ (POST/PATCH/PUT/DELETE).
 *
 * Логика:
 * - Если token предоставлен и ВАЛИДЕН → пропускаем
 * - Если token предоставлен и НЕВАЛИДЕН (истёк / подделан) → 401
 * - Если token НЕ предоставлен → пропускаем (backward-compat: анонимный гость)
 *
 * Это защищает от подделки чужих токенов при сохранении от имени другого пользователя.
 * Полный запрет анонимного доступа реализуется переключением флага REQUIRE_AUTH_FOR_WRITES.
 */
const REQUIRE_AUTH_FOR_WRITES =
  process.env.ZAYCHICK_REQUIRE_AUTH !== 'false';

function requireWriteAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);

  if (!token) {
    if (REQUIRE_AUTH_FOR_WRITES) {
      res.status(401).json({
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Требуется аутентификация: токен сессии не передан',
      });
      return;
    }
    // Анонимный режим: только если явно разрешён ZAYCHICK_REQUIRE_AUTH=false
    next();
    return;
  }

  // Токен передан — валидируем обязательно
  const session = serverDb.validateSessionToken(token);
  if (!session) {
    res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Токен сессии недействителен или истёк',
    });
    return;
  }

  (req as any).authenticatedSession = session;
  next();
}

async function startServer() {
  const app = express();

  // Глобальный лимит тела запроса: 5 МБ для большинства роутов
  app.use(express.json({ limit: '5mb' }));

  // Эндпоинт проверки работоспособности (Health Check для Docker / Kubernetes / мониторинга)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      engine: serverDb.getEngineMetadata().engineName,
    });
  });

  // Легковесный Rate Limiter для защиты эндпоинта логина (не более 10 попыток в минуту с IP)
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  const checkLoginRateLimit = (ip: string): boolean => {
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (!record || now > record.resetAt) {
      loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (record.count >= 10) {
      return false;
    }
    record.count += 1;
    return true;
  };

  // --- АУТЕНТИФИКАЦИЯ И СЕССИОННАЯ БЕЗОПАСНОСТЬ (Proposal 2) ---
  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const clientIp = (req.ip || req.socket.remoteAddress || 'unknown') as string;
      if (!checkLoginRateLimit(clientIp)) {
        res.status(429).json({
          status: 'error',
          code: 'TOO_MANY_REQUESTS',
          message: 'Слишком много попыток входа. Пожалуйста, подождите 1 минуту.',
        });
        return;
      }

      const { login, password } = req.body || {};
      if (!login || !password) {
        res.status(400).json({
          status: 'error',
          message: 'Не указан логин или пароль',
        });
        return;
      }

      const result = serverDb.authenticateUser(login, password);
      if (!result.success || !result.session) {
        res.status(401).json({
          status: 'error',
          message: result.error || 'Неверный логин или пароль',
        });
        return;
      }

      res.json({
        status: 'ok',
        token: result.session.token,
        session: result.session,
        user: result.user ? sanitizeUserAccountForClient(result.user) : undefined,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err?.message || 'Ошибка аутентификации',
      });
    }
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token =
        (req.headers['x-session-token'] as string) ||
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

      if (!token) {
        res.status(401).json({
          status: 'error',
          message: 'Токен сессии не предоставлен',
        });
        return;
      }

      const session = serverDb.validateSessionToken(token);
      if (!session) {
        res.status(401).json({
          status: 'error',
          message: 'Сессия недействительна или истекла',
        });
        return;
      }

      res.json({
        status: 'ok',
        session,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err?.message || 'Ошибка проверки сессии',
      });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token =
        (req.headers['x-session-token'] as string) ||
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.token);

      if (token) {
        serverDb.logoutUser(token);
      }
      res.json({ status: 'ok', message: 'Сессия завершена' });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err?.message || 'Ошибка выхода из системы',
      });
    }
  });

  // 1. Получение актуального состояния единой серверной СУБД SQLite
  app.get('/api/db/state', requireReadAuth, (req: Request, res: Response) => {
    try {
      const sinceRev = req.query.sinceRevision
        ? Number(req.query.sinceRevision)
        : undefined;
      const sessionId = String(req.query.sessionId || '');
      const login = String(req.query.login || '');
      const fullName = String(req.query.fullName || '');
      const role = String(req.query.role || '');

      if (sessionId && login) {
        serverDb.recordSessionHeartbeat({ sessionId, login, fullName, role });
      }

      const state = serverDb.readFullState();

      if (
        sinceRev !== undefined &&
        !Number.isNaN(sinceRev) &&
        sinceRev === state.meta.globalRevision
      ) {
        res.json({
          status: 'not_modified',
          meta: state.meta,
        });
        return;
      }

      res.json({
        status: 'ok',
        meta: state.meta,
        data: state.data,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err?.message || 'Ошибка чтения серверной БД SQLite',
      });
    }
  });

  // 2. Поток реального времени Server-Sent Events (SSE)
  app.get('/api/db/events', requireReadAuth, (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const state = serverDb.readFullState();
    const json = JSON.stringify({
      type: 'connected',
      meta: state.meta,
      globalRevision: state.meta.globalRevision,
    });
    res.write(`event: connected\ndata: ${json}\n\n`);

    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // 3. Сохранение паспорта сварного стыка с проверкой ОПТИМИСТИЧЕСКОЙ БЛОКИРОВКИ (OCC HTTP 409 Conflict)
  app.post('/api/db/joints/save', requireWriteAuth, (req: Request, res: Response) => {
    try {
      const {
        joint,
        baseJoint,
        expectedVersion,
        forceOverwrite,
        user,
        clientId,
      } = req.body || {};

      if (!joint || !joint.id) {
        res.status(400).json({
          status: 'error',
          message: 'Не передан объект сварного стыка',
        });
        return;
      }

      const authHeader = req.headers.authorization;
      const sessionToken =
        (req.headers['x-session-token'] as string) ||
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.sessionToken);

      const authenticatedSession = (req as any).authenticatedSession;
      const callerUser = authenticatedSession
        ? {
            login: authenticatedSession.login,
            fullName: authenticatedSession.fullName,
            role: authenticatedSession.role,
            isAdmin: Boolean(authenticatedSession.isAdmin),
          }
        : user;

      // Строго исключаем доверие к клиентскому req.body.user для административных полномочий
      const isAdmin = Boolean(authenticatedSession?.isAdmin);
      const effectiveForceOverwrite = Boolean(forceOverwrite) && isAdmin;

      const result = serverDb.saveJointWithOptimisticLock({
        joint,
        baseJoint,
        expectedVersion:
          typeof expectedVersion === 'number' ? expectedVersion : undefined,
        forceOverwrite: effectiveForceOverwrite,
        sessionToken,
        user: callerUser,
      });

      if (result.status === 'conflict') {
        // HTTP 409 Conflict — классический ответ СУБД при срабатывании оптимистической блокировки
        res.status(409).json({
          status: 'conflict',
          conflict: result.conflict,
          meta: result.meta,
        });
        return;
      }

      if (result.status === 'forbidden') {
        res.status(403).json({
          status: 'error',
          code: 'FORBIDDEN',
          message: result.error,
          meta: result.meta,
        });
        return;
      }

      if (result.status === 'duplicate') {
        res.status(409).json({
          status: 'error',
          code: 'DUPLICATE_JOINT_NUMBER',
          message: result.error,
          meta: result.meta,
        });
        return;
      }

      if (result.status === 'validation_error') {
        res.status(422).json({
          status: 'error',
          code: 'DOMAIN_VALIDATION_FAILED',
          message: result.error,
          errors: result.errors,
          meta: result.meta,
        });
        return;
      }

      broadcastDbChange({
        globalRevision: result.meta.globalRevision,
        lastUpdatedAt: result.meta.lastUpdatedAt,
        lastUpdatedBy: result.meta.lastUpdatedBy,
        lastAction: result.meta.lastAction,
        sourceClientId: clientId,
      });

      res.json({
        status: 'ok',
        savedJoint: result.savedJoint,
        meta: result.meta,
        data: result.data,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err?.message || 'Ошибка сохранения стыка в СУБД SQLite',
      });
    }
  });

  // 4. Транзакционная синхронизация таблиц с серверной СУБД SQLite
  app.post('/api/db/sync', requireWriteAuth, (req: Request, res: Response) => {
    try {
      const {
        data,
        expectedGlobalRevision,
        forceOverwrite,
        actionLabel,
        user,
        clientId,
      } = req.body || {};

      // Поддержка как вложенного data, так и коллекций на верхнем уровне (обратная совместимость)
      const incomingData =
        data ||
        (req.body &&
        (req.body.joints ||
          req.body.projectLineList ||
          req.body.lrvCatalog ||
          req.body.welders)
          ? {
              joints: req.body.joints,
              projectLineList: req.body.projectLineList,
              lrvCatalog: req.body.lrvCatalog,
              welders: req.body.welders,
              techCards: req.body.techCards,
              weldingMaterials: req.body.weldingMaterials,
              userAccounts: req.body.userAccounts,
              auditLogs: req.body.auditLogs,
              facilityGeoOverrides: req.body.facilityGeoOverrides,
              templates: req.body.templates,
              activeTemplateId: req.body.activeTemplateId,
            }
          : null);

      if (!incomingData || typeof incomingData !== 'object') {
        res.status(400).json({
          status: 'error',
          message: 'Некорректный пакет данных для синхронизации',
        });
        return;
      }

      const authHeader = req.headers.authorization;
      const sessionToken =
        (req.headers['x-session-token'] as string) ||
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.sessionToken);

      const authenticatedSession = (req as any).authenticatedSession;
      const callerUser = authenticatedSession
        ? {
            login: authenticatedSession.login,
            fullName: authenticatedSession.fullName,
            role: authenticatedSession.role,
            isAdmin: Boolean(authenticatedSession.isAdmin),
          }
        : user;

      // Строго исключаем доверие к клиентскому req.body.user для административных полномочий
      const isAdmin = Boolean(authenticatedSession?.isAdmin);
      const effectiveForceOverwrite = Boolean(forceOverwrite) && isAdmin;

      const result = serverDb.syncStateWithOptimisticLock({
        data: incomingData,
        expectedGlobalRevision,
        forceOverwrite: effectiveForceOverwrite,
        actionLabel: actionLabel || 'Синхронизация данных',
        sessionToken,
        user: callerUser,
      });

      if (result.status === 'conflict') {
        res.status(409).json(result);
        return;
      }

      broadcastDbChange({
        globalRevision: result.meta.globalRevision,
        lastUpdatedAt: result.meta.lastUpdatedAt,
        lastUpdatedBy: result.meta.lastUpdatedBy,
        lastAction: result.meta.lastAction,
        sourceClientId: clientId,
      });

      res.json({
        status: 'ok',
        meta: result.meta,
        data: result.data,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err?.message || 'Ошибка синхронизации с СУБД SQLite',
      });
    }
  });

  // 5. Имитация параллельной правки стыка другим пользователем на сервере (для проверки OCC 409 Conflict)
  app.post('/api/db/simulate-conflict', requireWriteAuth, (req: Request, res: Response) => {
    // В production запрещаем доступ к тестовому маршруту симуляции конфликтов
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_ROUTES !== 'true') {
      res.status(403).json({
        status: 'error',
        message: 'Тестовый маршрут симуляции конфликтов отключён в production-режиме',
      });
      return;
    }
    try {
      const { jointId, simulatedBy } = req.body || {};
      const sim = serverDb.simulateParallelServerEdit({
        jointId,
        simulatedBy,
      });

      if (!sim) {
        res.status(404).json({
          status: 'error',
          message: 'Стык для симуляции не найден в БД',
        });
        return;
      }

      broadcastDbChange({
        globalRevision: sim.meta.globalRevision,
        lastUpdatedAt: sim.meta.lastUpdatedAt,
        lastUpdatedBy: sim.meta.lastUpdatedBy,
        lastAction: sim.meta.lastAction,
        sourceClientId: 'simulated-parallel-session',
      });

      res.json({
        status: 'ok',
        targetJoint: sim.targetJoint,
        previousVersion: sim.previousVersion,
        newVersion: sim.newVersion,
        meta: sim.meta,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err?.message || 'Ошибка симуляции параллельной сессии',
      });
    }
  });

  // 6. Административный снимок базы данных SQLite (согласованный VACUUM INTO + WAL checkpoint)
  app.post('/api/admin/backup', requireWriteAuth, (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const sessionToken =
        (req.headers['x-session-token'] as string) ||
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body?.sessionToken);

      const authenticatedSession = (req as any).authenticatedSession;
      const isAdmin =
        Boolean(authenticatedSession?.isAdmin) ||
        getUserRolePermissions(authenticatedSession || {}).category === 'admin';

      if (!isAdmin) {
        res.status(403).json({
          status: 'error',
          message: 'Создание резервных копий доступно исключительно администратору системы',
        });
        return;
      }

      const label = (req.body?.label || 'manual').replace(/[^a-zA-Z0-9_-]/g, '');
      const backupResult = serverDb.createBackup(label);

      if (!backupResult.success) {
        res.status(500).json({
          status: 'error',
          message: backupResult.error || 'Ошибка создания резервной копии базы данных',
        });
        return;
      }

      res.json({
        status: 'ok',
        message: 'Согласованная резервная копия базы данных успешно создана',
        backupPath: backupResult.backupPath,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err?.message || 'Внутренняя ошибка при создании бэкапа',
      });
    }
  });

  // 7. Подключение Vite в режиме разработки или раздача статики в production
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.join(ROOT_DIR, 'dist');
  const prebuiltDir = path.join(ROOT_DIR, 'prebuilt');
  const httpServer = http.createServer(app);

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const staticRoot = fs.existsSync(path.join(distDir, 'index.html'))
      ? distDir
      : prebuiltDir;
    app.use(express.static(staticRoot));
    app.use(express.static(path.join(ROOT_DIR, 'public')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(staticRoot, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[ZAYCHICK Server DBMS] Единая серверная СУБД SQLite (WAL + OCC) запущена: http://localhost:${PORT}`
    );
  });
}

startServer().catch((err) => {
  console.error('[ZAYCHICK Server Error]:', err);
  process.exit(1);
});
