import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type {
  JointValidationSummary,
  ValidationIssue,
} from '../../utils/dataIntegrityGuard';

export interface PassportValidationBannerProps {
  validationError: string | null;
  comprehensiveValidation: JointValidationSummary;
}

export const PassportValidationBanner: React.FC<PassportValidationBannerProps> = ({
  validationError,
  comprehensiveValidation,
}) => {
  return (
    <>
      {validationError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {comprehensiveValidation.allIssues.length > 0 && (
        <div
          className={`mb-4 p-3.5 rounded-xl border space-y-2 ${
            comprehensiveValidation.errors.length > 0
              ? 'bg-red-50/90 border-red-300 text-red-900'
              : 'bg-amber-50/90 border-amber-300 text-amber-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold">
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  comprehensiveValidation.errors.length > 0
                    ? 'text-red-600'
                    : 'text-amber-600'
                }`}
              />
              <span>
                Автоматический контроль качества данных паспорта (
                {comprehensiveValidation.errors.length > 0
                  ? `критических ошибок: ${comprehensiveValidation.errors.length}, предупреждений: ${comprehensiveValidation.warnings.length}`
                  : `предупреждений: ${comprehensiveValidation.warnings.length}`}
                )
              </span>
            </div>
            <span className="text-[10px] font-medium opacity-80">
              {comprehensiveValidation.errors.length > 0
                ? 'Исправьте критические ошибки перед сохранением'
                : 'Рекомендации технадзора (сохранение разрешено)'}
            </span>
          </div>
          <ul className="space-y-1 text-[11px] pl-5 list-disc">
            {comprehensiveValidation.allIssues.map((iss: ValidationIssue) => (
              <li
                key={iss.id}
                className={
                  iss.severity === 'error'
                    ? 'text-red-800 font-semibold'
                    : 'text-amber-900'
                }
              >
                <span className="font-bold">{iss.title}:</span> {iss.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};
