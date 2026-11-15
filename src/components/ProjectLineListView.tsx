import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FacilityObject,
  LineListColumnKey,
  ProjectLineItem,
  WeatherDailyItem,
  WeatherStationItem,
  WeldJoint,
} from '../types/welding';
import {
  fetchWeatherDaily,
  fetchWeatherStations,
  refreshWeatherStation,
} from '../api/weatherApi';
import {
  buildUniqueLineId,
  computeLineListItemStatus,
  LINELIST_COLUMNS,
  parseProjectLineListRecords,
} from '../utils/weldingLogic';
import {
  exportProjectLineListToExcel,
  readProjectLineListFromExcelFile,
} from '../utils/excelUtils';
import { useResizableColumns } from '../utils/useResizableColumns';
import {
  DEMO_EXCEL_TSV,
  LineListActiveFilterBar,
  LineListBulkEditModal,
  LineListEditModal,
  LineListImportPanel,
  LineListStructureManager,
  LineListTable,
  LineListToolbar,
  RowModalState,
  SortConfig,
} from './linelist';
import { useAuth, useAppContext } from '../context';

export interface ProjectLineListViewProps {
  lineList?: ProjectLineItem[];
  joints?: WeldJoint[];
  facilities?: FacilityObject[];
  selectedObjectName?: string;
  selectedRdCode?: string;
  onSelectObjectName?: (name: string) => void;
  onSelectRdCode?: (code: string) => void;
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

export const ProjectLineListView: React.FC<ProjectLineListViewProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const lineList = props.lineList ?? app.projectLineList;
  const joints = props.joints ?? app.joints;
  const facilities = props.facilities ?? app.derivedFacilities;
  const selectedObjectName = props.selectedObjectName ?? app.selectedObjectName;
  const selectedRdCode = props.selectedRdCode ?? app.selectedRdCode;
  const onSelectObjectName = props.onSelectObjectName ?? app.setSelectedObjectName;
  const onSelectRdCode = props.onSelectRdCode ?? app.setSelectedRdCode;
  const canEdit = props.canEdit ?? auth.userPermissions.canEditLineList;
  const currentUserRoleLabel = props.currentUserRoleLabel ?? auth.userPermissions.categoryLabel;

