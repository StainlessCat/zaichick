import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', className = '', children, ...props }, ref) => {
    const variantStyles = {
      primary: 'bg-[#1e3799] hover:bg-[#15276e] text-white border-transparent',
      secondary: 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300',
      danger: 'bg-red-50 hover:bg-red-100 text-red-700 border-red-300',
      ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 border-transparent',
    }[variant];

    return (
      <button
        ref={ref}
        className={`h-8 text-xs leading-none box-border px-3 py-0 border rounded-md font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none ${variantStyles} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
