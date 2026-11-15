import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`h-8 text-xs leading-none box-border px-2.5 py-0 border border-slate-300 rounded-md bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1e3799] focus:border-[#1e3799] disabled:bg-slate-100 disabled:text-slate-400 ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
