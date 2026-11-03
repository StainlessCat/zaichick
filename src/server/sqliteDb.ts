import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
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
} from '../utils/authSecurity';

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
      latitude: number;
      longitude: number;
      weatherArchive?: Record<string, string>;
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
        return;
      }
    } catch {
      // Fallback if running on older Node without node:sqlite
    }

    this.engineName = 'Transactional File DB (WAL JSON)';
    this.journalMode = 'ATOMIC_RENAME';
    this.ensureSeededFallback();
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
    `);
  }

  private ensureSeeded() {
    if (!this.sqliteDb) return;
    const row = this.sqliteDb
      .prepare('SELECT global_revision FROM db_meta WHERE id = 1')
      .get();
    if (!row) {
      const seed = buildDefaultSeedData();
      this.writeFullStateToSqlite(
        seed,
        1,
        'Инициализация эталонной серверной БД SQLite',
        'Система (СУБД SQLite)'
      );
    }
  }

  private ensureSeededFallback() {
    if (!fs.existsSync(JSON_FALLBACK_PATH)) {
      const seed = buildDefaultSeedData();
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
      const payload = {
        meta: {
          globalRevision: nextRevision,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: updatedBy,
          lastAction: actionLabel,
          templates: data.templates || INITIAL_COLUMN_TEMPLATES,
          activeTemplateId: data.activeTemplateId || 'tpl-full-30',
        },
        data,
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

      // Weld Joints
      this.sqliteDb.exec('DELETE FROM weld_joints;');
      const insJoint = this.sqliteDb.prepare(`
        INSERT INTO weld_joints (id, sort_order, joint_number, unique_line_id, rd_code, object_name, version, updated_at, updated_by, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      (data.joints || []).forEach((j, idx) => {
        const ver = j.version ?? 1;
        const normalized: WeldJoint = { ...j, version: ver };
        insJoint.run(
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

      // Project Line List
      this.sqliteDb.exec('DELETE FROM project_linelist;');
      const insLine = this.sqliteDb.prepare(`
        INSERT INTO project_linelist (id, sort_order, unique_line_id, rd_code, object_name, version, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      (data.projectLineList || []).forEach((l, idx) => {
        const ver = l.version ?? 1;
        const normalized: ProjectLineItem = { ...l, version: ver };
        insLine.run(
          normalized.id,
          idx,
          normalized.uniqueLineId || '',
          normalized.rdCode || '',
          normalized.objectName || '',
          ver,
          JSON.stringify(normalized)
        );
      });

      // LRV Catalog
      this.sqliteDb.exec('DELETE FROM lrv_catalog;');
      const insLrv = this.sqliteDb.prepare(`
        INSERT INTO lrv_catalog (id, sort_order, lrv_code, rd_code, object_name, version, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      (data.lrvCatalog || []).forEach((item, idx) => {
        const ver = item.version ?? 1;
        const normalized: LRVItem = { ...item, version: ver };
        insLrv.run(
          normalized.id,
          idx,
          normalized.lrvCode || '',
          normalized.rdCode || '',
          normalized.objectName || '',
          ver,
          JSON.stringify(normalized)
        );
      });

      // Welders
      this.sqliteDb.exec('DELETE FROM welders;');
      const insWelder = this.sqliteDb.prepare(`
        INSERT INTO welders (stamp, sort_order, version, payload_json)
        VALUES (?, ?, 1, ?)
      `);
      (data.welders || []).forEach((w, idx) => {
        insWelder.run(w.stamp, idx, JSON.stringify(w));
      });

      // Tech Cards
      this.sqliteDb.exec('DELETE FROM tech_cards;');
      const insTc = this.sqliteDb.prepare(`
        INSERT INTO tech_cards (id, sort_order, number, version, payload_json)
        VALUES (?, ?, ?, 1, ?)
      `);
      (data.techCards || []).forEach((t, idx) => {
        insTc.run(t.id, idx, t.number || '', JSON.stringify(t));
      });

      // Welding Materials
      this.sqliteDb.exec('DELETE FROM welding_materials;');
      const insMat = this.sqliteDb.prepare(`
        INSERT INTO welding_materials (id, sort_order, version, payload_json)
        VALUES (?, ?, 1, ?)
      `);
      (data.weldingMaterials || []).forEach((m, idx) => {
        insMat.run(m.id, idx, JSON.stringify(m));
      });

      // User Accounts
      this.sqliteDb.exec('DELETE FROM user_accounts;');
      const insUser = this.sqliteDb.prepare(`
        INSERT INTO user_accounts (login, sort_order, version, payload_json)
        VALUES (?, ?, 1, ?)
      `);
      (data.userAccounts || []).forEach((u, idx) => {
        insUser.run(u.login, idx, JSON.stringify(u));
      });

      // Facility Geo Overrides
      this.sqliteDb.exec('DELETE FROM facility_geo;');
      const insGeo = this.sqliteDb.prepare(`
        INSERT INTO facility_geo (object_name, version, payload_json)
        VALUES (?, 1, ?)
      `);
      Object.entries(data.facilityGeoOverrides || {}).forEach(([objName, geo]) => {
        insGeo.run(objName, JSON.stringify(geo));
      });

      // Audit Logs
      this.sqliteDb.exec('DELETE FROM audit_logs;');
      const insAudit = this.sqliteDb.prepare(`
        INSERT INTO audit_logs (id, sort_order, timestamp, user_login, operation_type, payload_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      (data.auditLogs || []).slice(0, 2000).forEach((a, idx) => {
        insAudit.run(
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
    const state = this.readFullState();
    const account = state.data.userAccounts.find(
      (a) => a.login.toLowerCase() === cleanLogin
    );

    if (!account) {
      return { success: false, error: 'Пользователь с таким логином не найден' };
    }

    const isValid = verifyPassword(
      password,
      account.passwordHash || account.password,
      account.passwordSalt
    );

    if (!isValid) {
      return { success: false, error: 'Неверный пароль пользователя' };
    }

    // Если пароль хранился в открытом виде, мигрируем его на соленый хеш в БД
    if (!account.passwordSalt) {
      const hashed = hashPasswordWithSalt(password);
      account.passwordHash = hashed.hash;
      account.passwordSalt = hashed.salt;
      const updatedAccounts = state.data.userAccounts.map((a) =>
        a.login === account.login ? account : a
      );
      this.syncStateWithOptimisticLock({
        data: { userAccounts: updatedAccounts },
        actionLabel: `Обновление безопасности учетной записи ${account.login}`,
        user: account,
        forceOverwrite: true,
      });
    }

    const session = createAuthenticatedSession(account);
    this.authSessions.set(session.token, session);

    this.recordSessionHeartbeat({
      sessionId: session.token,
      login: account.login,
      fullName: account.fullName,
      role: account.role,
    });

    return { success: true, session, user: account };
  }

  public validateSessionToken(token?: string): AuthenticatedSession | null {
    if (!token) return null;
    const session = this.authSessions.get(token);
    if (!session) return null;
    if (!isSessionActive(session)) {
      this.authSessions.delete(token);
      return null;
    }
    return session;
  }

  public logoutUser(token?: string): boolean {
    if (!token) return false;
    this.activeSessions.delete(token);
    return this.authSessions.delete(token);
  }

  public readFullState(): { meta: ServerDbMetadata; data: UnifiedDbDataPayload } {
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
        data,
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
      .map((r: any) => JSON.parse(r.payload_json));

    const techCards: TechCardItem[] = this.sqliteDb
      .prepare('SELECT payload_json FROM tech_cards ORDER BY sort_order ASC')
      .all()
      .map((r: any) => JSON.parse(r.payload_json));

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
      } {
    const { meta, data } = this.readFullState();

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

    // Если стык создаётся впервые, но у роли нет права создания/удаления стыков — отклоняем создание
    if (!existingOnServer && !perms.canCreateOrDeleteJoints && !params.forceOverwrite) {
      return {
        status: 'ok',
        savedJoint: params.joint,
        meta,
        data,
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

    this.writeFullStateToSqlite(
      nextData,
      nextRevision,
      actionText,
      effectiveUser.fullName
    );

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
  }): {
    status: 'ok';
    meta: ServerDbMetadata;
    data: UnifiedDbDataPayload;
  } {
    const current = this.readFullState();
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
      userAccounts: canEditUsers
        ? params.data.userAccounts ?? current.data.userAccounts
        : current.data.userAccounts,
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
    const current = this.readFullState();
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
