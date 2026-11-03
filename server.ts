import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { serverDb } from './src/server/sqliteDb';

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
}) {
  const msg = `data: ${JSON.stringify({
    type: 'db_updated',
    ...payload,
  })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  // --- АУТЕНТИФИКАЦИЯ И СЕССИОННАЯ БЕЗОПАСНОСТЬ (Proposal 2) ---
  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
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
        user: result.user,
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
  app.get('/api/db/state', (req: Request, res: Response) => {
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
  app.get('/api/db/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const state = serverDb.readFullState();
    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        globalRevision: state.meta.globalRevision,
      })}\n\n`
    );

    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // 3. Сохранение паспорта сварного стыка с проверкой ОПТИМИСТИЧЕСКОЙ БЛОКИРОВКИ (OCC HTTP 409 Conflict)
  app.post('/api/db/joints/save', (req: Request, res: Response) => {
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

      const result = serverDb.saveJointWithOptimisticLock({
        joint,
        baseJoint,
        expectedVersion:
          typeof expectedVersion === 'number' ? expectedVersion : undefined,
        forceOverwrite: Boolean(forceOverwrite),
        sessionToken,
        user: user || {
          login: 'engineer_pto',
          fullName: 'Инженер ПТО',
          role: 'Инженер ПТО',
        },
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
  app.post('/api/db/sync', (req: Request, res: Response) => {
    try {
      const {
        data,
        expectedGlobalRevision,
        forceOverwrite,
        actionLabel,
        user,
        clientId,
      } = req.body || {};

      if (!data || typeof data !== 'object') {
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

      const result = serverDb.syncStateWithOptimisticLock({
        data,
        expectedGlobalRevision,
        forceOverwrite,
        actionLabel: actionLabel || 'Синхронизация данных',
        sessionToken,
        user: user || {
          login: 'engineer_pto',
          fullName: 'Инженер ПТО',
          role: 'Инженер ПТО',
        },
      });

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
  app.post('/api/db/simulate-conflict', (req: Request, res: Response) => {
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

  // 6. Подключение Vite в режиме разработки или раздача статики в production
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.join(ROOT_DIR, 'dist');
  const prebuiltDir = path.join(ROOT_DIR, 'prebuilt');

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[ZAYCHICK Server DBMS] Единая серверная СУБД SQLite (WAL + OCC) запущена: http://0.0.0.0:${PORT}`
    );
  });
}

startServer().catch((err) => {
  console.error('[ZAYCHICK Server Error]:', err);
  process.exit(1);
});
