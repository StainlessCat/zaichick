import { useEffect, useRef, useState } from 'react';
import type {
  AuditLogEntry,
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
  normalizeTechCard,
  normalizeWelderProfile,
  normalizeWeldJoint,
} from '../utils/entityNormalizers';
import type { CustomWeatherStation } from '../types/welding';

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
  currentUser: UserAccount;
  sessionToken: string | null;
  joints: WeldJoint[];
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  projectLineList: ProjectLineItem[];
  setProjectLineList: React.Dispatch<React.SetStateAction<ProjectLineItem[]>>;
  lrvCatalog: LRVItem[];
  setLrvCatalog: React.Dispatch<React.SetStateAction<LRVItem[]>>;
  welders: WelderProfile[];
  setWelders: React.Dispatch<React.SetStateAction<WelderProfile[]>>;
  techCards: TechCardItem[];
  setTechCards: React.Dispatch<React.SetStateAction<TechCardItem[]>>;
  weldingMaterials: WeldingMaterialCertificate[];
  setWeldingMaterials: React.Dispatch<
    React.SetStateAction<WeldingMaterialCertificate[]>
  >;
  userAccounts: UserAccount[];
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  auditLogs: AuditLogEntry[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  facilityGeoOverrides: Record<string, FacilityGeoOverride>;
  setFacilityGeoOverrides: React.Dispatch<
    React.SetStateAction<Record<string, FacilityGeoOverride>>
  >;
}

