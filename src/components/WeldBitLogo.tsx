import React from 'react';

export type WeldBitVariantId =
  | 'heritage-bit'
  | 'v-bevel-w'
  | 'seam-bits'
  | 'diamond-spark';

export type WeldBitWordmarkMode = 'weldbit' | 'WeldBit' | 'zaychick';

export interface WeldBitVariantMeta {
  id: WeldBitVariantId;
  title: string;
  subtitle: string;
  recommended?: boolean;
}

export const WELDBIT_LOGO_VARIANTS: WeldBitVariantMeta[] = [
  {
    id: 'heritage-bit',
    title: 'Наследник · Стык и бит',
    subtitle: 'Точная геометрия знака zaychick с заменой кернения на цифровой квадратный бит.',
    recommended: true,
  },
  {
    id: 'v-bevel-w',
    title: 'V-фаска · W-монограмма',
    subtitle: 'Открытая разделка кромок образует литеру W и силуэт ушей над ядром бита.',
  },
  {
    id: 'seam-bits',
    title: 'Разрез шва · Искра бита',
    subtitle: 'Разомкнутое сечение трубы по оси стыка и цифровой импульс между электродами.',
  },
  {
    id: 'diamond-spark',
    title: 'Ось и искра · Монолит',
    subtitle: 'Цельное кольцо трубы и ромбовидный бит для максимальной чёткости в мелких иконках.',
  },
];

export interface WeldBitLogoProps {
  variantId?: WeldBitVariantId;
  wordmark?: WeldBitWordmarkMode;
  tone?: 'header' | 'light';
  size?: number;
  iconOnly?: boolean;
  className?: string;
}

const renderEmblemElements = (variantId: WeldBitVariantId, accentColor: string) => {
  switch (variantId) {
    case 'heritage-bit':
      return (
        <>
          <line
            x1="38"
            y1="49"
            x2="33"
            y2="16"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <line
            x1="62"
            y1="49"
            x2="67"
            y2="16"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle
            cx="50"
            cy="72"
            r="26"
            stroke="currentColor"
            strokeWidth="9"
          />
          <rect
            x="43"
            y="65"
            width="14"
            height="14"
            rx="3"
            fill={accentColor}
          />
        </>
      );

    case 'v-bevel-w':
      return (
        <>
          <path
            d="M 65 51 A 26 26 0 1 1 35 51"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M 30 18 L 35 51 L 50 61 L 65 51 L 70 18"
            stroke="currentColor"
            strokeWidth="8.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="44"
            y="72"
            width="12"
            height="12"
            rx="2.5"
            fill={accentColor}
          />
        </>
      );

    case 'seam-bits':
      return (
        <>
          <line
            x1="38"
            y1="49"
            x2="33"
            y2="16"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <line
            x1="62"
            y1="49"
            x2="67"
            y2="16"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M 41 47.6 A 26 26 0 0 0 41 96.4"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M 59 47.6 A 26 26 0 0 1 59 96.4"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <rect
            x="45.5"
            y="34"
            width="9"
            height="9"
            rx="2"
            fill={accentColor}
          />
          <rect
            x="43.5"
            y="65.5"
            width="13"
            height="13"
            rx="3"
            fill="currentColor"
          />
        </>
      );

    case 'diamond-spark':
      return (
        <>
          <line
            x1="38"
            y1="49"
            x2="34"
            y2="17"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <line
            x1="62"
            y1="49"
            x2="66"
            y2="17"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle
            cx="50"
            cy="72"
            r="26"
            stroke="currentColor"
            strokeWidth="9"
          />
          <rect
            x="43"
            y="65"
            width="14"
            height="14"
            rx="2.5"
            transform="rotate(45 50 72)"
            fill={accentColor}
          />
        </>
      );
  }
};

export const WeldBitLogo: React.FC<WeldBitLogoProps> = ({
  variantId = 'heritage-bit',
  wordmark = 'weldbit',
  tone = 'header',
  size = 34,
  iconOnly = false,
  className = '',
}) => {
  const isHeader = tone === 'header';
  const mainColor = isHeader ? '#ffffff' : '#005EB8';
  const bitAccentColor = isHeader ? '#93c5fd' : '#1e3799';
  const primaryTextClass = isHeader ? 'text-white' : 'text-[#005EB8]';
  const secondaryTextClass = isHeader ? 'text-sky-200' : 'text-[#1e3799]';

  const renderWordmark = () => {
    if (wordmark === 'zaychick') {
      return (
        <span
          className={`font-sans font-bold text-2xl tracking-tight lowercase leading-none ${primaryTextClass}`}
          style={{ letterSpacing: '-0.03em' }}
        >
          zaychick
        </span>
      );
    }

    const firstPart = wordmark === 'WeldBit' ? 'Weld' : 'weld';
    const secondPart = wordmark === 'WeldBit' ? 'Bit' : 'bit';

    return (
      <span
        className={`font-sans font-bold text-2xl tracking-tight leading-none ${primaryTextClass}`}
        style={{ letterSpacing: '-0.03em' }}
      >
        <span>{firstPart}</span>
        <span className={variantId === 'v-bevel-w' ? secondaryTextClass : ''}>
          {secondPart}
        </span>
      </span>
    );
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
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
          style={{ color: mainColor }}
        >
          {renderEmblemElements(variantId, bitAccentColor)}
        </svg>
      </div>
      {!iconOnly && renderWordmark()}
    </div>
  );
};

