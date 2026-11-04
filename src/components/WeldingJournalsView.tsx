import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Printer,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {
  FacilityObject,
  JournalStandard,
  LRVItem,
  ProjectLineItem,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import {
  formatDateDDMMYY,
  formatGost32569JournalRow,
  formatStoGazpromJournalRow,
  GOST_32569_2013_JOURNAL_COLUMNS,
  Gost32569ColumnKey,
  sortJointsChronologically,
  STO_GAZPROM_15_1_1_002_2023_COLUMNS,
  StoGazpromColumnKey,
  StoGazpromJournalColumnDef,
} from '../utils/weldingLogic';
import {
  exportWeldingJournalToExcel,
  triggerBlobDownload,
} from '../utils/excelUtils';
import { exportWeldingJournalToPdfA3 } from '../utils/pdfBookletGenerator';
import {
  applyTableColumnFiltersAndSort,
  TableColumnFilterHeader,
} from './TableColumnFilterPopover';
import { useResizableColumns } from '../utils/useResizableColumns';

interface WeldingJournalsViewProps {
  joints: WeldJoint[];
  allJoints?: WeldJoint[];
  lines?: ProjectLineItem[];
  facilities?: FacilityObject[];
  materials?: WeldingMaterialCertificate[];
  lrvCatalog?: LRVItem[];
  selectedObjectName: string;
  selectedRdCode?: string;
  onEditJoint: (joint: WeldJoint) => void;
  onSelectObjectName?: (name: string) => void;
  onSelectRdCode?: (rd: string) => void;
}

const STO_COL_MAP: Record<StoGazpromColumnKey, StoGazpromJournalColumnDef> =
  Object.fromEntries(
    STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => [c.key, c])
  ) as Record<StoGazpromColumnKey, StoGazpromJournalColumnDef>;

