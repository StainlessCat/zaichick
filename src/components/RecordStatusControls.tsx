import React, { useState } from 'react';
import {
  Lock,
  ShieldAlert,
  Unlock,
  X,
} from 'lucide-react';
import { DepartmentCode, RecordStatus } from '../types/welding';
import { RECORD_STATUS_LABELS_RU } from '../utils/rbac';
import { usePermissions } from '../hooks/usePermissions';

export interface RecordStatusBadgeProps {
  status?: RecordStatus;
  compact?: boolean;
}

export const RecordStatusBadge: React.FC<RecordStatusBadgeProps> = ({
  status = 'DRAFT',
  compact = false,
}) => {
  if (status !== 'LOCKED') {
    return null;
  }

  const label = RECORD_STATUS_LABELS_RU[status] || 'Закрыто';
  const sizeClass = compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold border bg-slate-800 text-white border-slate-900 whitespace-nowrap ${sizeClass}`}
      title="Запись закрыта для изменений"
    >
      <Lock className="w-3 h-3 shrink-0" />
      <span>{label}</span>
    </span>
  );
};

export interface UnlockRecordModalProps {
  isOpen: boolean;
  recordLabel: string;
  onClose: () => void;
  onConfirmUnlock: (targetStatus: 'VERIFIED' | 'DRAFT', reason: string) => Promise<void> | void;
}

export const UnlockRecordModal: React.FC<UnlockRecordModalProps> = ({
  isOpen,
  recordLabel,
  onClose,
  onConfirmUnlock,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = reason.trim();
    if (clean.length < 5) {
      setError('Укажите основание разблокировки не короче 5 символов');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirmUnlock('DRAFT', clean);
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось снять блокировку');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Снятие блокировки записи"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#1e3799] text-white">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-sky-200 shrink-0" />
            <h3 className="text-sm font-bold">Снятие блокировки записи</h3>
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

        <div className="p-5 space-y-3.5 text-xs">
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-medium">
            Запись: <span className="font-bold">{recordLabel}</span>. Действие будет зафиксировано в журнале аудита с указанием причины.
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
              Причина разблокировки
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              placeholder="Укажите номер служебной записки или основание корректировки"
              className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/30"
            />
          </div>

          {error && (
            <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 font-semibold">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-3.5 rounded-md bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>{submitting ? 'Выполнение...' : 'Разблокировать'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export interface RecordStatusActionsProps {
  status?: RecordStatus;
  recordLabel: string;
  allowedDepartments: DepartmentCode[];
  onChangeStatus: (targetStatus: RecordStatus, reason?: string) => Promise<void> | void;
  compact?: boolean;
}

export const RecordStatusActions: React.FC<RecordStatusActionsProps> = ({
  status = 'DRAFT',
  recordLabel,
  allowedDepartments,
  onChangeStatus,
  compact = false,
}) => {
  const perms = usePermissions();
  const [unlockOpen, setUnlockOpen] = useState(false);

  const canUnlock =
    status === 'LOCKED' &&
    perms.canTransitionStatus('LOCKED', 'DRAFT', allowedDepartments).allowed;

  if (!canUnlock) {
    return null;
  }

  const btnHeight = compact ? 'h-6 px-2 text-[11px]' : 'h-8 px-2.5 text-xs';

  return (
    <>
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setUnlockOpen(true);
          }}
          className={`inline-flex items-center gap-1 rounded-md bg-[#1e3799] hover:bg-[#15276e] text-white font-semibold transition-colors cursor-pointer ${btnHeight}`}
          title="Снять блокировку записи"
        >
          <Unlock className="w-3.5 h-3.5" />
          <span>Разблокировать</span>
        </button>
      </div>

      <UnlockRecordModal
        isOpen={unlockOpen}
        recordLabel={recordLabel}
        onClose={() => setUnlockOpen(false)}
        onConfirmUnlock={async (targetStatus, reason) => {
          await onChangeStatus(targetStatus, reason);
        }}
      />
    </>
  );
};
