import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import type {
  CircuitTestStatus,
  FacilityObject,
  SriStatus,
  TestCircuit,
  UserAccount,
} from '../../types/welding';
import {
  CIRCUIT_TEST_STATUS_OPTIONS,
  SRI_STATUS_OPTIONS,
} from '../../utils/testCircuitCalc';
import { canForceCloseTestCircuit } from '../../utils/rbac';

export interface CircuitFormSubmitPayload {
  facilityId?: string | null;
  objectName?: string | null;
  name: string;
  sriName?: string | null;
  sriStatus: SriStatus;
  testStatus?: CircuitTestStatus;
  plannedDate?: string | null;
  actNumber?: string | null;
  actualTestDate?: string | null;
  force?: boolean;
  forceReason?: string | null;
}

export interface CircuitFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  circuit?: TestCircuit | null;
  facilities: FacilityObject[];
  defaultObjectName: string;
  currentUser: UserAccount;
  onClose: () => void;
  onSubmit: (
    payload: CircuitFormSubmitPayload
  ) => Promise<{ ok: boolean; error?: string; errorCode?: string }>;
}

export const CircuitFormModal: React.FC<CircuitFormModalProps> = ({
  isOpen,
  mode,
  circuit,
  facilities,
  defaultObjectName,
  currentUser,
  onClose,
  onSubmit,
}) => {
  const [selectedFacilityName, setSelectedFacilityName] = useState('');
  const [name, setName] = useState('');
  const [sriName, setSriName] = useState('');
  const [sriStatus, setSriStatus] = useState<SriStatus>('IN_DEVELOPMENT');
  const [testStatus, setTestStatus] = useState<CircuitTestStatus>('NOT_TESTED');
  const [plannedDate, setPlannedDate] = useState('');
  const [actNumber, setActNumber] = useState('');
  const [actualTestDate, setActualTestDate] = useState('');
  const [forceClose, setForceClose] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setForceClose(false);
    setForceReason('');
    if (mode === 'edit' && circuit) {
      setSelectedFacilityName(circuit.objectName || defaultObjectName || facilities[0]?.name || '');
      setName(circuit.name || '');
      setSriName(circuit.sriName || '');
      setSriStatus(circuit.sriStatus || 'IN_DEVELOPMENT');
      setTestStatus(circuit.testStatus || 'NOT_TESTED');
      setPlannedDate(circuit.plannedDate ? circuit.plannedDate.slice(0, 10) : '');
      setActNumber(circuit.actNumber || '');
      setActualTestDate(circuit.actualTestDate ? circuit.actualTestDate.slice(0, 10) : '');
    } else {
      const initialObj =
        defaultObjectName && defaultObjectName !== 'ALL'
          ? defaultObjectName
          : facilities[0]?.name || '';
      setSelectedFacilityName(initialObj);
      setName('');
      setSriName('');
      setSriStatus('IN_DEVELOPMENT');
      setTestStatus('NOT_TESTED');
      setPlannedDate('');
      setActNumber('');
      setActualTestDate('');
    }
  }, [isOpen, mode, circuit, defaultObjectName, facilities]);

  if (!isOpen) return null;

  const canForce = canForceCloseTestCircuit(currentUser);
  const isSwitchingToTested = mode === 'edit' && testStatus === 'TESTED';

  const criticalChecks =
    mode === 'edit' && circuit
      ? [
          {
            id: 'has_joints',
            label: `В контур включены стыки: ${circuit.totalJoints} шт.`,
            ok: circuit.totalJoints > 0,
            critical: true,
          },
          {
            id: 'no_defects',
            label:
              circuit.defectiveJointsCount === 0
                ? 'Неисправленный брак отсутствует'
                : `Неисправленный брак: ${circuit.defectiveJointsCount} стык.`,
            ok: circuit.defectiveJointsCount === 0,
            critical: true,
          },
        ]
      : [];

  const warningChecks =
    mode === 'edit' && circuit
      ? [
          {
            id: 'welded_100',
            label: `Сварка выполнена на 100%: ${circuit.weldedJoints} из ${circuit.totalJoints} шт.`,
            ok: circuit.totalJoints > 0 && circuit.weldingJointsPercent >= 100,
            critical: false,
          },
          {
            id: 'sri_approved',
            label: 'Статус СРИ — Согласована',
            ok: sriStatus === 'APPROVED',
            critical: false,
          },
        ]
      : [];

  const readinessChecks = [...criticalChecks, ...warningChecks];
  const hasCriticalBlockers = criticalChecks.some((c) => !c.ok);
  const hasWarningBlockers = warningChecks.some((c) => !c.ok);
  const hasReadinessBlockers = hasCriticalBlockers || hasWarningBlockers;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Укажите наименование испытательного контура.');
      return;
    }

    if (isSwitchingToTested) {
      if (!actNumber.trim() || !actualTestDate.trim()) {
        setError(
          'Для статуса «Испытано» обязательно укажите номер акта и фактическую дату испытания.'
        );
        return;
      }
      if (hasCriticalBlockers) {
        setError(
          'Перевод контура в статус «Испытано» невозможен: контур пуст или содержит неисправленный брак. Принудительное закрытие запрещено.'
        );
        return;
      }
      if (hasWarningBlockers) {
        if (!forceClose) {
          setError(
            canForce
              ? 'Не выполнены все условия готовности. Устраните замечания или укажите обоснование для принудительного закрытия.'
              : 'Не выполнены условия готовности для перевода контура в статус «Испытано».'
          );
          return;
        }
        if (!forceReason.trim() || forceReason.trim().length < 5) {
          setError('Для принудительного закрытия обязательно укажите обоснование не менее 5 символов.');
          return;
        }
      }
    }

    const matchedFacility = facilities.find((f) => f.name === selectedFacilityName);

    setSubmitting(true);
    setError('');
    try {
      const res = await onSubmit({
        facilityId: matchedFacility?.id || circuit?.facilityId || null,
        objectName: matchedFacility?.name || selectedFacilityName || null,
        name: trimmedName,
        sriName: sriName.trim() || null,
        sriStatus,
        ...(mode === 'edit'
          ? {
              testStatus,
              force: forceClose && !hasCriticalBlockers,
              forceReason: forceClose && !hasCriticalBlockers ? forceReason.trim() : null,
            }
          : {}),
        plannedDate: plannedDate || null,
        actNumber: actNumber.trim() || null,
        actualTestDate: actualTestDate || null,
      });
      if (!res.ok) {
        setError(res.error || 'Не удалось сохранить испытательный контур.');
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'create' ? 'Новый испытательный контур' : 'Редактирование контура'}
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <form
        onSubmit={handleFormSubmit}
        className="relative z-10 w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <ClipboardCheck className="w-4 h-4 text-sky-200 shrink-0" />
            <h3 className="text-sm font-bold truncate">
              {mode === 'create'
                ? 'Создание испытательного контура'
                : `Редактирование контура: ${circuit?.name || ''}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно"
            className="p-1 rounded text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Объект строительства */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-700">
              Объект строительства
            </label>
            {mode === 'create' ? (
              <select
                value={selectedFacilityName}
                onChange={(e) => setSelectedFacilityName(e.target.value)}
                required
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center text-xs font-semibold text-slate-700">
                {selectedFacilityName || '—'}
              </div>
            )}
          </div>

          {/* Наименование контура */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-700">
              Наименование испытательного контура <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Например, КИ-01-ГП или Контур 1.2"
              className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
            />
          </div>

          {/* СРИ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700">
                Шифр и наименование СРИ
              </label>
              <input
                type="text"
                value={sriName}
                onChange={(e) => setSriName(e.target.value)}
                placeholder="Например, СРИ-01-2026"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700">
                Статус СРИ
              </label>
              <select
                value={sriStatus}
                onChange={(e) => setSriStatus(e.target.value as SriStatus)}
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
              >
                {SRI_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Плановая дата и статус испытания */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700">
                Плановая дата испытания
              </label>
              <input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
              />
            </div>

            {mode === 'edit' && (
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Статус испытания
                </label>
                <select
                  value={testStatus}
                  onChange={(e) => {
                    const next = e.target.value as CircuitTestStatus;
                    setTestStatus(next);
                    if (next !== 'TESTED') { setForceClose(false); setForceReason(''); }
                  }}
                  className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                >
                  {CIRCUIT_TEST_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Акт и фактическая дата */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700">
                Номер акта испытания
                {isSwitchingToTested && <span className="text-red-500"> *</span>}
              </label>
              <input
                type="text"
                value={actNumber}
                onChange={(e) => setActNumber(e.target.value)}
                required={isSwitchingToTested}
                placeholder="Например, АКТ-ИСП-042"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700">
                Фактическая дата испытания
                {isSwitchingToTested && <span className="text-red-500"> *</span>}
              </label>
              <input
                type="date"
                value={actualTestDate}
                onChange={(e) => setActualTestDate(e.target.value)}
                required={isSwitchingToTested}
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
              />
            </div>
          </div>

          {/* Чек-лист готовности при переводе в статус «Испытано» */}
          {isSwitchingToTested && (
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 ${
                hasReadinessBlockers
                  ? 'bg-amber-50/80 border-amber-300'
                  : 'bg-emerald-50/70 border-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                {hasReadinessBlockers ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <span>Проверка готовности перед закрытием испытаний</span>
              </div>

              <ul className="space-y-1.5">
                {readinessChecks.map((chk) => (
                  <li key={chk.id} className="flex items-center gap-2 text-[11px]">
                    {chk.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    )}
                    <span className={chk.ok ? 'text-slate-700' : 'text-red-800 font-semibold'}>
                      {chk.label}
                    </span>
                  </li>
                ))}
              </ul>

              {hasReadinessBlockers && (
                <div className="pt-2 border-t border-amber-200 space-y-2">
                  {hasCriticalBlockers ? (
                    <div className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200 text-[11px] text-red-900">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>
                        Принудительное закрытие контура невозможно при наличии неисправленного брака или без привязанных стыков.
                      </span>
                    </div>
                  ) : canForce ? (
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={forceClose}
                          onChange={(e) => setForceClose(e.target.checked)}
                          className="mt-0.5 rounded border-amber-400 text-[#1e3799] focus:ring-[#1e3799]"
                        />
                        <span className="text-[11px] text-amber-950 leading-snug">
                          <span className="font-bold">Принудительное закрытие контура</span> — перевести
                          в статус «Испытано» при незавершённой сварке или несогласованной СРИ.
                          Факт принудительного закрытия фиксируется в журнале аудита.
                        </span>
                      </label>
                      {forceClose && (
                        <div className="space-y-1 pl-5">
                          <label className="text-[11px] font-semibold text-amber-950 block">
                            Обоснование принудительного закрытия <span className="text-red-600">*</span>
                          </label>
                          <input
                            type="text"
                            value={forceReason}
                            onChange={(e) => setForceReason(e.target.value)}
                            placeholder="Номер распоряжения или причина решения"
                            className="w-full h-8 px-2.5 text-xs rounded border border-amber-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3799]"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-[11px] text-amber-900">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <span>
                        Для перевода контура в статус «Испытано» с незавершёнными условиями
                        требуются права администратора отдела ПТО, СК или суперадминистратора.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-4 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting
              ? 'Сохранение...'
              : mode === 'create'
                ? 'Создать контур'
                : 'Сохранить изменения'}
          </button>
        </div>
      </form>
    </div>
  );
};
