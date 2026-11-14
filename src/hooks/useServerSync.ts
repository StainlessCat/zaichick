import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, zaychickApi } from '../api';
import {
  ANONYMOUS_USER,
  AuditLogEntry,
  ColumnTemplate,
  CustomWeatherStation,
  FacilityObject,
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
import { getUserRolePermissions } from '../utils/rbac';

export interface FacilityGeoOverride {
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
  customWeatherStations?: CustomWeatherStation[];
}

export interface UseServerSyncParams {
  currentUser: UserAccount | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setServerFacilities: React.Dispatch<React.SetStateAction<FacilityObject[]>>;
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  setProjectLineList: React.Dispatch<React.SetStateAction<ProjectLineItem[]>>;
  setLrvCatalog: React.Dispatch<React.SetStateAction<LRVItem[]>>;
  setWelders: React.Dispatch<React.SetStateAction<WelderProfile[]>>;
  setTechCards: React.Dispatch<React.SetStateAction<TechCardItem[]>>;
  setWeldingMaterials: React.Dispatch<React.SetStateAction<WeldingMaterialCertificate[]>>;
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  setTemplates?: React.Dispatch<React.SetStateAction<ColumnTemplate[]>>;
  setFacilityGeoOverrides: React.Dispatch<
    React.SetStateAction<Record<string, FacilityGeoOverride>>
  >;
}

interface SseDeltaEnvelope {
  event?: string;
  entity_type?: string;
  entity_id?: string;
  version?: number;
  updated_by?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

const DELTA_EVENTS = [
  'joint.created',
  'joint.updated',
  'joint.deleted',
  'line.created',
  'line.updated',
  'line.deleted',
  'lrv.created',
  'lrv.updated',
  'lrv.superseded',
  'lrv.deleted',
  'welder.created',
  'welder.updated',
  'welder.deleted',
  'wps.created',
  'wps.updated',
  'wps.deleted',
  'material.created',
  'material.updated',
  'material.deleted',
  'facility.created',
  'facility.updated',
  'facility.deleted',
  'template.created',
  'template.updated',
  'template.deleted',
  'user.created',
  'user.updated',
  'system.restored',
  'system.zero_reset',
];

export function useServerSync({
  currentUser,
  setCurrentUser,
  setIsLoginModalOpen,
  setServerFacilities,
  setJoints,
  setProjectLineList,
  setLrvCatalog,
  setWelders,
  setTechCards,
  setWeldingMaterials,
  setUserAccounts,
  setAuditLogs,
  setTemplates,
  setFacilityGeoOverrides,
}: UseServerSyncParams) {
  const [serverDbMeta, setServerDbMeta] = useState<ServerDbMetadata | null>(null);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(false);
  const [isDbSyncing, setIsDbSyncing] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [lastSyncAttemptAt, setLastSyncAttemptAt] = useState<string | null>(null);
  const [isServerDbModalOpen, setIsServerDbModalOpen] = useState<boolean>(false);
  const [activeConflict, setActiveConflict] =
    useState<OptimisticLockConflictPayload | null>(null);

  const clientIdRef = useRef<string>(`pg-${Math.random().toString(36).slice(2, 9)}`);
  const isApplyingServerStateRef = useRef<boolean>(false);

  const applyGeoFromFacilities = useCallback(
    (facilities: FacilityObject[]) => {
      setServerFacilities(facilities);
      setFacilityGeoOverrides((prev) => {
        const next = { ...prev };
        for (const fac of facilities) {
          next[fac.name] = {
            ...next[fac.name],
            region: fac.region || next[fac.name]?.region || '',
            weatherStation:
              fac.weatherStation || next[fac.name]?.weatherStation || 'Метеостанция не выбрана',
            weatherStationId: fac.weatherStationId || next[fac.name]?.weatherStationId,
            weatherStationDistanceKm:
              fac.weatherStationDistanceKm ?? next[fac.name]?.weatherStationDistanceKm,
            weatherStationSource:
              fac.weatherStationSource || next[fac.name]?.weatherStationSource,
            weatherLastCheckStatus:
              fac.weatherLastCheckStatus || next[fac.name]?.weatherLastCheckStatus,
            weatherLastCheckedAt:
              fac.weatherLastCheckedAt || next[fac.name]?.weatherLastCheckedAt,
            weatherLastErrorMessage:
              fac.weatherLastErrorMessage || next[fac.name]?.weatherLastErrorMessage,
            latitude: fac.latitude ?? next[fac.name]?.latitude ?? 66.53,
            longitude: fac.longitude ?? next[fac.name]?.longitude ?? 66.6,
            customWeatherStations:
              fac.customWeatherStations && fac.customWeatherStations.length > 0
                ? fac.customWeatherStations
                : next[fac.name]?.customWeatherStations,
          };
        }
        return next;
      });
    },
    [setFacilityGeoOverrides, setServerFacilities]
  );

  const fetchServerDbState = useCallback(
    async (silent = false): Promise<boolean> => {
      if (!silent) setIsDbSyncing(true);
      setLastSyncAttemptAt(new Date().toISOString());
      try {
        const session = await zaychickApi.getSession();
        setCurrentUser(session.user);
        setIsAuthenticated(true);

        const perms = getUserRolePermissions(session.user);
        const [
          facilities,
          lines,
          joints,
          lrv,
          welders,
          techCards,
          materials,
          templates,
          auditLogs,
          users,
        ] = await Promise.all([
          zaychickApi.listFacilities(),
          zaychickApi.listLines(),
          zaychickApi.listJoints(),
          zaychickApi.listLrv(),
          zaychickApi.listWelders(),
          zaychickApi.listTechCards(),
          zaychickApi.listMaterials(),
          zaychickApi.listTemplates().catch(() => [] as ColumnTemplate[]),
          zaychickApi.listAuditLogs(1, 200).catch(() => [] as AuditLogEntry[]),
          perms.category === 'admin'
            ? zaychickApi.listUsers().catch(() => [] as UserAccount[])
            : Promise.resolve([session.user]),
        ]);

        isApplyingServerStateRef.current = true;
        applyGeoFromFacilities(facilities);
        setProjectLineList(lines);
        setJoints(joints);
        setLrvCatalog(lrv);
        setWelders(welders);
        setTechCards(techCards);
        setWeldingMaterials(materials);
        if (setTemplates && templates.length > 0) {
          setTemplates(templates);
        }
        setAuditLogs(auditLogs);
        if (users.length > 0) {
          setUserAccounts(users);
        }

        setServerDbMeta((prev) => ({
          engine: 'PostgreSQL 16 (SQLAlchemy Async + Asyncpg)',
          journalMode: 'MVCC / ACID Transactions',
          dbFilePath: 'FastAPI REST + SSE Delta Bus',
          globalRevision: (prev?.globalRevision ?? 0) + 1,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: session.user.fullName,
          lastAction: 'Загрузка с сервера (REST API)',
          counts: {
            joints: joints.length,
            projectLineList: lines.length,
            lrvCatalog: lrv.length,
            welders: welders.length,
            techCards: techCards.length,
            weldingMaterials: materials.length,
            userAccounts: users.length,
            auditLogs: auditLogs.length,
          },
          activeSessions: [
            {
              sessionId: clientIdRef.current,
              login: session.user.login,
              fullName: session.user.fullName,
              role: session.user.role,
              lastSeenAt: new Date().toISOString(),
            },
          ],
        }));

        setIsDbConnected(true);
        setPendingSyncCount(0);
        setLastSyncError(null);
        window.setTimeout(() => {
          isApplyingServerStateRef.current = false;
        }, 50);
        return true;
      } catch (err) {
        setIsAuthenticated(false);
        setCurrentUser(ANONYMOUS_USER);
        if (err instanceof ApiError && err.status === 401) {
          setIsDbConnected(true);
          setLastSyncError('Сессия не активна: требуется вход в систему');
          setIsLoginModalOpen(true);
          return false;
        }
        setIsDbConnected(false);
        setLastSyncError(
          err instanceof Error
            ? (err.message.includes('fetch') ? 'Сервер FastAPI недоступен (порт 8000)' : err.message)
            : 'Сервер FastAPI / PostgreSQL недоступен'
        );
        return false;
      } finally {
        if (!silent) setIsDbSyncing(false);
      }
    },
    [
      applyGeoFromFacilities,
      setAuditLogs,
      setCurrentUser,
      setIsLoginModalOpen,
      setJoints,
      setLrvCatalog,
      setProjectLineList,
      setTechCards,
      setTemplates,
      setUserAccounts,
      setWeldingMaterials,
      setWelders,
    ]
  );

  // Initial load via HttpOnly cookie session
  useEffect(() => {
    fetchServerDbState(false);
  }, [fetchServerDbState]);

  const handleDeltaEvent = useCallback(
    async (env: SseDeltaEnvelope) => {
      const entityType = env.entity_type || '';
      const eventName = env.event || '';
      const entityId = env.entity_id || '';

      setServerDbMeta((prev) =>
        prev
          ? {
              ...prev,
              globalRevision: prev.globalRevision + 1,
              lastUpdatedAt: env.timestamp || new Date().toISOString(),
              lastUpdatedBy: env.updated_by || prev.lastUpdatedBy,
              lastAction: `SSE: ${eventName}`,
            }
          : prev
      );

      try {
        if (entityType === 'joint') {
          if (eventName.endsWith('.deleted') && entityId) {
            setJoints((prev) => prev.filter((j) => j.id !== entityId));
          } else if (entityId) {
            const fresh = await zaychickApi.getJoint(entityId);
            setJoints((prev) =>
              prev.some((j) => j.id === fresh.id)
                ? prev.map((j) => (j.id === fresh.id ? fresh : j))
                : [fresh, ...prev]
            );
          }
        } else if (entityType === 'line') {
          const lines = await zaychickApi.listLines();
          setProjectLineList(lines);
        } else if (entityType === 'lrv') {
          const items = await zaychickApi.listLrv();
          setLrvCatalog(items);
        } else if (entityType === 'welder') {
          const welders = await zaychickApi.listWelders();
          setWelders(welders);
        } else if (entityType === 'tech_card' || entityType === 'wps') {
          const cards = await zaychickApi.listTechCards();
          setTechCards(cards);
        } else if (entityType === 'welding_material' || entityType === 'material') {
          const mats = await zaychickApi.listMaterials();
          setWeldingMaterials(mats);
        } else if (entityType === 'facility') {
          const facs = await zaychickApi.listFacilities();
          applyGeoFromFacilities(facs);
        } else if (entityType === 'template' && setTemplates) {
          const tpls = await zaychickApi.listTemplates();
          if (tpls.length > 0) setTemplates(tpls);
        } else if (entityType === 'user') {
          const perms = currentUser ? getUserRolePermissions(currentUser) : null;
          if (perms?.category === 'admin') {
            const users = await zaychickApi.listUsers();
            setUserAccounts(users);
          }
        } else if (entityType === 'system') {
          await fetchServerDbState(true);
          return;
        }
        const logs = await zaychickApi.listAuditLogs(1, 200).catch(() => null);
        if (logs) setAuditLogs(logs);
      } catch {
        // Ignore transient SSE delta fetch failure
      }
    },
    [
      applyGeoFromFacilities,
      currentUser,
      fetchServerDbState,
      setAuditLogs,
      setJoints,
      setLrvCatalog,
      setProjectLineList,
      setTechCards,
      setTemplates,
      setUserAccounts,
      setWeldingMaterials,
      setWelders,
    ]
  );

  // Pinpoint SSE Delta subscription authenticated strictly via HttpOnly Cookie
  useEffect(() => {
    if (!isAuthenticated || typeof EventSource === 'undefined') return;

    const es = new EventSource('/api/events/stream', { withCredentials: true });
    es.addEventListener('connected', () => {
      setIsDbConnected(true);
    });

    const onDelta = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as SseDeltaEnvelope;
        void handleDeltaEvent(parsed);
      } catch {
        // ignore malformed frames
      }
    };

    for (const evtName of DELTA_EVENTS) {
      es.addEventListener(evtName, onDelta);
    }

    es.onerror = () => {
      // Browser EventSource reconnects automatically
    };

    return () => {
      es.close();
    };
  }, [isAuthenticated, handleDeltaEvent]);

  const triggerImmediateSync = useCallback(async (): Promise<boolean> => {
    return fetchServerDbState(false);
  }, [fetchServerDbState]);

  const bumpRevisionMeta = useCallback((actionLabel: string, byUser?: string) => {
    setServerDbMeta((prev) =>
      prev
        ? {
            ...prev,
            globalRevision: prev.globalRevision + 1,
            lastUpdatedAt: new Date().toISOString(),
            lastUpdatedBy: byUser || prev.lastUpdatedBy,
            lastAction: actionLabel,
          }
        : prev
    );
  }, []);

  return {
    serverDbMeta,
    setServerDbMeta,
    bumpRevisionMeta,
    isDbConnected,
    setIsDbConnected,
    isDbSyncing,
    setIsDbSyncing,
    isAuthenticated,
    setIsAuthenticated,
    pendingSyncCount,
    setPendingSyncCount,
    lastSyncError,
    setLastSyncError,
    lastSyncAttemptAt,
    triggerImmediateSync,
    isServerDbModalOpen,
    setIsServerDbModalOpen,
    activeConflict,
    setActiveConflict,
    clientIdRef,
    isApplyingServerStateRef,
    fetchServerDbState,
  };
}
