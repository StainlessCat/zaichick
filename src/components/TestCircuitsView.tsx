import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Eye,
  FileCheck2,
  Gauge,
  Link2,
  Plus,
  RotateCcw,
  Search,
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
import { canManageTestCircuits } from '../utils/rbac';
import {
  CIRCUIT_TEST_STATUS_OPTIONS,
  computeCircuitMetricsLocal,
  SRI_STATUS_OPTIONS,
} from '../utils/testCircuitCalc';
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

  const [search, setSearch] = useState('');
  const [filterTestStatus, setFilterTestStatus] = useState<'ALL' | CircuitTestStatus>('ALL');
  const [filterSriStatus, setFilterSriStatus] = useState<'ALL' | SriStatus>('ALL');
  const [onlyWithDefects, setOnlyWithDefects] = useState(false);

  const [formModal, setFormModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    circuit: TestCircuit | null;
  }>({ isOpen: false, mode: 'create', circuit: null });

  const [assignModalCircuitId, setAssignModalCircuitId] = useState<string | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<TestCircuitDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState('');

  // Ensure metrics stay live even in offline/local mode
  const enrichedCircuits = useMemo(() => {
    return app.testCircuits.map((c) => {
      if (app.isDbConnected) return c;
      const computed = computeCircuitMetricsLocal(c, app.joints, app.projectLineList);
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

  const filteredCircuits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedCircuits.filter((c) => {
      if (filterTestStatus !== 'ALL' && c.testStatus !== filterTestStatus) return false;
      if (filterSriStatus !== 'ALL' && c.sriStatus !== filterSriStatus) return false;
      if (onlyWithDefects && c.defectiveJointsCount === 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.sriName || '').toLowerCase().includes(q) ||
        (c.actNumber || '').toLowerCase().includes(q) ||
        c.linesSummary.some((l) => l.uniqueLineId.toLowerCase().includes(q))
      );
    });
  }, [filterSriStatus, filterTestStatus, onlyWithDefects, scopedCircuits, search]);

  const kpi = useMemo(() => {
    let totalCircuits = scopedCircuits.length;
    let testedCount = 0;
    let sriApprovedCount = 0;
    let totalJoints = 0;
    let weldedJoints = 0;
    let totalDInch = 0;
    let weldedDInch = 0;
    let totalEdi = 0;
    let weldedEdi = 0;
    let totalDefects = 0;

    for (const c of scopedCircuits) {
      if (c.testStatus === 'TESTED') testedCount += 1;
      if (c.sriStatus === 'APPROVED') sriApprovedCount += 1;
      totalJoints += c.totalJoints;
      weldedJoints += c.weldedJoints;
      totalDInch += c.totalDInch;
      weldedDInch += c.weldedDInch;
      totalEdi += c.totalEdi;
      weldedEdi += c.weldedEdi;
      totalDefects += c.defectiveJointsCount;
    }

    const jointsPct = totalJoints > 0 ? Math.round((weldedJoints / totalJoints) * 1000) / 10 : 0;
    const dInchPct = totalDInch > 0 ? Math.round((weldedDInch / totalDInch) * 1000) / 10 : 0;
    const ediPct = totalEdi > 0 ? Math.round((weldedEdi / totalEdi) * 1000) / 10 : 0;

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
      ediPct,
      totalDefects,
    };
  }, [scopedCircuits]);

  const openDrawer = async (circuit: TestCircuit) => {
    setBannerError('');
    // Show immediate local preview while fetching full detail
    const localPreview = computeCircuitMetricsLocal(circuit, app.joints, app.projectLineList);
    setDrawerDetail(localPreview);
    setDrawerLoading(true);
    try {
      const res = await onLoadCircuitDetail(circuit.id);
      if (res.ok && res.data) {
        setDrawerDetail(res.data);
      } else if (res.error) {
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

  const handleFormSubmit = async (payload: CircuitFormSubmitPayload) => {
    if (formModal.mode === 'create') {
      return onCreateCircuit(payload);
    }
    if (!formModal.circuit) {
      return { ok: false, error: 'Контур не выбран.' };
    }
    const res = await onUpdateCircuit(formModal.circuit.id, {
      version: formModal.circuit.version,
      name: payload.name,
      sriName: payload.sriName,
      sriStatus: payload.sriStatus,
      testStatus: payload.testStatus,
      plannedDate: payload.plannedDate,
      actNumber: payload.actNumber,
      actualTestDate: payload.actualTestDate,
      force: payload.force,
    });
    if (res.ok && res.data && drawerDetail?.id === res.data.id) {
      setDrawerDetail(res.data);
    }
    return res;
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
    const res = await onAssignLinesToCircuit(circuitId, lineIds, overwriteExisting);
    if (res.ok && res.data && drawerDetail?.id === circuitId) {
      setDrawerDetail(res.data.circuit);
    }
    return res;
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
    const res = await onAssignJointsToCircuit(circuitId, jointIds, overwriteExisting);
    if (res.ok && res.data && drawerDetail?.id === circuitId) {
      setDrawerDetail(res.data.circuit);
    }
    return res;
  };

  const handleDeleteConfirmed = async (circuit: TestCircuit) => {
    setBannerError('');
    const res = await onDeleteCircuit(circuit);
    setConfirmDeleteId(null);
    if (!res.ok) {
      setBannerError(res.error || 'Не удалось удалить контур.');
    } else if (drawerDetail?.id === circuit.id) {
      setDrawerDetail(null);
    }
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    filterTestStatus !== 'ALL' ||
    filterSriStatus !== 'ALL' ||
    onlyWithDefects;

  return (
    <div className="space-y-3">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#1e3799] text-white flex items-center justify-center shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 truncate">
              Испытательные контуры
            </h1>
            <p className="text-xs text-slate-500 truncate">
              Управление контурами, статусами СРИ, привязкой линий и стыков, расчёт готовности в стыках и дюймах
            </p>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() =>
              setFormModal({ isOpen: true, mode: 'create', circuit: null })
            }
            className="h-9 px-4 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Создать контур</span>
          </button>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Контуры испытаний
            </span>
            <ClipboardCheck className="w-4 h-4 text-[#1e3799]" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2 font-mono tabular-nums">
            <span className="text-xl font-bold text-slate-900">{kpi.totalCircuits}</span>
            <span className="text-xs font-semibold text-emerald-700">
              Испытано: {kpi.testedCount}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            В работе: {kpi.totalCircuits - kpi.testedCount}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Готовность СРИ
            </span>
            <FileCheck2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2 font-mono tabular-nums">
            <span className="text-xl font-bold text-slate-900">
              {kpi.sriApprovedCount} / {kpi.totalCircuits}
            </span>
            <span className="text-xs font-semibold text-slate-600">
              {kpi.totalCircuits > 0
                ? `${Math.round((kpi.sriApprovedCount / kpi.totalCircuits) * 100)}%`
                : '0%'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Согласована специальная рабочая инструкция
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Сварка по стыкам
            </span>
            <CheckCircle2 className="w-4 h-4 text-[#1e3799]" />
          </div>
          <ReadinessMiniBar
            percent={kpi.jointsPct}
            primaryText={`${kpi.weldedJoints} / ${kpi.totalJoints} шт.`}
            defectCount={kpi.totalDefects}
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Сварка в дюймах
            </span>
            <Gauge className="w-4 h-4 text-[#1e3799]" />
          </div>
          <ReadinessMiniBar
            percent={kpi.dInchPct}
            primaryText={`${kpi.weldedDInch.toFixed(1)} / ${kpi.totalDInch.toFixed(1)} d-inch`}
            secondaryText={`EDI: ${kpi.weldedEdi.toFixed(1)} / ${kpi.totalEdi.toFixed(1)} (${kpi.ediPct.toFixed(1)}%)`}
          />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-3 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
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
                  <th className="px-4 py-3">Контур и СРИ</th>
                  <th className="px-3 py-3">Включённые линии</th>
                  <th className="px-3 py-3">Статус СРИ</th>
                  <th className="px-3 py-3">Готовность по стыкам</th>
                  <th className="px-3 py-3">Готовность в дюймах</th>
                  <th className="px-3 py-3">План / Акт испытания</th>
                  <th className="px-3 py-3">Статус</th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCircuits.map((circuit) => {
                  const isMutable = circuit.recordStatus === 'DRAFT';
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
                          <div className="flex flex-wrap gap-1 max-w-[240px]">
                            {visibleLines.map((ls) => (
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
                                <span>{ls.lineNumber || ls.uniqueLineId}</span>
                                {!ls.isFullLine && (
                                  <span className="text-[9px] opacity-80">
                                    {ls.assignedJointsCount}/{ls.lineTotalJointsCount}
                                  </span>
                                )}
                              </span>
                            ))}
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

                      <td className="px-3 py-3 align-top whitespace-nowrap text-[11px] font-mono tabular-nums">
                        <div className="text-slate-600">
                          План: {circuit.plannedDate || '—'}
                        </div>
                        {circuit.actNumber || circuit.actualTestDate ? (
                          <div className="text-emerald-700 font-semibold mt-0.5">
                            Акт {circuit.actNumber || '—'} · {circuit.actualTestDate || '—'}
                          </div>
                        ) : (
                          <div className="text-slate-400 mt-0.5">Акт не оформлен</div>
                        )}
                      </td>

                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <CircuitTestStatusBadge status={circuit.testStatus} />
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
                            {canManage && isMutable && (
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
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(circuit.id)}
                                  title="Удалить контур"
                                  className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
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
        circuit={formModal.circuit}
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
        isOpen={Boolean(drawerDetail)}
        detail={drawerDetail}
        loading={drawerLoading}
        canManage={canManage}
        allJoints={app.joints}
        onClose={() => setDrawerDetail(null)}
        onEditCircuit={() => {
          if (!drawerDetail) return;
          setFormModal({ isOpen: true, mode: 'edit', circuit: drawerDetail });
        }}
        onOpenAssignModal={() => {
          if (!drawerDetail) return;
          setAssignModalCircuitId(drawerDetail.id);
        }}
        onChangeStatus={async (targetStatus, reason) => {
          if (!drawerDetail) return;
          const res = await onChangeCircuitStatus(drawerDetail, targetStatus, reason);
          if (res.ok && res.data) {
            setDrawerDetail(res.data);
          } else if (res.error) {
            setBannerError(res.error);
          }
        }}
        onUnassignJoints={async (jointIds) => {
          if (!drawerDetail) return { ok: false, error: 'Контур не выбран.' };
          const res = await onUnassignJointsFromCircuit(drawerDetail.id, jointIds);
          if (res.ok && res.data) {
            setDrawerDetail(res.data.circuit);
          }
          return res;
        }}
        onOpenJointPassport={onOpenJointPassport}
      />
    </div>
  );
};