export function useServerSync({
  currentUser,
  sessionToken,
  joints,
  setJoints,
  projectLineList,
  setProjectLineList,
  lrvCatalog,
  setLrvCatalog,
  welders,
  setWelders,
  techCards,
  setTechCards,
  weldingMaterials,
  setWeldingMaterials,
  userAccounts,
  setUserAccounts,
  auditLogs,
  setAuditLogs,
  facilityGeoOverrides,
  setFacilityGeoOverrides,
}: UseServerSyncParams) {
  const [serverDbMeta, setServerDbMeta] = useState<ServerDbMetadata | null>(
    null
  );
  const [isDbConnected, setIsDbConnected] = useState<boolean>(true);
  const [isDbSyncing, setIsDbSyncing] = useState<boolean>(false);
  const [isServerDbModalOpen, setIsServerDbModalOpen] =
    useState<boolean>(false);
  const [activeConflict, setActiveConflict] =
    useState<OptimisticLockConflictPayload | null>(null);

  const clientIdRef = useRef<string>(
    `sess-${Math.random().toString(36).slice(2, 9)}`
  );
  const isApplyingServerStateRef = useRef<boolean>(false);
  const hasLoadedServerInitialRef = useRef<boolean>(false);

  const fetchServerDbState = async (silent = false) => {
    if (!silent) setIsDbSyncing(true);
    try {
      const token =
        sessionToken ||
        (typeof window !== 'undefined'
          ? localStorage.getItem('zaychick_session_token') || ''
          : '');
      const headers: Record<string, string> = {};
      if (token) {
        headers['x-session-token'] = token;
      }
      const params = new URLSearchParams({
        clientId: clientIdRef.current,
        userLogin: currentUser.login,
        userFullName: currentUser.fullName,
        userRole: currentUser.role,
        ...(token ? { token } : {}),
      });
      const res = await fetch(`/api/db/state?${params.toString()}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (payload && payload.data) {
        isApplyingServerStateRef.current = true;
        if (Array.isArray(payload.data.joints)) setJoints(payload.data.joints);
        if (Array.isArray(payload.data.projectLineList))
          setProjectLineList(payload.data.projectLineList);
        if (Array.isArray(payload.data.lrvCatalog))
          setLrvCatalog(payload.data.lrvCatalog);
        if (Array.isArray(payload.data.welders)) {
          setWelders(payload.data.welders.map((w: WelderProfile) => normalizeWelderProfile(w)));
        }
        if (Array.isArray(payload.data.techCards)) {
          setTechCards(payload.data.techCards.map((tc: TechCardItem) => normalizeTechCard(tc)));
        }
        if (Array.isArray(payload.data.weldingMaterials))
          setWeldingMaterials(payload.data.weldingMaterials);
        if (
          Array.isArray(payload.data.userAccounts) &&
          payload.data.userAccounts.length > 0
        ) {
          setUserAccounts(payload.data.userAccounts);
        }
        if (Array.isArray(payload.data.auditLogs))
          setAuditLogs(payload.data.auditLogs);
        if (
          payload.data.facilityGeoOverrides &&
          typeof payload.data.facilityGeoOverrides === 'object'
        ) {
          setFacilityGeoOverrides(payload.data.facilityGeoOverrides);
        }
        if (payload.meta) {
          setServerDbMeta(payload.meta);
        }
        setIsDbConnected(true);
        hasLoadedServerInitialRef.current = true;
        window.setTimeout(() => {
          isApplyingServerStateRef.current = false;
        }, 60);
      }
    } catch {
      setIsDbConnected(false);
    } finally {
      if (!silent) setIsDbSyncing(false);
    }
  };

  // Загрузка начального состояния из серверной СУБД SQLite и подписка на SSE-события
  useEffect(() => {
    fetchServerDbState(false);

    let es: EventSource | null = null;
    try {
      const token =
        sessionToken ||
        (typeof window !== 'undefined'
          ? localStorage.getItem('zaychick_session_token') || ''
          : '');
      const sseUrl = `/api/db/events?clientId=${encodeURIComponent(
        clientIdRef.current
      )}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
      es = new EventSource(sseUrl);
      es.addEventListener('connected', (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed?.meta) setServerDbMeta(parsed.meta);
          setIsDbConnected(true);
        } catch {
          // ignore
        }
      });
      es.addEventListener('db_updated', (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed?.meta) setServerDbMeta(parsed.meta);
          if (
            parsed?.sourceClientId &&
            parsed.sourceClientId !== clientIdRef.current
          ) {
            fetchServerDbState(true);
          }
        } catch {
          // ignore
        }
      });
      // Фолбэк для прокси-серверов или сред без именованных событий (Замечание аудита №3)
      es.onmessage = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed?.meta) setServerDbMeta(parsed.meta);
          if (parsed?.type === 'connected') {
            setIsDbConnected(true);
          } else if (parsed?.type === 'db_updated') {
            if (
              parsed?.sourceClientId &&
              parsed.sourceClientId !== clientIdRef.current
            ) {
              fetchServerDbState(true);
            }
          }
        } catch {
          // ignore
        }
      };
      es.onerror = () => {
        // SSE auto-reconnects
      };
    } catch {
      // ignore if SSE unavailable
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // Автоматическая синхронизация справочников и групповых правок в серверную СУБД SQLite
  useEffect(() => {
    if (!hasLoadedServerInitialRef.current || isApplyingServerStateRef.current) {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const payloadData = {
          joints,
          projectLineList,
          lrvCatalog,
          welders,
          techCards,
          weldingMaterials,
          userAccounts,
          auditLogs,
          facilityGeoOverrides,
        };

        const res = await fetch('/api/db/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
          },
          body: JSON.stringify({
            clientId: clientIdRef.current,
            sessionToken,
            user: currentUser,
            expectedGlobalRevision: serverDbMeta?.globalRevision,
            data: payloadData,
            ...payloadData,
          }),
        });
        if (res.ok) {
          const out = await res.json();
          if (out?.meta) setServerDbMeta(out.meta);
          setIsDbConnected(true);
        } else {
          setIsDbConnected(false);
          const errData = await res.json().catch(() => null);
          if (res.status === 409) {
            console.warn('[ZAYCHICK Sync] Обнаружен конфликт ревизий (OCC 409). Актуализация данных с сервера...');
            fetchServerDbState(true);
          } else {
            console.warn('[ZAYCHICK Sync] Сервер отклонил пакет синхронизации:', res.status, errData?.message);
          }
        }
      } catch (err) {
        setIsDbConnected(false);
        // local state remains in localStorage as offline buffer
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    joints,
    projectLineList,
    lrvCatalog,
    welders,
    techCards,
    weldingMaterials,
    userAccounts,
    auditLogs,
    facilityGeoOverrides,
    currentUser,
    sessionToken,
  ]);

  return {
    serverDbMeta,
    setServerDbMeta,
    isDbConnected,
    setIsDbConnected,
    isDbSyncing,
    setIsDbSyncing,
    isServerDbModalOpen,
    setIsServerDbModalOpen,
    activeConflict,
    setActiveConflict,
    clientIdRef,
    isApplyingServerStateRef,
    fetchServerDbState,
  };
}
