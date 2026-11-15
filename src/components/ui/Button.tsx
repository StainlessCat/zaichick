import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const variantStyles = {
      primary: 'bg-[#1e3799] hover:bg-[#15276e] text-white border border-[#1e3799]',
      secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
      danger: 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-300',
      ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 border border-transparent',
    }[variant];

    const sizeStyles = {
      sm: 'h-6 text-[11px] px-2',
      md: 'h-8 text-xs px-3',
    }[size];

    return (
      <button
        ref={ref}
        className={`${sizeStyles} leading-none box-border py-0 rounded-md font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none shrink-0 ${variantStyles} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
