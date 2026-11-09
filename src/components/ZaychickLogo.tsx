import React from 'react';

interface ZaychickLogoProps {
  className?: string;
  size?: number;
  variant?: 'header' | 'card' | 'badge' | 'icon-only';
}

/**
 * Фирменный логотип системы «zaychick»:
 * Геометрический знак «Заяц — сварной стык трубопровода» и лаконичное имя «zaychick».
 */
export const ZaychickLogo: React.FC<ZaychickLogoProps> = ({
  className = '',
  size = 40,
  variant = 'header',
}) => {
  const isHeader = variant === 'header';
  const isIconOnly = variant === 'icon-only';

  const iconColor = isHeader ? '#ffffff' : '#005EB8';
  const textColor = isHeader ? 'text-white' : 'text-[#005EB8]';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Фирменный векторный знак */}
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 110"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ color: iconColor }}
        >
          {/* Левое ухо с легким наклоном и скругленным оголовком */}
          <line
            x1="38"
            y1="49"
            x2="33"
            y2="16"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />

          {/* Правое ухо с легким наклоном и скругленным оголовком */}
          <line
            x1="62"
            y1="49"
            x2="67"
            y2="16"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />

          {/* Внешний контур поперечного сечения трубы / сварного шва */}
          <circle
            cx="50"
            cy="72"
            r="26"
            stroke="currentColor"
            strokeWidth="9"
          />

          {/* Центральное кернение / ось стыка */}
          <circle
            cx="50"
            cy="72"
            r="6.5"
            fill="currentColor"
          />
        </svg>
      </div>

      {/* Текстовая часть логотипа (только имя zaychick) */}
      {!isIconOnly && (
        <span
          className={`font-sans font-bold text-2xl tracking-tight lowercase ${textColor}`}
          style={{ letterSpacing: '-0.03em' }}
        >
          zaychick
        </span>
      )}
    </div>
  );
};
