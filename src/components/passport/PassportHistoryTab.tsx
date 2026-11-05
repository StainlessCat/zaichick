import React from 'react';
import { History } from 'lucide-react';
import { AuditLogEntry } from '../../types/welding';
import { formatTimestampDDMMYY } from '../../utils/weldingLogic';

export interface PassportHistoryTabProps {
  jointNumber: string;
  auditLogsForJoint: AuditLogEntry[];
}

export const PassportHistoryTab: React.FC<PassportHistoryTabProps> = ({
  jointNumber,
  auditLogsForJoint,
}) => {
  return (
    <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 shadow-2xs">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 border-b border-slate-100 pb-2.5">
        <History className="w-4 h-4 text-[#1e3799]" />
        <span>
          История изменений паспорта стыка № {jointNumber} (записей:{' '}
          {auditLogsForJoint.length})
        </span>
      </div>
      {auditLogsForJoint.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">
          По данному стыку изменений после первичного ввода не зафиксировано.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
          {auditLogsForJoint.map((log) => (
            <div
              key={log.id}
              className="py-2 flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <span className="font-semibold text-slate-800">
                  {log.fieldLabel}:
                </span>{' '}
                <span className="line-through text-slate-400 font-mono">
                  {log.oldValue || '—'}
                </span>{' '}
                →{' '}
                <span className="font-mono font-semibold text-[#1e3799]">
                  {log.newValue || '—'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {log.userFullName} · {formatTimestampDDMMYY(log.timestamp)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
