import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { serverDb, sanitizeUserAccountForClient, mapDbMutationResultToHttpError } from './src/server/sqliteDb';
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

function extractCookieToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawKey, ...rawVal] = part.trim().split('=');
    if (rawKey === 'zaychick_access_token' && rawVal.length > 0) {
      return decodeURIComponent(rawVal.join('=')).trim();
    }
  }
  return undefined;
}

/**
 * Извлекает session token из заголовков, HttpOnly cookie или тела запроса.
 * Порядок приоритета: x-session-token header > Authorization: Bearer > Cookie > body.sessionToken
 */
function extractSessionToken(req: Request): string | undefined {
  const fromHeader = req.headers['x-session-token'] as string | undefined;
  if (fromHeader && fromHeader.trim()) return fromHeader.trim();
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const cookieToken = extractCookieToken(req.headers.cookie);
  if (cookieToken) return cookieToken;
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
  const fastApiTarget = new URL(
    process.env.FASTAPI_URL || process.env.VITE_API_TARGET || 'http://127.0.0.1:8000'
  );

  // Прозрачное проксирование /api/* на промышленный контур FastAPI (PostgreSQL 16), если он запущен на 127.0.0.1:8000.
  // Если FastAPI не запущен (например, автономный превью-режим на порту 3000), запросы бесшовно обрабатываются локальным контуром.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (process.env.DISABLE_FASTAPI_PROXY === 'true') {
      next();
      return;
    }
    const proxyReq = http.request(
      {
        hostname: fastApiTarget.hostname,
        port: Number(fastApiTarget.port) || 8000,
        path: req.originalUrl,
        method: req.method,
        headers: {
          ...req.headers,
          host: fastApiTarget.host,
        },
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode || 200);
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (v !== undefined) res.setHeader(k, v);
        }
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', () => {
      // FastAPI на 8000 недоступен — используем встроенный локальный контур
      next();
    });

    if (req.readable && !req.readableEnded) {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  });

  // Глобальный лимит тела запроса: 20 МБ (поддержка восстановления полных JSON-бэкапов)
  app.use(express.json({ limit: '20mb' }));

  // Эндпоинт проверки работоспособности (Health Check для Docker / Kubernetes / мониторинга)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      database: 'sqlite_fallback',
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

  // --- АУТЕНТИФИКАЦИЯ И СЕССИОННАЯ БЕЗОПАСНОСТЬ (Proposal 2 + FastAPI Cookie Compat) ---
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

      const sanitizedUser = result.user
        ? sanitizeUserAccountForClient(result.user)
        : undefined;
      res.setHeader(
        'Set-Cookie',
        `zaychick_access_token=${encodeURIComponent(result.session.token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`
      );
      res.json({
        status: 'ok',
        token: result.session.token,
        session: result.session,
        user: sanitizedUser,
        permissions: sanitizedUser ? getUserRolePermissions(sanitizedUser) : {},
        expires_at: result.session.expiresAt,
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
      const token = extractSessionToken(req);

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

      const state = serverDb.readFullState();
      const matchedUser = state.data.userAccounts.find(
        (u) => u.login.toLowerCase() === session.login.toLowerCase()
      );
      const userObj = matchedUser
        ? sanitizeUserAccountForClient(matchedUser)
        : {
            login: session.login,
            fullName: session.fullName,
            role: session.role,
            department: '',
            sessionNumber: 1,
          };

      res.json({
        status: 'ok',
        session,
        user: userObj,
        permissions: getUserRolePermissions(userObj),
        expires_at: session.expiresAt,
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
      const token = extractSessionToken(req) || req.body?.token;

      if (token) {
        serverDb.logoutUser(token);
      }
      res.setHeader(
        'Set-Cookie',
        'zaychick_access_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
      );
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

  /** Общий обработчик структурированных ошибок RBAC / дубликата / доменной валидации для /joints/save и /sync */
  function handleDbMutationError(
    res: Response,
    result: Parameters<typeof mapDbMutationResultToHttpError>[0]
  ): boolean {
    const mapped = mapDbMutationResultToHttpError(result);
    if (!mapped) return false;
    res.status(mapped.httpStatus).json(mapped.body);
    return true;
  }

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

      if (result.status !== 'ok') {
        handleDbMutationError(res, result);
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

      if (result.status !== 'ok') {
        handleDbMutationError(res, result);
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

  // 6b. REST-совместимые маршруты FastAPI для автономного режима (когда порт 8000 не запущен)
  const paginateArray = <T>(arr: T[], req: Request) => {
    const limit = Math.max(1, Number(req.query.limit) || 500);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    return {
      items: arr.slice(offset, offset + limit),
      total: arr.length,
      limit,
      offset,
    };
  };

  app.get('/api/events/stream', requireReadAuth, (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const state = serverDb.readFullState();
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        type: 'connected',
        globalRevision: state.meta.globalRevision,
      })}\n\n`
    );
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  app.get('/api/facilities', requireReadAuth, (req: Request, res: Response) => {
    const state = serverDb.readFullState();
    const names = Array.from(
      new Set([
        ...Object.keys(state.data.facilityGeoOverrides || {}),
        ...state.data.projectLineList.map((l) => l.objectName).filter(Boolean),
      ])
    );
    const items = names.map((name, idx) => {
      const geo = state.data.facilityGeoOverrides?.[name] || ({} as any);
      return {
        id: `fac-${idx + 1}`,
        name,
        short_name: name,
        region: geo.region || '',
        latitude: geo.latitude ?? 66.53,
        longitude: geo.longitude ?? 66.6,
        weather_station: geo.weatherStation || '',
        rd_codes: [],
        version: 1,
      };
    });
    res.json(paginateArray(items, req));
  });

  app.get('/api/lines', requireReadAuth, (req: Request, res: Response) => {
    const state = serverDb.readFullState();
    res.json(paginateArray(state.data.projectLineList, req));
  });

  app.get('/api/joints', requireReadAuth, (req: Request, res: Response) => {
    const state = serverDb.readFullState();
    res.json(paginateArray(state.data.joints, req));
  });

  app.get('/api/lrv', requireReadAuth, (req: Request, res: Response) => {
    const state = serverDb.readFullState();
    res.json(paginateArray(state.data.lrvCatalog, req));
  });

  app.get('/api/naks/welders', requireReadAuth, (req: Request, res: Response) => {
    const state = serverDb.readFullState();
    res.json(paginateArray(state.data.welders, req));
  });

  app.get('/api/naks/materials', requireReadAuth, (req: Request, res: Response) => {
    const state = serverDb.readFullState();
    res.json(paginateArray(state.data.weldingMaterials, req));
  });

  app.get('/api/naks/inspectors', requireReadAuth, (_req: Request, res: Response) => {
    res.json([]);
  });

  app.get('/api/wps', requireReadAuth, (req: Request, res: Response) => {
    const state = serverDb.readFullState();
    res.json(paginateArray(state.data.techCards, req));
  });

  app.get('/api/templates', requireReadAuth, (_req: Request, res: Response) => {
    const state = serverDb.readFullState();
    res.json(state.data.templates || []);
  });

  app.get('/api/audit-logs', requireReadAuth, (req: Request, res: Response) => {
    const state = serverDb.readFullState();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Number(req.query.page_size) || 150);
    const start = (page - 1) * pageSize;
    res.json({
      items: state.data.auditLogs.slice(start, start + pageSize),
      total: state.data.auditLogs.length,
    });
  });

  app.get('/api/users', requireReadAuth, (_req: Request, res: Response) => {
    const state = serverDb.readFullState();
    res.json(state.data.userAccounts.map(sanitizeUserAccountForClient));
  });

  app.post('/api/imports/restore-backup', requireWriteAuth, (req: Request, res: Response) => {
    const incomingData = req.body?.data || req.body;
    const authenticatedSession = (req as any).authenticatedSession;
    const result = serverDb.syncStateWithOptimisticLock({
      data: incomingData,
      forceOverwrite: true,
      actionLabel: 'Восстановление из JSON-бэкапа',
      sessionToken: extractSessionToken(req),
      user: authenticatedSession,
    });
    if (result.status !== 'ok') {
      handleDbMutationError(res, result);
      return;
    }
    res.json({ status: 'ok' });
  });

  app.post('/api/imports/zero-reset', requireWriteAuth, (req: Request, res: Response) => {
    const authenticatedSession = (req as any).authenticatedSession;
    const state = serverDb.readFullState();
    const result = serverDb.syncStateWithOptimisticLock({
      data: {
        joints: [],
        projectLineList: [],
        lrvCatalog: [],
        welders: [],
        techCards: [],
        weldingMaterials: [],
        auditLogs: [],
        facilityGeoOverrides: {},
        userAccounts: state.data.userAccounts.slice(0, 1),
        templates: state.data.templates,
        activeTemplateId: state.data.activeTemplateId,
      },
      forceOverwrite: true,
      actionLabel: 'Полное обнуление («Чистый лист»)',
      sessionToken: extractSessionToken(req),
      user: authenticatedSession,
    });
    if (result.status !== 'ok') {
      handleDbMutationError(res, result);
      return;
    }
    res.json({ status: 'ok' });
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
