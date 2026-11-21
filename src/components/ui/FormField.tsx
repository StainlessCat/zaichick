import React from 'react';

export interface FormFieldProps {
  label: React.ReactNode;
  labelAdornment?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  labelAdornment,
  children,
  className = '',
  title,
}) => {
  const resolvedTitle = title ?? (typeof label === 'string' ? label : undefined);
  return (
    <div className={`flex flex-col justify-start ${className}`}>
      <div className="flex items-center gap-1.5 h-4 leading-4 mb-1 min-w-0">
        <label
          title={resolvedTitle}
          className="min-w-0 truncate text-xs font-semibold text-slate-700 whitespace-nowrap select-none"
        >
          {label}
        </label>
        {labelAdornment && (
          <div className="shrink-0 inline-flex items-center">
            {labelAdornment}
          </div>
        )}
      </div>
      {children}
    </div>
  );
};
