import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownAZ,
  ArrowUp,
  ArrowUpAZ,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  FolderKanban,
  Info,
  Layers,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  FacilityObject,
  LineListColumnKey,
  ProjectLineItem,
  WeldJoint,
} from '../types/welding';
import {
  buildUniqueLineId,
  computeLineListItemStatus,
  formatDateDDMMYY,
  LINELIST_COLUMNS,
  LineListColumnDef,
  parseProjectLineListRecords,
} from '../utils/weldingLogic';
import {
  exportProjectLineListToExcel,
  readProjectLineListFromExcelFile,
} from '../utils/excelUtils';
import { useResizableColumns } from '../utils/useResizableColumns';

interface ProjectLineListViewProps {
  lineList: ProjectLineItem[];
  joints: WeldJoint[];
  facilities: FacilityObject[];
  selectedObjectName: string;
  selectedRdCode: string;
  onAddLineItems: (items: ProjectLineItem[]) => void;
  onUpdateLineItem: (
    updated: ProjectLineItem,
    previousItem?: ProjectLineItem,
    cascadeRename?: boolean
  ) => void;
  onBulkUpdateLineItems: (selectedIds: string[], patch: Partial<ProjectLineItem>) => void;
  onDeleteLineItems: (lineIds: string[]) => void;
  onDeleteObject: (objectName: string) => void;
  onDeleteRdCode: (rdCode: string) => void;
  onOpenLineInRegistry?: (uniqueLineId: string) => void;
  onOpenFacilityLocation?: (objectName: string) => void;
  canEdit?: boolean;
  currentUserRoleLabel?: string;
}

const DEMO_EXCEL_TSV = `Название объекта\tШифр РД\tНомер линии\tНаименование линии\tПродукт\tКонтур испытания\tНТД на сварку\tНТД на контроль\tУровень качества\tКатегория трубопровода\tРабочее давление\tТемпература\tПроцент контроля РК\tПроцент контроля УЗК\tПроцент контроля ПВК\tСтатус\tДата испытания
УКПГ-2В Бованенковское НГКМ\t0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3\tТХ-112/1\tЛиния перепуска газа регенерации на С-103\tПриродный газ\tКонтур ВД сепарации КВД-1\tСТО Газпром 15-1.1-002-2023\tСТО Газпром 15-1.3-004-2023\tУровень А\tI (В)\t12.5 МПа\t-40...+60 °C\t100%\t100%\t0%\tВсе стыки сварены и проконтролированы\t02.11.26
УКПГ-2В Бованенковское НГКМ\t0092.049.Р.13/1 0004 УКПГ.045.0077.002-TX1\tДРК-209/1\tТрубопровод аварийного сброса конденсата\tГазоконденсатная смесь\tКонтур дренажа конденсата КДК-1\tГОСТ 32569-2013\tГОСТ 32569-2013\tУровень В\tII (Б(а))\t6.4 МПа\t-45...+40 °C\t100%\t50%\t100%\tВ работе\t05.11.26`;

interface LineListExcelFilterPopoverProps {
  column: LineListColumnDef;
  uniqueValues: { value: string; count: number }[];
  selectedValues: string[] | undefined;
  onApplyFilter: (key: LineListColumnKey, values: string[] | undefined) => void;
  sortConfig: { key: LineListColumnKey; direction: 'asc' | 'desc' } | null;
  onSort: (key: LineListColumnKey, direction: 'asc' | 'desc') => void;
  onClose: () => void;
}