export function buildWeldBitSvgMarkup(
  variantId: WeldBitVariantId,
  wordmark: WeldBitWordmarkMode,
  tone: 'header' | 'light'
): string {
  const isHeader = tone === 'header';
  const mainColor = isHeader ? '#FFFFFF' : '#005EB8';
  const accentColor = isHeader ? '#93C5FD' : '#1E3799';
  const bgRect = isHeader
    ? `<rect width="340" height="120" rx="16" fill="#1E3799" />`
    : `<rect width="340" height="120" rx="16" fill="#FFFFFF" />`;

  let emblem = '';
  if (variantId === 'heritage-bit') {
    emblem = `
      <line x1="38" y1="49" x2="33" y2="16" stroke="${mainColor}" stroke-width="9" stroke-linecap="round" />
      <line x1="62" y1="49" x2="67" y2="16" stroke="${mainColor}" stroke-width="9" stroke-linecap="round" />
      <circle cx="50" cy="72" r="26" stroke="${mainColor}" stroke-width="9" />
      <rect x="43" y="65" width="14" height="14" rx="3" fill="${accentColor}" />
    `;
  } else if (variantId === 'v-bevel-w') {
    emblem = `
      <path d="M 65 51 A 26 26 0 1 1 35 51" stroke="${mainColor}" stroke-width="9" stroke-linecap="round" />
      <path d="M 30 18 L 35 51 L 50 61 L 65 51 L 70 18" stroke="${mainColor}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="44" y="72" width="12" height="12" rx="2.5" fill="${accentColor}" />
    `;
  } else if (variantId === 'seam-bits') {
    emblem = `
      <line x1="38" y1="49" x2="33" y2="16" stroke="${mainColor}" stroke-width="9" stroke-linecap="round" />
      <line x1="62" y1="49" x2="67" y2="16" stroke="${mainColor}" stroke-width="9" stroke-linecap="round" />
      <path d="M 41 47.6 A 26 26 0 0 0 41 96.4" stroke="${mainColor}" stroke-width="9" stroke-linecap="round" />
      <path d="M 59 47.6 A 26 26 0 0 1 59 96.4" stroke="${mainColor}" stroke-width="9" stroke-linecap="round" />
      <rect x="45.5" y="34" width="9" height="9" rx="2" fill="${accentColor}" />
      <rect x="43.5" y="65.5" width="13" height="13" rx="3" fill="${mainColor}" />
    `;
  } else {
    emblem = `
      <line x1="38" y1="49" x2="34" y2="17" stroke="${mainColor}" stroke-width="9" stroke-linecap="round" />
      <line x1="62" y1="49" x2="66" y2="17" stroke="${mainColor}" stroke-width="9" stroke-linecap="round" />
      <circle cx="50" cy="72" r="26" stroke="${mainColor}" stroke-width="9" />
      <rect x="43" y="65" width="14" height="14" rx="2.5" transform="rotate(45 50 72)" fill="${accentColor}" />
    `;
  }

  const textMarkup =
    wordmark === 'zaychick'
      ? `<text x="122" y="78" fill="${mainColor}" font-family="Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="44" font-weight="700" letter-spacing="-1.3">zaychick</text>`
      : variantId === 'v-bevel-w'
      ? `<text x="122" y="78" font-family="Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="44" font-weight="700" letter-spacing="-1.3"><tspan fill="${mainColor}">${wordmark === 'WeldBit' ? 'Weld' : 'weld'}</tspan><tspan fill="${accentColor}">${wordmark === 'WeldBit' ? 'Bit' : 'bit'}</tspan></text>`
      : `<text x="122" y="78" fill="${mainColor}" font-family="Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="44" font-weight="700" letter-spacing="-1.3">${wordmark}</text>`;

  return `<svg width="340" height="120" viewBox="0 0 340 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${bgRect}
  <g transform="translate(26 12) scale(0.84)">
    ${emblem}
  </g>
  ${textMarkup}
</svg>`;
}
