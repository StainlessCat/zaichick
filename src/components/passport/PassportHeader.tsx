import React from 'react';
import { ChevronLeft, ChevronRight, FileCheck2, X } from 'lucide-react';
import type { RecordStatus, WeldJoint } from '../../types/welding';
import { isJointDefective, isJointFullyAccepted } from '../../utils/weldingLogic';
import { RecordStatusActions, RecordStatusBadge } from '../RecordStatusControls';

export interface PassportHeaderProps {
  mode: 'create' | 'edit';
  form: WeldJoint;
  lineJoints: WeldJoint[];
  currentLineIndex: number;
  prevJoint: WeldJoint | null;
  nextJoint: WeldJoint | null;
  onNavigateToJoint: (target: WeldJoint) => void;
  onChangeJointStatus?: (
    joint: WeldJoint,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;
  onClose: () => void;
}

export const PassportHeader: React.FC<PassportHeaderProps> = ({
  mode,
  form,
  lineJoints,
  currentLineIndex,
  prevJoint,
  nextJoint,
  onNavigateToJoint,
  onChangeJointStatus,
  onClose,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 bg-[#1e3799] text-white shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <FileCheck2 className="w-5 h-5 text-sky-300 shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-bold whitespace-nowrap">
              {mode === 'create'
                ? 'Добавление нового сварного стыка'
                : `Паспорт сварного стыка № ${form.jointNumber}`}
            </h2>
            {mode === 'edit' && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${
                  isJointDefective(form)
                    ? 'bg-red-500/25 text-red-100 border-red-300/40'
                    : isJointFullyAccepted(form)
                    ? 'bg-emerald-500/25 text-emerald-100 border-emerald-300/40'
                    : form.weldingDate
                    ? 'bg-sky-400/20 text-sky-100 border-sky-300/40'
                    : 'bg-white/15 text-sky-100 border-white/20'
                }`}
              >
                <span>
                  {isJointDefective(form)
                    ? 'Требуется ремонт'
                    : isJointFullyAccepted(form)
                    ? 'Годен'
                    : form.weldingDate
                    ? 'На контроле'
                    : 'Не заварен'}
                </span>
              </span>
            )}
            {mode === 'edit' && (
              <RecordStatusBadge status={form.recordStatus} compact />
            )}
            {mode === 'edit' && lineJoints.length > 0 && (
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[11px] font-mono tabular-nums bg-white/15 text-sky-100 border border-white/20 whitespace-nowrap">
                Линия {form.lineNumber} · {currentLineIndex >= 0 ? currentLineIndex + 1 : 1}/{lineJoints.length}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {mode === 'edit' && onChangeJointStatus && (
          <RecordStatusActions
            status={form.recordStatus}
            recordLabel={`Стык № ${form.jointNumber} · ${form.uniqueLineId}`}
            allowedDepartments={['PTO', 'PIL']}
            compact
            onChangeStatus={async (targetStatus, reason) => {
              await onChangeJointStatus(form, targetStatus, reason);
            }}
          />
        )}

        {mode === 'edit' && lineJoints.length > 1 && (
          <div className="flex items-center gap-1 bg-white/10 p-1 rounded-lg border border-white/20">
            <button
              type="button"
              disabled={!prevJoint}
              onClick={() => prevJoint && onNavigateToJoint(prevJoint)}
              title={
                prevJoint
                  ? `Предыдущий стык № ${prevJoint.jointNumber}`
                  : 'Это первый стык на линии'
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-white/15 hover:bg-white/30 disabled:opacity-35 disabled:hover:bg-white/15 disabled:cursor-not-allowed text-white transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Стык</span> № {prevJoint ? prevJoint.jointNumber : '—'}
            </button>

            <span className="text-[11px] text-sky-200 font-mono tabular-nums px-1.5 hidden md:inline">
              {currentLineIndex >= 0 ? `${currentLineIndex + 1} из ${lineJoints.length}` : ''}
            </span>

            <button
              type="button"
              disabled={!nextJoint}
              onClick={() => nextJoint && onNavigateToJoint(nextJoint)}
              title={
                nextJoint
                  ? `Следующий стык № ${nextJoint.jointNumber}`
                  : 'Это последний стык на линии'
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-white/15 hover:bg-white/30 disabled:opacity-35 disabled:hover:bg-white/15 disabled:cursor-not-allowed text-white transition-colors"
            >
              <span className="hidden sm:inline">Стык</span> № {nextJoint ? nextJoint.jointNumber : '—'}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть паспорт стыка"
          className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

