import React, { useMemo, useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Edit3,
  Eye,
  FileSpreadsheet,
  Gauge,
  Link2,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type {
  CircuitAssignmentConflictItem,
  CircuitAssignmentResult,
  CircuitTestStatus,
  RecordStatus,
  SriStatus,
  TestCircuit,
  TestCircuitDetail,
  WeldJoint,
} from '../types/welding';
import { useAppContext, useAuth } from '../context';
import { canManageTestCircuits, canUserMutateRecord } from '../utils/rbac';
import {
  CIRCUIT_TEST_STATUS_OPTIONS,
  CircuitNdtReadiness,
  computeCircuitMetricsLocal,
  computeCircuitNdtReadiness,
  getCircuitUniqueLineLabel,
  SRI_STATUS_OPTIONS,
} from '../utils/testCircuitCalc';
import { formatDateDDMMYY } from '../utils/formatting';
import { exportTestCircuitsFilteredToXlsx } from '../utils/excelUtils';
import { RecordStatusBadge } from './RecordStatusControls';
import {
  CircuitTestStatusBadge,
  ReadinessMiniBar,
  SriStatusBadge,
} from './testCircuits/CircuitStatusBadges';
import {
  CircuitFormModal,
  CircuitFormSubmitPayload,
} from './testCircuits/CircuitFormModal';
import { CircuitAssignModal } from './testCircuits/CircuitAssignModal';
import { CircuitDetailDrawer } from './testCircuits/CircuitDetailDrawer';
import type { CircuitActionOutcome } from '../hooks/useTestCircuitActions';

export interface TestCircuitsViewProps {
  onLoadCircuitDetail: (
    circuitId: string
  ) => Promise<CircuitActionOutcome<TestCircuitDetail>>;
  onCreateCircuit: (payload: {
    facilityId?: string | null;
    objectName?: string | null;
    name: string;
    sriName?: string | null;
    sriStatus?: SriStatus;
    plannedDate?: string | null;
    actNumber?: string | null;
    actualTestDate?: string | null;
  }) => Promise<CircuitActionOutcome<TestCircuit>>;
  onUpdateCircuit: (
    circuitId: string,
    payload: {
      version: number;
      name?: string;
      sriName?: string | null;
      sriStatus?: SriStatus;
      testStatus?: CircuitTestStatus;
      plannedDate?: string | null;
      actNumber?: string | null;
      actualTestDate?: string | null;
      force?: boolean;
      forceReason?: string | null;
    }
  ) => Promise<CircuitActionOutcome<TestCircuitDetail>>;
  onChangeCircuitStatus: (
    circuit: TestCircuit,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<CircuitActionOutcome<TestCircuitDetail>>;
  onDeleteCircuit: (circuit: TestCircuit) => Promise<CircuitActionOutcome<void>>;
  onAssignLinesToCircuit: (
    circuitId: string,
    lineIds: string[],
    overwriteExisting?: boolean
  ) => Promise<CircuitActionOutcome<CircuitAssignmentResult>>;
  onAssignJointsToCircuit: (
    circuitId: string,
    jointIds: string[],
    overwriteExisting?: boolean
  ) => Promise<CircuitActionOutcome<CircuitAssignmentResult>>;
  onUnassignJointsFromCircuit: (
    circuitId: string,
    jointIds: string[]
  ) => Promise<CircuitActionOutcome<CircuitAssignmentResult>>;
  onOpenJointPassport: (joint: WeldJoint) => void;
}

type SortKey =
  | 'name'
  | 'weldingJointsPercent'
  | 'weldingDInchPercent'
  | 'ndtPercent'
  | 'plannedDate'
  | 'testStatus';

export const TestCircuitsView: React.FC<TestCircuitsViewProps> = ({
  onLoadCircuitDetail,
  onCreateCircuit,
  onUpdateCircuit,
  onChangeCircuitStatus,
  onDeleteCircuit,
  onAssignLinesToCircuit,
  onAssignJointsToCircuit,
  onUnassignJointsFromCircuit,
  onOpenJointPassport,
}) => {
  const app = useAppContext();
  const { currentUser } = useAuth();

  const canManage = canManageTestCircuits(currentUser);

  const [search, setSearch] = usePersistentState('testCircuits:search', '');
  const [filterRdCode, setFilterRdCode] = usePersistentState<string>(
    'testCircuits:filterRdCode',
    'ALL'
  );
  const [filterTestStatus, setFilterTestStatus] = usePersistentState<
    'ALL' | CircuitTestStatus
  >('testCircuits:filterTestStatus', 'ALL');
  const [filterSriStatus, setFilterSriStatus] = usePersistentState<'ALL' | SriStatus>(
    'testCircuits:filterSriStatus',
    'ALL'
  );
  const [onlyWithDefects, setOnlyWithDefects] = usePersistentState(
    'testCircuits:onlyWithDefects',
    false
  );
  const [sortConfig, setSortConfig] = usePersistentState<{
    key: SortKey;
    direction: 'asc' | 'desc';
  } | null>('testCircuits:sortConfig', null);

  const [formModal, setFormModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    circuit: TestCircuit | null;
  }>({ isOpen: false, mode: 'create', circuit: null });

  const [assignModalCircuitId, setAssignModalCircuitId] = useState<string | null>(null);
  const [drawerCircuitId, setDrawerCircuitId] = useState<string | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState('');

  // Keep circuit metrics live-synced with app.joints (so edits in Joint Passport refresh immediately)
  const enrichedCircuits = useMemo(() => {
    return app.testCircuits.map((c) => {
      const computed = computeCircuitMetricsLocal(c, app.joints, app.projectLineList);
      if (app.isDbConnected && computed.totalJoints === 0 && c.totalJoints > 0) {
        // Fallback to server summary if client joints list has not loaded the circuit's joints
        return c;
      }
      const { joints: _j, ...summary } = computed;
      void _j;
      return summary;
    });
  }, [app.isDbConnected, app.joints, app.projectLineList, app.testCircuits]);

  const scopedCircuits = useMemo(() => {
    const obj = app.selectedObjectName;
    if (!obj || obj === 'ALL') return enrichedCircuits;
    return enrichedCircuits.filter((c) => c.objectName === obj);
  }, [app.selectedObjectName, enrichedCircuits]);

  const ndtReadinessById = useMemo(() => {
    const map = new Map<string, CircuitNdtReadiness>();
    for (const c of scopedCircuits) {
      map.set(c.id, computeCircuitNdtReadiness(c, app.joints, app.projectLineList));
    }
    return map;
  }, [app.joints, app.projectLineList, scopedCircuits]);

  const rdCodeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of scopedCircuits) {
      for (const ls of c.linesSummary) {
        if (ls.rdCode) set.add(ls.rdCode);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [scopedCircuits]);

  const effectiveRdFilter =
    filterRdCode !== 'ALL' && rdCodeOptions.includes(filterRdCode) ? filterRdCode : 'ALL';

  const filteredCircuits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = scopedCircuits.filter((c) => {
      if (
        effectiveRdFilter !== 'ALL' &&
        !c.linesSummary.some((ls) => ls.rdCode === effectiveRdFilter)
      ) {
        return false;
      }
      if (filterTestStatus !== 'ALL' && c.testStatus !== filterTestStatus) return false;
      if (filterSriStatus !== 'ALL' && c.sriStatus !== filterSriStatus) return false;
      if (onlyWithDefects && c.defectiveJointsCount === 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.sriName || '').toLowerCase().includes(q) ||
        (c.actNumber || '').toLowerCase().includes(q) ||
        c.linesSummary.some(
          (l) =>
            l.uniqueLineId.toLowerCase().includes(q) ||
            l.lineNumber.toLowerCase().includes(q) ||
            l.rdCode.toLowerCase().includes(q)
        )
      );
    });

    if (!sortConfig) return list;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortConfig.key) {
        case 'name':
          return a.name.localeCompare(b.name, 'ru') * dir;
        case 'weldingJointsPercent':
          return (a.weldingJointsPercent - b.weldingJointsPercent) * dir;
        case 'weldingDInchPercent':
          return (a.weldingDInchPercent - b.weldingDInchPercent) * dir;
        case 'ndtPercent': {
          const na = ndtReadinessById.get(a.id)?.ndtPercent ?? 0;
          const nb = ndtReadinessById.get(b.id)?.ndtPercent ?? 0;
          return (na - nb) * dir;
        }
        case 'plannedDate': {
          const da = a.plannedDate || '9999-12-31';
          const db = b.plannedDate || '9999-12-31';
          return da.localeCompare(db) * dir;
        }
        case 'testStatus': {
          const sa = a.testStatus === 'TESTED' ? 1 : 0;
          const sb = b.testStatus === 'TESTED' ? 1 : 0;
          return (sa - sb) * dir;
        }
      }
    });
  }, [
    effectiveRdFilter,
    filterSriStatus,
    filterTestStatus,
    ndtReadinessById,
    onlyWithDefects,
    scopedCircuits,
    search,
    sortConfig,
  ]);

  // Dynamic KPIs matching active filters
  const kpi = useMemo(() => {
    const totalCircuits = filteredCircuits.length;
    let testedCount = 0;
    let sriApprovedCount = 0;
    let totalJoints = 0;
    let weldedJoints = 0;
    let totalDInch = 0;
    let weldedDInch = 0;
    let totalEdi = 0;
    let weldedEdi = 0;
    let totalDefects = 0;
    let ndtRequired = 0;
    let ndtPassed = 0;

    for (const c of filteredCircuits) {
      if (c.testStatus === 'TESTED') testedCount += 1;
      if (c.sriStatus === 'APPROVED') sriApprovedCount += 1;
      totalJoints += c.totalJoints;
      weldedJoints += c.weldedJoints;
      totalDInch += c.totalDInch;
      weldedDInch += c.weldedDInch;
      totalEdi += c.totalEdi;
      weldedEdi += c.weldedEdi;
      totalDefects += c.defectiveJointsCount;
      const ndt = ndtReadinessById.get(c.id);
      if (ndt) {
        ndtRequired += ndt.requiredChecks;
        ndtPassed += ndt.passedChecks;
      }
    }

    const jointsPct = totalJoints > 0 ? Math.round((weldedJoints / totalJoints) * 1000) / 10 : 0;
    const dInchPct = totalDInch > 0 ? Math.round((weldedDInch / totalDInch) * 1000) / 10 : 0;
    const ndtPct = ndtRequired > 0 ? Math.round((ndtPassed / ndtRequired) * 1000) / 10 : 0;
    const ndtDeficit = Math.max(0, ndtRequired - ndtPassed);

    return {
      totalCircuits,
      testedCount,
      sriApprovedCount,
      totalJoints,
      weldedJoints,
      jointsPct,
      totalDInch,
      weldedDInch,
      dInchPct,
      totalEdi,
      weldedEdi,
      totalDefects,
      ndtRequired,
      ndtPassed,
      ndtPct,
      ndtDeficit,
    };
  }, [filteredCircuits, ndtReadinessById]);

  // Live reactive drawer detail synced with latest joints & circuit metadata
  const liveDrawerDetail = useMemo<TestCircuitDetail | null>(() => {
    if (!drawerCircuitId) return null;
    const base = enrichedCircuits.find((c) => c.id === drawerCircuitId);
    if (!base) return null;
    return computeCircuitMetricsLocal(base, app.joints, app.projectLineList);
  }, [app.joints, app.projectLineList, drawerCircuitId, enrichedCircuits]);

  const openDrawer = async (circuit: TestCircuit) => {
    setBannerError('');
    setDrawerCircuitId(circuit.id);
    setDrawerLoading(true);
    try {
      const res = await onLoadCircuitDetail(circuit.id);
      if (!res.ok && res.error) {
        setBannerError(res.error);
      }
    } finally {
      setDrawerLoading(false);
    }
  };

  const assignModalCircuit = useMemo(
    () => enrichedCircuits.find((c) => c.id === assignModalCircuitId) || null,
    [assignModalCircuitId, enrichedCircuits]
  );

  const formModalCircuit = useMemo(() => {
    if (!formModal.circuit) return null;
    return enrichedCircuits.find((c) => c.id === formModal.circuit!.id) || formModal.circuit;
  }, [enrichedCircuits, formModal.circuit]);

  const handleToggleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const renderSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[#1e3799] shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#1e3799] shrink-0" />
    );
  };

  const handleFormSubmit = async (payload: CircuitFormSubmitPayload) => {
    if (formModal.mode === 'create') {
      return onCreateCircuit(payload);
    }
    if (!formModalCircuit) {
      return { ok: false, error: 'Контур не выбран.' };
    }
    return onUpdateCircuit(formModalCircuit.id, {
      version: formModalCircuit.version,
      name: payload.name,
      sriName: payload.sriName,
      sriStatus: payload.sriStatus,
      testStatus: payload.testStatus,
      plannedDate: payload.plannedDate,
      actNumber: payload.actNumber,
      actualTestDate: payload.actualTestDate,
      force: payload.force,
      forceReason: payload.forceReason,
    });
  };

  const handleAssignLinesWrapped = async (
    circuitId: string,
    lineIds: string[],
    overwriteExisting: boolean
  ): Promise<{
    ok: boolean;
    error?: string;
    errorCode?: string;
    conflicts?: CircuitAssignmentConflictItem[];
  }> => {
    return onAssignLinesToCircuit(circuitId, lineIds, overwriteExisting);
  };

  const handleAssignJointsWrapped = async (
    circuitId: string,
    jointIds: string[],
    overwriteExisting: boolean
  ): Promise<{
    ok: boolean;
    error?: string;
    errorCode?: string;
    conflicts?: CircuitAssignmentConflictItem[];
  }> => {
    return onAssignJointsToCircuit(circuitId, jointIds, overwriteExisting);
  };

  const handleDeleteConfirmed = async (circuit: TestCircuit) => {
    setBannerError('');
    const res = await onDeleteCircuit(circuit);
    setConfirmDeleteId(null);
    if (!res.ok) {
      setBannerError(res.error || 'Не удалось удалить контур.');
    } else if (drawerCircuitId === circuit.id) {
      setDrawerCircuitId(null);
    }
  };

  const handleExportExcel = () => {
    exportTestCircuitsFilteredToXlsx({
      circuits: filteredCircuits,
      ndtByCircuitId: ndtReadinessById,
      allJoints: app.joints,
      allLines: app.projectLineList,
    });
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    effectiveRdFilter !== 'ALL' ||
    filterTestStatus !== 'ALL' ||
    filterSriStatus !== 'ALL' ||
    onlyWithDefects;

  return (
    <div className="space-y-2.5">
      {/* Compact Header Card: KPI Strip + Filter Bar (unified with Laboratory & Registry) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-3 space-y-2.5">
        {/* 6-Cell Compact KPI Strip */}
        <div className="zaychick-kpi-strip grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-lg bg-slate-50/70 overflow-hidden">
          <div
            className="px-3 py-2 flex items-center justify-between gap-2"
            title={`Испытано: ${kpi.testedCount} из ${kpi.totalCircuits} контуров`}
          >
            <span className="text-[11px] font-medium text-slate-600 truncate">
              Контуры
            </span>
            <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
              {kpi.testedCount}/{kpi.totalCircuits}
            </span>
          </div>

          <div
            className="px-3 py-2 flex items-center justify-between gap-2"
            title={`Согласована специальная рабочая инструкция: ${kpi.sriApprovedCount} из ${kpi.totalCircuits}`}
          >
            <span className="text-[11px] font-medium text-slate-600 truncate">
              СРИ согласована
            </span>
            <span className="text-sm font-bold font-mono tabular-nums text-emerald-700">
              {kpi.sriApprovedCount}/{kpi.totalCircuits}
            </span>
          </div>

          <div
            className="px-3 py-2 flex items-center justify-between gap-2"
            title={`Сварено стыков: ${kpi.weldedJoints} из ${kpi.totalJoints} шт.`}
          >
            <span className="text-[11px] font-medium text-slate-600 truncate">
              Сварка стыков
            </span>
            <span className="text-sm font-bold font-mono tabular-nums text-[#1e3799]">
              {kpi.jointsPct.toFixed(1)}%
            </span>
          </div>

          <div
            className="px-3 py-2 flex items-center justify-between gap-2"
            title={`Сварено: ${kpi.weldedDInch.toFixed(1)} из ${kpi.totalDInch.toFixed(1)} d-inch · EDI ${kpi.weldedEdi.toFixed(1)} из ${kpi.totalEdi.toFixed(1)}`}
          >
            <span className="text-[11px] font-medium text-slate-600 truncate">
              Сварка d-inch
            </span>
            <span className="text-sm font-bold font-mono tabular-nums text-[#1e3799]">
              {kpi.dInchPct.toFixed(1)}%
            </span>
          </div>

          <div
            className="px-3 py-2 flex items-center justify-between gap-2"
            title={`Выполнено проверок ВИК и НК: ${kpi.ndtPassed} из ${kpi.ndtRequired}, дефицит: ${kpi.ndtDeficit}`}
          >
            <span className="text-[11px] font-medium text-slate-600 truncate">
              Готовность НК
            </span>
            <span
              className={`text-sm font-bold font-mono tabular-nums ${
                kpi.ndtRequired > 0 && kpi.ndtDeficit === 0
                  ? 'text-emerald-700'
                  : kpi.ndtDeficit > 0
                    ? 'text-amber-700'
                    : 'text-slate-700'
              }`}
            >
              {kpi.ndtPct.toFixed(1)}%
            </span>
          </div>

          <div
            className="px-3 py-2 flex items-center justify-between gap-2"
            title="Стыки с неисправленным браком в отфильтрованных контурах"
          >
            <span className="text-[11px] font-medium text-slate-600 truncate">
              Брак
            </span>
            <span
              className={`text-sm font-bold font-mono tabular-nums ${
                kpi.totalDefects > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {kpi.totalDefects}
            </span>
          </div>
        </div>

        {/* Filter & Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {rdCodeOptions.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Шифр РД:
              </span>
              <select
                value={effectiveRdFilter}
                onChange={(e) => setFilterRdCode(e.target.value)}
                className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-[#1e3799] max-w-[240px]"
              >
                <option value="ALL">Все шифры РД</option>
                {rdCodeOptions.map((rd) => (
                  <option key={rd} value={rd}>
                    {rd}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по контуру, СРИ, номеру акта или линии..."
              className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:bg-white focus:border-[#1e3799]"
            />
          </div>

          <select
            value={filterTestStatus}
            onChange={(e) =>
              setFilterTestStatus(e.target.value as 'ALL' | CircuitTestStatus)
            }
            className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-[#1e3799]"
          >
            <option value="ALL">Все статусы испытаний</option>
            {CIRCUIT_TEST_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={filterSriStatus}
            onChange={(e) => setFilterSriStatus(e.target.value as 'ALL' | SriStatus)}
            className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-[#1e3799]"
          >
            <option value="ALL">Все статусы СРИ</option>
            {SRI_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                СРИ: {opt.label}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 cursor-pointer select-none hover:bg-slate-50">
            <input
              type="checkbox"
              checked={onlyWithDefects}
              onChange={(e) => setOnlyWithDefects(e.target.checked)}
              className="rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <span>Только с браком</span>
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilterRdCode('ALL');
                setFilterTestStatus('ALL');
                setFilterSriStatus('ALL');
                setOnlyWithDefects(false);
              }}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleExportExcel}
              title="Выгрузить в Excel"
              aria-label="Выгрузить в Excel"
              className="h-8 w-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#1e3799] inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>

            {canManage && (
              <button
                type="button"
                onClick={() =>
                  setFormModal({ isOpen: true, mode: 'create', circuit: null })
                }
                className="h-8 px-3.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать контур</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {bannerError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError('')}
            className="text-red-700 hover:underline text-[11px] font-semibold cursor-pointer"
          >
            Скрыть
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredCircuits.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Gauge className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">
                {scopedCircuits.length === 0
                  ? 'Испытательные контуры ещё не созданы'
                  : 'Контуры по заданным фильтрам не найдены'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {scopedCircuits.length === 0
                  ? 'Создайте испытательный контур и привяжите к нему линии целиком или отдельные стыки для автоматического контроля готовности.'
                  : 'Попробуйте изменить поисковый запрос или сбросить фильтры.'}
              </p>
            </div>
            {scopedCircuits.length === 0 && canManage && (
              <button
                type="button"
                onClick={() =>
                  setFormModal({ isOpen: true, mode: 'create', circuit: null })
                }
                className="h-9 px-4 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Создать первый контур</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-slate-800 cursor-pointer uppercase"
                    >
                      <span>Контур и СРИ</span>
                      {renderSortIcon('name')}
                    </button>
                  </th>
                  <th className="px-3 py-3">Включённые линии</th>
                  <th className="px-3 py-3">Статус СРИ</th>
                  <th className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('weldingJointsPercent')}
                      className="inline-flex items-center gap-1 hover:text-slate-800 cursor-pointer uppercase"
                    >
                      <span>Сварка стыков</span>
                      {renderSortIcon('weldingJointsPercent')}
                    </button>
                  </th>
                  <th className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('weldingDInchPercent')}
                      className="inline-flex items-center gap-1 hover:text-slate-800 cursor-pointer uppercase"
                    >
                      <span>Сварка в дюймах</span>
                      {renderSortIcon('weldingDInchPercent')}
                    </button>
                  </th>
                  <th className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('ndtPercent')}
                      className="inline-flex items-center gap-1 hover:text-slate-800 cursor-pointer uppercase"
                    >
                      <span>Готовность НК</span>
                      {renderSortIcon('ndtPercent')}
                    </button>
                  </th>
                  <th className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('plannedDate')}
                      className="inline-flex items-center gap-1 hover:text-slate-800 cursor-pointer uppercase"
                    >
                      <span>План / Акт</span>
                      {renderSortIcon('plannedDate')}
                    </button>
                  </th>
                  <th className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleSort('testStatus')}
                      className="inline-flex items-center gap-1 hover:text-slate-800 cursor-pointer uppercase"
                    >
                      <span>Статус</span>
                      {renderSortIcon('testStatus')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCircuits.map((circuit) => {
                  const canEdit = canUserMutateRecord(
                    currentUser,
                    circuit,
                    ['PTO', 'SK'],
                    'edit',
                    false
                  ).allowed;
                  const canDelete = canUserMutateRecord(
                    currentUser,
                    circuit,
                    ['PTO', 'SK'],
                    'delete',
                    false
                  ).allowed;
                  const ndt = ndtReadinessById.get(circuit.id);
                  const visibleLines = circuit.linesSummary.slice(0, 3);
                  const remainingLines = circuit.linesSummary.length - visibleLines.length;

                  return (
                    <tr
                      key={circuit.id}
                      onClick={() => void openDrawer(circuit)}
                      className="hover:bg-[#f7faff] transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-bold text-slate-900 text-xs">
                          {circuit.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {circuit.sriName ? `СРИ: ${circuit.sriName}` : 'СРИ не указана'}
                        </div>
                        {(!app.selectedObjectName || app.selectedObjectName === 'ALL') &&
                          circuit.objectName && (
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px]">
                              {circuit.objectName}
                            </div>
                          )}
                      </td>

                      <td className="px-3 py-3 align-top">
                        {circuit.linesSummary.length === 0 ? (
                          <span className="text-[11px] text-slate-400">
                            Стыки не назначены
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[230px]">
                            {visibleLines.map((ls) => {
                              const badgeLabel = getCircuitUniqueLineLabel(
                                ls,
                                circuit.linesSummary
                              );
                              return (
                                <span
                                  key={ls.lineId || ls.uniqueLineId}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                                    ls.isFullLine
                                      ? 'bg-[#f0f5fc] border-[#1e3799]/20 text-[#1e3799]'
                                      : 'bg-amber-50 border-amber-300 text-amber-900'
                                  }`}
                                  title={
                                    ls.isFullLine
                                      ? `Линия ${ls.uniqueLineId} включена полностью`
                                      : `Частичное включение: ${ls.assignedJointsCount} из ${ls.lineTotalJointsCount} стыков`
                                  }
                                >
                                  <span>{badgeLabel}</span>
                                  {!ls.isFullLine && (
                                    <span className="text-[9px] opacity-80">
                                      {ls.assignedJointsCount}/{ls.lineTotalJointsCount}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                            {remainingLines > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                +{remainingLines}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <SriStatusBadge status={circuit.sriStatus} />
                      </td>

                      <td className="px-3 py-3 align-top">
                        <ReadinessMiniBar
                          percent={circuit.weldingJointsPercent}
                          primaryText={`${circuit.weldedJoints} / ${circuit.totalJoints} шт.`}
                          defectCount={circuit.defectiveJointsCount}
                        />
                      </td>

                      <td className="px-3 py-3 align-top">
                        <ReadinessMiniBar
                          percent={circuit.weldingDInchPercent}
                          primaryText={`${circuit.weldedDInch.toFixed(1)} / ${circuit.totalDInch.toFixed(1)} d-inch`}
                          secondaryText={`EDI: ${circuit.weldedEdi.toFixed(1)} / ${circuit.totalEdi.toFixed(1)}`}
                        />
                      </td>

                      <td className="px-3 py-3 align-top">
                        {ndt && ndt.requiredChecks > 0 ? (
                          <ReadinessMiniBar
                            percent={ndt.ndtPercent}
                            primaryText={`${ndt.passedChecks} / ${ndt.requiredChecks} пров.`}
                            secondaryText={
                              ndt.deficitDetails.length > 0
                                ? ndt.deficitDetails.join(' · ')
                                : 'Норматив выполнен'
                            }
                          />
                        ) : (
                          <span className="text-[11px] text-slate-400">Нет стыков</span>
                        )}
                      </td>

                      <td className="px-3 py-3 align-top whitespace-nowrap text-[11px] font-mono tabular-nums">
                        <div className="text-slate-600">
                          План:{' '}
                          {circuit.plannedDate ? formatDateDDMMYY(circuit.plannedDate) : '—'}
                        </div>
                        {circuit.actNumber || circuit.actualTestDate ? (
                          <div className="text-emerald-700 font-semibold mt-0.5">
                            Акт {circuit.actNumber || '—'} ·{' '}
                            {circuit.actualTestDate
                              ? formatDateDDMMYY(circuit.actualTestDate)
                              : '—'}
                          </div>
                        ) : (
                          <div className="text-slate-400 mt-0.5">Акт не оформлен</div>
                        )}
                      </td>

                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <CircuitTestStatusBadge status={circuit.testStatus} />
                          {circuit.recordStatus === 'VERIFIED' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200 whitespace-nowrap">
                              <ShieldCheck className="w-3 h-3 shrink-0" />
                              <span>Проверено</span>
                            </span>
                          )}
                          <RecordStatusBadge status={circuit.recordStatus} compact />
                        </div>
                      </td>

                      <td
                        className="px-4 py-3 align-top text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {confirmDeleteId === circuit.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDeleteConfirmed(circuit)}
                              className="h-7 px-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Удалить
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="h-7 px-2 rounded-md border border-slate-300 bg-white text-slate-700 text-[11px] font-medium cursor-pointer"
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void openDrawer(circuit)}
                              title="Открыть состав контура"
                              className="p-1.5 rounded-md text-slate-500 hover:text-[#1e3799] hover:bg-slate-100 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setAssignModalCircuitId(circuit.id)}
                                  title="Привязать линии и стыки"
                                  className="p-1.5 rounded-md text-slate-500 hover:text-[#1e3799] hover:bg-slate-100 cursor-pointer"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFormModal({
                                      isOpen: true,
                                      mode: 'edit',
                                      circuit,
                                    })
                                  }
                                  title="Редактировать контур"
                                  className="p-1.5 rounded-md text-slate-500 hover:text-[#1e3799] hover:bg-slate-100 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(circuit.id)}
                                title="Удалить контур"
                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <CircuitFormModal
        isOpen={formModal.isOpen}
        mode={formModal.mode}
        circuit={formModalCircuit}
        ndtReadiness={
          formModalCircuit ? ndtReadinessById.get(formModalCircuit.id) || null : null
        }
        facilities={app.derivedFacilities}
        defaultObjectName={app.selectedObjectName}
        currentUser={currentUser}
        onClose={() =>
          setFormModal({ isOpen: false, mode: 'create', circuit: null })
        }
        onSubmit={handleFormSubmit}
      />

      {/* Assign Lines / Joints Modal */}
      <CircuitAssignModal
        isOpen={Boolean(assignModalCircuit)}
        circuit={assignModalCircuit}
        allCircuits={enrichedCircuits}
        lines={app.projectLineList}
        joints={app.joints}
        onClose={() => setAssignModalCircuitId(null)}
        onAssignLines={handleAssignLinesWrapped}
        onAssignJoints={handleAssignJointsWrapped}
      />

      {/* Detail Slide-Over Drawer */}
      <CircuitDetailDrawer
        isOpen={Boolean(liveDrawerDetail)}
        detail={liveDrawerDetail}
        ndtReadiness={
          liveDrawerDetail ? ndtReadinessById.get(liveDrawerDetail.id) || null : null
        }
        loading={drawerLoading}
        currentUser={currentUser}
        allJoints={app.joints}
        onClose={() => setDrawerCircuitId(null)}
        onEditCircuit={() => {
          if (!liveDrawerDetail) return;
          setFormModal({ isOpen: true, mode: 'edit', circuit: liveDrawerDetail });
        }}
        onOpenAssignModal={() => {
          if (!liveDrawerDetail) return;
          setAssignModalCircuitId(liveDrawerDetail.id);
        }}
        onChangeStatus={async (targetStatus, reason) => {
          if (!liveDrawerDetail) return;
          const res = await onChangeCircuitStatus(liveDrawerDetail, targetStatus, reason);
          if (!res.ok && res.error) {
            setBannerError(res.error);
          }
        }}
        onUnassignJoints={async (jointIds) => {
          if (!liveDrawerDetail) return { ok: false, error: 'Контур не выбран.' };
          return onUnassignJointsFromCircuit(liveDrawerDetail.id, jointIds);
        }}
        onOpenJointPassport={onOpenJointPassport}
      />
    </div>
  );
};
