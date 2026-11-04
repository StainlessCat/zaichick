import React, { useState, useEffect, useCallback, useRef } from 'react';

export interface UseResizableColumnsOptions {
  /** Уникальный ключ для сохранения ширин в localStorage */
  storageKey: string;
  /** Заводские значения ширин по умолчанию */
  defaultWidths?: Record<string, number>;
  /** Минимальная ширина столбца при перетаскивании (по умолчанию 60px) */
  minColumnWidth?: number;
}

export interface UseResizableColumnsReturn {
  /** Объект с текущими настроенными ширинами */
  columnWidths: Record<string, number>;
  /** Функция получения фактической ширины столбца с фоллбеком */
  getColumnWidth: (key: string, fallbackWidth?: number) => number;
  /** Начало перетаскивания границы столбца */
  handleResizeStart: (
    e: React.PointerEvent,
    colKey: string,
    currentWidth: number,
    minWidth?: number
  ) => void;
  /** Автоподбор ширины столбца (двойной клик) */
  handleAutoFit: (colKey: string, estimatedWidth?: number) => void;
  /** Сброс настроенных ширин к заводским значениям */
  handleResetWidths: () => void;
  /** Ручная установка ширины столбца */
  setColumnWidth: (colKey: string, width: number) => void;
  /** Ключ столбца, который перетаскивается прямо сейчас */
  activeResizingKey: string | null;
  /** Есть ли сохранённые кастомные ширины */
  hasCustomWidths: boolean;
}

/**
 * Универсальный хук для интерактивной регулировки ширины столбцов таблиц.
 * Поддерживает:
 * - Плавное перетаскивание мышью/тачем с защитой от вылета за пределы экрана
 * - Автоподбор ширины по двойному клику
 * - Персистентное сохранение ширин в localStorage
 * - Быстрый сброс к заводским значениям
 */
export function useResizableColumns({
  storageKey,
  defaultWidths = {},
  minColumnWidth = 60,
}: UseResizableColumnsOptions): UseResizableColumnsReturn {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {
      // Игнорируем ошибки парсинга localStorage
    }
    return {};
  });

  const [activeResizingKey, setActiveResizingKey] = useState<string | null>(null);

  const resizingStateRef = useRef<{
    colKey: string;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);

  // Сохранение в localStorage при изменении ширин
  useEffect(() => {
    try {
      if (Object.keys(columnWidths).length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(columnWidths));
      }
    } catch {
      // ignore
    }
  }, [columnWidths, storageKey]);

  // Слушатели перемещения и отпускания мыши на уровне window для надёжного drag-события
  useEffect(() => {
    if (!activeResizingKey) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!resizingStateRef.current) return;
      const { colKey, startX, startWidth, minWidth } = resizingStateRef.current;
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(minWidth, Math.round(startWidth + deltaX));

      setColumnWidths((prev) => {
        if (prev[colKey] === newWidth) return prev;
        return {
          ...prev,
          [colKey]: newWidth,
        };
      });
    };

    const handlePointerUp = () => {
      resizingStateRef.current = null;
      setActiveResizingKey(null);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };
  }, [activeResizingKey]);

  const getColumnWidth = useCallback(
    (key: string, fallbackWidth = 120): number => {
      return columnWidths[key] ?? defaultWidths[key] ?? fallbackWidth;
    },
    [columnWidths, defaultWidths]
  );

  const handleResizeStart = useCallback(
    (
      e: React.PointerEvent,
      colKey: string,
      currentWidth: number,
      minWidth?: number
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const minW = Math.max(minColumnWidth, minWidth ?? minColumnWidth);
      resizingStateRef.current = {
        colKey,
        startX: e.clientX,
        startWidth: currentWidth,
        minWidth: minW,
      };
      setActiveResizingKey(colKey);
    },
    [minColumnWidth]
  );

  const handleAutoFit = useCallback(
    (colKey: string, estimatedWidth?: number) => {
      const targetWidth = estimatedWidth ?? defaultWidths[colKey] ?? 120;
      setColumnWidths((prev) => ({
        ...prev,
        [colKey]: Math.max(minColumnWidth, targetWidth),
      }));
    },
    [defaultWidths, minColumnWidth]
  );

  const handleResetWidths = useCallback(() => {
    setColumnWidths({});
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  const setColumnWidth = useCallback((colKey: string, width: number) => {
    setColumnWidths((prev) => ({
      ...prev,
      [colKey]: width,
    }));
  }, []);

  return {
    columnWidths,
    getColumnWidth,
    handleResizeStart,
    handleAutoFit,
    handleResetWidths,
    setColumnWidth,
    activeResizingKey,
    hasCustomWidths: Object.keys(columnWidths).length > 0,
  };
}

export interface ColumnResizeHandleProps {
  onResizeStart: (
    e: React.PointerEvent,
    colKey: string,
    currentWidth: number,
    minWidth?: number
  ) => void;
  onAutoFit?: (colKey: string) => void;
  colKey: string;
  currentWidth: number;
  minWidth?: number;
  title?: string;
  className?: string;
}

/**
 * Визуальная ручка изменения ширины столбца в правом краю <th>.
 */
export const ColumnResizeHandle: React.FC<ColumnResizeHandleProps> = ({
  onResizeStart,
  onAutoFit,
  colKey,
  currentWidth,
  minWidth = 60,
  title = 'Потяните для изменения ширины. Двойной клик — автоподбор',
  className = '',
}) => {
  return (
    <div
      onPointerDown={(e) => onResizeStart(e, colKey, currentWidth, minWidth)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onAutoFit) onAutoFit(colKey);
      }}
      title={title}
      className={`absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize select-none z-10 hover:bg-sky-400/50 transition-colors ${className}`}
    />
  );
};
