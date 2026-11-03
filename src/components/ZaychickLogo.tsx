import React from 'react';

interface ZaychickLogoProps {
  className?: string;
  size?: number;
  variant?: 'header' | 'card';
}

/**
 * Корпоративный логотип «ZAYCHICK»:
 * Минималистичный геометрический заяц в сварочном щитке с дуговой искрой на фоне фланца трубопровода.
 * Корпоративная палитра: #1e3799 (инженерный синий), #38bdf8 (голубая сварочная дуга), #ffffff (белый).
 */
export const ZaychickLogo: React.FC<ZaychickLogoProps> = ({
  className = '',
  size = 38,
  variant = 'header',
}) => {
  const isHeader = variant === 'header';

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <div
        className={`relative flex items-center justify-center rounded-lg shrink-0 ${
          isHeader
            ? 'bg-white/10 border border-sky-300/30 shadow-inner'
            : 'bg-[#1e3799] border border-[#1e3799] shadow-sm'
        }`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg
          width={size - 4}
          height={size - 4}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Внешнее кольцо сечения трубопровода со сварочным разделочным швом */}
          <circle
            cx="24"
            cy="26"
            r="17"
            stroke="#93c5fd"
            strokeWidth="1.5"
            strokeDasharray="5 3"
            opacity="0.55"
          />

          {/* Заднее ухо зайца (минималистичная геометрия) */}
          <path
            d="M17.5 20L12.5 6.5C12.1 5.3 13.4 4.3 14.4 5L22 14.5"
            stroke="#bae6fd"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Переднее ухо зайца */}
          <path
            d="M21.5 18.5L19.5 4.8C19.3 3.5 20.9 2.9 21.7 3.9L27.5 15.5"
            fill="#1e3799"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Голова и профиль минималистичного зайца */}
          <path
            d="M14 34C14 26.5 17.8 20.5 24.5 19.5L33 21.5C35.2 22 36.5 24 35.8 26.2L33.8 30.5C32.8 32.5 30.5 33.5 27.5 33.5H22L19.5 39H13.5L14 34Z"
            fill="#1e3799"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Сварочная маска-щиток (визор) на голове зайца */}
          <path
            d="M23.5 22.2L34.8 23.4L33.4 27.8L22.5 26.6Z"
            fill="#38bdf8"
            stroke="#ffffff"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />

          {/* Отражение сварочной дуги в визоре */}
          <path
            d="M25.5 24.2H31.5"
            stroke="#1e3799"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* Электрод / горелка РАД и яркая голубая искра сварки */}
          <path
            d="M39.5 25.5L35 28"
            stroke="#bae6fd"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Звезда-искра сварочной дуги */}
          <path
            d="M40.5 18.5L41.4 21.6L44.5 22.5L41.4 23.4L40.5 26.5L39.6 23.4L36.5 22.5L39.6 21.6L40.5 18.5Z"
            fill="#38bdf8"
          />
          <circle cx="40.5" cy="22.5" r="1.4" fill="#ffffff" />
        </svg>
      </div>

      <div className="flex flex-col leading-none">
        <span
          className={`font-display text-lg font-extrabold tracking-wider whitespace-nowrap ${
            isHeader ? 'text-white' : 'text-[#1e3799]'
          }`}
        >
          ZAYCHICK
        </span>
        <span
          className={`text-[11px] font-medium tracking-tight whitespace-nowrap mt-0.5 ${
            isHeader ? 'text-sky-200' : 'text-slate-500'
          }`}
        >
          Учёт сварки и НК трубопроводов
        </span>
      </div>
    </div>
  );
};
