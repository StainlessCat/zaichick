import { useModalDismiss } from '../../hooks/useModalDismiss';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  GitBranch,
  Link2,
  ListChecks,
  Search,
  X,
} from 'lucide-react';
import type {
  CircuitAssignmentConflictItem,
  ProjectLineItem,
  TestCircuit,
  WeldJoint,
} from '../../types/welding';
import { isJointWelded } from '../../utils/jointDerived';

export interface CircuitAssignModalProps {
  isOpen: boolean;
  circuit: TestCircuit | null;
  allCircuits: TestCircuit[];
  lines: ProjectLineItem[];
  joints: WeldJoint[];
  onClose: () => void;
  onAssignLines: (
    circuitId: string,
    lineIds: string[],
    overwriteExisting: boolean
  ) => Promise<{
    ok: boolean;
    error?: string;
    errorCode?: string;
    conflicts?: CircuitAssignmentConflictItem[];
  }>;
  onAssignJoints: (
    circuitId: string,
    jointIds: string[],
    overwriteExisting: boolean
  ) => Promise<{
    ok: boolean;
    error?: string;
    errorCode?: string;
    conflicts?: CircuitAssignmentConflictItem[];
  }>;
}

type AssignTab = 'lines' | 'joints';

export const CircuitAssignModal: React.FC<CircuitAssignModalProps> = ({
  isOpen,
  circuit,
  allCircuits,
  lines,
  joints,
  onClose,
  onAssignLines,
  onAssignJoints,
}) => {
  const [activeTab, setActiveTab] = useState<AssignTab>('lines');
  const [search, setSearch] = useState('');
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('ALL');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty: false,
    onClose,
  });

  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [selectedJointIds, setSelectedJointIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<CircuitAssignmentConflictItem[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('lines');
    setSearch('');
    setSelectedLineFilter('ALL');
    setOnlyUnassigned(false);
    setSelectedLineIds([]);
    setSelectedJointIds([]);
    setError('');
    setConflicts([]);
  }, [isOpen, circuit?.id]);

  const circuitNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allCircuits) map.set(c.id, c.name);
    return map;
  }, [allCircuits]);

  const facilityLines = useMemo(() => {
    if (!circuit) return [];
    return lines.filter(
      (l) =>
        (circuit.facilityId && l.facilityId === circuit.facilityId) ||
        (circuit.objectName && l.objectName === circuit.objectName)
    );
  }, [circuit, lines]);

  const facilityJoints = useMemo(() => {
    if (!circuit) return [];
    return joints.filter(
      (j) =>
        (circuit.facilityId && j.facilityId === circuit.facilityId) ||
        (circuit.objectName && j.objectName === circuit.objectName)
    );
  }, [circuit, joints]);

  const resolveJointCircuitName = (j: WeldJoint): { id: string | null; name: string } => {
    if (j.testCircuitId) {
      return {
        id: j.testCircuitId,
        name: circuitNameById.get(j.testCircuitId) || j.contour || '',
      };
    }
    const textContour = (j.contour || '').trim();
    if (!textContour) return { id: null, name: '' };
    const matched = allCircuits.find(
      (c) => c.objectName === j.objectName && c.name.trim() === textContour
    );
    return { id: matched?.id || null, name: matched?.name || textContour };
  };

  // Statistics per line
  const lineRows = useMemo(() => {
    const jointsByLine = new Map<string, WeldJoint[]>();
    for (const j of facilityJoints) {
      const key = j.lineId || j.uniqueLineId;
      const arr = jointsByLine.get(key) || [];
      arr.push(j);
      jointsByLine.set(key, arr);
    }

    const q = search.trim().toLowerCase();
    return facilityLines
      .map((line) => {
        const lineJoints =
          jointsByLine.get(line.id) || jointsByLine.get(line.uniqueLineId) || [];
        let inThisCircuit = 0;
        const otherCircuits = new Set<string>();
        for (const j of lineJoints) {
          const bound = resolveJointCircuitName(j);
          if (bound.id && circuit && bound.id === circuit.id) {
            inThisCircuit += 1;
          } else if (bound.name) {
            otherCircuits.add(bound.name);
          }
        }
        return {
          line,
          totalJoints: lineJoints.length,
          inThisCircuit,
          otherCircuits: Array.from(otherCircuits),
        };
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.line.uniqueLineId.toLowerCase().includes(q) ||
          row.line.lineNumber.toLowerCase().includes(q) ||
          row.line.rdCode.toLowerCase().includes(q) ||
          (row.line.lineName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.line.uniqueLineId.localeCompare(b.line.uniqueLineId, 'ru'));
  }, [circuit, facilityJoints, facilityLines, search, allCircuits, circuitNameById]);

  const filteredJoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facilityJoints
      .filter((j) => {
        if (selectedLineFilter !== 'ALL' && j.uniqueLineId !== selectedLineFilter) {
          return false;
        }
        if (onlyUnassigned) {
          const bound = resolveJointCircuitName(j);
          if (bound.id || bound.name) return false;
        }
        if (!q) return true;
        return (
          j.jointNumber.toLowerCase().includes(q) ||
          j.uniqueLineId.toLowerCase().includes(q) ||
          j.lineNumber.toLowerCase().includes(q) ||
          String(j.diameterMm).includes(q)
        );
      })
      .sort((a, b) => {
        const lc = a.uniqueLineId.localeCompare(b.uniqueLineId, 'ru');
        if (lc !== 0) return lc;
        return a.jointNumber.localeCompare(b.jointNumber, 'ru', { numeric: true });
      });
  }, [facilityJoints, onlyUnassigned, search, selectedLineFilter, allCircuits, circuitNameById]);

  if (!isOpen || !circuit) return null;

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setConflicts([]);
    setError('');
  };

  const toggleJoint = (id: string) => {
    setSelectedJointIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setConflicts([]);
    setError('');
  };

  const handleToggleAllLines = () => {
    const visibleIds = lineRows.map((r) => r.line.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedLineIds.includes(id));
    if (allSelected) {
      setSelectedLineIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedLineIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
    setConflicts([]);
  };

  const handleToggleAllJoints = () => {
    const visibleIds = filteredJoints.map((j) => j.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedJointIds.includes(id));
    if (allSelected) {
      setSelectedJointIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedJointIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
    setConflicts([]);
  };

  const runAssign = async (overwriteExisting: boolean) => {
    setSubmitting(true);
    setError('');
    try {
      const res =
        activeTab === 'lines'
          ? await onAssignLines(circuit.id, selectedLineIds, overwriteExisting)
          : await onAssignJoints(circuit.id, selectedJointIds, overwriteExisting);

      if (!res.ok) {
        if (res.errorCode === 'CIRCUIT_ASSIGNMENT_CONFLICT' && res.conflicts?.length) {
          setConflicts(res.conflicts);
          setError(res.error || 'Выбранные стыки уже входят в другие контуры.');
        } else {
          setConflicts([]);
          setError(res.error || 'Не удалось выполнить привязку.');
        }
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = activeTab === 'lines' ? selectedLineIds.length : selectedJointIds.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Привязка линий и стыков к контуру"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={handleRequestClose}
      />
      <div className="relative z-10 w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link2 className="w-4 h-4 text-sky-200 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">
                Состав контура: {circuit.name}
              </h3>
              <p className="text-[11px] text-sky-100/80 truncate">
                {circuit.objectName || 'Объект строительства'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Закрыть окно"
            className="p-1 rounded text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-5 pt-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('lines');
                setConflicts([]);
                setError('');
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'lines'
                  ? 'border-[#1e3799] text-[#1e3799] bg-white rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>По линиям</span>
              <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-200/80 text-[10px] font-mono text-slate-700">
                {facilityLines.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('joints');
                setConflicts([]);
                setError('');
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'joints'
                  ? 'border-[#1e3799] text-[#1e3799] bg-white rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Точечно по стыкам</span>
              <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-200/80 text-[10px] font-mono text-slate-700">
                {facilityJoints.length}
              </span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 pb-2">
            {activeTab === 'lines'
              ? 'Массово привязывает все стыки выбранных линий в контур'
              : 'Позволяет включить часть линии или исключить захлёстные стыки'}
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="px-5 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === 'lines'
                  ? 'Поиск по номеру линии или шифру РД...'
                  : 'Поиск по номеру стыка, линии или диаметру...'
              }
              className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:bg-white focus:border-[#1e3799]"
            />
          </div>

          {activeTab === 'joints' && (
            <>
              <select
                value={selectedLineFilter}
                onChange={(e) => setSelectedLineFilter(e.target.value)}
                className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-[#1e3799] max-w-[240px]"
              >
                <option value="ALL">Все линии объекта</option>
                {facilityLines.map((l) => (
                  <option key={l.id} value={l.uniqueLineId}>
                    {l.uniqueLineId}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none px-2 py-1 rounded-lg hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={onlyUnassigned}
                  onChange={(e) => setOnlyUnassigned(e.target.checked)}
                  className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                />
                <span>Только без контура</span>
              </label>
            </>
          )}

          <button
            type="button"
            onClick={activeTab === 'lines' ? handleToggleAllLines : handleToggleAllJoints}
            className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
          >
            Выбрать все видимые
          </button>
        </div>

        {/* Conflict Warning Banner (HTTP 409) */}
        {conflicts.length > 0 && (
          <div className="mx-5 mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2.5 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950">
                  <div className="font-bold">
                    Конфликт привязки: {conflicts.length} стык. уже входят в другие контуры
                  </div>
                  <div className="text-[11px] text-amber-900 mt-0.5">
                    Подтвердите перенос, чтобы переназначить эти стыки в контур «{circuit.name}».
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void runAssign(true)}
                className="h-8 px-3.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-50 shrink-0"
              >
                Перенести в этот контур
              </button>
            </div>

            <div className="max-h-28 overflow-y-auto bg-white/80 rounded-lg border border-amber-200 divide-y divide-amber-100 text-[11px]">
              {conflicts.slice(0, 30).map((c) => (
                <div
                  key={c.jointId}
                  className="px-2.5 py-1 flex items-center justify-between gap-2"
                >
                  <span className="font-mono font-semibold text-slate-800">
                    Стык № {c.jointNumber} · {c.uniqueLineId}
                  </span>
                  <span className="text-amber-800 font-semibold truncate">
                    Текущий контур: {c.currentCircuitName || '—'}
                  </span>
                </div>
              ))}
              {conflicts.length > 30 && (
                <div className="px-2.5 py-1 text-slate-500">
                  И ещё {conflicts.length - 30} стык.
                </div>
              )}
            </div>
          </div>
        )}

        {error && conflicts.length === 0 && (
          <div className="mx-5 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {activeTab === 'lines' ? (
            lineRows.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Линии по заданному фильтру не найдены.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {lineRows.map(({ line, totalJoints, inThisCircuit, otherCircuits }) => {
                  const checked = selectedLineIds.includes(line.id);
                  const isFullInThis = totalJoints > 0 && inThisCircuit >= totalJoints;
                  return (
                    <label
                      key={line.id}
                      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                        checked ? 'bg-[#f0f5fc]' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLine(line.id)}
                          className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 font-mono">
                              {line.uniqueLineId}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              РД: {line.rdCode}
                            </span>
                          </div>
                          {line.lineName && (
                            <div className="text-[11px] text-slate-500 truncate">
                              {line.lineName}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isFullInThis ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
                            <Check className="w-3 h-3" />
                            <span>Уже в контуре</span>
                          </span>
                        ) : inThisCircuit > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-semibold font-mono">
                            В контуре: {inThisCircuit} из {totalJoints}
                          </span>
                        ) : null}

                        {otherCircuits.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold max-w-[180px] truncate">
                            Другой: {otherCircuits.join(', ')}
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-mono tabular-nums font-semibold">
                          {totalJoints} шт.
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )
          ) : filteredJoints.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Стыки по заданному фильтру не найдены.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-9 px-3 py-2 text-center">Выбор</th>
                    <th className="px-3 py-2">Линия</th>
                    <th className="px-3 py-2">Стык №</th>
                    <th className="px-3 py-2">Размер, мм</th>
                    <th className="px-3 py-2">Сварка</th>
                    <th className="px-3 py-2">Текущий контур</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredJoints.map((j) => {
                    const checked = selectedJointIds.includes(j.id);
                    const bound = resolveJointCircuitName(j);
                    const inThis = bound.id === circuit.id;
                    const welded = isJointWelded(j);
                    return (
                      <tr
                        key={j.id}
                        onClick={() => toggleJoint(j.id)}
                        className={`cursor-pointer transition-colors ${
                          checked ? 'bg-[#f0f5fc]' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td
                          className="px-3 py-2 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleJoint(j.id)}
                            className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          {j.uniqueLineId}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {j.jointNumber}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                          Ø{j.diameterMm} × {j.wallThickness}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {welded ? (
                            <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                              {j.weldingDate}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Не сварен</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {inThis ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
                              Текущий контур
                            </span>
                          ) : bound.name ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
                              {bound.name}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Не назначен</span>
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

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 font-medium">
            Выбрано:{' '}
            <span className="font-mono font-bold text-[#1e3799]">{selectedCount}</span>{' '}
            {activeTab === 'lines' ? 'лин.' : 'стык.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={submitting || selectedCount === 0}
              onClick={() => void runAssign(false)}
              className="h-8 px-4 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45"
            >
              {submitting
                ? 'Назначение...'
                : activeTab === 'lines'
                  ? 'Назначить выбранные линии'
                  : 'Назначить выбранные стыки'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
