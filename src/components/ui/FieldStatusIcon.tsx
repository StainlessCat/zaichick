import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export type FieldStatusVariant = 'ok' | 'warning' | 'error';
export type TooltipAlign = 'left' | 'center' | 'right';

export interface FieldStatusIconProps {
  status: FieldStatusVariant;
  message: string | string[];
  align?: TooltipAlign;
  ariaLabel?: string;
}

const TOOLTIP_POSITION_CLASSES: Record<TooltipAlign, string> = {
  left: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-0',
};

const CARET_POSITION_CLASSES: Record<TooltipAlign, string> = {
  left: 'left-1.5',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-1.5',
};

export const FieldStatusIcon: React.FC<FieldStatusIconProps> = ({
  status,
  message,
  align = 'center',
  ariaLabel,
}) => {
  const lines = (Array.isArray(message) ? message : [message]).filter(Boolean);
  if (lines.length === 0) return null;

  const resolvedAria = ariaLabel || lines.join('. ');

  return (
    <span className="relative inline-flex items-center justify-center shrink-0 group">
      <span
        tabIndex={0}
        role="img"
        aria-label={resolvedAria}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3799]/50"
      >
        {status === 'ok' ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        ) : status === 'warning' ? (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
        )}
      </span>

      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full mb-1.5 z-50 w-max max-w-[260px] rounded-lg bg-slate-900 text-white text-[11px] leading-snug font-normal px-2.5 py-1.5 shadow-lg border border-slate-700/70 whitespace-normal opacity-0 invisible translate-y-0.5 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 transition-all duration-150 ease-out ${TOOLTIP_POSITION_CLASSES[align]}`}
      >
        {lines.length === 1 ? (
          <span>{lines[0]}</span>
        ) : (
          <span className="flex flex-col gap-0.5">
            {lines.map((line, idx) => (
              <span key={idx}>{line}</span>
            ))}
          </span>
        )}
        <span
          aria-hidden="true"
          className={`absolute top-full -mt-1 w-2 h-2 bg-slate-900 border-r border-b border-slate-700/70 rotate-45 ${CARET_POSITION_CLASSES[align]}`}
        />
      </span>
    </span>
  );
};

export interface FieldActionIconProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  align?: TooltipAlign;
  ariaLabel?: string;
}

export const FieldActionIcon: React.FC<FieldActionIconProps> = ({
  icon,
  tooltip,
  onClick,
  align = 'right',
  ariaLabel,
}) => {
  return (
    <span className="relative inline-flex items-center justify-center shrink-0 group">
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || tooltip}
        className="inline-flex items-center justify-center w-4 h-4 rounded text-sky-700 hover:text-sky-900 hover:bg-sky-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3799]/50 transition-colors cursor-pointer"
      >
        {icon}
      </button>

      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full mb-1.5 z-50 w-max max-w-[240px] rounded-lg bg-slate-900 text-white text-[11px] leading-snug font-normal px-2.5 py-1.5 shadow-lg border border-slate-700/70 whitespace-normal opacity-0 invisible translate-y-0.5 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 transition-all duration-150 ease-out ${TOOLTIP_POSITION_CLASSES[align]}`}
      >
        <span>{tooltip}</span>
        <span
          aria-hidden="true"
          className={`absolute top-full -mt-1 w-2 h-2 bg-slate-900 border-r border-b border-slate-700/70 rotate-45 ${CARET_POSITION_CLASSES[align]}`}
        />
      </span>
    </span>
  );
};