const LineListExcelFilterPopover: React.FC<LineListExcelFilterPopoverProps> = ({
  column,
  uniqueValues,
  selectedValues,
  onApplyFilter,
  sortConfig,
  onSort,
  onClose,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [searchText, setSearchText] = useState('');
  const allPossibleValues = useMemo(
    () => uniqueValues.map((u) => u.value),
    [uniqueValues]
  );

  const [checkedSet, setCheckedSet] = useState<Set<string>>(() => {
    if (!selectedValues) return new Set(allPossibleValues);
    return new Set(selectedValues);
  });

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  const formatOptionLabel = (val: string) => {
    if (val === '') return '(Пустые ячейки)';
    if (column.key === 'testDate') return formatDateDDMMYY(val) || val;
    if (
      column.key === 'rkPercent' ||
      column.key === 'uzkPercent' ||
      column.key === 'pvkPercent'
    ) {
      return `${val}%`;
    }
    return val;
  };

  const filteredOptions = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return uniqueValues;
    return uniqueValues.filter((item) => {
      const display = formatOptionLabel(item.value);
      return (
        display.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)
      );
    });
  }, [uniqueValues, searchText, column.key]);

  const areAllFilteredChecked =
    filteredOptions.length > 0 &&
    filteredOptions.every((opt) => checkedSet.has(opt.value));

  const toggleAllFiltered = () => {
    const next = new Set(checkedSet);
    if (areAllFilteredChecked) {
      for (const opt of filteredOptions) next.delete(opt.value);
    } else {
      for (const opt of filteredOptions) next.add(opt.value);
    }
    setCheckedSet(next);
  };

  const toggleSingleValue = (val: string) => {
    const next = new Set(checkedSet);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setCheckedSet(next);
  };

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchText.trim() !== '' && checkedSet.size === allPossibleValues.length) {
      onApplyFilter(
        column.key,
        filteredOptions.map((o) => o.value)
      );
      onClose();
      return;
    }
    if (checkedSet.size === allPossibleValues.length) {
      onApplyFilter(column.key, undefined);
    } else {
      onApplyFilter(column.key, Array.from(checkedSet));
    }
    onClose();
  };

  const isSortedAsc =
    sortConfig?.key === column.key && sortConfig?.direction === 'asc';
  const isSortedDesc =
    sortConfig?.key === column.key && sortConfig?.direction === 'desc';

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={`Фильтр столбца ${column.label}`}
      onClick={(e) => e.stopPropagation()}
      className="absolute left-0 top-full mt-1 w-72 bg-white text-slate-800 rounded-lg shadow-xl border border-slate-300 z-40 font-normal text-xs select-none"
    >
      <div className="flex items-center justify-between px-3 py-2 bg-[#f0f5fc] border-b border-slate-200 rounded-t-lg">
        <span className="font-semibold text-[#1e3799] truncate" title={column.label}>
          {column.label}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть фильтр"
          className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-1.5 border-b border-slate-200">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => {
              onSort(column.key, 'asc');
              onClose();
            }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-left transition-colors ${
              isSortedAsc
                ? 'bg-[#1e3799] text-white font-medium'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ArrowUpAZ className="w-3.5 h-3.5 shrink-0" />
            <span>По возрастанию</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onSort(column.key, 'desc');
              onClose();
            }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-left transition-colors ${
              isSortedDesc
                ? 'bg-[#1e3799] text-white font-medium'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ArrowDownAZ className="w-3.5 h-3.5 shrink-0" />
            <span>По убыванию</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleApply} className="p-2.5 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#1e3799] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            autoFocus
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Поиск (курсор активен)..."
            aria-label={`Поиск значений в столбце ${column.label}`}
            className="w-full pl-8 pr-7 py-1.5 bg-sky-50/60 border border-[#1e3799]/40 rounded text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1e3799] focus:bg-white"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="max-h-44 overflow-y-auto border border-slate-200 rounded bg-slate-50/50 divide-y divide-slate-100">
          <label className="flex items-center justify-between px-2.5 py-1.5 hover:bg-sky-50 cursor-pointer font-semibold text-slate-800 bg-white sticky top-0 z-10 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={areAllFilteredChecked}
                onChange={toggleAllFiltered}
                className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
              />
              <span>(Выделить все)</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {filteredOptions.length}
            </span>
          </label>

          {filteredOptions.length === 0 ? (
            <div className="p-3 text-center text-slate-400">
              Совпадений не найдено
            </div>
          ) : (
            filteredOptions.map((item) => {
              const checked = checkedSet.has(item.value);
              const label = formatOptionLabel(item.value);
              return (
                <label
                  key={item.value || '__empty__'}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 hover:bg-sky-50/80 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSingleValue(item.value)}
                      className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] shrink-0"
                    />
                    <span
                      className={`truncate ${
                        item.value === '' ? 'italic text-slate-400' : 'text-slate-700'
                      }`}
                      title={label}
                    >
                      {label}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {item.count}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onApplyFilter(column.key, undefined);
              onClose();
            }}
            className="px-2.5 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Сбросить
          </button>
          <button
            type="submit"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>ОК (Применить)</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export const ProjectLineListView: React.FC<ProjectLineListViewProps> = ({
  lineList,
  joints,
  facilities,
  selectedObjectName,
  selectedRdCode,
  onAddLineItems,
  onUpdateLineItem,
  onBulkUpdateLineItems,
  onDeleteLineItems,
  onDeleteObject,
  onDeleteRdCode,
  onOpenLineInRegistry,
  onOpenFacilityLocation,
  canEdit = true,
  currentUserRoleLabel = 'Инженер ПТО',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showStructureManager, setShowStructureManager] = useState(false);
  const [confirmDeleteLineId, setConfirmDeleteLineId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteObj, setConfirmDeleteObj] = useState<string | null>(null);
  const [confirmDeleteRd, setConfirmDeleteRd] = useState<string | null>(null);

  // Excel-фильтры по каждому из 17 столбцов лайнлиста и сортировка
  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<LineListColumnKey, string[]>>
  >({});
  const [openFilterColumnKey, setOpenFilterColumnKey] =
    useState<LineListColumnKey | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: LineListColumnKey;
    direction: 'asc' | 'desc';
  } | null>(null);

  // Выделенные строки лайнлиста для группового редактирования
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Модальное окно создания или редактирования одной строки лайнлиста
  const [rowModal, setRowModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    item: ProjectLineItem | null;
  }>({
    isOpen: false,
    mode: 'create',
    item: null,
  });

  // Состояние загрузки из Excel файла или буфера обмена
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [previewItems, setPreviewItems] = useState<ProjectLineItem[]>([]);
  const [pasteText, setPasteText] = useState<string>(DEMO_EXCEL_TSV);
  const [importError, setImportError] = useState<string>('');

  const defaultObj =
    selectedObjectName === 'ALL'
      ? facilities[0]?.name || 'УКПГ-2В Бованенковское НГКМ'
      : selectedObjectName;
  const defaultFacility =
    facilities.find((f) => f.name === defaultObj) || facilities[0];
  const defaultRd =
    selectedRdCode === 'ALL'
      ? defaultFacility?.rdCodes[0]?.code ||
        '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3'
      : selectedRdCode;

  // Локальная форма для модального окна создания/редактирования строки лайнлиста
  const [editForm, setEditForm] = useState<ProjectLineItem>({
    id: '',
    objectName: defaultObj,
    rdCode: defaultRd,
    lineNumber: '',
    uniqueLineId: '',
    lineName: '',
    product: 'Природный газ',
    testContour: defaultFacility?.rdCodes[0]?.contours[0] || 'Контур КИ-1',
    weldingNtd: 'СТО Газпром 15-1.1-002-2023',
    controlNtd: 'СТО Газпром 15-1.3-004-2023',
    qualityLevel: 'Уровень А',
    pipelineCategory: 'I (В)',
    workingPressure: '11.8 МПа',
    workingTemperature: '-40...+60 °C',
    rkPercent: 100,
    uzkPercent: 100,
    pvkPercent: 0,
    manualStatus: 'В работе',
    testDate: '2026-10-30',
  });

  // Состояние для группового редактирования строк лайнлиста
  const [bulkEnableObject, setBulkEnableObject] = useState(false);
  const [bulkObjectName, setBulkObjectName] = useState(defaultObj);
  const [bulkEnableRd, setBulkEnableRd] = useState(false);
  const [bulkRdCode, setBulkRdCode] = useState(defaultRd);
  const [bulkEnableProduct, setBulkEnableProduct] = useState(false);
  const [bulkProduct, setBulkProduct] = useState('Природный газ');
  const [bulkEnableContour, setBulkEnableContour] = useState(false);
  const [bulkTestContour, setBulkTestContour] = useState(
    defaultFacility?.rdCodes[0]?.contours[0] || 'Контур факельного сброса КФС-1'
  );
  const [bulkEnableNtd, setBulkEnableNtd] = useState(false);
  const [bulkWeldingNtd, setBulkWeldingNtd] = useState('СТО Газпром 15-1.1-002-2023');
  const [bulkControlNtd, setBulkControlNtd] = useState('СТО Газпром 15-1.3-004-2023');
  const [bulkEnableQuality, setBulkEnableQuality] = useState(true);
  const [bulkQualityLevel, setBulkQualityLevel] = useState('Уровень А');
  const [bulkEnableCategory, setBulkEnableCategory] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('I (В)');
  const [bulkEnableParams, setBulkEnableParams] = useState(false);
  const [bulkPressure, setBulkPressure] = useState('12.5 МПа');
  const [bulkTemperature, setBulkTemperature] = useState('-40...+60 °C');
  const [bulkEnableNdtPct, setBulkEnableNdtPct] = useState(false);
  const [bulkRkPct, setBulkRkPct] = useState(100);
  const [bulkUzkPct, setBulkUzkPct] = useState(100);
  const [bulkPvkPct, setBulkPvkPct] = useState(0);
  const [bulkEnableTestDate, setBulkEnableTestDate] = useState(false);
  const [bulkTestDate, setBulkTestDate] = useState('2026-11-05');

  const [isCustomObject, setIsCustomObject] = useState(false);
  const [isCustomRd, setIsCustomRd] = useState(false);

  // Настраиваемая курсором ширина столбцов лайнлиста с сохранением в localStorage
  const {
    columnWidths,
    getColumnWidth,
    handleResizeStart,
    handleAutoFit,
    handleResetWidths,
    hasCustomWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_linelist',
    defaultWidths: Object.fromEntries(
      LINELIST_COLUMNS.map((col) => [col.key, col.minWidth])
    ),
  });

  // Список всех доступных объектов (из facilities + из lineList)
  const availableObjectOptions = useMemo(() => {
    const fromFac = facilities.map((f) => f.name.trim()).filter(Boolean);
    const fromLines = lineList.map((l) => l.objectName.trim()).filter(Boolean);
    return Array.from(new Set([...fromFac, ...fromLines]));
  }, [facilities, lineList]);

  // Список доступных шифров РД для выбранного в форме объекта
  const rdsForCurrentObject = useMemo(() => {
    const curObj = editForm.objectName.trim();
    const fac = facilities.find((f) => f.name.trim() === curObj);
    const fromFac = fac ? fac.rdCodes.map((r) => r.code.trim()).filter(Boolean) : [];
    const fromLines = lineList
      .filter((l) => l.objectName.trim() === curObj)
      .map((l) => l.rdCode.trim())
      .filter(Boolean);
    return Array.from(new Set([...fromFac, ...fromLines]));
  }, [facilities, lineList, editForm.objectName]);

  // Список контуров испытания для выбранного объекта и шифра РД
  const contoursForCurrentRd = useMemo(() => {
    const curObj = editForm.objectName.trim();
    const curRd = editForm.rdCode.trim();
    const fac = facilities.find((f) => f.name.trim() === curObj);
    const rdMeta = fac?.rdCodes.find((r) => r.code.trim() === curRd);
    const fromMeta = rdMeta ? rdMeta.contours : [];
    const fromLines = lineList
      .filter((l) => l.rdCode.trim() === curRd && l.testContour)
      .map((l) => l.testContour.trim())
      .filter(Boolean);
    return Array.from(new Set([...fromMeta, ...fromLines]));
  }, [facilities, lineList, editForm.objectName, editForm.rdCode]);

  const handleSelectExistingObject = (newObj: string) => {
    const fac = facilities.find((f) => f.name === newObj);
    const rds = fac
      ? fac.rdCodes.map((r) => r.code)
      : lineList.filter((l) => l.objectName === newObj).map((l) => l.rdCode);
    const firstRd = rds[0] || '';
    const firstContour = fac?.rdCodes[0]?.contours[0] || 'Контур факельного сброса КФС-1';
    setEditForm((prev) => ({
      ...prev,
      objectName: newObj,
      rdCode: firstRd,
      uniqueLineId: buildUniqueLineId(firstRd, prev.lineNumber),
      testContour: firstContour,
    }));
    setIsCustomRd(false);
  };

  const handleSelectExistingRd = (newRd: string) => {
    const fac = facilities.find((f) => f.name === editForm.objectName);
    const rdMeta = fac?.rdCodes.find((r) => r.code === newRd);
    const firstContour = rdMeta?.contours[0] || editForm.testContour;
    setEditForm((prev) => ({
      ...prev,
      rdCode: newRd,
      uniqueLineId: buildUniqueLineId(newRd, prev.lineNumber),
      testContour: firstContour,
    }));
  };

  const openCreateLineModal = () => {
    const initObj = defaultObj || availableObjectOptions[0] || '';
    const fac = facilities.find((f) => f.name === initObj);
    const rds = fac
      ? fac.rdCodes.map((r) => r.code)
      : lineList.filter((l) => l.objectName === initObj).map((l) => l.rdCode);
    const initRd =
      defaultRd && defaultRd !== 'ALL'
        ? defaultRd
        : rds[0] || '';
    const initContour =
      fac?.rdCodes[0]?.contours[0] || 'Контур испытания КИ-1';

    setIsCustomObject(!initObj);
    setIsCustomRd(!initRd);
    setLineFormError('');

    setEditForm({
      id: `ll-man-${Date.now()}`,
      objectName: initObj,
      rdCode: initRd,
      lineNumber: '',
      uniqueLineId: '',
      lineName: '',
      product: 'Природный газ',
      testContour: initContour,
      weldingNtd: 'СТО Газпром 15-1.1-002-2023',
      controlNtd: 'СТО Газпром 15-1.3-004-2023',
      qualityLevel: 'Уровень А',
      pipelineCategory: 'I (В)',
      workingPressure: '11.8 МПа',
      workingTemperature: '-40...+60 °C',
      rkPercent: 100,
      uzkPercent: 100,
      pvkPercent: 0,
      manualStatus: 'В работе',
      testDate: '2026-10-30',
    });
    setRowModal({ isOpen: true, mode: 'create', item: null });
  };

  const [cascadeRename, setCascadeRename] = useState(true);
  const [lineFormError, setLineFormError] = useState('');

  const openEditLineModal = (item: ProjectLineItem) => {
    setLineFormError('');
    setEditForm({ ...item });
    setCascadeRename(true);
    const isKnownObj = availableObjectOptions.includes(item.objectName);
    setIsCustomObject(!isKnownObj);
    const knownRds = facilities
      .find((f) => f.name === item.objectName)
      ?.rdCodes.map((r) => r.code) || [];
    setIsCustomRd(!knownRds.includes(item.rdCode));
    setRowModal({ isOpen: true, mode: 'edit', item });
  };

  // Расчёт статуса готовности для каждой строки
  const scopedList = useMemo(() => {
    return lineList
      .filter((item) => {
        if (selectedObjectName !== 'ALL' && item.objectName !== selectedObjectName) {
          return false;
        }
        if (selectedRdCode !== 'ALL' && item.rdCode !== selectedRdCode) {
          return false;
        }
        return true;
      })
      .map((item) => ({
        item,
        status: computeLineListItemStatus(item, joints),
      }));
  }, [lineList, joints, selectedObjectName, selectedRdCode]);

  const getCellRawValue = (
    row: { item: ProjectLineItem; status: ReturnType<typeof computeLineListItemStatus> },
    colKey: LineListColumnKey
  ): string => {
    if (colKey === 'computedStatus') {
      return row.status.ndtStatusBadge;
    }
    return String(row.item[colKey] ?? '');
  };

  // Применение Excel-фильтров по столбцам и сортировки
  const filteredAndSortedList = useMemo(() => {
    const filtered = scopedList.filter((row) => {
      for (const [colKey, allowedValues] of Object.entries(columnFilters)) {
        if (!allowedValues) continue;
        const rawVal = getCellRawValue(row, colKey as LineListColumnKey);
        if (!allowedValues.includes(rawVal)) {
          return false;
        }
      }
      return true;
    });

    if (!sortConfig) return filtered;
    const { key, direction } = sortConfig;
    return [...filtered].sort((a, b) => {
      const valA = getCellRawValue(a, key);
      const valB = getCellRawValue(b, key);
      const cmp = valA.localeCompare(valB, 'ru', { numeric: true });
      return direction === 'asc' ? cmp : -cmp;
    });
  }, [scopedList, columnFilters, sortConfig]);

  const getUniqueValuesForColumn = (colKey: LineListColumnKey) => {
    const counts = new Map<string, number>();
    for (const row of scopedList) {
      const val = getCellRawValue(row, colKey);
      counts.set(val, (counts.get(val) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, 'ru', { numeric: true }));
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredAndSortedList.map((r) => r.item.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedLineIds.includes(id));

    if (allSelected) {
      setSelectedLineIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedLineIds(Array.from(new Set([...selectedLineIds, ...visibleIds])));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Обработка выбора реального файла Excel (.xlsx / .xls / .csv)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setUploadedFileName(file.name);
    try {
      const parsed = await readProjectLineListFromExcelFile(
        file,
        defaultObj,
        defaultRd
      );
      if (parsed.length === 0) {
        setImportError(
          'В выбранном файле не найдено строк с данными линий. Проверьте заголовки столбцов.'
        );
      }
      setPreviewItems(parsed);
    } catch {
      setImportError(
        'Ошибка чтения файла Excel. Убедитесь, что файл имеет формат .xlsx, .xls или .csv.'
      );
    }
    e.target.value = '';
  };

  // Парсинг скопированных из Excel строк (TSV / CSV)
  const handleParsePasteText = () => {
    setImportError('');
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setPreviewItems([]);
      return;
    }

    const splitRow = (line: string) =>
      line.includes('\t')
        ? line.split('\t').map((c) => c.trim())
        : line.split(';').map((c) => c.trim());

    const firstRowCols = splitRow(lines[0]);
    const hasHeader =
      firstRowCols.some((c) => c.toLowerCase().includes('линии')) ||
      firstRowCols.some((c) => c.toLowerCase().includes('шифр'));

    const headers = hasHeader
      ? firstRowCols
      : [
          'Название объекта',
          'Шифр РД',
          'Номер линии',
          'Наименование линии',
          'Продукт',
          'Контур испытания',
          'НТД на сварку',
          'НТД на контроль',
          'Уровень качества',
          'Категория трубопровода',
          'Рабочее давление',
          'Температура',
          'Процент контроля РК',
          'Процент контроля УЗК',
          'Процент контроля ПВК',
          'Статус',
          'Дата испытания',
        ];

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const records: Record<string, unknown>[] = dataLines.map((line) => {
      const cols = splitRow(line);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i] ?? '';
      });
      return obj;
    });

    const parsed = parseProjectLineListRecords(records, defaultObj, defaultRd);
    setUploadedFileName('Данные из буфера обмена Excel');
    setPreviewItems(parsed);
  };

  const handleConfirmImport = () => {
    if (previewItems.length === 0) return;
    onAddLineItems(previewItems);
    setPreviewItems([]);
    setUploadedFileName('');
    setShowImportPanel(false);
  };

  const handleSaveSingleRow = (e: React.FormEvent) => {
    e.preventDefault();
    setLineFormError('');
    const cleanLine = editForm.lineNumber.trim();
    if (!cleanLine) {
      setLineFormError('Укажите номер линии.');
      return;
    }

    const cleanRd = editForm.rdCode.trim() || defaultRd;
    const candidateUniqueId = buildUniqueLineId(cleanRd, cleanLine);

    const duplicateLine = lineList.find(
      (l) =>
        l.id !== editForm.id &&
        l.uniqueLineId.trim().toLowerCase() === candidateUniqueId.toLowerCase()
    );
    if (duplicateLine) {
      setLineFormError(
        `Линия «${cleanLine}» в шифре РД «${cleanRd}» уже существует в лайнлисте (${duplicateLine.lineName}). Дублирование запрещено.`
      );
      return;
    }

    const clampPct = (val: number) => Math.max(0, Math.min(100, Number.isFinite(val) ? val : 0));

    const finalItem: ProjectLineItem = {
      ...editForm,
      objectName: editForm.objectName.trim() || defaultObj,
      rdCode: cleanRd,
      lineNumber: cleanLine,
      uniqueLineId: candidateUniqueId,
      lineName: editForm.lineName.trim() || `Технологическая линия ${cleanLine}`,
      product: editForm.product.trim() || 'Природный газ',
      testContour: editForm.testContour.trim() || 'Контур КИ-1',
      weldingNtd: editForm.weldingNtd.trim() || 'СТО Газпром 15-1.1-002-2023',
      controlNtd: editForm.controlNtd.trim() || 'СТО Газпром 15-1.3-004-2023',
      qualityLevel: editForm.qualityLevel.trim(),
      pipelineCategory: editForm.pipelineCategory.trim(),
      workingPressure: editForm.workingPressure.trim() || '11.8 МПа',
      workingTemperature: editForm.workingTemperature.trim() || '-40...+60 °C',
      rkPercent: clampPct(Number(editForm.rkPercent)),
      uzkPercent: clampPct(Number(editForm.uzkPercent)),
      pvkPercent: clampPct(Number(editForm.pvkPercent)),
    };

    if (rowModal.mode === 'create') {
      onAddLineItems([finalItem]);
    } else {
      onUpdateLineItem(finalItem, rowModal.item || undefined, cascadeRename);
    }

    setRowModal({ isOpen: false, mode: 'create', item: null });
  };

  const handleApplyBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Partial<ProjectLineItem> = {};

    if (bulkEnableObject && bulkObjectName.trim()) {
      patch.objectName = bulkObjectName.trim();
    }
    if (bulkEnableRd && bulkRdCode.trim()) {
      patch.rdCode = bulkRdCode.trim();
    }
    if (bulkEnableProduct && bulkProduct.trim()) {
      patch.product = bulkProduct.trim();
    }
    if (bulkEnableContour && bulkTestContour.trim()) {
      patch.testContour = bulkTestContour.trim();
    }
    if (bulkEnableNtd) {
      patch.weldingNtd = bulkWeldingNtd.trim();
      patch.controlNtd = bulkControlNtd.trim();
    }
    if (bulkEnableQuality) {
      patch.qualityLevel = bulkQualityLevel.trim();
    }
    if (bulkEnableCategory) {
      patch.pipelineCategory = bulkCategory.trim();
    }
    if (bulkEnableParams) {
      patch.workingPressure = bulkPressure.trim();
      patch.workingTemperature = bulkTemperature.trim();
    }
    if (bulkEnableNdtPct) {
      patch.rkPercent = Number(bulkRkPct);
      patch.uzkPercent = Number(bulkUzkPct);
      patch.pvkPercent = Number(bulkPvkPct);
    }
    if (bulkEnableTestDate) {
      patch.testDate = bulkTestDate;
    }

    onBulkUpdateLineItems(selectedLineIds, patch);
    setSelectedLineIds([]);
    setIsBulkModalOpen(false);
  };

  const activeFilterKeys = Object.keys(columnFilters).filter(
    (k) => columnFilters[k as LineListColumnKey] !== undefined
  ) as LineListColumnKey[];

  const columnLabelMap = useMemo(
    () => Object.fromEntries(LINELIST_COLUMNS.map((c) => [c.key, c.label])),
    []
  );

  // Доступные уникальные значения в лайнлисте для подсказок datalist при редактировании лайнлиста
  const uniqueObjectNames = useMemo(
    () => Array.from(new Set(lineList.map((i) => i.objectName))),
    [lineList]
  );
  const uniqueRdCodes = useMemo(
    () => Array.from(new Set(lineList.map((i) => i.rdCode))),
    [lineList]
  );
  const uniqueContours = useMemo(
    () => Array.from(new Set(lineList.map((i) => i.testContour))),
    [lineList]
  );

  return (
    <div className="space-y-3">
      <datalist id="ll-objects-list">
        {uniqueObjectNames.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <datalist id="ll-rds-list">
        {uniqueRdCodes.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <datalist id="ll-contours-list">
        {uniqueContours.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Скрытый input для загрузки реального файла Excel (.xlsx, .xls, .csv) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Выбрать файл Excel для загрузки лайнлиста"
      />

      {!canEdit && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Ролевое ограничение (RBAC): Текущая роль — «{currentUserRoleLabel}». Редактирование вкладки «Проект (лайнлист)» доступно только роли «Инженер ПТО». Включён режим чтения (выгрузка в Excel и переход к стыкам доступны).
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-200/70 text-amber-900 font-mono text-[11px] shrink-0">
            Только чтение
          </span>
        </div>
      )}

      {/* Верхняя панель управления разделом «Проект (лайнлист)» */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 shadow-2xs flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-2 w-full justify-end">
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowStructureManager((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                showStructureManager
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              title="Удаление объектов строительства, шифров РД и линий"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Объекты / Шифры РД (Удаление)</span>
            </button>
          )}

          {canEdit && selectedLineIds.length > 0 && (
            !confirmBulkDelete ? (
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Удалить линии ({selectedLineIds.length})</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1 bg-red-50 border border-red-400 rounded-lg px-2.5 py-1">
                <span className="text-xs font-bold text-red-800">
                  Удалить {selectedLineIds.length} лин.?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteLineItems(selectedLineIds);
                    setSelectedLineIds([]);
                    setConfirmBulkDelete(false);
                  }}
                  className="px-2 py-1 rounded bg-red-600 text-white text-xs font-bold hover:bg-red-700"
                >
                  Да
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(false)}
                  className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Нет
                </button>
              </div>
            )
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                if (selectedLineIds.length === 0) {
                  setSelectedLineIds(filteredAndSortedList.map((r) => r.item.id));
                }
                setIsBulkModalOpen(true);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                selectedLineIds.length > 0
                  ? 'bg-[#e8f1fc] border-[#1e3799] text-[#1e3799] hover:bg-sky-100'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-4 h-4 text-[#1e3799]" />
              <span>
                Групповое ред.
                {selectedLineIds.length > 0 ? ` (${selectedLineIds.length})` : ''}
              </span>
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => setShowImportPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1e3799] text-[#1e3799] bg-sky-50/70 hover:bg-sky-100 text-xs font-semibold transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Загрузить из Excel (.xlsx / .csv)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              exportProjectLineListToExcel(
                filteredAndSortedList.map((r) => r.item),
                joints,
                false
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4 text-[#1e3799]" />
            <span>Выгрузить лайнлист (.xlsx)</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={openCreateLineModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить линию</span>
            </button>
          )}
        </div>
      </div>

      {/* Панель управления и удаления Объектов строительства и Шифров РД */}
      {showStructureManager && (
        <div className="bg-white rounded-xl border-2 border-red-200 p-4 shadow-sm space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-600" />
                <span>Управление объектами строительства и шифрами РД (Каскадное удаление)</span>
              </h3>
              <p className="text-slate-500 mt-0.5">
                При удалении объекта или шифра РД автоматически удаляются связанные с ним линии лайнлиста, позиции ЛРВ и сварные стыки (доступна отмена через Ctrl+Z).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowStructureManager(false)}
              className="px-2.5 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold"
            >
              Закрыть
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Список объектов */}
            <div className="space-y-2">
              <div className="font-bold text-[#1e3799]">
                Объекты строительства ({uniqueObjectNames.length}):
              </div>
              {uniqueObjectNames.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-50 text-slate-400">
                  Объекты отсутствуют
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {uniqueObjectNames.map((objName) => {
                    const linesCount = lineList.filter((l) => l.objectName === objName).length;
                    const jointsCount = joints.filter((j) => j.objectName === objName).length;
                    const isConfirming = confirmDeleteObj === objName;
                    return (
                      <div
                        key={objName}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50/70"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{objName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Линий: {linesCount} · Стыков: {jointsCount}
                          </div>
                        </div>
                        {!isConfirming ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteObj(objName)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 font-semibold shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Удалить объект</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteObject(objName);
                                setConfirmDeleteObj(null);
                              }}
                              className="px-2.5 py-1 rounded bg-red-600 text-white font-bold hover:bg-red-700"
                            >
                              Подтвердить
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteObj(null)}
                              className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 font-semibold"
                            >
                              Отмена
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Список шифров РД */}
            <div className="space-y-2">
              <div className="font-bold text-[#1e3799]">
                Шифры рабочей документации РД ({uniqueRdCodes.length}):
              </div>
              {uniqueRdCodes.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-50 text-slate-400">
                  Шифры РД отсутствуют
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {uniqueRdCodes.map((rd) => {
                    const parentObj =
                      lineList.find((l) => l.rdCode === rd)?.objectName || '—';
                    const linesCount = lineList.filter((l) => l.rdCode === rd).length;
                    const jointsCount = joints.filter((j) => j.rdCode === rd).length;
                    const isConfirming = confirmDeleteRd === rd;
                    return (
                      <div
                        key={rd}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50/70"
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-slate-900 truncate">
                            {rd}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {parentObj} · Линий: {linesCount} · Стыков: {jointsCount}
                          </div>
                        </div>
                        {!isConfirming ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteRd(rd)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 font-semibold shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Удалить РД</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteRdCode(rd);
                                setConfirmDeleteRd(null);
                              }}
                              className="px-2.5 py-1 rounded bg-red-600 text-white font-bold hover:bg-red-700"
                            >
                              Подтвердить
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRd(null)}
                              className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 font-semibold"
                            >
                              Отмена
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Индикатор активных Excel-фильтров или выделенных строк */}
      {(activeFilterKeys.length > 0 || selectedLineIds.length > 0) && (
        <div className="bg-[#e8f1fc] rounded-xl border border-sky-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {selectedLineIds.length > 0 && (
              <span className="font-bold text-[#1e3799]">
                Выделено строк лайнлиста: {selectedLineIds.length} шт.
              </span>
            )}
            {activeFilterKeys.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white border border-sky-300 text-[#1e3799] font-medium"
              >
                <Filter className="w-3 h-3" />
                <span>
                  {columnLabelMap[k]}: {columnFilters[k]?.length} знач.
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setColumnFilters((prev) => ({ ...prev, [k]: undefined }))
                  }
                  className="text-slate-400 hover:text-red-600 font-bold"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {selectedLineIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedLineIds([])}
                className="text-slate-600 hover:text-slate-900 underline font-medium"
              >
                Снять выделение
              </button>
            )}
            {activeFilterKeys.length > 0 && (
              <button
                type="button"
                onClick={() => setColumnFilters({})}
                className="inline-flex items-center gap-1 text-[#1e3799] hover:underline font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сбросить все фильтры</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Модуль загрузки данных из Excel файла с аналогичной структурой 17 полей */}
      {showImportPanel && (
        <div className="bg-white rounded-xl border-2 border-[#1e3799]/30 p-5 shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-[#1e3799] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span>
                  Загрузка данных лайнлиста из файла Excel (.xlsx, .xls, .csv) или буфера обмена
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Поддерживается прямая загрузка файла Excel с 17 столбцами: Название объекта, Шифр РД, Номер линии, Наименование линии, Продукт, Контур испытания, НТД на сварку, НТД на контроль, Уровень качества, Категория трубопровода, Рабочее давление, Температура, % РК, % УЗК, % ПВК, Статус, Дата испытания.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportProjectLineListToExcel([], joints, true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>Скачать шаблон Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowImportPanel(false)}
                className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1"
              >
                Закрыть
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="p-4 rounded-xl border-2 border-dashed border-[#1e3799]/35 bg-[#f4f8fe] flex flex-col items-center justify-center text-center gap-2">
                <FileSpreadsheet className="w-8 h-8 text-[#1e3799]" />
                <div className="text-xs font-semibold text-slate-800">
                  Выберите файл Excel (.xlsx, .xls, .csv) с проектной ведомостью линий
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e]"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Выбрать файл Excel с диска</span>
                  </button>
                </div>
                {uploadedFileName && (
                  <div className="text-xs font-semibold text-emerald-700 mt-1">
                    Источник: {uploadedFileName} (распознано линий: {previewItems.length})
                  </div>
                )}
                {importError && (
                  <div className="text-xs font-semibold text-red-600 mt-1">
                    {importError}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Или вставьте скопированные строки напрямую из листа Excel:
                  </label>
                  <button
                    type="button"
                    onClick={handleParsePasteText}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1e3799] hover:underline"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Распознать строки из поля</span>
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
              </div>
            </div>

            <div className="space-y-2 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Предпросмотр импортируемых линий ({previewItems.length} поз.)
                </span>
                {previewItems.length === 0 && (
                  <button
                    type="button"
                    onClick={handleParsePasteText}
                    className="text-xs font-semibold text-[#1e3799] hover:underline"
                  >
                    Загрузить демо-пример для проверки
                  </button>
                )}
              </div>

              <div className="flex-1 max-h-56 overflow-y-auto overflow-x-auto border border-slate-200 rounded-lg bg-slate-50 table-scroll-container">
                {previewItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Выберите файл .xlsx / .csv слева или нажмите «Распознать строки из поля» для предпросмотра.
                  </div>
                ) : (
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-[#1e3799] text-white">
                        <th className="py-1.5 px-2 text-left">Линия</th>
                        <th className="py-1.5 px-2 text-left">Наименование</th>
                        <th className="py-1.5 px-2 text-left">Ур. кач. / Кат.</th>
                        <th className="py-1.5 px-2 text-right">РК/УЗК/ПВК</th>
                        <th className="py-1.5 px-2 text-left">Испытание</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {previewItems.map((it) => (
                        <tr key={it.id}>
                          <td className="py-1.5 px-2 font-mono font-bold text-[#1e3799]">
                            {it.lineNumber}
                          </td>
                          <td className="py-1.5 px-2 truncate max-w-[150px]">
                            {it.lineName}
                          </td>
                          <td className="py-1.5 px-2 font-mono">
                            {it.qualityLevel} · {it.pipelineCategory}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">
                            {it.rkPercent}/{it.uzkPercent}/{it.pvkPercent}%
                          </td>
                          <td className="py-1.5 px-2 font-mono">
                            {formatDateDDMMYY(it.testDate) || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={previewItems.length === 0}
                  onClick={handleConfirmImport}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Импортировать в Проект (лайнлист) ({previewItems.length} шт.)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Таблица «Проект (лайнлист)» со всеми 17 полями, Excel-фильтрами и шапкой #1e3799 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto min-h-[420px] max-h-[calc(100vh-250px)] table-scroll-container">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr className="bg-[#1e3799] text-white select-none">
                {/* Чекбокс выбора всех строк лайнлиста */}
                <th className="py-2.5 px-2.5 border-r border-white/15 w-9 text-center sticky left-0 top-0 z-30 bg-[#1e3799]">
                  <input
                    type="checkbox"
                    aria-label="Выбрать все линии в таблице"
                    checked={
                      filteredAndSortedList.length > 0 &&
                      filteredAndSortedList.every((r) =>
                        selectedLineIds.includes(r.item.id)
                      )
                    }
                    onChange={toggleSelectAllVisible}
                    className="rounded border-white/40 text-sky-400 focus:ring-sky-300 cursor-pointer"
                  />
                </th>

                {LINELIST_COLUMNS.map((col) => {
                  const isFiltered = columnFilters[col.key] !== undefined;
                  const isSorted = sortConfig?.key === col.key;
                  const isFilterOpen = openFilterColumnKey === col.key;
                  const colWidth = getColumnWidth(col.key, col.minWidth);

                  return (
                    <th
                      key={col.key}
                      style={{ width: colWidth, minWidth: colWidth }}
                      className={`relative py-2.5 px-2.5 border-r border-white/15 text-left font-semibold align-middle transition-colors ${
                        isFiltered || isFilterOpen
                          ? 'bg-[#15276e]'
                          : 'bg-[#1e3799] hover:bg-[#192f85]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 pr-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setSortConfig((prev) =>
                              prev?.key === col.key && prev.direction === 'asc'
                                ? { key: col.key, direction: 'desc' }
                                : { key: col.key, direction: 'asc' }
                            )
                          }
                          className="text-left font-semibold text-white hover:text-sky-200 truncate flex items-center gap-1 min-w-0 cursor-pointer"
                          title={`Сортировать по столбцу «${col.label}»`}
                        >
                          <span className="truncate">{col.shortLabel || col.label}</span>
                          {isSorted &&
                            (sortConfig.direction === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-sky-300 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-sky-300 shrink-0" />
                            ))}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenFilterColumnKey((prev) =>
                              prev === col.key ? null : col.key
                            );
                          }}
                          aria-label={`Фильтр Excel для столбца ${col.label}`}
                          title="Фильтр как в Excel (автофокус курсора)"
                          className={`p-1 rounded transition-colors shrink-0 ${
                            isFiltered
                              ? 'bg-sky-400 text-[#1e3799] font-bold'
                              : 'text-sky-200 hover:bg-white/15 hover:text-white'
                          }`}
                        >
                          <Filter className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Интерактивная ручка изменения ширины столбца */}
                      <div
                        onPointerDown={(e) =>
                          handleResizeStart(e, col.key, colWidth, col.minWidth)
                        }
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleAutoFit(
                            col.key,
                            Math.max(col.minWidth, (col.shortLabel || col.label).length * 10 + 65)
                          );
                        }}
                        title="Потяните для изменения ширины. Двойной клик — автоподбор"
                        className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize select-none z-10"
                      />

                      {isFilterOpen && (
                        <LineListExcelFilterPopover
                          column={col}
                          uniqueValues={getUniqueValuesForColumn(col.key)}
                          selectedValues={columnFilters[col.key]}
                          onApplyFilter={(k, vals) =>
                            setColumnFilters((prev) => ({ ...prev, [k]: vals }))
                          }
                          sortConfig={sortConfig}
                          onSort={(k, dir) => setSortConfig({ key: k, direction: dir })}
                          onClose={() => setOpenFilterColumnKey(null)}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAndSortedList.length === 0 ? (
                <tr>
                  <td
                    colSpan={LINELIST_COLUMNS.length + 1}
                    className="py-10 text-center text-slate-400"
                  >
                    Линии по заданным условиям фильтрации не найдены
                  </td>
                </tr>
              ) : (
                filteredAndSortedList.map(({ item, status }) => {
                  const isSelected = selectedLineIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      onDoubleClick={() => {
                        if (canEdit) openEditLineModal(item);
                      }}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-[#e8f1fc]'
                          : 'odd:bg-white even:bg-slate-50/70 hover:bg-sky-50/60'
                      }`}
                    >
                      <td className="py-2.5 px-2.5 border-r border-slate-200 text-center sticky left-0 z-10 bg-inherit">
                        <input
                          type="checkbox"
                          aria-label={`Выбрать линию ${item.uniqueLineId}`}
                          checked={isSelected}
                          onChange={() => toggleSelectRow(item.id)}
                          disabled={!canEdit}
                          className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] cursor-pointer disabled:opacity-40"
                        />
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('objectName'),
                          minWidth: getColumnWidth('objectName'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-medium text-slate-800"
                      >
                        {onOpenFacilityLocation && canEdit ? (
                          <button
                            type="button"
                            onClick={() => onOpenFacilityLocation(item.objectName)}
                            title="Нажмите на объект, чтобы выбрать или изменить его географическое местоположение (координаты метеопоста)"
                            className="inline-flex items-center gap-1 text-left text-slate-800 hover:text-[#1e3799] hover:underline transition-colors cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
                            <span>{item.objectName}</span>
                          </button>
                        ) : (
                          item.objectName
                        )}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('rdCode'),
                          minWidth: getColumnWidth('rdCode'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-[11px] text-slate-700"
                      >
                        {item.rdCode}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('lineNumber'),
                          minWidth: getColumnWidth('lineNumber'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono font-bold text-[#1e3799] whitespace-nowrap"
                      >
                        <div className="flex items-center justify-between gap-1">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => openEditLineModal(item)}
                              aria-label={`Редактировать линию ${item.uniqueLineId}`}
                              title="Нажмите для редактирования строки лайнлиста"
                              className="text-left hover:underline cursor-pointer flex items-center gap-1 text-[#1e3799]"
                            >
                              <div>
                                <div className="flex items-center gap-1">
                                  <span>{item.lineNumber}</span>
                                  <Edit3 className="w-3 h-3 text-slate-400" />
                                </div>
                                <div className="text-[10px] font-normal text-slate-400">
                                  {item.uniqueLineId}
                                </div>
                              </div>
                            </button>
                          ) : (
                            <div>
                              <div className="flex items-center gap-1">
                                <span>{item.lineNumber}</span>
                              </div>
                              <div className="text-[10px] font-normal text-slate-400">
                                {item.uniqueLineId}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-0.5">
                            {onOpenLineInRegistry && (
                              <button
                                type="button"
                                onClick={() => onOpenLineInRegistry(item.uniqueLineId)}
                                aria-label={`Открыть стыки линии ${item.uniqueLineId} в реестре`}
                                title={`Перейти к стыкам линии ${item.uniqueLineId} в реестре`}
                                className="p-1 rounded hover:bg-sky-100 text-slate-400 hover:text-[#1e3799]"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canEdit &&
                              (confirmDeleteLineId !== item.id ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteLineId(item.id);
                                  }}
                                  aria-label={`Удалить линию ${item.lineNumber}`}
                                  title={`Удалить линию ${item.lineNumber}`}
                                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteLineItems([item.id]);
                                      setConfirmDeleteLineId(null);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700"
                                  >
                                    Удалить
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteLineId(null);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-slate-600 text-[10px]"
                                  >
                                    Отмена
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('lineName'),
                          minWidth: getColumnWidth('lineName'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 font-medium"
                      >
                        {item.lineName}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('product'),
                          minWidth: getColumnWidth('product'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
                      >
                        {item.product}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('testContour'),
                          minWidth: getColumnWidth('testContour'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
                      >
                        {item.testContour}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('weldingNtd'),
                          minWidth: getColumnWidth('weldingNtd'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
                      >
                        {item.weldingNtd}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('controlNtd'),
                          minWidth: getColumnWidth('controlNtd'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
                      >
                        {item.controlNtd}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('qualityLevel'),
                          minWidth: getColumnWidth('qualityLevel'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-center font-semibold text-[#1e3799] whitespace-nowrap"
                      >
                        {item.qualityLevel || (
                          <span className="text-slate-300 font-normal">—</span>
                        )}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('pipelineCategory'),
                          minWidth: getColumnWidth('pipelineCategory'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-center font-mono font-semibold text-slate-800"
                      >
                        {item.pipelineCategory || (
                          <span className="text-slate-300 font-normal">—</span>
                        )}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('workingPressure'),
                          minWidth: getColumnWidth('workingPressure'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-right font-mono text-slate-800 whitespace-nowrap"
                      >
                        {item.workingPressure}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('workingTemperature'),
                          minWidth: getColumnWidth('workingTemperature'),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-right font-mono text-slate-800 whitespace-nowrap"
                      >
                        {item.workingTemperature}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('rkPercent'),
                          minWidth: getColumnWidth('rkPercent'),
                        }}
                        className="py-2.5 px-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800"
                      >
                        {item.rkPercent}%
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('uzkPercent'),
                          minWidth: getColumnWidth('uzkPercent'),
                        }}
                        className="py-2.5 px-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800"
                      >
                        {item.uzkPercent}%
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('pvkPercent'),
                          minWidth: getColumnWidth('pvkPercent'),
                        }}
                        className="py-2.5 px-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800"
                      >
                        {item.pvkPercent}%
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('computedStatus'),
                          minWidth: getColumnWidth('computedStatus'),
                        }}
                        className="py-2.5 px-3 border-r border-slate-200"
                      >
                        {status.ndtStatus === 'sufficient' ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
                            title={status.statusLabel}
                          >
                            <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-700" />
                            <span>НК ✓</span>
                          </span>
                        ) : status.ndtStatus === 'insufficient' ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                            title={status.statusLabel}
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0 text-amber-700" />
                            <span>НК !</span>
                          </span>
                        ) : (
                          <span
                            className="text-slate-400 font-mono text-[11px] px-2"
                            title={status.statusLabel}
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          width: getColumnWidth('testDate'),
                          minWidth: getColumnWidth('testDate'),
                        }}
                        className="py-2.5 px-2.5 text-center font-mono font-semibold text-slate-800 whitespace-nowrap"
                      >
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => openEditLineModal(item)}
                            className="hover:text-[#1e3799] hover:underline cursor-pointer"
                            title="Нажмите для редактирования строки лайнлиста"
                          >
                            {formatDateDDMMYY(item.testDate) || '—'}
                          </button>
                        ) : (
                          <span>{formatDateDDMMYY(item.testDate) || '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 bg-[#f8fafd] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div>
              Отображено технологических линий:{' '}
              <span className="font-mono font-bold text-slate-800">
                {filteredAndSortedList.length}
              </span>{' '}
              из <span className="font-mono">{lineList.length}</span>
            </div>
            {hasCustomWidths && (
              <button
                type="button"
                onClick={handleResetWidths}
                title="Сбросить пользовательские ширины столбцов лайнлиста к исходным"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Сбросить ширину столбцов</span>
              </button>
            )}
          </div>
          <div>
            Нажмите на номер линии (или дважды на строку) для редактирования строки лайнлиста
          </div>
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО: РЕДАКТИРОВАНИЕ / ДОБАВЛЕНИЕ СТРОКИ ЛАЙНЛИСТА (ВСЕ 17 ПОЛЕЙ) */}
      {rowModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={
            rowModal.mode === 'create'
              ? 'Добавление строки лайнлиста'
              : 'Редактирование строки лайнлиста'
          }
        >
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={() => setRowModal({ isOpen: false, mode: 'create', item: null })}
          />
          <div className="relative z-10 w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
              <div>
                <h2 className="font-display text-base font-bold">
                  {rowModal.mode === 'create'
                    ? 'Добавление новой линии в раздел «Проект (лайнлист)»'
                    : `Редактирование строки лайнлиста · Линия ${editForm.lineNumber} (${buildUniqueLineId(editForm.rdCode, editForm.lineNumber)})`}
                </h2>
                <p className="text-xs text-sky-200">
                  Все данные по объектам, шифрам РД, контурам и названиям линий синхронизируются с остальными разделами системы
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRowModal({ isOpen: false, mode: 'create', item: null })
                }
                aria-label="Закрыть окно редактирования строки лайнлиста"
                className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveSingleRow}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              {lineFormError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold">
                  {lineFormError}
                </div>
              )}

              {/* Поясняющая карточка архитектуры лайнлиста */}
              <div className="p-3.5 rounded-xl bg-sky-50/90 border border-sky-200/90 text-xs text-sky-950 flex items-start gap-3">
                <Info className="w-4 h-4 text-[#1e3799] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-[#1e3799]">
                    Лайнлист — первоисточник объектов и шифров РД
                  </div>
                  <div className="text-slate-600 leading-relaxed">
                    Выберите существующий объект и шифр РД из выпадающего списка или введите новые наименования. При сохранении строки этот объект и шифр РД автоматически появятся во всех разделах системы: в шапке программы, в паспорте стыка, в каталоге ЛРВ и отчетах.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. НАЗВАНИЕ ОБЪЕКТА */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      1. Название объекта *
                    </label>
                    {selectedObjectName === 'ALL' && availableObjectOptions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isCustomObject) {
                            setIsCustomObject(false);
                            const firstObj = availableObjectOptions[0] || '';
                            handleSelectExistingObject(firstObj);
                          } else {
                            setIsCustomObject(true);
                            setIsCustomRd(true);
                            setEditForm((prev) => ({ ...prev, objectName: '', rdCode: '' }));
                          }
                        }}
                        className="text-[11px] text-[#1e3799] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {isCustomObject ? (
                          '← Выбрать из существующих'
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Ввести новый объект</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {selectedObjectName !== 'ALL' ? (
                    <div className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-semibold text-[#1e3799] flex items-center justify-between">
                      <span className="truncate">{selectedObjectName}</span>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-1">
                        (зафиксирован в меню)
                      </span>
                    </div>
                  ) : isCustomObject || availableObjectOptions.length === 0 ? (
                    <input
                      type="text"
                      required
                      value={editForm.objectName}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, objectName: e.target.value }))
                      }
                      placeholder="Введите название нового объекта (напр.: КС «Воркутинская»)"
                      autoFocus
                      aria-label="Название объекта"
                      className="w-full px-3 py-2 bg-white border border-[#1e3799] rounded-md text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                    />
                  ) : (
                    <select
                      value={editForm.objectName}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsCustomObject(true);
                          setIsCustomRd(true);
                          setEditForm((prev) => ({ ...prev, objectName: '', rdCode: '' }));
                        } else {
                          handleSelectExistingObject(e.target.value);
                        }
                      }}
                      aria-label="Название объекта"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
                    >
                      {availableObjectOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      <option value="__NEW__">+ Ввести новый объект вручную...</option>
                    </select>
                  )}
                </div>

                {/* 2. ШИФР РД */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      2. Шифр РД *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (isCustomRd) {
                          setIsCustomRd(false);
                          const firstRd = rdsForCurrentObject[0] || '';
                          handleSelectExistingRd(firstRd);
                        } else {
                          setIsCustomRd(true);
                          setEditForm((prev) => ({
                            ...prev,
                            rdCode: '',
                            uniqueLineId: buildUniqueLineId('', prev.lineNumber),
                          }));
                        }
                      }}
                      className="text-[11px] text-[#1e3799] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      {isCustomRd && !isCustomObject && rdsForCurrentObject.length > 0 ? (
                        '← Выбрать из существующих РД'
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Ввести новый шифр РД</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isCustomRd || isCustomObject || rdsForCurrentObject.length === 0 ? (
                    <input
                      type="text"
                      required
                      value={editForm.rdCode}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          rdCode: e.target.value,
                          uniqueLineId: buildUniqueLineId(
                            e.target.value,
                            prev.lineNumber
                          ),
                        }))
                      }
                      placeholder="Введите шифр РД (напр.: 0092.049.Р.13/1 0004 УКПГ.045.0077.003-ТХ5)"
                      aria-label="Шифр РД"
                      className="w-full px-3 py-2 bg-white border border-[#1e3799] rounded-md text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                    />
                  ) : (
                    <select
                      value={editForm.rdCode}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsCustomRd(true);
                          setEditForm((prev) => ({
                            ...prev,
                            rdCode: '',
                            uniqueLineId: buildUniqueLineId('', prev.lineNumber),
                          }));
                        } else {
                          handleSelectExistingRd(e.target.value);
                        }
                      }}
                      aria-label="Шифр РД"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
                    >
                      {rdsForCurrentObject.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      <option value="__NEW__">+ Ввести новый шифр РД вручную...</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    3. Номер линии *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.lineNumber}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        lineNumber: e.target.value,
                        uniqueLineId: buildUniqueLineId(prev.rdCode, e.target.value),
                      }))
                    }
                    placeholder="Напр.: ФП1.2/1"
                    aria-label="Номер линии"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-[#1e3799]"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    4. Наименование линии *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.lineName}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, lineName: e.target.value }))
                    }
                    aria-label="Наименование линии"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    5. Продукт
                  </label>
                  <input
                    type="text"
                    value={editForm.product}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, product: e.target.value }))
                    }
                    aria-label="Продукт"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    6. Контур испытания
                  </label>
                  <input
                    type="text"
                    list="ll-contours-list"
                    value={editForm.testContour}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        testContour: e.target.value,
                      }))
                    }
                    aria-label="Контур испытания"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    7. НТД на сварку
                  </label>
                  <input
                    type="text"
                    value={editForm.weldingNtd}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, weldingNtd: e.target.value }))
                    }
                    aria-label="НТД на сварку"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    8. НТД на контроль
                  </label>
                  <input
                    type="text"
                    value={editForm.controlNtd}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, controlNtd: e.target.value }))
                    }
                    aria-label="НТД на контроль"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    9. Уровень качества (может быть пустым)
                  </label>
                  <select
                    value={editForm.qualityLevel}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        qualityLevel: e.target.value,
                      }))
                    }
                    aria-label="Уровень качества"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-semibold text-[#1e3799]"
                  >
                    <option value="">— Не указан (пусто) —</option>
                    <option value="Уровень А">Уровень А</option>
                    <option value="Уровень В">Уровень В</option>
                    <option value="Уровень С">Уровень С</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    10. Категория трубопровода (может быть пустой)
                  </label>
                  <input
                    type="text"
                    value={editForm.pipelineCategory}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        pipelineCategory: e.target.value,
                      }))
                    }
                    placeholder="Напр.: I (В) или оставьте пустым"
                    aria-label="Категория трубопровода"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    11. Рабочее давление
                  </label>
                  <input
                    type="text"
                    value={editForm.workingPressure}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        workingPressure: e.target.value,
                      }))
                    }
                    aria-label="Рабочее давление"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    12. Температура
                  </label>
                  <input
                    type="text"
                    value={editForm.workingTemperature}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        workingTemperature: e.target.value,
                      }))
                    }
                    aria-label="Температура"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    13. Процент контроля РК, %
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.rkPercent}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        rkPercent: Number(e.target.value),
                      }))
                    }
                    aria-label="Процент контроля РК"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    14. Процент контроля УЗК, %
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.uzkPercent}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        uzkPercent: Number(e.target.value),
                      }))
                    }
                    aria-label="Процент контроля УЗК"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    15. Процент контроля ПВК, %
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.pvkPercent}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        pvkPercent: Number(e.target.value),
                      }))
                    }
                    aria-label="Процент контроля ПВК"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-700">
                      17. Дата испытания
                    </label>
                    <span className="text-xs font-mono font-bold text-[#1e3799]">
                      {formatDateDDMMYY(editForm.testDate)}
                    </span>
                  </div>
                  <input
                    type="date"
                    value={
                      /^\d{4}-\d{2}-\d{2}$/.test(editForm.testDate)
                        ? editForm.testDate
                        : ''
                    }
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, testDate: e.target.value }))
                    }
                    aria-label="Дата испытания"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
                  />
                </div>
              </div>

              {rowModal.mode === 'edit' && (
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#e8f1fc] border border-[#1e3799]/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cascadeRename}
                    onChange={(e) => setCascadeRename(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                  />
                  <div className="text-xs text-slate-800">
                    <span className="font-bold text-[#1e3799]">
                      Каскадно переименовать во всей системе (1 → N):
                    </span>{' '}
                    если вы изменили <b>Название объекта</b>, <b>Шифр РД</b> или{' '}
                    <b>Контур испытания</b>, автоматически заменить старое название во всех остальных строках лайнлиста, в реестре сварных стыков и в каталоге ЛРВ.{' '}
                    <span className="text-slate-500">
                      (Снимите галочку, если нужно перенести в другой шифр/контур только эту одну линию).
                    </span>
                  </div>
                </label>
              )}

              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
                <div>
                  {rowModal.mode === 'edit' && rowModal.item && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteLineItems([rowModal.item!.id]);
                        setRowModal({ isOpen: false, mode: 'create', item: null });
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Удалить эту линию</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setRowModal({ isOpen: false, mode: 'create', item: null })
                    }
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e]"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {rowModal.mode === 'create'
                        ? 'Добавить линию в лайнлист'
                        : 'Сохранить изменения строки'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО: ГРУППОВОЕ РЕДАКТИРОВАНИЕ СТРОК ЛАЙНЛИСТА */}
      {isBulkModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Групповое редактирование строк лайнлиста"
        >
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={() => setIsBulkModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-sky-300" />
                <div>
                  <h2 className="font-display text-base font-bold">
                    Групповое редактирование строк лайнлиста ({selectedLineIds.length} лин.)
                  </h2>
                  <p className="text-xs text-sky-200">
                    Массовое обновление параметров выбранных линий трубопроводов
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                aria-label="Закрыть групповое редактирование лайнлиста"
                className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleApplyBulkSubmit}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              <div className="flex items-start gap-3 p-3 rounded-lg bg-[#e8f1fc] border border-[#1e3799]/25 text-xs text-slate-800">
                <Lock className="w-4 h-4 text-[#1e3799] shrink-0 mt-0.5" />
                <div>
                  Индивидуальные номера линий защищены от массовой перезаписи. Выбрано линий:{' '}
                  <span className="font-mono font-bold text-[#1e3799]">
                    {lineList
                      .filter((l) => selectedLineIds.includes(l.id))
                      .map((l) => l.lineNumber)
                      .join(', ')}
                  </span>
                </div>
              </div>

              {/* 1. Уровень качества и Категория трубопровода */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableQuality}
                      onChange={(e) => setBulkEnableQuality(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">
                      Изменить Уровень качества
                    </span>
                  </label>
                  {bulkEnableQuality && (
                    <select
                      value={bulkQualityLevel}
                      onChange={(e) => setBulkQualityLevel(e.target.value)}
                      aria-label="Уровень качества для группового изменения"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold text-[#1e3799]"
                    >
                      <option value="">— Не указан (пусто) —</option>
                      <option value="Уровень А">Уровень А</option>
                      <option value="Уровень В">Уровень В</option>
                      <option value="Уровень С">Уровень С</option>
                    </select>
                  )}
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableCategory}
                      onChange={(e) => setBulkEnableCategory(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">
                      Изменить Категорию трубопровода
                    </span>
                  </label>
                  {bulkEnableCategory && (
                    <input
                      type="text"
                      value={bulkCategory}
                      onChange={(e) => setBulkCategory(e.target.value)}
                      placeholder="Оставьте пустым для очистки"
                      aria-label="Категория трубопровода для группового изменения"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  )}
                </div>
              </div>

              {/* 2. Объект, Шифр РД и Контур испытания */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableObject}
                      onChange={(e) => setBulkEnableObject(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">Название объекта</span>
                  </label>
                  {bulkEnableObject && (
                    <input
                      type="text"
                      list="ll-objects-list"
                      value={bulkObjectName}
                      onChange={(e) => setBulkObjectName(e.target.value)}
                      placeholder="Введите или выберите объект"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  )}
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableRd}
                      onChange={(e) => setBulkEnableRd(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">Шифр РД</span>
                  </label>
                  {bulkEnableRd && (
                    <input
                      type="text"
                      list="ll-rds-list"
                      value={bulkRdCode}
                      onChange={(e) => setBulkRdCode(e.target.value)}
                      placeholder="Введите или выберите шифр РД"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  )}
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableContour}
                      onChange={(e) => setBulkEnableContour(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">Контур испытания</span>
                  </label>
                  {bulkEnableContour && (
                    <input
                      type="text"
                      list="ll-contours-list"
                      value={bulkTestContour}
                      onChange={(e) => setBulkTestContour(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  )}
                </div>
              </div>

              {/* 3. Продукт, НТД и Рабочие параметры */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableProduct}
                      onChange={(e) => setBulkEnableProduct(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">Изменить Продукт</span>
                  </label>
                  {bulkEnableProduct && (
                    <input
                      type="text"
                      value={bulkProduct}
                      onChange={(e) => setBulkProduct(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  )}
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableNtd}
                      onChange={(e) => setBulkEnableNtd(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">
                      НТД на сварку и контроль
                    </span>
                  </label>
                  {bulkEnableNtd && (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={bulkWeldingNtd}
                        onChange={(e) => setBulkWeldingNtd(e.target.value)}
                        placeholder="НТД на сварку"
                        className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs"
                      />
                      <input
                        type="text"
                        value={bulkControlNtd}
                        onChange={(e) => setBulkControlNtd(e.target.value)}
                        placeholder="НТД на контроль"
                        className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Давление/Температура, Проценты НК и Дата испытания */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableParams}
                      onChange={(e) => setBulkEnableParams(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">
                      Давление и Температура
                    </span>
                  </label>
                  {bulkEnableParams && (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={bulkPressure}
                        onChange={(e) => setBulkPressure(e.target.value)}
                        placeholder="Давление"
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={bulkTemperature}
                        onChange={(e) => setBulkTemperature(e.target.value)}
                        placeholder="Температура"
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableNdtPct}
                      onChange={(e) => setBulkEnableNdtPct(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">
                      % РК / % УЗК / % ПВК
                    </span>
                  </label>
                  {bulkEnableNdtPct && (
                    <div className="grid grid-cols-3 gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={bulkRkPct}
                        onChange={(e) => setBulkRkPct(Number(e.target.value))}
                        className="px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={bulkUzkPct}
                        onChange={(e) => setBulkUzkPct(Number(e.target.value))}
                        className="px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={bulkPvkPct}
                        onChange={(e) => setBulkPvkPct(Number(e.target.value))}
                        className="px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEnableTestDate}
                      onChange={(e) => setBulkEnableTestDate(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="text-xs font-bold text-slate-900">Дата испытания</span>
                  </label>
                  {bulkEnableTestDate && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-mono font-bold text-[#1e3799]">
                        ДД.ММ.ГГ: {formatDateDDMMYY(bulkTestDate)}
                      </div>
                      <input
                        type="date"
                        value={bulkTestDate}
                        onChange={(e) => setBulkTestDate(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e]"
                >
                  <Check className="w-4 h-4" />
                  <span>Применить к выбранным ({selectedLineIds.length} лин.)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

