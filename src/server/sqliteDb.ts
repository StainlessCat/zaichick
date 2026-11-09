import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { normalizeTechCard, normalizeWelderProfile } from '../utils/entityNormalizers';
import {
  AuditLogEntry,
  ColumnTemplate,
  LRVItem,
  OptimisticLockConflictPayload,
  ProjectLineItem,
  ServerDbMetadata,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_COLUMN_TEMPLATES,
  INITIAL_JOINTS,
  INITIAL_LRV_CATALOG,
  INITIAL_PROJECT_LINELIST,
  INITIAL_TECH_CARDS,
  INITIAL_WELDING_MATERIALS,
  USER_ACCOUNTS,
  WELDERS_DIRECTORY,
} from '../data/seedData';
import {
  applyOptimisticJointSave,
  COMPARABLE_JOINT_FIELDS,
  computeJointOptimisticConflict,
} from '../utils/optimisticLocking';
import {
  enforceFieldLevelRbacOnJointSave,
  getUserRolePermissions,
} from '../utils/rbac';
import { ALL_COLUMNS } from '../utils/weldingLogic';
import {
  AuthenticatedSession,
  createAuthenticatedSession,
  hashPasswordWithSalt,
  isSessionActive,
  verifyPassword,
} from './serverAuth';

export function sanitizeUserAccountForClient(acc: UserAccount): UserAccount {
  const { password, passwordHash, passwordSalt, ...safe } = acc;
  return safe as UserAccount;
}

const require = createRequire(import.meta.url);

export interface UnifiedDbDataPayload {
  joints: WeldJoint[];
  projectLineList: ProjectLineItem[];
  lrvCatalog: LRVItem[];
  welders: WelderProfile[];
  techCards: TechCardItem[];
  weldingMaterials: WeldingMaterialCertificate[];
  userAccounts: UserAccount[];
  auditLogs: AuditLogEntry[];
  facilityGeoOverrides: Record<
    string,
    {
      region: string;
      weatherStation: string;
      weatherStationId?: string;
      weatherStationDistanceKm?: number;
      weatherStationSource?: string;
      weatherLastCheckStatus?: string;
      weatherLastCheckedAt?: string;
      weatherLastErrorMessage?: string;
      latitude: number;
      longitude: number;
      weatherArchive?: Record<string, string>;
      weatherObservations?: Record<string, any>;
    }
  >;
  templates: ColumnTemplate[];
  activeTemplateId: string;
}

interface SqliteMetaRecord {
  globalRevision: number;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  lastAction: string;
  templates: ColumnTemplate[];
  activeTemplateId: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SQLITE_DB_PATH = path.join(DATA_DIR, 'zaychick.sqlite');
const JSON_FALLBACK_PATH = path.join(DATA_DIR, 'zaychick-fallback.json');

const FIELD_LABELS_MAP: Record<string, string> = Object.fromEntries(
  COMPARABLE_JOINT_FIELDS.map((c) => [String(c.key), c.label])
);

function buildDefaultSeedData(): UnifiedDbDataPayload {
  return {
    joints: INITIAL_JOINTS.map((j) => ({ ...j, version: j.version ?? 1 })),
    projectLineList: INITIAL_PROJECT_LINELIST.map((l) => ({
      ...l,
      version: l.version ?? 1,
    })),
    lrvCatalog: INITIAL_LRV_CATALOG.map((item) => ({
      ...item,
      version: item.version ?? 1,
    })),
    welders: WELDERS_DIRECTORY.map((w) => ({ ...w })),
    techCards: INITIAL_TECH_CARDS.map((t) => ({ ...t })),
    weldingMaterials: INITIAL_WELDING_MATERIALS.map((m) => ({ ...m })),
    userAccounts: USER_ACCOUNTS.map((u) => ({ ...u })),
    auditLogs: INITIAL_AUDIT_LOGS.map((a) => ({ ...a })),
    facilityGeoOverrides: {},
    templates: INITIAL_COLUMN_TEMPLATES.map((tpl) => ({ ...tpl })),
    activeTemplateId: 'tpl-full-30',
  };
}

export class UnifiedServerDatabase {
  private sqliteDb: any = null;
  private engineName = 'SQLite 3 (Native WAL)';
  private journalMode = 'WAL';
  private activeSessions = new Map<
    string,
    {
      sessionId: string;
      login: string;
      fullName: string;
      role: string;
      lastSeenAt: string;
    }
  >();
  private authSessions = new Map<string, AuthenticatedSession>();

  constructor() {
    this.init();
  }

  private init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    try {
      const nodeSqlite = require('node:sqlite');
      if (nodeSqlite && nodeSqlite.DatabaseSync) {
        this.sqliteDb = new nodeSqlite.DatabaseSync(SQLITE_DB_PATH);
        this.sqliteDb.exec('PRAGMA journal_mode = WAL;');
        this.sqliteDb.exec('PRAGMA synchronous = NORMAL;');
        this.sqliteDb.exec('PRAGMA busy_timeout = 5000;');
        this.createSchema();
        this.ensureSeeded();
        this.restorePersistentSessions();
        this.createStartupBackup();
        return;
      }
    } catch {
      // Fallback if running on older Node without node:sqlite
    }

    this.engineName = 'Transactional File DB (WAL JSON)';
    this.journalMode = 'ATOMIC_RENAME';
    this.ensureSeededFallback();
    this.createStartupBackup();
  }

  /**
   * Создает снимок базы данных SQLite в data/backups/ перед открытием сессии.
   */
  private createStartupBackup(): void {
    try {
      this.createBackup('startup');
    } catch (err) {
      console.warn('[ZAYCHICK] Автоматический бэкап при старте пропущен:', err);
    }
  }

