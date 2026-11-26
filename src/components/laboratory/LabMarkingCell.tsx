import React, { useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import type { WeldJoint } from '../../types/welding';
import { buildJointLabMarking } from '../../utils/labMarking';

interface LabMarkingCellProps {
  joint: Pick<
    WeldJoint,
    'rdCode' | 'lineNumber' | 'diameterMm' | 'jointKind' | 'gostJointType' | 'weldingType' | 'jointNumber'
  >;
  compact?: boolean;
}

export const LabMarkingCell: React.FC<LabMarkingCellProps> = ({ joint, compact = false }) => {
  const [copied, setCopied] = useState(false);
  const res = buildJointLabMarking(joint);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!res.marking) return;
    try {
      void navigator.clipboard?.writeText(res.marking);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore clipboard errors in restricted contexts
    }
  };

  return (
    <div className="inline-flex items-center gap-1 max-w-full">
      <span
        className={`font-mono font-semibold truncate ${
          compact ? 'text-[11px]' : 'text-xs'
        } ${res.isComplete ? 'text-[#1e3799]' : 'text-amber-700'}`}
        title={
          res.isComplete
            ? `Маркировка стыка: ${res.marking}`
            : `Неполная маркировка (отсутствует: ${res.missingParts.join(', ')}): ${res.marking}`
        }
      >
        {res.marking}
      </span>

      {!res.isComplete && (
        <AlertTriangle
          className="w-3 h-3 text-amber-600 shrink-0"
          aria-label={`Неполная маркировка: ${res.missingParts.join(', ')}`}
        />
      )}

      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Скопировано' : 'Копировать маркировку стыка'}
        aria-label="Копировать маркировку стыка"
        className="p-0.5 rounded text-slate-400 hover:text-[#1e3799] hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-600" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
    </div>
  );
};
