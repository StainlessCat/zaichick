import React from 'react';

export interface FormFieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  children,
  className = '',
  title,
}) => {
  const resolvedTitle = title ?? (typeof label === 'string' ? label : undefined);
  return (
    <div className={`flex flex-col justify-end ${className}`} title={resolvedTitle}>
      <label className="block h-4 leading-4 text-xs font-semibold text-slate-700 whitespace-nowrap truncate mb-1 select-none">
        {label}
      </label>
      {children}
    </div>
  );
};