  /**
   * Создает согласованный моментальный снимок базы данных SQLite (VACUUM INTO + WAL checkpoint)
   * в папке data/backups/, выполняя ротацию с сохранением 5 последних архивных копий.
   */
  public createBackup(label = 'manual'): { success: boolean; backupPath?: string; error?: string } {
    try {
      const backupsDir = path.join(DATA_DIR, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      if (this.sqliteDb) {
        const backupPath = path.join(backupsDir, `zaychick-backup-${ts}-${label}.sqlite`);
        let createdSuccessfully = false;

        // 1. Приоритетный путь: транзакционный моментальный снимок через нативный VACUUM INTO
        try {
          this.sqliteDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
          const escapedPath = backupPath.replace(/'/g, "''");
          this.sqliteDb.exec(`VACUUM INTO '${escapedPath}';`);
          createdSuccessfully = true;
        } catch (vacuumErr) {
          console.warn('[ZAYCHICK] VACUUM INTO не удался, попытка синхронного checkpoint + copy:', vacuumErr);
        }

        // 2. Fallback: строгий fail-closed путь с верификацией контрольной точки
        if (!createdSuccessfully) {
          try {
            this.sqliteDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
            if (!fs.existsSync(SQLITE_DB_PATH)) {
              return { success: false, error: 'Файл базы данных SQLite не найден' };
            }
            fs.copyFileSync(SQLITE_DB_PATH, backupPath);
            createdSuccessfully = true;
          } catch (fallbackErr: any) {
            return {
              success: false,
              error: `Сбой создания резервной копии SQLite: ${fallbackErr?.message || fallbackErr}`,
            };
          }
        }

        // 3. Валидация целостности созданного файла (размер и сигнатура SQLite format 3)
        if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size < 100) {
          try {
            if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
          } catch {}
          return { success: false, error: 'Резервная копия повреждена или имеет нулевой размер' };
        }

        try {
          const fd = fs.openSync(backupPath, 'r');
          const headerBuf = Buffer.alloc(16);
          fs.readSync(fd, headerBuf, 0, 16, 0);
          fs.closeSync(fd);
          const magicPrefix = Buffer.from('SQLite format 3\0', 'utf8');
          if (!headerBuf.equals(magicPrefix)) {
            try {
              if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
            } catch {}
            return {
              success: false,
              error: 'Резервная копия повреждена: сигнатура заголовка не соответствует SQLite format 3',
            };
          }
        } catch (hdrErr: any) {
          return {
            success: false,
            error: `Не удалось проверить сигнатуру созданной резервной копии: ${hdrErr?.message || hdrErr}`,
          };
        }

        this.rotateBackups(backupsDir, 5);
        return { success: true, backupPath };
      }

      if (fs.existsSync(JSON_FALLBACK_PATH)) {
        const jsonBackupPath = path.join(backupsDir, `zaychick-backup-${ts}-${label}.json`);
        fs.copyFileSync(JSON_FALLBACK_PATH, jsonBackupPath);
        try {
          const parsed = JSON.parse(fs.readFileSync(jsonBackupPath, 'utf8'));
          if (!parsed?.data || !parsed?.meta) {
            try {
              if (fs.existsSync(jsonBackupPath)) fs.unlinkSync(jsonBackupPath);
            } catch {}
            return { success: false, error: 'JSON-резервная копия повреждена: отсутствуют обязательные секции' };
          }
        } catch {
          try {
            if (fs.existsSync(jsonBackupPath)) fs.unlinkSync(jsonBackupPath);
          } catch {}
          return { success: false, error: 'Некорректный синтаксис JSON в резервной копии' };
        }
        this.rotateBackups(backupsDir, 5);
        return { success: true, backupPath: jsonBackupPath };
      }

      return { success: false, error: 'База данных не инициализирована' };
    } catch (err: any) {
      console.warn('[ZAYCHICK] Ошибка создания резервной копии:', err);
      return { success: false, error: err?.message || 'Ошибка создания бэкапа' };
    }
  }

  private rotateBackups(backupsDir: string, maxFiles = 5): void {
    try {
      const existingBackups = fs
        .readdirSync(backupsDir)
        .filter((f) => f.startsWith('zaychick-backup-') && (f.endsWith('.sqlite') || f.endsWith('.json')))
        .sort();

      while (existingBackups.length > maxFiles) {
        const oldest = existingBackups.shift();
        if (oldest) {
          try {
            fs.unlinkSync(path.join(backupsDir, oldest));
          } catch {}
        }
      }
    } catch {}
  }

  private createSchema() {
    if (!this.sqliteDb) return;
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS db_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        global_revision INTEGER NOT NULL DEFAULT 1,
        last_updated_at TEXT NOT NULL,
        last_updated_by TEXT NOT NULL,
        last_action TEXT NOT NULL,
        templates_json TEXT NOT NULL,
        active_template_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS weld_joints (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        joint_number TEXT NOT NULL,
        unique_line_id TEXT NOT NULL,
        rd_code TEXT NOT NULL,
        object_name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_linelist (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        unique_line_id TEXT NOT NULL,
        rd_code TEXT NOT NULL,
        object_name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lrv_catalog (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        lrv_code TEXT NOT NULL,
        rd_code TEXT NOT NULL,
        object_name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS welders (
        stamp TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tech_cards (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        number TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS welding_materials (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_accounts (
        login TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS facility_geo (
        object_name TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL,
        user_login TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        login TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        department TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);
  }

  private ensureSeeded() {
    if (!this.sqliteDb) return;
    const row = this.sqliteDb
      .prepare('SELECT global_revision FROM db_meta WHERE id = 1')
      .get();
    if (!row) {
      const seed = buildDefaultSeedData();
      if (process.env.INITIAL_ADMIN_PASSWORD) {
        const customHashed = hashPasswordWithSalt(process.env.INITIAL_ADMIN_PASSWORD);
        const adminAcc = seed.userAccounts.find((u) => u.login === 'admin');
        if (adminAcc) {
          adminAcc.passwordHash = customHashed.hash;
          adminAcc.passwordSalt = customHashed.salt;
          delete adminAcc.password;
        }
        console.log('[ZAYCHICK Security] Пароль администратора инициализирован из переменной окружения INITIAL_ADMIN_PASSWORD.');
      } else {
        console.log('[ZAYCHICK Security] Учётная запись администратора инициализирована со стандартным соленым хешем. Рекомендуется сменить пароль при первом входе.');
      }
      this.writeFullStateToSqlite(
        seed,
        1,
        'Инициализация эталонной серверной БД SQLite',
        'Система (СУБД SQLite)'
      );
    } else {
      // Самовосстановление учётных записей в существующей базе данных, если хеши были стёрты:
      try {
        const userRows = this.sqliteDb
          .prepare('SELECT login, payload_json FROM user_accounts')
          .all() as { login: string; payload_json: string }[];
        const seedMap = new Map(USER_ACCOUNTS.map((u) => [u.login.toLowerCase(), u]));
        const updateStmt = this.sqliteDb.prepare('UPDATE user_accounts SET payload_json = ? WHERE lower(login) = ?');

        for (const r of userRows) {
          const acc = JSON.parse(r.payload_json) as UserAccount;
          if (!acc.passwordHash && !acc.password) {
            const seedAcc = seedMap.get(acc.login.toLowerCase());
            if (seedAcc?.passwordHash && seedAcc?.passwordSalt) {
              acc.passwordHash = seedAcc.passwordHash;
              acc.passwordSalt = seedAcc.passwordSalt;
            } else {
              const generated = hashPasswordWithSalt('123');
              acc.passwordHash = generated.hash;
              acc.passwordSalt = generated.salt;
            }
            updateStmt.run(JSON.stringify(acc), acc.login.toLowerCase());
            console.log(`[ZAYCHICK Security] Восстановлены парольные хеши для учётной записи «${acc.login}».`);
          }
        }

        // Если в БД не оказалось администратора admin, добавляем его из seed
        const adminExists = userRows.some((r) => r.login.toLowerCase() === 'admin');
        if (!adminExists) {
          const seedAdmin = USER_ACCOUNTS.find((u) => u.login === 'admin');
          if (seedAdmin) {
            this.sqliteDb
              .prepare('INSERT INTO user_accounts (login, sort_order, version, payload_json) VALUES (?, 99, 1, ?)')
              .run(seedAdmin.login, JSON.stringify(seedAdmin));
          }
        }
      } catch (err) {
        console.warn('[ZAYCHICK Security] Ошибка восстановления учётных записей:', err);
      }
    }
  }

  private ensureSeededFallback() {
    if (!fs.existsSync(JSON_FALLBACK_PATH)) {
      const seed = buildDefaultSeedData();
      if (process.env.INITIAL_ADMIN_PASSWORD) {
        const customHashed = hashPasswordWithSalt(process.env.INITIAL_ADMIN_PASSWORD);
        const adminAcc = seed.userAccounts.find((u) => u.login === 'admin');
        if (adminAcc) {
          adminAcc.passwordHash = customHashed.hash;
          adminAcc.passwordSalt = customHashed.salt;
          delete adminAcc.password;
        }
      }
      const payload = {
        meta: {
          globalRevision: 1,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: 'Система',
          lastAction: 'Инициализация серверной БД',
          templates: seed.templates,
          activeTemplateId: seed.activeTemplateId,
        },
        data: seed,
      };
      fs.writeFileSync(JSON_FALLBACK_PATH, JSON.stringify(payload, null, 2), 'utf8');
    }
  }

  private writeFullStateToSqlite(
    data: UnifiedDbDataPayload,
    nextRevision: number,
    actionLabel: string,
    updatedBy: string
  ) {
    if (!this.sqliteDb) {
      // Сохраняем парольные хеши существующих пользователей, если новые записи пришли маскированными
      const existingUserMap = new Map<string, UserAccount>();
      if (fs.existsSync(JSON_FALLBACK_PATH)) {
        try {
          const oldRaw = JSON.parse(fs.readFileSync(JSON_FALLBACK_PATH, 'utf8'));
          (oldRaw?.data?.userAccounts || []).forEach((u: UserAccount) => {
            if (u.login) existingUserMap.set(u.login.toLowerCase(), u);
          });
        } catch {}
      }
      const safeUserAccounts = (data.userAccounts || []).map((u) => {
        const existing = existingUserMap.get(u.login.toLowerCase());
        return {
          ...u,
          passwordHash: u.passwordHash || existing?.passwordHash,
          passwordSalt: u.passwordSalt || existing?.passwordSalt,
          password: u.password || existing?.password,
        };
      });
      const safeData = {
        ...data,
        userAccounts: safeUserAccounts,
      };
      const payload = {
        meta: {
          globalRevision: nextRevision,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: updatedBy,
          lastAction: actionLabel,
          templates: data.templates || INITIAL_COLUMN_TEMPLATES,
          activeTemplateId: data.activeTemplateId || 'tpl-full-30',
        },
        data: safeData,
      };
      const tmp = `${JSON_FALLBACK_PATH}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
      fs.renameSync(tmp, JSON_FALLBACK_PATH);
      return;
    }

    const nowIso = new Date().toISOString();
    this.sqliteDb.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // Meta
      const upsertMeta = this.sqliteDb.prepare(`
        INSERT INTO db_meta (id, global_revision, last_updated_at, last_updated_by, last_action, templates_json, active_template_id)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          global_revision = excluded.global_revision,
          last_updated_at = excluded.last_updated_at,
          last_updated_by = excluded.last_updated_by,
          last_action = excluded.last_action,
          templates_json = excluded.templates_json,
          active_template_id = excluded.active_template_id
      `);
      upsertMeta.run(
        nextRevision,
        nowIso,
        updatedBy,
        actionLabel,
        JSON.stringify(data.templates || INITIAL_COLUMN_TEMPLATES),
        data.activeTemplateId || 'tpl-full-30'
      );

      // 1. Weld Joints (UPSERT + differential delete)
      const incomingJointIds = new Set((data.joints || []).map((j) => j.id));
      const existingJointRows = this.sqliteDb
        .prepare('SELECT id FROM weld_joints')
        .all() as { id: string }[];
      const jointsToDelete = existingJointRows.filter((r) => !incomingJointIds.has(r.id));
      if (jointsToDelete.length > 0) {
        const delJointStmt = this.sqliteDb.prepare('DELETE FROM weld_joints WHERE id = ?');
        for (const row of jointsToDelete) {
          delJointStmt.run(row.id);
        }
      }
      const upsertJoint = this.sqliteDb.prepare(`
        INSERT INTO weld_joints (id, sort_order, joint_number, unique_line_id, rd_code, object_name, version, updated_at, updated_by, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sort_order = excluded.sort_order,
          joint_number = excluded.joint_number,
          unique_line_id = excluded.unique_line_id,
          rd_code = excluded.rd_code,
          object_name = excluded.object_name,
          version = excluded.version,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          payload_json = excluded.payload_json
      `);
      (data.joints || []).forEach((j, idx) => {
        const ver = j.version ?? 1;
        const normalized: WeldJoint = { ...j, version: ver };
        upsertJoint.run(
          normalized.id,
          idx,
          normalized.jointNumber || '',
          normalized.uniqueLineId || '',
          normalized.rdCode || '',
          normalized.objectName || '',
          ver,
          normalized.updatedAt || nowIso,
          normalized.updatedBy || updatedBy,
          JSON.stringify(normalized)
        );
      });

      // 2. Project Line List (UPSERT + differential delete)
      const incomingLineIds = new Set((data.projectLineList || []).map((l) => l.id));
      const existingLineRows = this.sqliteDb
        .prepare('SELECT id FROM project_linelist')
        .all() as { id: string }[];
      const linesToDelete = existingLineRows.filter((r) => !incomingLineIds.has(r.id));
      if (linesToDelete.length > 0) {
        const delLineStmt = this.sqliteDb.prepare('DELETE FROM project_linelist WHERE id = ?');
        for (const row of linesToDelete) {
          delLineStmt.run(row.id);
        }
      }
      const upsertLine = this.sqliteDb.prepare(`
        INSERT INTO project_linelist (id, sort_order, unique_line_id, rd_code, object_name, version, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sort_order = excluded.sort_order,
          unique_line_id = excluded.unique_line_id,
          rd_code = excluded.rd_code,
          object_name = excluded.object_name,
          version = excluded.version,
          payload_json = excluded.payload_json
      `);
      (data.projectLineList || []).forEach((l, idx) => {
        const ver = l.version ?? 1;
        const normalized: ProjectLineItem = { ...l, version: ver };
        upsertLine.run(
          normalized.id,
          idx,
          normalized.uniqueLineId || '',
          normalized.rdCode || '',
          normalized.objectName || '',
          ver,
          JSON.stringify(normalized)
        );
      });

      // 3. LRV Catalog (UPSERT + differential delete)
      const incomingLrvIds = new Set((data.lrvCatalog || []).map((item) => item.id));
      const existingLrvRows = this.sqliteDb
        .prepare('SELECT id FROM lrv_catalog')
        .all() as { id: string }[];
      const lrvToDelete = existingLrvRows.filter((r) => !incomingLrvIds.has(r.id));
      if (lrvToDelete.length > 0) {
        const delLrvStmt = this.sqliteDb.prepare('DELETE FROM lrv_catalog WHERE id = ?');
        for (const row of lrvToDelete) {
          delLrvStmt.run(row.id);
        }
      }
      const upsertLrv = this.sqliteDb.prepare(`
        INSERT INTO lrv_catalog (id, sort_order, lrv_code, rd_code, object_name, version, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sort_order = excluded.sort_order,
          lrv_code = excluded.lrv_code,
          rd_code = excluded.rd_code,
          object_name = excluded.object_name,
          version = excluded.version,
          payload_json = excluded.payload_json
      `);
      (data.lrvCatalog || []).forEach((item, idx) => {
        const ver = item.version ?? 1;
        const normalized: LRVItem = { ...item, version: ver };
        upsertLrv.run(
          normalized.id,
          idx,
          normalized.lrvCode || '',
          normalized.rdCode || '',
          normalized.objectName || '',
          ver,
          JSON.stringify(normalized)
        );
      });

      // 4. Welders (UPSERT + differential delete)
      const incomingStamps = new Set((data.welders || []).map((w) => w.stamp));
      const existingWelderRows = this.sqliteDb
        .prepare('SELECT stamp FROM welders')
        .all() as { stamp: string }[];
      const weldersToDelete = existingWelderRows.filter((r) => !incomingStamps.has(r.stamp));
      if (weldersToDelete.length > 0) {
        const delWelderStmt = this.sqliteDb.prepare('DELETE FROM welders WHERE stamp = ?');
        for (const row of weldersToDelete) {
          delWelderStmt.run(row.stamp);
        }
      }
      const upsertWelder = this.sqliteDb.prepare(`
        INSERT INTO welders (stamp, sort_order, version, payload_json)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(stamp) DO UPDATE SET
          sort_order = excluded.sort_order,
          version = excluded.version,
          payload_json = excluded.payload_json
      `);
      (data.welders || []).forEach((w, idx) => {
        const nw = normalizeWelderProfile(w); upsertWelder.run(nw.stamp, idx, JSON.stringify(nw));
      });

      // 5. Tech Cards (UPSERT + differential delete)
      const incomingTcIds = new Set((data.techCards || []).map((t) => t.id));
      const existingTcRows = this.sqliteDb
        .prepare('SELECT id FROM tech_cards')
        .all() as { id: string }[];
      const tcToDelete = existingTcRows.filter((r) => !incomingTcIds.has(r.id));
      if (tcToDelete.length > 0) {
        const delTcStmt = this.sqliteDb.prepare('DELETE FROM tech_cards WHERE id = ?');
        for (const row of tcToDelete) {
          delTcStmt.run(row.id);
        }
      }
      const upsertTc = this.sqliteDb.prepare(`
        INSERT INTO tech_cards (id, sort_order, number, version, payload_json)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          sort_order = excluded.sort_order,
          number = excluded.number,
          version = excluded.version,
          payload_json = excluded.payload_json
      `);
      (data.techCards || []).forEach((t, idx) => {
        const nt = normalizeTechCard(t); upsertTc.run(nt.id, idx, nt.number || '', JSON.stringify(nt));
      });

      // 6. Welding Materials (UPSERT + differential delete)
      const incomingMatIds = new Set((data.weldingMaterials || []).map((m) => m.id));
      const existingMatRows = this.sqliteDb
        .prepare('SELECT id FROM welding_materials')
        .all() as { id: string }[];
      const matToDelete = existingMatRows.filter((r) => !incomingMatIds.has(r.id));
      if (matToDelete.length > 0) {
        const delMatStmt = this.sqliteDb.prepare('DELETE FROM welding_materials WHERE id = ?');
        for (const row of matToDelete) {
          delMatStmt.run(row.id);
        }
      }
      const upsertMat = this.sqliteDb.prepare(`
        INSERT INTO welding_materials (id, sort_order, version, payload_json)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          sort_order = excluded.sort_order,
          version = excluded.version,
          payload_json = excluded.payload_json
      `);
      (data.weldingMaterials || []).forEach((m, idx) => {
        upsertMat.run(m.id, idx, JSON.stringify(m));
      });

      // 7. User Accounts (UPSERT + differential delete с сохранением секретов)
      const incomingLogins = new Set((data.userAccounts || []).map((u) => u.login.toLowerCase()));
      const existingUserRows = this.sqliteDb
        .prepare('SELECT login, payload_json FROM user_accounts')
        .all() as { login: string; payload_json: string }[];
      const existingUserMap = new Map<string, UserAccount>(
        existingUserRows.map((r) => [r.login.toLowerCase(), JSON.parse(r.payload_json)])
      );

      const usersToDelete = existingUserRows.filter((r) => !incomingLogins.has(r.login.toLowerCase()));
      if (usersToDelete.length > 0) {
        const delUserStmt = this.sqliteDb.prepare('DELETE FROM user_accounts WHERE lower(login) = ?');
        for (const row of usersToDelete) {
          delUserStmt.run(row.login.toLowerCase());
        }
      }
      const upsertUser = this.sqliteDb.prepare(`
        INSERT INTO user_accounts (login, sort_order, version, payload_json)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(login) DO UPDATE SET
          sort_order = excluded.sort_order,
          version = excluded.version,
          payload_json = excluded.payload_json
      `);
      (data.userAccounts || []).forEach((u, idx) => {
        const existing = existingUserMap.get(u.login.toLowerCase());
        const safeUser: UserAccount = {
          ...u,
          passwordHash: u.passwordHash || existing?.passwordHash,
          passwordSalt: u.passwordSalt || existing?.passwordSalt,
        };
        if (!safeUser.passwordHash && existing?.password) {
          safeUser.password = existing.password;
        }
        upsertUser.run(safeUser.login, idx, JSON.stringify(safeUser));
      });

      // 8. Facility Geo Overrides (UPSERT + differential delete)
      const incomingGeoKeys = new Set(Object.keys(data.facilityGeoOverrides || {}));
      const existingGeoRows = this.sqliteDb
        .prepare('SELECT object_name FROM facility_geo')
        .all() as { object_name: string }[];
      const geoToDelete = existingGeoRows.filter((r) => !incomingGeoKeys.has(r.object_name));
      if (geoToDelete.length > 0) {
        const delGeoStmt = this.sqliteDb.prepare('DELETE FROM facility_geo WHERE object_name = ?');
        for (const row of geoToDelete) {
          delGeoStmt.run(row.object_name);
        }
      }
      const upsertGeo = this.sqliteDb.prepare(`
        INSERT INTO facility_geo (object_name, version, payload_json)
        VALUES (?, 1, ?)
        ON CONFLICT(object_name) DO UPDATE SET
          version = excluded.version,
          payload_json = excluded.payload_json
      `);
      Object.entries(data.facilityGeoOverrides || {}).forEach(([objName, geo]) => {
        upsertGeo.run(objName, JSON.stringify(geo));
      });

      // 9. Audit Logs (UPSERT without clearing history)
      const upsertAudit = this.sqliteDb.prepare(`
        INSERT INTO audit_logs (id, sort_order, timestamp, user_login, operation_type, payload_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sort_order = excluded.sort_order,
          timestamp = excluded.timestamp,
          user_login = excluded.user_login,
          operation_type = excluded.operation_type,
          payload_json = excluded.payload_json
      `);
      (data.auditLogs || []).slice(0, 5000).forEach((a, idx) => {
        upsertAudit.run(
          a.id,
          idx,
          a.timestamp || nowIso,
          a.userLogin || 'system',
          a.operationType || 'single_edit',
          JSON.stringify(a)
        );
      });

      this.sqliteDb.exec('COMMIT;');
    } catch (err) {
      this.sqliteDb.exec('ROLLBACK;');
      throw err;
    }
  }

  public saveSingleJointToSqlite(params: {
    nextRevision: number;
    nowIso: string;
    updatedBy: string;
    actionText: string;
    savedJoint: WeldJoint;
    auditEntries: AuditLogEntry[];
    templates?: ColumnTemplate[];
    activeTemplateId?: string;
  }) {
    if (!this.sqliteDb) return;
    this.sqliteDb.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // 1. Обновляем метаданные БД
      const upsertMeta = this.sqliteDb.prepare(`
        INSERT INTO db_meta (id, global_revision, last_updated_at, last_updated_by, last_action, templates_json, active_template_id)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          global_revision = excluded.global_revision,
          last_updated_at = excluded.last_updated_at,
          last_updated_by = excluded.last_updated_by,
          last_action = excluded.last_action,
          templates_json = excluded.templates_json,
          active_template_id = excluded.active_template_id
      `);
      upsertMeta.run(
        params.nextRevision,
        params.nowIso,
        params.updatedBy,
        params.actionText,
        JSON.stringify(params.templates || INITIAL_COLUMN_TEMPLATES),
        params.activeTemplateId || 'tpl-full-30'
      );

      // 2. Гранулярный UPSERT одного сохраненного стыка без перезаписи всей таблицы
      const upsertJoint = this.sqliteDb.prepare(`
        INSERT INTO weld_joints (id, sort_order, joint_number, unique_line_id, rd_code, object_name, version, updated_at, updated_by, payload_json)
        VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          joint_number = excluded.joint_number,
          unique_line_id = excluded.unique_line_id,
          rd_code = excluded.rd_code,
          object_name = excluded.object_name,
          version = excluded.version,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          payload_json = excluded.payload_json
      `);
      const j = params.savedJoint;
      upsertJoint.run(
        j.id,
        j.jointNumber || '',
        j.uniqueLineId || '',
        j.rdCode || '',
        j.objectName || '',
        j.version ?? 1,
        j.updatedAt || params.nowIso,
        j.updatedBy || params.updatedBy,
        JSON.stringify(j)
      );

      // 3. Точечная вставка новых записей аудита
      if (params.auditEntries && params.auditEntries.length > 0) {
        const upsertAudit = this.sqliteDb.prepare(`
          INSERT INTO audit_logs (id, sort_order, timestamp, user_login, operation_type, payload_json)
          VALUES (?, 0, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            timestamp = excluded.timestamp,
            user_login = excluded.user_login,
            operation_type = excluded.operation_type,
            payload_json = excluded.payload_json
        `);
        for (const a of params.auditEntries) {
          upsertAudit.run(
            a.id,
            a.timestamp || params.nowIso,
            a.userLogin || 'system',
            a.operationType || 'single_edit',
            JSON.stringify(a)
          );
        }
      }

      this.sqliteDb.exec('COMMIT;');
    } catch (err) {
      this.sqliteDb.exec('ROLLBACK;');
      throw err;
    }
  }

  public recordSessionHeartbeat(session: {
    sessionId: string;
    login: string;
    fullName: string;
    role: string;
  }) {
    if (!session.sessionId) return;
    const now = new Date().toISOString();
    this.activeSessions.set(session.sessionId, {
      ...session,
      lastSeenAt: now,
    });
    // Prune sessions inactive > 5 minutes
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [id, info] of this.activeSessions.entries()) {
      if (new Date(info.lastSeenAt).getTime() < cutoff) {
        this.activeSessions.delete(id);
      }
    }
  }

  private getRawUserAccountByLogin(login: string): UserAccount | null {
    const cleanLogin = (login || '').trim().toLowerCase();
    if (!this.sqliteDb) {
      if (!fs.existsSync(JSON_FALLBACK_PATH)) return null;
      const raw = JSON.parse(fs.readFileSync(JSON_FALLBACK_PATH, 'utf8'));
      const acc = (raw.data?.userAccounts || []).find(
        (a: any) => (a.login || '').trim().toLowerCase() === cleanLogin
      );
      return acc || null;
    }
    const row = this.sqliteDb
      .prepare('SELECT payload_json FROM user_accounts WHERE lower(login) = ?')
      .get(cleanLogin);
    if (!row) return null;
    return JSON.parse(row.payload_json);
  }

  public authenticateUser(
    login: string,
    password: string
  ): {
    success: boolean;
    session?: AuthenticatedSession;
    user?: UserAccount;
    error?: string;
  } {
    const cleanLogin = (login || '').trim().toLowerCase();
    const account = this.getRawUserAccountByLogin(cleanLogin);

    if (!account) {
      return { success: false, error: 'Пользователь с таким логином не найден' };
    }

    const isValid = verifyPassword(
      password,
      account.passwordHash || account.password || '',
      account.passwordSalt
    );

    if (!isValid) {
      return { success: false, error: 'Неверный пароль пользователя' };
    }

    // Проверяем, требует ли пароль миграции на современный scrypt KDF или очистки открытого пароля
    const currentScrypt = account.passwordSalt
      ? hashPasswordWithSalt(password, account.passwordSalt)
      : null;
    const needsMigration =
      !account.passwordSalt ||
      !currentScrypt ||
      account.passwordHash !== currentScrypt.hash ||
      Boolean(account.password);

    if (needsMigration) {
      const rehashed = hashPasswordWithSalt(password);
      account.passwordHash = rehashed.hash;
      account.passwordSalt = rehashed.salt;
      delete account.password; // Удаляем открытый пароль при миграции

      if (this.sqliteDb) {
        try {
          this.sqliteDb
            .prepare('UPDATE user_accounts SET payload_json = ? WHERE lower(login) = ?')
            .run(JSON.stringify(account), cleanLogin);
        } catch {}
      }
    }

    const session = createAuthenticatedSession(account);
    this.authSessions.set(session.token, session);

    if (this.sqliteDb) {
      try {
        const insSess = this.sqliteDb.prepare(`
          INSERT INTO auth_sessions (token, login, full_name, role, is_admin, department, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(token) DO UPDATE SET
            login = excluded.login,
            full_name = excluded.full_name,
            role = excluded.role,
            is_admin = excluded.is_admin,
            department = excluded.department,
            expires_at = excluded.expires_at
        `);
        insSess.run(
          session.token,
          session.login,
          session.fullName,
          session.role,
          session.isAdmin ? 1 : 0,
          session.department,
          session.createdAt,
          session.expiresAt
        );
      } catch {}
    }

    this.recordSessionHeartbeat({
      sessionId: session.token,
      login: account.login,
      fullName: account.fullName,
      role: account.role,
    });

    return { success: true, session, user: account };
  }

  private restorePersistentSessions() {
    if (!this.sqliteDb) return;
    try {
      const nowIso = new Date().toISOString();
      this.sqliteDb.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(nowIso);
      const rows = this.sqliteDb.prepare('SELECT * FROM auth_sessions').all() as any[];
      for (const r of rows) {
        this.authSessions.set(r.token, {
          token: r.token,
          login: r.login,
          fullName: r.full_name,
          role: r.role,
          isAdmin: Boolean(r.is_admin),
          department: r.department || '',
          createdAt: r.created_at,
          expiresAt: r.expires_at,
        });
      }
    } catch {}
  }

  public validateSessionToken(token?: string): AuthenticatedSession | null {
    if (!token) return null;
    let session = this.authSessions.get(token);
    if (!session && this.sqliteDb) {
      try {
        const r = this.sqliteDb
          .prepare('SELECT * FROM auth_sessions WHERE token = ?')
          .get(token) as any;
        if (r) {
          session = {
            token: r.token,
            login: r.login,
            fullName: r.full_name,
            role: r.role,
            isAdmin: Boolean(r.is_admin),
            department: r.department || '',
            createdAt: r.created_at,
            expiresAt: r.expires_at,
          };
          this.authSessions.set(session.token, session);
        }
      } catch {}
    }
    if (!session) return null;
    if (!isSessionActive(session)) {
      this.authSessions.delete(token);
      if (this.sqliteDb) {
        try {
          this.sqliteDb.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
        } catch {}
      }
      return null;
    }
    return session;
  }

  public logoutUser(token?: string): boolean {
    if (!token) return false;
    this.activeSessions.delete(token);
    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
      } catch {}
    }
    return this.authSessions.delete(token);
  }

  public getEngineMetadata(): { engineName: string; journalMode: string; isConnected: boolean } {
    return {
      engineName: this.engineName,
      journalMode: this.journalMode,
      isConnected: Boolean(this.sqliteDb),
    };
  }

  /**
   * Считывает полное внутреннее состояние базы данных SQLite БЕЗ маскирования парольных хешей.
   * Используется строго внутри сервера (для OCC, транзакций и синхронизации).
   */
  public readInternalFullState(): { meta: ServerDbMetadata; data: UnifiedDbDataPayload } {
    if (!this.sqliteDb) {
      const raw = JSON.parse(fs.readFileSync(JSON_FALLBACK_PATH, 'utf8'));
      const data: UnifiedDbDataPayload = raw.data;
      return {
        meta: {
          engine: this.engineName,
          journalMode: this.journalMode,
          dbFilePath: 'data/zaychick-fallback.json',
          globalRevision: raw.meta.globalRevision || 1,
          lastUpdatedAt: raw.meta.lastUpdatedAt,
          lastUpdatedBy: raw.meta.lastUpdatedBy,
          lastAction: raw.meta.lastAction,
          counts: {
            joints: data.joints.length,
            projectLineList: data.projectLineList.length,
            lrvCatalog: data.lrvCatalog.length,
            welders: data.welders.length,
            techCards: data.techCards.length,
            weldingMaterials: data.weldingMaterials.length,
            userAccounts: data.userAccounts.length,
            auditLogs: data.auditLogs.length,
          },
          activeSessions: Array.from(this.activeSessions.values()),
        },
        data: {
          ...data,
          userAccounts: data.userAccounts || [],
        },
      };
    }

    const metaRow = this.sqliteDb
      .prepare('SELECT * FROM db_meta WHERE id = 1')
      .get();

    const joints: WeldJoint[] = this.sqliteDb
      .prepare('SELECT payload_json, version FROM weld_joints ORDER BY sort_order ASC')
      .all()
      .map((r: any) => {
        const parsed = JSON.parse(r.payload_json);
        return { ...parsed, version: r.version ?? parsed.version ?? 1 };
      });

    const projectLineList: ProjectLineItem[] = this.sqliteDb
      .prepare('SELECT payload_json, version FROM project_linelist ORDER BY sort_order ASC')
      .all()
      .map((r: any) => {
        const parsed = JSON.parse(r.payload_json);
        return { ...parsed, version: r.version ?? parsed.version ?? 1 };
      });

    const lrvCatalog: LRVItem[] = this.sqliteDb
      .prepare('SELECT payload_json, version FROM lrv_catalog ORDER BY sort_order ASC')
      .all()
      .map((r: any) => {
        const parsed = JSON.parse(r.payload_json);
        return { ...parsed, version: r.version ?? parsed.version ?? 1 };
      });

    const welders: WelderProfile[] = this.sqliteDb
      .prepare('SELECT payload_json FROM welders ORDER BY sort_order ASC')
      .all()
      .map((r: any) => {
        const w = JSON.parse(r.payload_json);
        if (w.naksCerts && w.naksCerts.length > 0) return w;
        const methods = w.allowedMethods && w.allowedMethods.length > 0 ? w.allowedMethods : ['РД'];
        return {
          ...w,
          naksCerts: methods.map((m: any, idx: number) => ({
            weldingType: m,
            certNumber: w.certNumber ? `${w.certNumber}-${m}` : `НАКС-${m}-${w.stamp}`,
            issueDate: w.certIssueDate,
            expiryDate: w.certExpiryDate,
            admissionSheetNumber: w.admissionSheetNumber ? `${w.admissionSheetNumber}/${idx + 1}` : undefined,
            admissionSheetDate: w.admissionSheetDate,
          })),
        };
      });

    const techCards: TechCardItem[] = this.sqliteDb
      .prepare('SELECT payload_json FROM tech_cards ORDER BY sort_order ASC')
      .all()
      .map((r: any) => {
        const tc = JSON.parse(r.payload_json);
        return {
          ...tc,
          jointKind: tc.jointKind || (tc.number && tc.number.includes('УГЛ') ? 'Угловое' : 'Стыковое'),
          elementCombination: tc.elementCombination || 'Труба+Труба',
        };
      });

    const weldingMaterials: WeldingMaterialCertificate[] = this.sqliteDb
      .prepare('SELECT payload_json FROM welding_materials ORDER BY sort_order ASC')
      .all()
      .map((r: any) => JSON.parse(r.payload_json));

    const userAccounts: UserAccount[] = this.sqliteDb
      .prepare('SELECT payload_json FROM user_accounts ORDER BY sort_order ASC')
      .all()
      .map((r: any) => JSON.parse(r.payload_json));

    const geoRows = this.sqliteDb
      .prepare('SELECT object_name, payload_json FROM facility_geo')
      .all();
    const facilityGeoOverrides: UnifiedDbDataPayload['facilityGeoOverrides'] = {};
    for (const r of geoRows) {
      facilityGeoOverrides[r.object_name] = JSON.parse(r.payload_json);
    }

    const auditLogs: AuditLogEntry[] = this.sqliteDb
      .prepare('SELECT payload_json FROM audit_logs ORDER BY sort_order ASC')
      .all()
      .map((r: any) => JSON.parse(r.payload_json));

    const templates: ColumnTemplate[] = metaRow?.templates_json
      ? JSON.parse(metaRow.templates_json)
      : INITIAL_COLUMN_TEMPLATES;
    const activeTemplateId: string = metaRow?.active_template_id || 'tpl-full-30';

    const data: UnifiedDbDataPayload = {
      joints,
      projectLineList,
      lrvCatalog,
      welders,
      techCards,
      weldingMaterials,
      userAccounts,
      auditLogs,
      facilityGeoOverrides,
      templates,
      activeTemplateId,
    };

    const meta: ServerDbMetadata = {
      engine: this.engineName,
      journalMode: this.journalMode,
      dbFilePath: 'data/zaychick.sqlite',
      globalRevision: metaRow?.global_revision ?? 1,
      lastUpdatedAt: metaRow?.last_updated_at || new Date().toISOString(),
      lastUpdatedBy: metaRow?.last_updated_by || 'Система',
      lastAction: metaRow?.last_action || 'Готов к работе',
      counts: {
        joints: joints.length,
        projectLineList: projectLineList.length,
        lrvCatalog: lrvCatalog.length,
        welders: welders.length,
        techCards: techCards.length,
        weldingMaterials: weldingMaterials.length,
        userAccounts: userAccounts.length,
        auditLogs: auditLogs.length,
      },
      activeSessions: Array.from(this.activeSessions.values()),
    };

    return { meta, data };
  }

  /**
   * Считывает публичное состояние базы данных с маскированием паролей и секретных хешей пользователей.
   * Безопасно для выдачи внешним клиентам по API.
   */
  public readFullState(): { meta: ServerDbMetadata; data: UnifiedDbDataPayload } {
    const internal = this.readInternalFullState();
    return {
      meta: internal.meta,
      data: {
        ...internal.data,
        userAccounts: (internal.data.userAccounts || []).map(sanitizeUserAccountForClient),
      },
    };
  }

  /**
   * Сохраняет сварной стык с транзакционной проверкой оптимистической блокировки (OCC) по полю version.
   */
  public saveJointWithOptimisticLock(params: {
    joint: WeldJoint;
    baseJoint?: WeldJoint | null;
    expectedVersion?: number;
    forceOverwrite?: boolean;
    user?: { login: string; fullName: string; role: string; isAdmin?: boolean };
    sessionToken?: string;
  }):
    | {
        status: 'ok';
        savedJoint: WeldJoint;
        meta: ServerDbMetadata;
        data: UnifiedDbDataPayload;
      }
    | {
        status: 'conflict';
        conflict: OptimisticLockConflictPayload;
        meta: ServerDbMetadata;
      }
    | {
        status: 'forbidden';
        error: string;
        meta: ServerDbMetadata;
      } {
    const { meta, data } = this.readInternalFullState();

    const verifiedSession = this.validateSessionToken(params.sessionToken);
    const effectiveUser = verifiedSession
      ? {
          login: verifiedSession.login,
          fullName: verifiedSession.fullName,
          role: verifiedSession.role,
          isAdmin: verifiedSession.isAdmin,
        }
      : params.user || {
          login: 'engineer_pto',
          fullName: 'Инженер ПТО',
          role: 'Инженер ПТО',
        };

    const perms = getUserRolePermissions(effectiveUser);
    const existingOnServer = data.joints.find((j) => j.id === params.joint.id);

    // Если стык создаётся впервые, но у роли нет права создания/удаления стыков — возвращаем явный отказ
    if (!existingOnServer && !perms.canCreateOrDeleteJoints && !params.forceOverwrite) {
      return {
        status: 'forbidden',
        error: 'У вашей роли отсутствуют полномочия на заведение новых сварных стыков в систему',
        meta,
      };
    }

    const sanitizedIncomingJoint = !params.forceOverwrite
      ? enforceFieldLevelRbacOnJointSave(
          existingOnServer,
          params.joint,
          effectiveUser
        )
      : params.joint;

    const occResult = applyOptimisticJointSave({
      currentJoints: data.joints,
      incomingJoint: sanitizedIncomingJoint,
      baseJoint: params.baseJoint,
      expectedVersion: params.expectedVersion,
      forceOverwrite: params.forceOverwrite,
      user: effectiveUser,
      fieldLabels: FIELD_LABELS_MAP,
    });

    if (occResult.status === 'conflict') {
      return {
        status: 'conflict',
        conflict: occResult.conflict,
        meta,
      };
    }

    const nextRevision = meta.globalRevision + 1;
    const nextData: UnifiedDbDataPayload = {
      ...data,
      joints: occResult.updatedJoints,
      auditLogs: [...occResult.auditEntries, ...data.auditLogs],
    };

    const actionText = params.forceOverwrite
      ? `Разрешение конфликта OCC стыка №${occResult.savedJoint.jointNumber} (v${occResult.savedJoint.version})`
      : `Сохранение паспорта стыка №${occResult.savedJoint.jointNumber} (v${occResult.savedJoint.version})`;

    if (this.sqliteDb) {
      this.saveSingleJointToSqlite({
        nextRevision,
        nowIso: new Date().toISOString(),
        updatedBy: effectiveUser.fullName,
        actionText,
        savedJoint: occResult.savedJoint,
        auditEntries: occResult.auditEntries,
        templates: data.templates,
        activeTemplateId: data.activeTemplateId,
      });
    } else {
      this.writeFullStateToSqlite(
        nextData,
        nextRevision,
        actionText,
        effectiveUser.fullName
      );
    }

    const updated = this.readFullState();
    return {
      status: 'ok',
      savedJoint: occResult.savedJoint,
      meta: updated.meta,
      data: updated.data,
    };
  }

  /**
   * Синхронизирует пакетное/табличное обновление состояния с контролем версий записей и серверной проверкой RBAC.
   */
  public syncStateWithOptimisticLock(params: {
    data: Partial<UnifiedDbDataPayload>;
    expectedGlobalRevision?: number;
    forceOverwrite?: boolean;
    actionLabel: string;
    user?: { login: string; fullName: string; role: string; isAdmin?: boolean };
    sessionToken?: string;
  }):
    | {
        status: 'ok';
        meta: ServerDbMetadata;
        data: UnifiedDbDataPayload;
      }
    | {
        status: 'conflict';
        conflict: 'STALE_GLOBAL_REVISION';
        currentRevision: number;
        expectedRevision: number;
        meta: ServerDbMetadata;
        data: UnifiedDbDataPayload;
      } {
    const current = this.readInternalFullState();

    // OCC: Проверка ревизии для предотвращения коллизий и перезаписи параллельных изменений
    if (
      params.expectedGlobalRevision !== undefined &&
      !params.forceOverwrite &&
      params.expectedGlobalRevision < current.meta.globalRevision
    ) {
      return {
        status: 'conflict',
        conflict: 'STALE_GLOBAL_REVISION',
        currentRevision: current.meta.globalRevision,
        expectedRevision: params.expectedGlobalRevision,
        meta: current.meta,
        data: current.data,
      };
    }

    const nextRevision = current.meta.globalRevision + 1;

    const verifiedSession = this.validateSessionToken(params.sessionToken);
    const effectiveUser = verifiedSession
      ? {
          login: verifiedSession.login,
          fullName: verifiedSession.fullName,
          role: verifiedSession.role,
          isAdmin: verifiedSession.isAdmin,
        }
      : params.user || {
          login: 'engineer_pto',
          fullName: 'Инженер ПТО',
          role: 'Инженер ПТО',
        };

    const perms = getUserRolePermissions(effectiveUser);
    const bypassRbac = Boolean(params.forceOverwrite);

    // При обновлении стыков автоматически инкрементируем version тех стыков, которые изменились, и применяем RBAC
    const prevJointMap = new Map(current.data.joints.map((j) => [j.id, j]));
    let nextJoints = current.data.joints;
    if (params.data.joints !== undefined) {
      if (
        !bypassRbac &&
        !perms.canCreateOrDeleteJoints &&
        !perms.canEditPrepAndWeldingFields &&
        !perms.canEditNdtFields
      ) {
        nextJoints = current.data.joints;
      } else {
        const rawIncoming =
          !bypassRbac && !perms.canCreateOrDeleteJoints
            ? params.data.joints.filter((j) => prevJointMap.has(j.id))
            : params.data.joints;

        nextJoints = rawIncoming.map((rawJ) => {
          const prev = prevJointMap.get(rawJ.id);
          const j = bypassRbac
            ? rawJ
            : enforceFieldLevelRbacOnJointSave(prev, rawJ, effectiveUser);
          if (!prev) {
            return { ...j, version: j.version ?? 1 };
          }
          if (prev.updatedAt !== j.updatedAt) {
            return {
              ...j,
              version:
                Math.max(prev.version ?? 1, j.version ?? 1) +
                (j.version === prev.version ? 1 : 0),
            };
          }
          return { ...j, version: prev.version ?? j.version ?? 1 };
        });
      }
    }

    const canEditLineList = bypassRbac || perms.canEditLineList;
    const canEditLrv = bypassRbac || perms.canEditLrvCatalog;
    const canEditTech = bypassRbac || perms.canEditWeldingTech;
    const canEditGeo = bypassRbac || perms.canEditLineList || perms.category === 'admin';
    const canEditUsers =
      bypassRbac ||
      perms.category === 'admin' ||
      Boolean((effectiveUser as any)?.isAdmin);

    const canClearOrShrinkAuditLogs = bypassRbac || perms.category === 'admin';
    const nextAuditLogs =
      params.data.auditLogs === undefined
        ? current.data.auditLogs
        : params.data.auditLogs.length < current.data.auditLogs.length &&
          !canClearOrShrinkAuditLogs
        ? current.data.auditLogs
        : params.data.auditLogs;

    let nextUserAccounts = current.data.userAccounts;
    if (canEditUsers && params.data.userAccounts) {
      const existingMap = new Map(current.data.userAccounts.map((u) => [u.login.toLowerCase(), u]));
      nextUserAccounts = params.data.userAccounts.map((incoming) => {
        const existing = existingMap.get(incoming.login.toLowerCase());
        return {
          ...incoming,
          passwordHash: incoming.passwordHash || existing?.passwordHash,
          passwordSalt: incoming.passwordSalt || existing?.passwordSalt,
          password: incoming.password || existing?.password,
        };
      });
    }

    const mergedData: UnifiedDbDataPayload = {
      joints: nextJoints,
      projectLineList: canEditLineList
        ? params.data.projectLineList ?? current.data.projectLineList
        : current.data.projectLineList,
      lrvCatalog: canEditLrv
        ? params.data.lrvCatalog ?? current.data.lrvCatalog
        : current.data.lrvCatalog,
      welders: canEditTech
        ? params.data.welders ?? current.data.welders
        : current.data.welders,
      techCards: canEditTech
        ? params.data.techCards ?? current.data.techCards
        : current.data.techCards,
      weldingMaterials: canEditTech
        ? params.data.weldingMaterials ?? current.data.weldingMaterials
        : current.data.weldingMaterials,
      userAccounts: nextUserAccounts,
      auditLogs: nextAuditLogs,
      facilityGeoOverrides: canEditGeo
        ? params.data.facilityGeoOverrides ?? current.data.facilityGeoOverrides
        : current.data.facilityGeoOverrides,
      templates: params.data.templates ?? current.data.templates,
      activeTemplateId:
        params.data.activeTemplateId ?? current.data.activeTemplateId,
    };

    this.writeFullStateToSqlite(
      mergedData,
      nextRevision,
      params.actionLabel || 'Синхронизация данных с СУБД',
      params.user?.fullName || 'Инженер ПТО'
    );

    const updated = this.readFullState();
    return {
      status: 'ok',
      meta: updated.meta,
      data: updated.data,
    };
  }

  /**
   * Имитирует параллельное изменение сварного стыка другим пользователем напрямую в серверной СУБД
   * (для наглядной демонстрации и проверки механизма оптимистической блокировки OCC HTTP 409).
   */
  public simulateParallelServerEdit(params: {
    jointId?: string;
    simulatedBy?: string;
  }): {
    targetJoint: WeldJoint;
    previousVersion: number;
    newVersion: number;
    meta: ServerDbMetadata;
  } | null {
    const current = this.readInternalFullState();
    const target =
      (params.jointId
        ? current.data.joints.find((j) => j.id === params.jointId)
        : current.data.joints[0]) || current.data.joints[0];

    if (!target) return null;

    const prevVersion = target.version ?? 1;
    const newVersion = prevVersion + 1;
    const nowIso = new Date().toISOString();
    const actor =
      params.simulatedBy || 'Лебедев Константин Михайлович (Начальник ЛНК, сессия #27)';

    const nextPreheat = target.preheatTemp === '150' ? '165' : '150';
    const nextVikRes = target.vikResult === 'Годен' ? 'В работе' : 'Годен';

    const modifiedJoint: WeldJoint = {
      ...target,
      preheatTemp: nextPreheat,
      vikResult: nextVikRes,
      ndtReportNumber: `НК-АВТО-${newVersion}0${target.jointNumber}`,
      version: newVersion,
      updatedAt: nowIso,
      updatedBy: actor,
    };

    const simAudit: AuditLogEntry = {
      id: `aud-sim-${Date.now()}`,
      timestamp: nowIso,
      userLogin: 'lebedev_km',
      userFullName: actor,
      userRole: 'Начальник лаборатории НК (ПИЛ)',
      jointId: modifiedJoint.id,
      jointNumber: modifiedJoint.jointNumber,
      uniqueLineId: modifiedJoint.uniqueLineId,
      rdCode: modifiedJoint.rdCode,
      fieldKey: 'vikResult',
      fieldLabel: `[Параллельная сессия СУБД v${newVersion}] Контроль ВИК и режим подогрева`,
      oldValue: `${target.vikResult || '—'} / +${target.preheatTemp || '—'}°C (v${prevVersion})`,
      newValue: `${modifiedJoint.vikResult} / +${modifiedJoint.preheatTemp}°C (v${newVersion})`,
      operationType: 'single_edit',
    };

    const nextData: UnifiedDbDataPayload = {
      ...current.data,
      joints: current.data.joints.map((j) =>
        j.id === modifiedJoint.id ? modifiedJoint : j
      ),
      auditLogs: [simAudit, ...current.data.auditLogs],
    };

    this.writeFullStateToSqlite(
      nextData,
      current.meta.globalRevision + 1,
      `Параллельная правка стыка №${modifiedJoint.jointNumber} -> v${newVersion}`,
      actor
    );

    const updated = this.readFullState();
    return {
      targetJoint: modifiedJoint,
      previousVersion: prevVersion,
      newVersion,
      meta: updated.meta,
    };
  }
}

export const serverDb = new UnifiedServerDatabase();
