import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ColumnDefinition,
  ColumnTemplate,
  WeldJointFieldKey,
} from '../../types/welding';
import { ALL_COLUMNS, DEFAULT_COLUMN_KEYS } from '../../utils/weldingLogic';
import { INITIAL_COLUMN_TEMPLATES } from '../../data/seedData';

export const STORAGE_KEYS = {
  TEMPLATES: 'zaychick_column_templates_v2',
  ACTIVE_TPL: 'zaychick_active_template_id_v2',
  COLUMN_WIDTHS: 'zaychick_column_widths_v1',
};

export function useColumnsLayoutState() {
  // Шаблоны столбцов
  const [templates, setTemplates] = useState<ColumnTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((tpl: ColumnTemplate) => {
            const order: WeldJointFieldKey[] = Array.isArray(tpl.columnOrder)
              ? [...tpl.columnOrder]
              : [...DEFAULT_COLUMN_KEYS];
            const vis: WeldJointFieldKey[] = Array.isArray(tpl.visibleColumns)
              ? [...tpl.visibleColumns]
              : [...DEFAULT_COLUMN_KEYS];
            if (!order.includes('labRequestStatus')) {
              const stampIdx = order.indexOf('welderStamp');
              if (stampIdx !== -1) order.splice(stampIdx + 1, 0, 'labRequestStatus');
              else order.push('labRequestStatus');
            }
            if (!vis.includes('labRequestStatus')) {
              const stampVisIdx = vis.indexOf('welderStamp');
              if (stampVisIdx !== -1) vis.splice(stampVisIdx + 1, 0, 'labRequestStatus');
              else vis.push('labRequestStatus');
            }
            return { ...tpl, columnOrder: order, visibleColumns: vis };
          });
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_COLUMN_TEMPLATES;
  });

  const [activeTemplateId, setActiveTemplateId] = useState<string>('tpl-full-30');
  const [columnOrder, setColumnOrder] = useState<WeldJointFieldKey[]>([
    ...DEFAULT_COLUMN_KEYS,
  ]);
  const [visibleColumns, setVisibleColumns] = useState<WeldJointFieldKey[]>([
    ...DEFAULT_COLUMN_KEYS,
  ]);
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);

  // Пользовательские ширины столбцов
  const [columnWidths, setColumnWidths] = useState<
    Partial<Record<WeldJointFieldKey, number>>
  >(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.COLUMN_WIDTHS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  });

  const resizingRef = useRef<{
    colKey: WeldJointFieldKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  const [activeResizingKey, setActiveResizingKey] =
    useState<WeldJointFieldKey | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.COLUMN_WIDTHS,
        JSON.stringify(columnWidths)
      );
    } catch {
      // ignore
    }
  }, [columnWidths]);

  const handleResetColumnWidths = useCallback(() => {
    setColumnWidths({});
    try {
      localStorage.removeItem(STORAGE_KEYS.COLUMN_WIDTHS);
    } catch {
      // ignore
    }
  }, []);

  const handleColumnAutoFit = useCallback((colKey: WeldJointFieldKey) => {
    const colDef = ALL_COLUMNS.find((c) => c.key === colKey);
    if (!colDef) return;
    const label = colDef.shortLabel || colDef.label;
    const estimatedWidth = Math.max(
      colDef.minWidth,
      Math.min(450, label.length * 10 + 65)
    );
    setColumnWidths((prev) => ({
      ...prev,
      [colKey]: estimatedWidth,
    }));
  }, []);

  const handleColumnResizeStart = useCallback(
    (e: React.PointerEvent, colKey: WeldJointFieldKey, currentWidth: number) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = {
        colKey,
        startX: e.clientX,
        startWidth: currentWidth,
      };
      setActiveResizingKey(colKey);
    },
    []
  );

  useEffect(() => {
    if (!activeResizingKey) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!resizingRef.current) return;
      const { colKey, startX, startWidth } = resizingRef.current;
      const deltaX = e.clientX - startX;
      const colDef = ALL_COLUMNS.find((c) => c.key === colKey);
      const minW = Math.max(65, colDef?.minWidth ? Math.min(colDef.minWidth, 80) : 65);
      const newWidth = Math.max(minW, Math.round(startWidth + deltaX));
      setColumnWidths((prev) => ({
        ...prev,
        [colKey]: newWidth,
      }));
    };

    const onPointerUp = () => {
      resizingRef.current = null;
      setActiveResizingKey(null);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };
  }, [activeResizingKey]);

  // Сохранение шаблонов колонок (UI настройки)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
    } catch {
      // ignore
    }
  }, [templates]);

  const activeColumnDefs: ColumnDefinition[] = useMemo(() => {
    const colMap = new Map(ALL_COLUMNS.map((c) => [c.key, c]));
    return columnOrder
      .filter((k) => visibleColumns.includes(k))
      .map((k) => colMap.get(k))
      .filter(Boolean) as ColumnDefinition[];
  }, [columnOrder, visibleColumns]);

  return {
    templates,
    setTemplates,
    activeTemplateId,
    setActiveTemplateId,
    columnOrder,
    setColumnOrder,
    visibleColumns,
    setVisibleColumns,
    isColumnsModalOpen,
    setIsColumnsModalOpen,
    columnWidths,
    setColumnWidths,
    handleResetColumnWidths,
    handleColumnAutoFit,
    handleColumnResizeStart,
    activeColumnDefs,
  };
}