  const {
    onAddLineItems,
    onUpdateLineItem,
    onBulkUpdateLineItems,
    onDeleteLineItems,
    onDeleteObject,
    onDeleteRdCode,
    onOpenLineInRegistry,
    onOpenFacilityLocation,
  } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showStructureManager, setShowStructureManager] = useState(false);
  const [confirmDeleteLineId, setConfirmDeleteLineId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Excel-фильтры по каждому из 17 столбцов лайнлиста и сортировка
  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<LineListColumnKey, string[]>>
  >({});
  const [openFilterColumnKey, setOpenFilterColumnKey] =
    useState<LineListColumnKey | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // Выделенные строки лайнлиста для группового редактирования
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Модальное окно создания или редактирования одной строки лайнлиста
  const [rowModal, setRowModal] = useState<RowModalState>({
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

  const [isCustomObject, setIsCustomObject] = useState(false);
  const [isCustomRd, setIsCustomRd] = useState(false);
  const [cascadeRename, setCascadeRename] = useState(true);
  const [lineFormError, setLineFormError] = useState('');

  // Настраиваемая курсором ширина столбцов лайнлиста с сохранением в localStorage
  const {
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

  // Список доступных шифров РД для фильтрации по выбранному объекту
  const availableFilterRdCodes = useMemo(() => {
    let lines = lineList;
    if (selectedObjectName !== 'ALL') {
      lines = lines.filter((l) => l.objectName === selectedObjectName);
    }
    const rdsFromLines = lines.map((l) => l.rdCode.trim()).filter(Boolean);
    const fac = facilities.find((f) => f.name === selectedObjectName);
    const rdsFromFac = fac ? fac.rdCodes.map((r) => r.code.trim()).filter(Boolean) : [];
    return Array.from(new Set([...rdsFromLines, ...rdsFromFac]));
  }, [facilities, lineList, selectedObjectName]);

  // Состояния метеомодуля РФ (SYNOP + NOAA GSOD)
  const [weatherStations, setWeatherStations] = useState<WeatherStationItem[]>([]);
  const [selectedWeatherStationId, setSelectedWeatherStationId] = useState<string>('');
  const [dailyWeather, setDailyWeather] = useState<WeatherDailyItem | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    fetchWeatherStations().then((items) => {
      if (isMounted) setWeatherStations(items);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const facility = facilities.find((f) => f.name === selectedObjectName);
    if (facility?.weatherStationId) {
      setSelectedWeatherStationId(facility.weatherStationId);
    } else {
      const lineWithStation = lineList.find(
        (l) => (selectedObjectName === 'ALL' || l.objectName === selectedObjectName) && l.weatherStationId
      );
      if (lineWithStation?.weatherStationId) {
        setSelectedWeatherStationId(lineWithStation.weatherStationId);
      } else {
        setSelectedWeatherStationId('');
      }
    }
  }, [selectedObjectName, facilities, lineList]);

  const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (!selectedWeatherStationId) {
      setDailyWeather(null);
      return;
    }
    let isMounted = true;
    setIsLoadingWeather(true);
    fetchWeatherDaily(selectedWeatherStationId, todayDate, todayDate)
      .then((records) => {
        if (!isMounted) return;
        const rec = records.find((r) => r.obsDate === todayDate) || records[0] || null;
        setDailyWeather(rec);
      })
      .finally(() => {
        if (isMounted) setIsLoadingWeather(false);
      });
  }, [selectedWeatherStationId, todayDate]);

  const handleRefreshWeather = useCallback(async () => {
    if (!selectedWeatherStationId) return;
    setIsLoadingWeather(true);
    try {
      const updated = await refreshWeatherStation(selectedWeatherStationId);
      if (updated) {
        const records = await fetchWeatherDaily(selectedWeatherStationId, todayDate, todayDate);
        const rec = records.find((r) => r.obsDate === todayDate) || records[0] || null;
        setDailyWeather(rec);
      }
    } finally {
      setIsLoadingWeather(false);
    }
  }, [selectedWeatherStationId, todayDate]);

  const handleSelectStation = useCallback(
    (stationId: string) => {
      setSelectedWeatherStationId(stationId);
      if (selectedObjectName !== 'ALL' && onBulkUpdateLineItems) {
        const station = weatherStations.find((s) => s.id === stationId);
        const scopedLines = lineList.filter((l) => l.objectName === selectedObjectName);
        if (scopedLines.length > 0) {
          onBulkUpdateLineItems(
            scopedLines.map((l) => l.id),
            { weatherStationId: stationId, weatherStationName: station?.name }
          );
        }
      }
    },
    [selectedObjectName, lineList, weatherStations, onBulkUpdateLineItems]
  );

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

  const handleDeleteFromEditModal = () => {
    if (!rowModal.item) return;
    onDeleteLineItems([rowModal.item.id]);
    setRowModal({ isOpen: false, mode: 'create', item: null });
    setSelectedLineIds((prev) => prev.filter((id) => id !== rowModal.item?.id));
  };

  const handleApplyBulk = (patch: Partial<ProjectLineItem>) => {
    onBulkUpdateLineItems(selectedLineIds, patch);
    setSelectedLineIds([]);
    setIsBulkModalOpen(false);
  };

  const handleExportExcel = () => {
    exportProjectLineListToExcel(
      filteredAndSortedList.map((r) => r.item),
      joints,
      false,
      selectedRdCode !== 'ALL' ? selectedRdCode : undefined
    );
  };

  const activeFilterKeys = useMemo(
    () =>
      (Object.keys(columnFilters) as LineListColumnKey[]).filter(
        (k) => (columnFilters[k]?.length ?? 0) > 0
      ),
    [columnFilters]
  );

  const columnLabelMap = useMemo(
    () => Object.fromEntries(LINELIST_COLUMNS.map((c) => [c.key, c.label])),
    []
  );

  // Доступные уникальные значения в лайнлисте для подсказок datalist при редактировании лайнлиста
  const uniqueObjectNames = useMemo(
    () => Array.from(new Set(lineList.map((i) => i.objectName).filter(Boolean))),
    [lineList]
  );
  const uniqueRdCodes = useMemo(
    () => Array.from(new Set(lineList.map((i) => i.rdCode).filter(Boolean))),
    [lineList]
  );
  const uniqueContours = useMemo(
    () =>
      Array.from(
        new Set(
          lineList
            .map((i) => i.testContour)
            .filter((c): c is string => Boolean(c))
        )
      ),
    [lineList]
  );

  return (
    <div className="space-y-3">
      {/* Панель инструментов: кнопки создания, удаления, импорта/экспорта, datalists */}
      <LineListToolbar
        canEdit={canEdit}
        currentUserRoleLabel={currentUserRoleLabel}
        showStructureManager={showStructureManager}
        onToggleStructureManager={() => setShowStructureManager((prev) => !prev)}
        selectedLineIds={selectedLineIds}
        onClearSelection={() => setSelectedLineIds([])}
        confirmBulkDelete={confirmBulkDelete}
        setConfirmBulkDelete={setConfirmBulkDelete}
        onDeleteLineItems={onDeleteLineItems}
        onOpenBulkModal={() => setIsBulkModalOpen(true)}
        onToggleImportPanel={() => setShowImportPanel((prev) => !prev)}
        onExportExcel={handleExportExcel}
        onOpenCreateLineModal={openCreateLineModal}
        fileInputRef={fileInputRef}
        onFileChange={handleFileChange}
        uniqueObjectNames={uniqueObjectNames}
        uniqueRdCodes={uniqueRdCodes}
        uniqueContours={uniqueContours}
        selectedObjectName={selectedObjectName}
        availableObjectOptions={availableObjectOptions}
        onSelectObjectName={(newObj) => {
          onSelectObjectName(newObj);
          onSelectRdCode('ALL');
        }}
        selectedRdCode={selectedRdCode}
        availableRdCodes={availableFilterRdCodes}
        onSelectRdCode={onSelectRdCode}
        weatherStationId={selectedWeatherStationId}
        weatherStations={weatherStations}
        onSelectWeatherStation={handleSelectStation}
        dailyWeather={dailyWeather}
        isLoadingWeather={isLoadingWeather}
        onRefreshWeather={handleRefreshWeather}
      />

      {/* Панель управления структурой (Объекты и Шифры РД с каскадным удалением) */}
      <LineListStructureManager
        isOpen={showStructureManager}
        onClose={() => setShowStructureManager(false)}
        uniqueObjectNames={uniqueObjectNames}
        uniqueRdCodes={uniqueRdCodes}
        lineList={lineList}
        joints={joints}
        onDeleteObject={onDeleteObject}
        onDeleteRdCode={onDeleteRdCode}
      />

      {/* Панель активных Excel-фильтров колонок и выделения строк */}
      <LineListActiveFilterBar
        selectedLineIdsCount={selectedLineIds.length}
        activeFilterKeys={activeFilterKeys}
        columnFilters={columnFilters}
        columnLabelMap={columnLabelMap}
        onRemoveColumnFilter={(k) =>
          setColumnFilters((prev) => {
            const next = { ...prev };
            delete next[k];
            return next;
          })
        }
        onClearSelection={() => setSelectedLineIds([])}
        onResetAllFilters={() => {
          setColumnFilters({});
          setSelectedLineIds([]);
        }}
      />

      {/* Панель импорта из Excel (.xlsx / TSV / CSV) */}
      {showImportPanel && (
        <LineListImportPanel
          joints={joints}
          fileInputRef={fileInputRef}
          uploadedFileName={uploadedFileName}
          importError={importError}
          pasteText={pasteText}
          previewItems={previewItems}
          onChangePasteText={setPasteText}
          onParsePasteText={handleParsePasteText}
          onConfirmImport={handleConfirmImport}
          onClose={() => setShowImportPanel(false)}
        />
      )}

      {/* Инженерная таблица лайнлиста (17 колонок СТО Газпром, ресайз, автоподбор, Excel-фильтры) */}
      <LineListTable
        filteredAndSortedList={filteredAndSortedList}
        selectedLineIds={selectedLineIds}
        onToggleSelectAll={toggleSelectAllVisible}
        onToggleSelectRow={toggleSelectRow}
        canEdit={canEdit}
        columnFilters={columnFilters}
        setColumnFilters={setColumnFilters}
        openFilterColumnKey={openFilterColumnKey}
        setOpenFilterColumnKey={setOpenFilterColumnKey}
        sortConfig={sortConfig}
        setSortConfig={setSortConfig}
        getColumnWidth={getColumnWidth}
        handleResizeStart={handleResizeStart}
        handleAutoFit={handleAutoFit}
        getUniqueValuesForColumn={getUniqueValuesForColumn}
        onOpenFacilityLocation={onOpenFacilityLocation}
        onOpenLineInRegistry={onOpenLineInRegistry}
        onOpenEditLineModal={openEditLineModal}
        onDeleteLineItems={onDeleteLineItems}
        confirmDeleteLineId={confirmDeleteLineId}
        setConfirmDeleteLineId={setConfirmDeleteLineId}
        totalLinesCount={lineList.length}
        hasCustomWidths={hasCustomWidths}
        onResetWidths={handleResetWidths}
      />

      {/* Модальное окно создания и редактирования строки лайнлиста */}
      <LineListEditModal
        isOpen={rowModal.isOpen}
        mode={rowModal.mode}
        rowItem={rowModal.item}
        editForm={editForm}
        setEditForm={setEditForm}
        selectedObjectName={selectedObjectName}
        availableObjectOptions={availableObjectOptions}
        isCustomObject={isCustomObject}
        setIsCustomObject={setIsCustomObject}
        isCustomRd={isCustomRd}
        setIsCustomRd={setIsCustomRd}
        rdsForCurrentObject={rdsForCurrentObject}
        onSelectExistingObject={handleSelectExistingObject}
        onSelectExistingRd={handleSelectExistingRd}
        cascadeRename={cascadeRename}
        setCascadeRename={setCascadeRename}
        lineFormError={lineFormError}
        onSave={handleSaveSingleRow}
        onDelete={handleDeleteFromEditModal}
        onClose={() => setRowModal({ isOpen: false, mode: 'create', item: null })}
      />

      {/* Модальное окно группового редактирования выбранных линий */}
      <LineListBulkEditModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        selectedLineIds={selectedLineIds}
        lineList={lineList}
        onApplyBulk={handleApplyBulk}
      />
    </div>
  );
};