export const WeldingJournalsView: React.FC<WeldingJournalsViewProps> = ({
  joints,
  allJoints,
  lines = [],
  facilities = [],
  materials = [],
  lrvCatalog = [],
  selectedObjectName,
  selectedRdCode = 'ALL',
  onEditJoint,
  onSelectObjectName,
  onSelectRdCode,
}) => {
  // По умолчанию открываем форму по СТО Газпром 15-1.1-002-2023 (49 граф)
  const [standard, setStandard] = useState<JournalStandard>(
    'СТО Газпром 15-1.1-002-2023'
  );
  const [onlyWelded, setOnlyWelded] = useState<boolean>(true);
  const [tableSearch, setTableSearch] = useState<string>('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [actionToast, setActionToast] = useState<string>('');

  // 1. Состояние выбора объекта (синхронизируется с пропом selectedObjectName)
  const [currentObjectName, setCurrentObjectName] = useState<string>(
    selectedObjectName || 'ALL'
  );

  useEffect(() => {
    if (selectedObjectName) {
      setCurrentObjectName(selectedObjectName);
    }
  }, [selectedObjectName]);

  // Состояние и рефы выпадающего списка объекта
  const [isObjectOpen, setIsObjectOpen] = useState(false);
  const [objectSearch, setObjectSearch] = useState('');
  const [objectHighlightIndex, setObjectHighlightIndex] = useState(0);
  const objectTriggerRef = useRef<HTMLButtonElement>(null);
  const objectInputRef = useRef<HTMLInputElement>(null);
  const objectDropdownRef = useRef<HTMLDivElement>(null);

  // 2. Состояние выбора линии
  const [selectedLineKey, setSelectedLineKey] = useState<string>('ALL');

  // Состояние и рефы выпадающего списка линии
  const [isLineOpen, setIsLineOpen] = useState(false);
  const [lineDropdownSearch, setLineDropdownSearch] = useState('');
  const [lineHighlightIndex, setLineHighlightIndex] = useState(0);
  const lineTriggerRef = useRef<HTMLButtonElement>(null);
  const lineInputRef = useRef<HTMLInputElement>(null);
  const lineDropdownRef = useRef<HTMLDivElement>(null);

  // Переключение фокуса в поле поиска при открытии списка объектов
  useEffect(() => {
    if (isObjectOpen) {
      setObjectSearch('');
      setObjectHighlightIndex(0);
      const timer = setTimeout(() => {
        objectInputRef.current?.focus();
        objectInputRef.current?.select();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isObjectOpen]);

  // Переключение фокуса в поле поиска при открытии списка линий
  useEffect(() => {
    if (isLineOpen) {
      setLineDropdownSearch('');
      setLineHighlightIndex(0);
      const timer = setTimeout(() => {
        lineInputRef.current?.focus();
        lineInputRef.current?.select();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isLineOpen]);

  // Закрытие выпадающих списков при клике вне их области
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        isObjectOpen &&
        objectDropdownRef.current &&
        !objectDropdownRef.current.contains(target) &&
        !objectTriggerRef.current?.contains(target)
      ) {
        setIsObjectOpen(false);
      }
      if (
        isLineOpen &&
        lineDropdownRef.current &&
        !lineDropdownRef.current.contains(target) &&
        !lineTriggerRef.current?.contains(target)
      ) {
        setIsLineOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isObjectOpen, isLineOpen]);

  // Все доступные стыки (если передан allJoints, используем его, иначе joints)
  const effectiveAllJoints = useMemo(() => {
    return allJoints && allJoints.length > 0 ? allJoints : joints;
  }, [allJoints, joints]);

  // Список доступных линий с подсчётом стыков
  const availableLines = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        lineNumber: string;
        uniqueLineId: string;
        lineName: string;
        product: string;
        objectName: string;
        pipelineCategory: string;
        qualityLevel: string;
        jointsCount: number;
      }
    >();

    // Добавляем линии из реестра линий
    for (const pl of lines) {
      if (currentObjectName !== 'ALL' && pl.objectName !== currentObjectName) continue;
      const key = pl.uniqueLineId || pl.lineNumber;
      if (!key) continue;
      map.set(key, {
        id: pl.id || key,
        lineNumber: pl.lineNumber,
        uniqueLineId: pl.uniqueLineId || pl.lineNumber,
        lineName: pl.lineName || '',
        product: pl.product || '',
        objectName: pl.objectName,
        pipelineCategory: pl.pipelineCategory || '',
        qualityLevel: pl.qualityLevel || '',
        jointsCount: 0,
      });
    }

    // Стыки объекта для подсчёта и выявления линий, отсутствующих в лайн-листе
    const relevantJoints =
      currentObjectName !== 'ALL'
        ? effectiveAllJoints.filter((j) => j.objectName === currentObjectName)
        : effectiveAllJoints;

    for (const j of relevantJoints) {
      if (!j.lineNumber) continue;
      const key = j.uniqueLineId || j.lineNumber;
      const existing =
        map.get(key) ||
        (j.lineNumber ? map.get(j.lineNumber) : undefined) ||
        (j.uniqueLineId ? map.get(j.uniqueLineId) : undefined);
      if (existing) {
        existing.jointsCount += 1;
      } else {
        map.set(key, {
          id: key,
          lineNumber: j.lineNumber,
          uniqueLineId: j.uniqueLineId || j.lineNumber,
          lineName: '',
          product: '',
          objectName: j.objectName,
          pipelineCategory: '',
          qualityLevel: '',
          jointsCount: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.lineNumber.localeCompare(b.lineNumber, 'ru', { numeric: true })
    );
  }, [lines, currentObjectName, effectiveAllJoints]);

  // Выбранный объект линии
  const selectedLineItem = useMemo(() => {
    if (selectedLineKey === 'ALL') return null;
    return (
      availableLines.find(
        (l) =>
          l.id === selectedLineKey ||
          l.uniqueLineId === selectedLineKey ||
          l.lineNumber === selectedLineKey
      ) || null
    );
  }, [selectedLineKey, availableLines]);

  // Человекочитаемая метка выбранной линии
  const activeLineDisplayLabel = useMemo(() => {
    if (selectedLineKey === 'ALL') return 'Все линии';
    if (!selectedLineItem) return selectedLineKey;
    if (
      selectedLineItem.lineNumber &&
      selectedLineItem.uniqueLineId &&
      selectedLineItem.uniqueLineId !== selectedLineItem.lineNumber
    ) {
      return `${selectedLineItem.lineNumber} (${selectedLineItem.uniqueLineId})`;
    }
    return (
      selectedLineItem.lineNumber ||
      selectedLineItem.uniqueLineId ||
      selectedLineKey
    );
  }, [selectedLineItem, selectedLineKey]);

  // Обработчики выбора объекта и линии
  const handleSelectObject = (objName: string) => {
    setCurrentObjectName(objName);
    onSelectObjectName?.(objName);
    onSelectRdCode?.('ALL');
    setIsObjectOpen(false);
    objectTriggerRef.current?.focus();

    // Проверяем, принадлежит ли ранее выбранная линия новому объекту
    if (selectedLineKey !== 'ALL' && objName !== 'ALL') {
      const lineExistsInNewObj =
        lines.some(
          (l) =>
            l.objectName === objName &&
            (l.id === selectedLineKey ||
              l.uniqueLineId === selectedLineKey ||
              l.lineNumber === selectedLineKey)
        ) ||
        effectiveAllJoints.some(
          (j) =>
            j.objectName === objName &&
            (j.uniqueLineId === selectedLineKey || j.lineNumber === selectedLineKey)
        );
      if (!lineExistsInNewObj) {
        setSelectedLineKey('ALL');
      }
    }
  };

  const handleSelectLine = (lineKey: string) => {
    setSelectedLineKey(lineKey);
    setIsLineOpen(false);
    lineTriggerRef.current?.focus();
  };

  // Варианты выбора объекта для выпадающего списка
  const objectOptions = useMemo(() => {
    const allOption = {
      name: 'ALL',
      displayName: 'Все объекты (сводный)',
      shortName: 'Все',
      region: '',
      linesCount: lines.length,
      jointsCount: effectiveAllJoints.length,
    };

    const objMap = new Map<
      string,
      {
        name: string;
        displayName: string;
        shortName: string;
        region: string;
        linesCount: number;
        jointsCount: number;
      }
    >();

    for (const f of facilities) {
      if (!f.name || f.name === 'ALL') continue;
      objMap.set(f.name, {
        name: f.name,
        displayName: f.name,
        shortName: f.shortName || f.name,
        region: f.region || '',
        linesCount: 0,
        jointsCount: 0,
      });
    }

    for (const j of effectiveAllJoints) {
      if (!j.objectName) continue;
      const ex = objMap.get(j.objectName);
      if (ex) {
        ex.jointsCount += 1;
      } else {
        objMap.set(j.objectName, {
          name: j.objectName,
          displayName: j.objectName,
          shortName: j.objectName,
          region: '',
          linesCount: 0,
          jointsCount: 1,
        });
      }
    }

    for (const l of lines) {
      if (!l.objectName) continue;
      const ex = objMap.get(l.objectName);
      if (ex) {
        ex.linesCount += 1;
      }
    }

    const sorted = Array.from(objMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'ru', { numeric: true })
    );

    return [allOption, ...sorted];
  }, [facilities, lines, effectiveAllJoints]);

  const filteredObjectOptions = useMemo(() => {
    if (!objectSearch.trim()) return objectOptions;
    const q = objectSearch.trim().toLowerCase();
    return objectOptions.filter(
      (opt) =>
        opt.displayName.toLowerCase().includes(q) ||
        opt.shortName.toLowerCase().includes(q) ||
        opt.region.toLowerCase().includes(q)
    );
  }, [objectOptions, objectSearch]);

  // Варианты выбора линии для выпадающего списка
  const filteredLineOptions = useMemo(() => {
    const relevantJointsCount = (
      currentObjectName === 'ALL'
        ? effectiveAllJoints
        : effectiveAllJoints.filter((j) => j.objectName === currentObjectName)
    ).length;

    const allOption = {
      id: 'ALL',
      lineNumber: 'Все линии',
      uniqueLineId: '',
      lineName:
        currentObjectName === 'ALL'
          ? 'Сводный перечень по всем объектам'
          : `Все линии объекта «${currentObjectName}»`,
      product: '',
      objectName: currentObjectName,
      pipelineCategory: '',
      qualityLevel: '',
      jointsCount: relevantJointsCount,
    };

    const list = [allOption, ...availableLines];
    if (!lineDropdownSearch.trim()) return list;

    const q = lineDropdownSearch.trim().toLowerCase();
    return list.filter((l) => {
      if (l.id === 'ALL') return 'все линии'.includes(q);
      return (
        l.lineNumber.toLowerCase().includes(q) ||
        l.uniqueLineId.toLowerCase().includes(q) ||
        l.lineName.toLowerCase().includes(q) ||
        l.product.toLowerCase().includes(q) ||
        l.pipelineCategory.toLowerCase().includes(q)
      );
    });
  }, [availableLines, lineDropdownSearch, currentObjectName, effectiveAllJoints]);

  // Клавиатурная навигация в списке объектов (ArrowUp/Down, Enter, Escape)
  const handleObjectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsObjectOpen(false);
      objectTriggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setObjectHighlightIndex((prev) =>
        prev < filteredObjectOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setObjectHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : filteredObjectOptions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredObjectOptions[objectHighlightIndex];
      if (item) {
        handleSelectObject(item.name);
      }
    }
  };

  // Клавиатурная навигация в списке линий (ArrowUp/Down, Enter, Escape)
  const handleLineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsLineOpen(false);
      lineTriggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setLineHighlightIndex((prev) =>
        prev < filteredLineOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setLineHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : filteredLineOptions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredLineOptions[lineHighlightIndex];
      if (item) {
        handleSelectLine(item.id);
      }
    }
  };

  // Стыки с фильтрацией по выбранному объекту и выбранной линии
  const lineScopedJoints = useMemo(() => {
    let list =
      currentObjectName === 'ALL'
        ? effectiveAllJoints
        : effectiveAllJoints.filter((j) => j.objectName === currentObjectName);

    if (selectedLineKey !== 'ALL') {
      if (selectedLineItem) {
        list = list.filter((j) => {
          if (
            selectedLineItem.uniqueLineId &&
            j.uniqueLineId &&
            j.uniqueLineId === selectedLineItem.uniqueLineId
          ) {
            return true;
          }
          return j.lineNumber === selectedLineItem.lineNumber;
        });
      } else {
        list = list.filter(
          (j) =>
            j.uniqueLineId === selectedLineKey || j.lineNumber === selectedLineKey
        );
      }
    }

    return list;
  }, [effectiveAllJoints, currentObjectName, selectedLineKey, selectedLineItem]);

  // Регулирование ширины столбцов журнала по ГОСТ 32569-2013
  const {
    columnWidths: gostColumnWidths,
    getColumnWidth: getGostColWidth,
    handleResizeStart: handleGostResizeStart,
    handleAutoFit: handleGostAutoFit,
    handleResetWidths: handleResetGostWidths,
    hasCustomWidths: hasCustomGostWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_journal_gost',
    defaultWidths: Object.fromEntries(
      GOST_32569_2013_JOURNAL_COLUMNS.map((c) => [c.key, c.minWidth])
    ),
  });

  // Регулирование ширины столбцов журнала по СТО Газпром 15-1.1-002-2023
  const {
    columnWidths: stoColumnWidths,
    getColumnWidth: getStoColWidth,
    handleResizeStart: handleStoResizeStart,
    handleAutoFit: handleStoAutoFit,
    handleResetWidths: handleResetStoWidths,
    hasCustomWidths: hasCustomStoWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_journal_sto',
    defaultWidths: Object.fromEntries(
      STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => [c.key, c.minWidth])
    ),
  });

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(''), 4500);
  };

  const handleSwitchStandard = (nextStd: JournalStandard) => {
    setStandard(nextStd);
    setColumnFilters({});
    setSortConfig(null);
  };

  // Сортировка строго в хронологическом порядке по дате сварки
  const baseChronologicalJoints = useMemo(() => {
    const base = lineScopedJoints.filter((j) => {
      if (onlyWelded && !j.weldingDate) return false;
      if (tableSearch.trim()) {
        const q = tableSearch.trim().toLowerCase();
        return (
          j.lineNumber.toLowerCase().includes(q) ||
          j.jointNumber.toLowerCase().includes(q) ||
          j.welderStamp.toLowerCase().includes(q) ||
          j.welderFullName.toLowerCase().includes(q) ||
          (j.gostJointType || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
    return sortJointsChronologically(base);
  }, [lineScopedJoints, onlyWelded, tableSearch]);

  // Геттеры для всех 49 граф формы СТО Газпром 15-1.1-002-2023
  const stoGazpromGetters = useMemo<
    Record<StoGazpromColumnKey, (j: WeldJoint, idx: number) => string>
  >(() => {
    const map = {} as Record<
      StoGazpromColumnKey,
      (j: WeldJoint, idx: number) => string
    >;
    for (const col of STO_GAZPROM_15_1_1_002_2023_COLUMNS) {
      map[col.key] = (j: WeldJoint, idx: number) =>
        formatStoGazpromJournalRow(j, idx, lrvCatalog)[col.key];
    }
    return map;
  }, [lrvCatalog]);

  // Геттеры для всех 17 граф формы по ГОСТ 32569-2013
  const gost32569Getters = useMemo<
    Record<Gost32569ColumnKey, (j: WeldJoint, idx: number) => string>
  >(() => {
    const map = {} as Record<
      Gost32569ColumnKey,
      (j: WeldJoint, idx: number) => string
    >;
    for (const col of GOST_32569_2013_JOURNAL_COLUMNS) {
      map[col.key] = (j: WeldJoint, idx: number) =>
        formatGost32569JournalRow(j, idx, materials)[col.key];
    }
    return map;
  }, [materials]);

  const activeGetters =
    standard === 'ГОСТ 32569-2013' ? gost32569Getters : stoGazpromGetters;

  const chronologicalJoints = useMemo(
    () =>
      applyTableColumnFiltersAndSort(
        baseChronologicalJoints,
        columnFilters,
        activeGetters,
        sortConfig
      ),
    [baseChronologicalJoints, columnFilters, activeGetters, sortConfig]
  );

  const handleApplyFilter = (colKey: string, vals: string[] | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (vals === undefined) delete next[colKey];
      else next[colKey] = vals;
      return next;
    });
  };

  const handleSort = (colKey: string, direction: 'asc' | 'desc') => {
    setSortConfig({ key: colKey, direction });
  };

  const handleExportCsv = () => {
    const headers =
      standard === 'ГОСТ 32569-2013'
        ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => c.label)
        : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => c.fullLabel);

    const rows = chronologicalJoints.map((j, idx) => {
      if (standard === 'ГОСТ 32569-2013') {
        return formatGost32569JournalRow(j, idx, materials).cells;
      }
      return formatStoGazpromJournalRow(j, idx, lrvCatalog).cells;
    });

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) =>
          r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')
        )
        .join('\n');

    const lineSuffix =
      selectedLineKey !== 'ALL' && selectedLineItem
        ? `_Линия_${selectedLineItem.lineNumber.replace(/[\\/:*?"<>|]/g, '_')}`
        : '';
    const objSuffix =
      currentObjectName !== 'ALL'
        ? `_${currentObjectName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 25)}`
        : '';
    const fileName = `Журнал_сварки_${standard.replace(/\s+/g, '_')}${objSuffix}${lineSuffix}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, fileName);
    showToast(`Журнал (${chronologicalJoints.length} зап.) выгружен в файл «${fileName}».`);
  };

  const handleExportXlsx = () => {
    exportWeldingJournalToExcel(
      chronologicalJoints,
      standard,
      materials,
      lrvCatalog
    );
    showToast(
      `Книга Excel по форме «${standard}» (${chronologicalJoints.length} зап.) успешно сформирована и скачана.`
    );
  };

  const handlePrintOrExportPdfA3 = () => {
    const headers =
      standard === 'ГОСТ 32569-2013'
        ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => c.label)
        : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => c.label);
    const colNumbers =
      standard === 'ГОСТ 32569-2013'
        ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => String(c.colNumber))
        : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => String(c.colNumber));
    const rows = chronologicalJoints.map((j, idx) =>
      standard === 'ГОСТ 32569-2013'
        ? formatGost32569JournalRow(j, idx, materials).cells
        : formatStoGazpromJournalRow(j, idx, lrvCatalog).cells
    );

    const displayObjectName =
      (currentObjectName === 'ALL' ? 'Сводный реестр' : currentObjectName) +
      (selectedLineKey !== 'ALL' && selectedLineItem
        ? ` (Линия: ${selectedLineItem.lineNumber})`
        : '');

    exportWeldingJournalToPdfA3(
      standard,
      displayObjectName,
      selectedRdCode || 'ALL',
      headers,
      colNumbers,
      rows
    );
    try {
      window.print();
    } catch {
      // ignore sandbox print restrictions
    }
    showToast(
      `Сформирован широкоформатный лист печати А3 (PDF) для журнала «${standard}» (${chronologicalJoints.length} зап.).`
    );
  };

  const currentFormationDate = formatDateDDMMYY(
    new Date().toISOString().slice(0, 10)
  );

  const renderStoHeaderCell = (
    colKey: StoGazpromColumnKey,
    rowSpan?: number,
    extraClassName = ''
  ) => {
    const col = STO_COL_MAP[colKey];
    const width = getStoColWidth(col.key, col.minWidth);
    return (
      <TableColumnFilterHeader
        key={col.key}
        columnKey={col.key}
        label={col.label}
        title={col.fullLabel}
        rows={baseChronologicalJoints}
        getValue={stoGazpromGetters[col.key]}
        activeFilters={columnFilters}
        onApplyFilter={handleApplyFilter}
        sortConfig={sortConfig}
        onSort={handleSort}
        rowSpan={rowSpan}
        width={width}
        minWidth={col.minWidth}
        onResizeStart={handleStoResizeStart}
        onAutoFit={() => handleStoAutoFit(col.key, col.minWidth)}
        className={`align-middle text-[11px] ${extraClassName}`}
      />
    );
  };

  return (
    <div className="space-y-4 print-journal-container">
      {actionToast && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2 no-print shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{actionToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionToast('')}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Панель управления журналом (Блок 1) */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2.5 no-print">
        {/* Селекторы объекта и линии, и переключатель нормативной формы */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Выбор объекта (выпадающий список с переключением фокуса и поиском) */}
          <div className="relative">
            <button
              ref={objectTriggerRef}
              type="button"
              onClick={() => setIsObjectOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isObjectOpen}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer select-none ${
                currentObjectName !== 'ALL'
                  ? 'border-[#1e3799] bg-[#e8f1fc] text-[#1e3799] font-semibold shadow-2xs'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
              }`}
              title="Выбор объекта строительства для формирования журнала"
            >
              <Building2
                className={`w-4 h-4 shrink-0 ${
                  currentObjectName !== 'ALL' ? 'text-[#1e3799]' : 'text-slate-500'
                }`}
              />
              <span className="max-w-[150px] sm:max-w-[200px] truncate">
                {currentObjectName === 'ALL' ? 'Все объекты' : currentObjectName}
              </span>
              {currentObjectName !== 'ALL' && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectObject('ALL');
                  }}
                  className="hover:bg-[#1e3799]/15 rounded p-0.5 text-[#1e3799]"
                  title="Сбросить фильтр по объекту (показать все объекты)"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  isObjectOpen ? 'rotate-180 text-[#1e3799]' : ''
                }`}
              />
            </button>

            {isObjectOpen && (
              <div
                ref={objectDropdownRef}
                className="absolute left-0 top-full mt-1.5 z-40 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col"
                onKeyDown={handleObjectKeyDown}
              >
                <div className="p-2 border-b border-slate-100 bg-[#f8fafd] flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={objectInputRef}
                      type="text"
                      value={objectSearch}
                      onChange={(e) => {
                        setObjectSearch(e.target.value);
                        setObjectHighlightIndex(0);
                      }}
                      placeholder="Поиск объекта..."
                      className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
                    />
                    {objectSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setObjectSearch('');
                          objectInputRef.current?.focus();
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div
                  role="listbox"
                  className="max-h-64 overflow-y-auto p-1.5 space-y-0.5"
                >
                  {filteredObjectOptions.map((opt, idx) => {
                    const isSelected = currentObjectName === opt.name;
                    const isHighlighted = objectHighlightIndex === idx;
                    return (
                      <button
                        key={opt.name}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectObject(opt.name)}
                        onMouseEnter={() => setObjectHighlightIndex(idx)}
                        ref={(el) => {
                          if (isHighlighted && el) {
                            el.scrollIntoView({ block: 'nearest' });
                          }
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#e8f1fc] text-[#1e3799] font-semibold'
                            : isHighlighted
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">{opt.displayName}</span>
                            {opt.name === 'ALL' && (
                              <span className="text-[10px] px-1 py-0.2 rounded bg-slate-200/70 text-slate-600">
                                сводный
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{opt.linesCount} лин.</span>
                            <span>·</span>
                            <span>{opt.jointsCount} ст.</span>
                            {opt.region && (
                              <>
                                <span>·</span>
                                <span className="truncate">{opt.region}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-[#1e3799] shrink-0" />}
                      </button>
                    );
                  })}
                  {filteredObjectOptions.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-slate-400">
                      Объекты не найдены
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Выбор линии (выпадающий список с переключением фокуса и поиском) */}
          <div className="relative">
            <button
              ref={lineTriggerRef}
              type="button"
              onClick={() => setIsLineOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isLineOpen}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer select-none ${
                selectedLineKey !== 'ALL'
                  ? 'border-[#1e3799] bg-[#e8f1fc] text-[#1e3799] font-semibold shadow-2xs'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
              }`}
              title="Выбор линии технологического трубопровода"
            >
              <FolderKanban
                className={`w-4 h-4 shrink-0 ${
                  selectedLineKey !== 'ALL' ? 'text-[#1e3799]' : 'text-slate-500'
                }`}
              />
              <span className="max-w-[150px] sm:max-w-[200px] truncate">
                {selectedLineKey === 'ALL' ? 'Все линии' : activeLineDisplayLabel}
              </span>
              {selectedLineKey !== 'ALL' && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectLine('ALL');
                  }}
                  className="hover:bg-[#1e3799]/15 rounded p-0.5 text-[#1e3799]"
                  title="Сбросить фильтр по линии (показать все линии)"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  isLineOpen ? 'rotate-180 text-[#1e3799]' : ''
                }`}
              />
            </button>

            {isLineOpen && (
              <div
                ref={lineDropdownRef}
                className="absolute left-0 top-full mt-1.5 z-40 w-84 sm:w-[440px] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col"
                onKeyDown={handleLineKeyDown}
              >
                <div className="p-2 border-b border-slate-100 bg-[#f8fafd] flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={lineInputRef}
                      type="text"
                      value={lineDropdownSearch}
                      onChange={(e) => {
                        setLineDropdownSearch(e.target.value);
                        setLineHighlightIndex(0);
                      }}
                      placeholder="Поиск линии (номер, шифр, продукт, контур)..."
                      className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
                    />
                    {lineDropdownSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setLineDropdownSearch('');
                          lineInputRef.current?.focus();
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="px-3 py-1 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                  <span className="truncate">
                    {currentObjectName === 'ALL'
                      ? 'Все линии всех объектов'
                      : `Объект: ${currentObjectName}`}
                  </span>
                  <span className="font-mono text-slate-400 shrink-0">
                    Найдено: {filteredLineOptions.length}
                  </span>
                </div>

                <div
                  role="listbox"
                  className="max-h-72 overflow-y-auto p-1.5 space-y-0.5"
                >
                  {filteredLineOptions.map((opt, idx) => {
                    const isSelected = selectedLineKey === opt.id;
                    const isHighlighted = lineHighlightIndex === idx;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectLine(opt.id)}
                        onMouseEnter={() => setLineHighlightIndex(idx)}
                        ref={(el) => {
                          if (isHighlighted && el) {
                            el.scrollIntoView({ block: 'nearest' });
                          }
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#e8f1fc] text-[#1e3799] font-semibold'
                            : isHighlighted
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono font-bold text-slate-900">
                              {opt.lineNumber}
                            </span>
                            {opt.uniqueLineId && opt.uniqueLineId !== opt.lineNumber && (
                              <span className="font-mono text-[10px] text-slate-500 px-1 py-0.2 rounded bg-slate-100 truncate">
                                {opt.uniqueLineId}
                              </span>
                            )}
                            {opt.id === 'ALL' && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-600 font-sans">
                                все
                              </span>
                            )}
                          </div>
                          {(opt.lineName || opt.product || opt.jointsCount !== undefined) && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 truncate">
                              <span className="font-medium text-[#1e3799]">
                                {opt.jointsCount}{' '}
                                {opt.jointsCount === 1
                                  ? 'стык'
                                  : opt.jointsCount > 1 && opt.jointsCount < 5
                                  ? 'стыка'
                                  : 'стыков'}
                              </span>
                              {opt.lineName && (
                                <>
                                  <span>·</span>
                                  <span className="truncate">{opt.lineName}</span>
                                </>
                              )}
                              {opt.product && (
                                <>
                                  <span>·</span>
                                  <span className="text-slate-400 truncate">{opt.product}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-[#1e3799] shrink-0" />}
                      </button>
                    );
                  })}
                  {filteredLineOptions.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-slate-400">
                      Линии не найдены
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block mx-0.5" />

          {/* 3. Переключатель нормативной формы журнала */}
          <div
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
            role="group"
            aria-label="Выбор нормативной формы журнала"
          >
            <button
              type="button"
              onClick={() => handleSwitchStandard('СТО Газпром 15-1.1-002-2023')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                standard === 'СТО Газпром 15-1.1-002-2023'
                  ? 'bg-[#1e3799] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Форма СТО Газпром 15-1.1-002-2023 (49 граф)
            </button>
            <button
              type="button"
              onClick={() => handleSwitchStandard('ГОСТ 32569-2013')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                standard === 'ГОСТ 32569-2013'
                  ? 'bg-[#1e3799] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Форма ГОСТ 32569-2013 (17 граф)
            </button>
          </div>
        </div>

        {/* Экспорт и печать */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportXlsx}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Выгрузить (.XLSX)</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e3799]/30 bg-[#f0f5fc] text-[#1e3799] text-xs font-semibold hover:bg-sky-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>.CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrintOrExportPdfA3}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
            title="Скачать готовый PDF-лист формата А3 Альбомная и вызвать диалог печати"
          >
            <Printer className="w-4 h-4 text-[#1e3799]" />
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Печать / PDF (А3 Альбомная)</span>
          </button>
        </div>
      </div>

      {/* Полоса фильтрации и статуса хронологии (Блок 2) */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e3799] bg-[#e8f1fc] px-3 py-1.5 rounded-md border border-sky-200">
            <CalendarClock className="w-4 h-4" />
            <span>Хронологический порядок по дате сварки (ДД.ММ.ГГ)</span>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyWelded}
              onChange={(e) => setOnlyWelded(e.target.checked)}
              className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
            />
            <span>Только сваренные стыки</span>
          </label>
          {Object.keys(columnFilters).length > 0 && (
            <button
              type="button"
              onClick={() => setColumnFilters({})}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-50 border border-sky-200 text-xs font-semibold text-[#1e3799] hover:bg-sky-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                Сбросить фильтры столбцов ({Object.keys(columnFilters).length})
              </span>
            </button>
          )}
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Поиск по стыку, клейму..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3799] focus:bg-white"
          />
        </div>
      </div>

      {/* Официальный нормативный бланк выбранного журнала */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-[#f8fafd] border-b border-slate-200 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-[#1e3799] font-semibold">
              {standard === 'ГОСТ 32569-2013'
                ? 'ГОСТ 32569-2013 (Форма журнала сварочных работ — 17 нормативных граф)'
                : 'СТО Газпром 15-1.1-002-2023 (Форма журнала сварочных работ — 49 нормативных граф)'}
            </div>
            <h3 className="font-display text-sm font-bold text-slate-900 mt-0.5">
              {standard === 'ГОСТ 32569-2013'
                ? 'ЖУРНАЛ СВАРКИ ТЕХНОЛОГИЧЕСКИХ СТАЛЬНЫХ ТРУБОПРОВОДОВ (ПО ГОСТ 32569-2013)'
                : 'ЖУРНАЛ СВАРОЧНЫХ РАБОТ (ПО ФОРМЕ СТО ГАЗПРОМ 15-1.1-002-2023)'}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Объект:{' '}
                <span className="font-medium text-slate-900">
                  {currentObjectName === 'ALL' ? 'Сводный реестр (все объекты)' : currentObjectName}
                </span>
              </span>
              <span>·</span>
              <span>
                Линия:{' '}
                <span className="font-mono font-medium text-[#1e3799]">
                  {selectedLineKey === 'ALL' ? 'Все линии' : activeLineDisplayLabel}
                </span>
              </span>
              {selectedRdCode && selectedRdCode !== 'ALL' && (
                <>
                  <span>·</span>
                  <span>
                    Шифр РД: <span className="font-mono text-slate-900">{selectedRdCode}</span>
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono">
            <div>Записей в журнале: {chronologicalJoints.length}</div>
            <div>Дата формирования: {currentFormationDate}</div>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[380px] print-journal-scroll">
          {standard === 'ГОСТ 32569-2013' ? (
            <div>
              <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#1e3799] text-white text-left">
                  {GOST_32569_2013_JOURNAL_COLUMNS.map((col, idx) => {
                    const colWidth = getGostColWidth(col.key, col.minWidth);
                    return (
                      <TableColumnFilterHeader
                        key={col.key}
                        columnKey={col.key}
                        label={col.label}
                        rows={baseChronologicalJoints}
                        getValue={gost32569Getters[col.key]}
                        activeFilters={columnFilters}
                        onApplyFilter={handleApplyFilter}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        width={colWidth}
                        minWidth={col.minWidth}
                        onResizeStart={handleGostResizeStart}
                        onAutoFit={() => handleGostAutoFit(col.key, col.minWidth)}
                        className={
                          idx === GOST_32569_2013_JOURNAL_COLUMNS.length - 1
                            ? 'border-r-0'
                            : ''
                        }
                      />
                    );
                  })}
                </tr>
                {/* Нормативная строка нумерации граф 1..17 по форме ГОСТ 32569-2013 */}
                <tr className="bg-[#15276e] text-sky-100 text-center font-mono text-[11px] font-bold border-t border-white/15">
                  {GOST_32569_2013_JOURNAL_COLUMNS.map((col, idx) => {
                    const colWidth = getGostColWidth(col.key, col.minWidth);
                    return (
                      <th
                        key={col.key}
                        style={{ width: colWidth, minWidth: colWidth }}
                        className={`py-1 px-2 border-r border-white/15 ${
                          idx === GOST_32569_2013_JOURNAL_COLUMNS.length - 1
                            ? 'border-r-0'
                            : ''
                        }`}
                      >
                        {col.colNumber}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {chronologicalJoints.map((j, index) => {
                  const row = formatGost32569JournalRow(j, index, materials);
                  const gostType = j.gostJointType?.trim() || 'С17';
                  return (
                    <tr
                      key={j.id}
                      className="hover:bg-[#e8f1fc]/60 transition-colors odd:bg-white even:bg-slate-50/60 align-top"
                    >
                      {/* Графа 1: № п/п */}
                      <td
                        style={{
                          width: getGostColWidth('col1', 55),
                          minWidth: getGostColWidth('col1', 55),
                        }}
                        className="py-2.5 px-2.5 font-mono text-center text-slate-900 border-r border-slate-200"
                      >
                        {row.col1}
                      </td>

                      {/* Графа 2: Обозначение сварного соединения по исполнительному чертежу, тип сварного соединения ГОСТ 16037 */}
                      <td
                        style={{
                          width: getGostColWidth('col2', 150),
                          minWidth: getGostColWidth('col2', 150),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center text-slate-900 whitespace-nowrap"
                      >
                        <button
                          type="button"
                          onClick={() => onEditJoint(j)}
                          className="font-bold text-[#1e3799] hover:underline"
                          title="Открыть паспорт стыка"
                        >
                          {j.jointNumber}
                        </button>
                        , {gostType}
                      </td>

                      {/* Графа 3: Ф.И.О. сварщика, личное клеймо */}
                      <td
                        style={{
                          width: getGostColWidth('col3', 190),
                          minWidth: getGostColWidth('col3', 190),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-pre"
                      >
                        {row.col3}
                      </td>

                      {/* Графа 4: Марка стали (композиция марок сталей), НД, номера сертификатов */}
                      <td
                        style={{
                          width: getGostColWidth('col4', 210),
                          minWidth: getGostColWidth('col4', 210),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-pre"
                      >
                        {row.col4}
                      </td>

                      {/* Графа 5: Наружный диаметр элемента трубопровода и толщина стенки DнхS, мм */}
                      <td
                        style={{
                          width: getGostColWidth('col5', 120),
                          minWidth: getGostColWidth('col5', 120),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center text-slate-900 whitespace-nowrap"
                      >
                        {row.col5}
                      </td>

                      {/* Графа 6: Дата сварки, температурные условия в рабочей зоне, °С */}
                      <td
                        style={{
                          width: getGostColWidth('col6', 130),
                          minWidth: getGostColWidth('col6', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-slate-900 whitespace-nowrap"
                      >
                        {row.col6}
                      </td>

                      {/* Графа 7: Способ сварки */}
                      <td
                        style={{
                          width: getGostColWidth('col7', 100),
                          minWidth: getGostColWidth('col7', 100),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center text-slate-900 whitespace-nowrap"
                      >
                        {row.col7}
                      </td>

                      {/* Графа 8: Сварочные материалы (марка электрода, сварочной проволоки, защитный газ, флюс), НД, №№ сертификатов */}
                      <td
                        style={{
                          width: getGostColWidth('col8', 210),
                          minWidth: getGostColWidth('col8', 210),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-pre"
                      >
                        {row.col8}
                      </td>

                      {/* Графа 9: Режим предварительного и сопутствующего подогрева */}
                      <td
                        style={{
                          width: getGostColWidth('col9', 130),
                          minWidth: getGostColWidth('col9', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center text-slate-900 whitespace-nowrap"
                      >
                        {row.col9}
                      </td>

                      {/* Графа 10: Отметка о контроле корня шва */}
                      <td
                        style={{
                          width: getGostColWidth('col10', 120),
                          minWidth: getGostColWidth('col10', 120),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-nowrap"
                      >
                        {row.col10}
                      </td>

                      {/* Графа 11: Стилоскопирование металла шва, N заключения, дата */}
                      <td
                        style={{
                          width: getGostColWidth('col11', 130),
                          minWidth: getGostColWidth('col11', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900"
                      >
                        {row.col11}
                      </td>

                      {/* Графа 12: Ф.И.О. оператора термиста, личное клеймо */}
                      <td
                        style={{
                          width: getGostColWidth('col12', 120),
                          minWidth: getGostColWidth('col12', 120),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 text-center"
                      >
                        {row.col12}
                      </td>

                      {/* Графа 13: № диаграммы по журналу термообработки сварных соединений */}
                      <td
                        style={{
                          width: getGostColWidth('col13', 120),
                          minWidth: getGostColWidth('col13', 120),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-slate-900 text-center"
                      >
                        {row.col13}
                      </td>

                      {/* Графа 14: Твердость металла шва, N заключения, дата */}
                      <td
                        style={{
                          width: getGostColWidth('col14', 130),
                          minWidth: getGostColWidth('col14', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900"
                      >
                        {row.col14}
                      </td>

                      {/* Графа 15: Отметка о годности сварного соединения по внешнему осмотру и измерениям */}
                      <td
                        style={{
                          width: getGostColWidth('col15', 130),
                          minWidth: getGostColWidth('col15', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-nowrap"
                      >
                        {row.col15}
                      </td>

                      {/* Графа 16: Способ и результаты неразрушающего контроля сварного соединения, N заключения, дата */}
                      <td
                        style={{
                          width: getGostColWidth('col16', 150),
                          minWidth: getGostColWidth('col16', 150),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900"
                      >
                        {row.col16}
                      </td>

                      {/* Графа 17: Результаты измерения ферритной фазы в металле шва, N заключения, дата */}
                      <td
                        style={{
                          width: getGostColWidth('col17', 130),
                          minWidth: getGostColWidth('col17', 130),
                        }}
                        className="py-2.5 px-2.5 text-slate-900"
                      >
                        {row.col17}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div>
                  Записей в журнале:{' '}
                  <span className="font-mono font-bold text-slate-800">
                    {chronologicalJoints.length}
                  </span>
                </div>
                {hasCustomGostWidths && (
                  <button
                    type="button"
                    onClick={handleResetGostWidths}
                    title="Сбросить ширину столбцов журнала ГОСТ 32569-2013"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-400" />
                    <span>Сбросить ширину столбцов</span>
                  </button>
                )}
              </div>
              <div>
                Ширина столбцов регулируется перетаскиванием правой границы заголовка (двойной клик — автоподбор)
              </div>
            </div>
          </div>
        ) : (
            <div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* УРОВЕНЬ 1 ШАПКИ СТО ГАЗПРОМ 15-1.1-002-2023 (49 ГРАФ) */}
                  <tr className="bg-[#1e3799] text-white text-left">
                    {/* Графы 1..10 (rowSpan=3) */}
                    {renderStoHeaderCell('col1', 3)}
                    {renderStoHeaderCell('col2', 3)}
                    {renderStoHeaderCell('col3', 3)}
                    {renderStoHeaderCell('col4', 3)}
                    {renderStoHeaderCell('col5', 3)}
                    {renderStoHeaderCell('col6', 3)}
                    {renderStoHeaderCell('col7', 3)}
                    {renderStoHeaderCell('col8', 3)}
                    {renderStoHeaderCell('col9', 3)}
                    {renderStoHeaderCell('col10', 3)}

                    {/* Группа граф 11..14: Маркировка сварного соединения */}
                    <th
                      colSpan={4}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Маркировка сварного соединения
                    </th>

                    {/* Графы 15..18 (rowSpan=3) */}
                    {renderStoHeaderCell('col15', 3)}
                    {renderStoHeaderCell('col16', 3)}
                    {renderStoHeaderCell('col17', 3)}
                    {renderStoHeaderCell('col18', 3)}

                    {/* Группа граф 19..20: Соблюдение технологии */}
                    <th
                      colSpan={2}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Соблюдение технологии
                    </th>

                    {/* Группа граф 21..31: Приемка сварного соединения */}
                    <th
                      colSpan={11}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Приемка сварного соединения
                    </th>

                    {/* Группа граф 32..37: Сведения о проведении ремонта */}
                    <th
                      colSpan={6}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Сведения о проведении ремонта
                    </th>

                    {/* Группа граф 38..48: Приемка сварного соединения после ремонта */}
                    <th
                      colSpan={11}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Приемка сварного соединения после ремонта
                    </th>

                    {/* Графа 49: Примечание (rowSpan=3) */}
                    {renderStoHeaderCell('col49', 3, 'border-r-0')}
                  </tr>

                  {/* УРОВЕНЬ 2 ШАПКИ СТО ГАЗПРОМ 15-1.1-002-2023 */}
                  <tr className="bg-[#1e3799] text-white text-left">
                    {/* Графы 11..14 (rowSpan=2) */}
                    {renderStoHeaderCell('col11', 2)}
                    {renderStoHeaderCell('col12', 2)}
                    {renderStoHeaderCell('col13', 2)}
                    {renderStoHeaderCell('col14', 2)}

                    {/* Графы 19..20 (rowSpan=2) */}
                    {renderStoHeaderCell('col19', 2)}
                    {renderStoHeaderCell('col20', 2)}

                    {/* Подгруппы граф 21..31 (Приемка сварного соединения) */}
                    <th
                      colSpan={3}
                      className="px-2 py-1.5 text-center font-semibold text-[11px] border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля ВИК
                    </th>
                    <th
                      colSpan={4}
                      className="px-2 py-1.5 text-center font-semibold text-[10px] leading-snug border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)
                    </th>
                    <th
                      colSpan={4}
                      className="px-2 py-1.5 text-center font-semibold text-[10px] leading-snug border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)
                    </th>

                    {/* Графы 32..37 (rowSpan=2 — Сведения о проведении ремонта) */}
                    {renderStoHeaderCell('col32', 2)}
                    {renderStoHeaderCell('col33', 2)}
                    {renderStoHeaderCell('col34', 2)}
                    {renderStoHeaderCell('col35', 2)}
                    {renderStoHeaderCell('col36', 2)}
                    {renderStoHeaderCell('col37', 2)}

                    {/* Подгруппы граф 38..48 (Приемка сварного соединения после ремонта) */}
                    <th
                      colSpan={3}
                      className="px-2 py-1.5 text-center font-semibold text-[11px] border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля ВИК
                    </th>
                    <th
                      colSpan={4}
                      className="px-2 py-1.5 text-center font-semibold text-[10px] leading-snug border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)
                    </th>
                    <th
                      colSpan={4}
                      className="px-2 py-1.5 text-center font-semibold text-[10px] leading-snug border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)
                    </th>
                  </tr>

                  {/* УРОВЕНЬ 3 ШАПКИ СТО ГАЗПРОМ 15-1.1-002-2023 (листовые графы 21..31 и 38..48) */}
                  <tr className="bg-[#1e3799] text-white text-left">
                    {renderStoHeaderCell('col21')}
                    {renderStoHeaderCell('col22')}
                    {renderStoHeaderCell('col23')}
                    {renderStoHeaderCell('col24')}
                    {renderStoHeaderCell('col25')}
                    {renderStoHeaderCell('col26')}
                    {renderStoHeaderCell('col27')}
                    {renderStoHeaderCell('col28')}
                    {renderStoHeaderCell('col29')}
                    {renderStoHeaderCell('col30')}
                    {renderStoHeaderCell('col31')}

                    {renderStoHeaderCell('col38')}
                    {renderStoHeaderCell('col39')}
                    {renderStoHeaderCell('col40')}
                    {renderStoHeaderCell('col41')}
                    {renderStoHeaderCell('col42')}
                    {renderStoHeaderCell('col43')}
                    {renderStoHeaderCell('col44')}
                    {renderStoHeaderCell('col45')}
                    {renderStoHeaderCell('col46')}
                    {renderStoHeaderCell('col47')}
                    {renderStoHeaderCell('col48')}
                  </tr>

                  {/* НОРМАТИВНАЯ СТРОКА НУМЕРАЦИИ ГРАФ 1..49 ПО ФОРМЕ СТО ГАЗПРОМ 15-1.1-002-2023 */}
                  <tr className="bg-[#15276e] text-sky-100 text-center font-mono text-[11px] font-bold border-t border-white/15">
                    {STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((col, idx) => {
                      const colWidth = getStoColWidth(col.key, col.minWidth);
                      return (
                        <th
                          key={col.key}
                          style={{ width: colWidth, minWidth: colWidth }}
                          className={`py-1 px-2 border-r border-white/15 ${
                            idx === STO_GAZPROM_15_1_1_002_2023_COLUMNS.length - 1
                              ? 'border-r-0'
                              : ''
                          }`}
                        >
                          {col.colNumber}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {chronologicalJoints.map((j, index) => {
                    const row = formatStoGazpromJournalRow(j, index, lrvCatalog);
                    return (
                      <tr
                        key={j.id}
                        className="hover:bg-[#e8f1fc]/60 transition-colors odd:bg-white even:bg-slate-50/60 align-top"
                      >
                        {STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((col, cIdx) => {
                          const cellVal = row[col.key];
                          const colWidth = getStoColWidth(col.key, col.minWidth);
                          const isLast =
                            cIdx ===
                            STO_GAZPROM_15_1_1_002_2023_COLUMNS.length - 1;

                          // Графа 13: номер сварного соединения в километре (на схеме, чертеже, в подобъекте²) — кликабельная ссылка на паспорт стыка
                          if (col.key === 'col13') {
                            return (
                              <td
                                key={col.key}
                                style={{ width: colWidth, minWidth: colWidth }}
                                className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center whitespace-nowrap"
                              >
                                <button
                                  type="button"
                                  onClick={() => onEditJoint(j)}
                                  className="font-bold text-[#1e3799] hover:underline"
                                  title="Открыть паспорт стыка"
                                >
                                  {j.jointNumber}
                                </button>
                              </td>
                            );
                          }

                          // Графа 14: дополнительная маркировка сварного соединения ("Я" для углового сварного шва, "н/п" в остальных случаях)
                          if (col.key === 'col14') {
                            return (
                              <td
                                key={col.key}
                                style={{ width: colWidth, minWidth: colWidth }}
                                className="py-2.5 px-2.5 border-r border-slate-200 font-mono font-bold text-center text-slate-900 whitespace-nowrap"
                              >
                                {cellVal}
                              </td>
                            );
                          }

                          const isMultiline =
                            col.key === 'col4' ||
                            col.key === 'col5' ||
                            col.key === 'col6' ||
                            col.key === 'col8' ||
                            col.key === 'col9' ||
                            col.key === 'col10' ||
                            col.key === 'col17';

                          const isCentered =
                            col.colNumber <= 5 ||
                            col.colNumber === 7 ||
                            col.colNumber === 10 ||
                            (col.colNumber >= 11 && col.colNumber <= 15) ||
                            col.colNumber >= 20;

                          return (
                            <td
                              key={col.key}
                              style={{ width: colWidth, minWidth: colWidth }}
                              className={`py-2.5 px-2.5 text-slate-900 ${
                                isLast ? '' : 'border-r border-slate-200'
                              } ${isMultiline ? 'whitespace-pre' : 'whitespace-nowrap'} ${
                                isCentered ? 'text-center font-mono' : ''
                              }`}
                            >
                              {cellVal}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div>
                    Записей в журнале:{' '}
                    <span className="font-mono font-bold text-slate-800">
                      {chronologicalJoints.length}
                    </span>
                  </div>
                  {hasCustomStoWidths && (
                    <button
                      type="button"
                      onClick={handleResetStoWidths}
                      title="Сбросить ширину столбцов журнала СТО Газпром 15-1.1-002-2023"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-slate-400" />
                      <span>Сбросить ширину столбцов</span>
                    </button>
                  )}
                </div>
                <div>
                  ¹ Для разнотолщинных элементов указывается толщина стенки каждого свариваемого элемента · ² В графе 14 для угловых сварных швов (У2..У20 по ГОСТ 16037) указывается «Я», в остальных случаях — «н/п»
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

