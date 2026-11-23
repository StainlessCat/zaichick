import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Gauge, X } from 'lucide-react';
import {
  CircuitAssignmentConflictItem,
  CircuitAssignmentResult,
  FacilityObject,
  LineListColumnKey,
  ProjectLineItem,
  RecordStatus,
  WeldJoint,
} from '../types/welding';
import { canManageTestCircuits } from '../utils/rbac';
import type { CircuitActionOutcome } from '../hooks/useTestCircuitActions';
import type { LineCircuitBindingSummary } from './linelist/LineListTable';
import {
  buildUniqueLineId,
  computeLineListItemStatus,
  formatExecutiveDocStatusLabel,
  LINELIST_COLUMNS,
  normalizeExecutiveDocStatus,
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
  onChangeLineStatus?: (
    line: ProjectLineItem,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;
  onAssignLinesToCircuit?: (
    circuitId: string,
    lineIds: string[],
    overwriteExisting?: boolean
  ) => Promise<CircuitActionOutcome<CircuitAssignmentResult>>;
  onOpenTestingCircuits?: () => void;
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
    onChangeLineStatus,
    onAssignLinesToCircuit,
    onOpenTestingCircuits,
  } = props;
  const canManageCircuits = canManageTestCircuits(auth.currentUser);
  const testCircuits = app.testCircuits;
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

  // Выделенные строки лайнлиста для группового редактирования и назначения в контур
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isAssignCircuitModalOpen, setIsAssignCircuitModalOpen] = useState(false);
  const [targetCircuitId, setTargetCircuitId] = useState('');
  const [assignCircuitBusy, setAssignCircuitBusy] = useState(false);
  const [assignCircuitError, setAssignCircuitError] = useState('');
  const [assignCircuitConflicts, setAssignCircuitConflicts] = useState<
    CircuitAssignmentConflictItem[]
  >([]);

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
    idStatus: 'IN_WORK',
    responsiblePto: '',
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
      product: '',
      testContour: '',
      weldingNtd: '',
      controlNtd: '',
      qualityLevel: '',
      pipelineCategory: '',
      workingPressure: '',
      workingTemperature: '',
      rkPercent: 0,
      uzkPercent: 0,
      pvkPercent: 0,
      manualStatus: '',
      testDate: '',
      idStatus: 'IN_WORK',
      responsiblePto: '',
    });
    setRowModal({ isOpen: true, mode: 'create', item: null });
  };

  const openEditLineModal = (item: ProjectLineItem) => {
    setLineFormError('');
    setEditForm({
      ...item,
      idStatus: normalizeExecutiveDocStatus(item.idStatus),
      responsiblePto: item.responsiblePto || '',
    });
    setCascadeRename(true);
    const isKnownObj = availableObjectOptions.includes(item.objectName);
    setIsCustomObject(!isKnownObj);
    const knownRds = facilities
      .find((f) => f.name === item.objectName)
      ?.rdCodes.map((r) => r.code) || [];
    setIsCustomRd(!knownRds.includes(item.rdCode));
    setRowModal({ isOpen: true, mode: 'edit', item });
  };

  // Сводка фактической привязки стыков каждой линии к испытательным контурам
  const lineCircuitsMap = useMemo(() => {
    const map = new Map<string, LineCircuitBindingSummary[]>();
    if (testCircuits.length === 0) return map;

    const circuitsById = new Map(testCircuits.map((c) => [c.id, c]));
    const circuitsByObjAndName = new Map(
      testCircuits.map((c) => [`${c.objectName || ''}::${c.name}`, c])
    );

    const jointsByLine = new Map<string, WeldJoint[]>();
    for (const j of joints) {
      const list = jointsByLine.get(j.uniqueLineId);
      if (list) list.push(j);
      else jointsByLine.set(j.uniqueLineId, [j]);
    }

    for (const [uid, lineJoints] of jointsByLine.entries()) {
      const total = lineJoints.length;
      if (total === 0) continue;
      const counts = new Map<string, { circuitName: string; count: number }>();
      for (const j of lineJoints) {
        const matched =
          (j.testCircuitId ? circuitsById.get(j.testCircuitId) : undefined) ||
          (j.contour
            ? circuitsByObjAndName.get(`${j.objectName || ''}::${j.contour}`)
            : undefined);
        if (!matched) continue;
        const prev = counts.get(matched.id);
        if (prev) prev.count += 1;
        else counts.set(matched.id, { circuitName: matched.name, count: 1 });
      }
      if (counts.size > 0) {
        map.set(
          uid,
          Array.from(counts.entries())
            .map(([circuitId, info]) => ({
              circuitId,
              circuitName: info.circuitName,
              assigned: info.count,
              total,
              isFull: info.count === total,
            }))
            .sort((a, b) => a.circuitName.localeCompare(b.circuitName, 'ru'))
        );
      }
    }
    return map;
  }, [joints, testCircuits]);

  const selectedLinesForCircuit = useMemo(
    () => lineList.filter((l) => selectedLineIds.includes(l.id)),
    [lineList, selectedLineIds]
  );

  const selectedLineObjectNames = useMemo(
    () =>
      Array.from(
        new Set(selectedLinesForCircuit.map((l) => l.objectName).filter(Boolean))
      ),
    [selectedLinesForCircuit]
  );

  const circuitsAvailableForSelectedLines = useMemo(() => {
    if (selectedLineObjectNames.length === 1) {
      return testCircuits.filter((c) => c.objectName === selectedLineObjectNames[0]);
    }
    return testCircuits;
  }, [selectedLineObjectNames, testCircuits]);

  const handleOpenAssignCircuitModal = () => {
    setAssignCircuitError('');
    setAssignCircuitConflicts([]);
    const firstValid = circuitsAvailableForSelectedLines[0]?.id || '';
    setTargetCircuitId(firstValid);
    setIsAssignCircuitModalOpen(true);
  };

  const handleConfirmAssignLinesToCircuit = async (overwriteExisting = false) => {
    if (!onAssignLinesToCircuit || !targetCircuitId || selectedLineIds.length === 0) {
      return;
    }
    setAssignCircuitBusy(true);
    setAssignCircuitError('');
    try {
      const outcome = await onAssignLinesToCircuit(
        targetCircuitId,
        selectedLineIds,
        overwriteExisting
      );
      if (outcome.ok) {
        setIsAssignCircuitModalOpen(false);
        setAssignCircuitConflicts([]);
        setSelectedLineIds([]);
      } else if (outcome.conflicts && outcome.conflicts.length > 0) {
        setAssignCircuitConflicts(outcome.conflicts);
        setAssignCircuitError(
          outcome.error ||
            'Часть стыков выбранных линий уже закреплена за другими испытательными контурами.'
        );
      } else {
        setAssignCircuitError(
          outcome.error || 'Не удалось назначить линии в испытательный контур.'
        );
      }
    } finally {
      setAssignCircuitBusy(false);
    }
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
    if (colKey === 'readinessProgress') {
      if (row.status.totalJoints === 0) return 'Нет стыков';
      if (row.status.jointsReadinessPct >= 100) return '100%';
      if (row.status.jointsReadinessPct <= 0) return '0%';
      return 'Частично';
    }
    if (colKey === 'computedStatus') {
      return row.status.ndtStatusBadge;
    }
    if (colKey === 'idStatus') {
      return formatExecutiveDocStatusLabel(row.item.idStatus);
    }
    if (colKey === 'responsiblePto') {
      return row.item.responsiblePto?.trim() || 'Не назначен';
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
      if (key === 'readinessProgress') {
        const scoreA = a.status.totalJoints === 0 ? -1 : a.status.jointsReadinessPct;
        const scoreB = b.status.totalJoints === 0 ? -1 : b.status.jointsReadinessPct;
        const cmp =
          scoreA !== scoreB
            ? scoreA - scoreB
            : a.status.ediReadinessPct !== b.status.ediReadinessPct
              ? a.status.ediReadinessPct - b.status.ediReadinessPct
              : a.status.totalJoints - b.status.totalJoints;
        return direction === 'asc' ? cmp : -cmp;
      }
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
          'Статус ИД',
          'Ответственный ПТО',
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
      idStatus: normalizeExecutiveDocStatus(editForm.idStatus),
      responsiblePto: (editForm.responsiblePto || '').trim() || undefined,
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

  // Список инженеров ПТО: учётные записи отдела ПТО + ранее назначенные в лайнлисте
  const ptoEngineerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const acc of auth.userAccounts) {
      if (acc.isActive === false) continue;
      if (acc.department === 'PTO' || acc.role === 'ПТО') {
        const clean = acc.fullName?.trim();
        if (clean) names.add(clean);
      }
    }
    for (const item of lineList) {
      const clean = item.responsiblePto?.trim();
      if (clean) names.add(clean);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [auth.userAccounts, lineList]);

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
        ptoEngineerOptions={ptoEngineerOptions}
        selectedRdCode={selectedRdCode}
        availableRdCodes={availableFilterRdCodes}
        onSelectRdCode={onSelectRdCode}
        canManageCircuits={canManageCircuits && Boolean(onAssignLinesToCircuit)}
        onOpenAssignCircuitModal={handleOpenAssignCircuitModal}
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
        canSelectForCircuit={canManageCircuits && Boolean(onAssignLinesToCircuit)}
        lineCircuitsMap={lineCircuitsMap}
        onOpenTestingCircuits={onOpenTestingCircuits}
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
        currentUser={auth.currentUser}
        onChangeLineStatus={onChangeLineStatus}
      />

      {/* Модальное окно создания и редактирования строки лайнлиста */}
      <LineListEditModal
        testCircuits={testCircuits}
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

      {/* Модальное окно назначения выбранных линий в испытательный контур */}
      {isAssignCircuitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Назначение линий в испытательный контур"
        >
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={() => !assignCircuitBusy && setIsAssignCircuitModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#1e3799] text-white">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-sky-200" />
                <h3 className="text-sm font-bold">
                  Назначить линии в испытательный контур
                </h3>
              </div>
              <button
                type="button"
                disabled={assignCircuitBusy}
                onClick={() => setIsAssignCircuitModalOpen(false)}
                aria-label="Закрыть окно назначения контура"
                className="p-1 rounded text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-[#f4f8fe] border border-sky-200/80 text-slate-700">
                <div className="font-semibold text-[#1e3799] mb-1">
                  Выбрано технологических линий: {selectedLinesForCircuit.length}
                </div>
                <div className="font-mono text-[11px] text-slate-600 break-words">
                  {selectedLinesForCircuit.map((l) => l.lineNumber).join(', ')}
                </div>
              </div>

              {selectedLineObjectNames.length > 1 && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Выбраны линии разных объектов строительства. Испытательный контур может включать стыки только одного объекта.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Целевой испытательный контур
                </label>
                {circuitsAvailableForSelectedLines.length > 0 ? (
                  <select
                    value={targetCircuitId}
                    onChange={(e) => {
                      setTargetCircuitId(e.target.value);
                      setAssignCircuitConflicts([]);
                      setAssignCircuitError('');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                  >
                    <option value="">Выберите контур…</option>
                    {circuitsAvailableForSelectedLines.map((circuit) => (
                      <option key={circuit.id} value={circuit.id}>
                        {circuit.name}
                        {circuit.sriName ? ` · СРИ: ${circuit.sriName}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-between gap-2">
                    <span>Для выбранного объекта испытательные контуры ещё не созданы.</span>
                    {onOpenTestingCircuits && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAssignCircuitModalOpen(false);
                          onOpenTestingCircuits();
                        }}
                        className="px-2.5 py-1 rounded bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] cursor-pointer shrink-0"
                      >
                        Перейти в Испытания
                      </button>
                    )}
                  </div>
                )}
              </div>

              {assignCircuitError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                  <div className="flex items-start gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{assignCircuitError}</span>
                  </div>
                  {assignCircuitConflicts.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-1 pl-6 text-[11px] font-mono">
                      {assignCircuitConflicts.slice(0, 15).map((c) => (
                        <div key={c.jointId} className="text-rose-800">
                          {c.lineNumber ? `${c.lineNumber} · ` : ''}ст. № {c.jointNumber} → уже в «{c.currentCircuitName}»
                        </div>
                      ))}
                      {assignCircuitConflicts.length > 15 && (
                        <div className="text-rose-700 font-sans">
                          и ещё {assignCircuitConflicts.length - 15} стык.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={assignCircuitBusy}
                  onClick={() => setIsAssignCircuitModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Отмена
                </button>
                {assignCircuitConflicts.length > 0 ? (
                  <button
                    type="button"
                    disabled={assignCircuitBusy || !targetCircuitId}
                    onClick={() => void handleConfirmAssignLinesToCircuit(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-45 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {assignCircuitBusy
                        ? 'Переназначение…'
                        : 'Переназначить с перезаписью'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={
                      assignCircuitBusy ||
                      !targetCircuitId ||
                      selectedLineObjectNames.length > 1
                    }
                    onClick={() => void handleConfirmAssignLinesToCircuit(false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white font-semibold disabled:opacity-45 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {assignCircuitBusy ? 'Назначение…' : 'Назначить стыки линий'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
