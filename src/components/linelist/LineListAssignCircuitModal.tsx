import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Gauge, X } from 'lucide-react';
import {
  CircuitAssignmentConflictItem,
  CircuitAssignmentResult,
  ProjectLineItem,
  TestCircuit,
} from '../../types/welding';
import type { CircuitActionOutcome } from '../../hooks/useTestCircuitActions';

export interface LineListAssignCircuitModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLineIds: string[];
  lineList: ProjectLineItem[];
  testCircuits: TestCircuit[];
  onAssignLinesToCircuit?: (
    circuitId: string,
    lineIds: string[],
    overwriteExisting?: boolean
  ) => Promise<CircuitActionOutcome<CircuitAssignmentResult>>;
  onAssignedSuccess: () => void;
  onOpenTestingCircuits?: () => void;
}

export const LineListAssignCircuitModal: React.FC<LineListAssignCircuitModalProps> = ({
  isOpen,
  onClose,
  selectedLineIds,
  lineList,
  testCircuits,
  onAssignLinesToCircuit,
  onAssignedSuccess,
  onOpenTestingCircuits,
}) => {
  const selectedLinesForCircuit = useMemo(() => {
    const idSet = new Set(selectedLineIds);
    return lineList.filter((l) => idSet.has(l.id));
  }, [lineList, selectedLineIds]);

  const selectedLineObjectNames = useMemo(
    () =>
      Array.from(
        new Set(selectedLinesForCircuit.map((l) => l.objectName).filter(Boolean))
      ),
    [selectedLinesForCircuit]
  );

  const circuitsAvailableForSelectedLines = useMemo(() => {
    if (selectedLineObjectNames.length === 1) {
      return testCircuits.filter((c) => c.objectName === selectedLineObjectNames[0]);
    }
    return testCircuits;
  }, [selectedLineObjectNames, testCircuits]);

  const [targetCircuitId, setTargetCircuitId] = useState(
    () => circuitsAvailableForSelectedLines[0]?.id || ''
  );
  const [assignCircuitBusy, setAssignCircuitBusy] = useState(false);
  const [assignCircuitError, setAssignCircuitError] = useState('');
  const [assignCircuitConflicts, setAssignCircuitConflicts] = useState<
    CircuitAssignmentConflictItem[]
  >([]);

  // Синхронизируем выбранный по умолчанию контур при открытии/смене доступного списка
  React.useEffect(() => {
    if (!isOpen) return;
    setAssignCircuitError('');
    setAssignCircuitConflicts([]);
    setTargetCircuitId((prev) => {
      if (prev && circuitsAvailableForSelectedLines.some((c) => c.id === prev)) {
        return prev;
      }
      return circuitsAvailableForSelectedLines[0]?.id || '';
    });
  }, [isOpen, circuitsAvailableForSelectedLines]);

  if (!isOpen) return null;

  const handleConfirmAssign = async (overwriteExisting = false) => {
    if (!onAssignLinesToCircuit || !targetCircuitId || selectedLineIds.length === 0) {
      return;
    }
    setAssignCircuitBusy(true);
    setAssignCircuitError('');
    try {
      const outcome = await onAssignLinesToCircuit(
        targetCircuitId,
        selectedLineIds,
        overwriteExisting
      );
      if (outcome.ok) {
        setAssignCircuitConflicts([]);
        onAssignedSuccess();
        onClose();
      } else if (outcome.conflicts && outcome.conflicts.length > 0) {
        setAssignCircuitConflicts(outcome.conflicts);
        setAssignCircuitError(
          outcome.error ||
            'Часть стыков выбранных линий уже закреплена за другими испытательными контурами.'
        );
      } else {
        setAssignCircuitError(
          outcome.error || 'Не удалось назначить линии в испытательный контур.'
        );
      }
    } finally {
      setAssignCircuitBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Назначение линий в испытательный контур"
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={() => !assignCircuitBusy && onClose()}
      />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#1e3799] text-white">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-sky-200" />
            <h3 className="text-sm font-bold">
              Назначить линии в испытательный контур
            </h3>
          </div>
          <button
            type="button"
            disabled={assignCircuitBusy}
            onClick={onClose}
            aria-label="Закрыть окно назначения контура"
            className="p-1 rounded text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-[#f4f8fe] border border-sky-200/80 text-slate-700">
            <div className="font-semibold text-[#1e3799] mb-1">
              Выбрано технологических линий: {selectedLinesForCircuit.length}
            </div>
            <div className="font-mono text-[11px] text-slate-600 break-words">
              {selectedLinesForCircuit.map((l) => l.lineNumber).join(', ')}
            </div>
          </div>

          {selectedLineObjectNames.length > 1 && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Выбраны линии разных объектов строительства. Испытательный контур может включать стыки только одного объекта.
              </span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Целевой испытательный контур
            </label>
            {circuitsAvailableForSelectedLines.length > 0 ? (
              <select
                value={targetCircuitId}
                onChange={(e) => {
                  setTargetCircuitId(e.target.value);
                  setAssignCircuitConflicts([]);
                  setAssignCircuitError('');
                }}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              >
                <option value="">Выберите контур…</option>
                {circuitsAvailableForSelectedLines.map((circuit) => (
                  <option key={circuit.id} value={circuit.id}>
                    {circuit.name}
                    {circuit.sriName ? ` · СРИ: ${circuit.sriName}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-between gap-2">
                <span>Для выбранного объекта испытательные контуры ещё не созданы.</span>
                {onOpenTestingCircuits && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTestingCircuits();
                    }}
                    className="px-2.5 py-1 rounded bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] cursor-pointer shrink-0"
                  >
                    Перейти в Испытания
                  </button>
                )}
              </div>
            )}
          </div>

          {assignCircuitError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
              <div className="flex items-start gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{assignCircuitError}</span>
              </div>
              {assignCircuitConflicts.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1 pl-6 text-[11px] font-mono">
                  {assignCircuitConflicts.slice(0, 15).map((c) => (
                    <div key={c.jointId} className="text-rose-800">
                      {c.lineNumber ? `${c.lineNumber} · ` : ''}ст. № {c.jointNumber} → уже в «{c.currentCircuitName}»
                    </div>
                  ))}
                  {assignCircuitConflicts.length > 15 && (
                    <div className="text-rose-700 font-sans">
                      и ещё {assignCircuitConflicts.length - 15} стык.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              disabled={assignCircuitBusy}
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Отмена
            </button>
            {assignCircuitConflicts.length > 0 ? (
              <button
                type="button"
                disabled={assignCircuitBusy || !targetCircuitId}
                onClick={() => void handleConfirmAssign(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-45 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {assignCircuitBusy
                    ? 'Переназначение…'
                    : 'Переназначить с перезаписью'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  assignCircuitBusy ||
                  !targetCircuitId ||
                  selectedLineObjectNames.length > 1
                }
                onClick={() => void handleConfirmAssign(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white font-semibold disabled:opacity-45 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {assignCircuitBusy ? 'Назначение…' : 'Назначить стыки линий'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
