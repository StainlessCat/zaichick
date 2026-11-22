import { useEffect, useMemo, useState } from 'react';
import {
  JournalStandard,
  WeldJoint,
} from '../../types/welding';
import {
  extractRdSuffix,
  formatDateDDMMYY,
  formatGost32569JournalRow,
  formatStoGazpromJournalRow,
  GOST_32569_2013_JOURNAL_COLUMNS,
  Gost32569ColumnKey,
  sortJointsChronologically,
  STO_GAZPROM_15_1_1_002_2023_COLUMNS,
  StoGazpromColumnKey,
} from '../../utils/weldingLogic';
import {
  exportWeldingJournalToExcel,
  triggerBlobDownload,
} from '../../utils/excelUtils';
import { validateJournalCompleteness } from '../../utils/journals';
import { useResizableColumns } from '../../utils/useResizableColumns';
import { applyTableColumnFiltersAndSort } from '../TableColumnFilterPopover';
import { useAppContext } from '../../context';
import type {
  JournalLineOption,
  JournalRdOption,
  LineWeldingAlert,
  WeldingJournalsViewProps,
} from './index';

export function useWeldingJournals(props: WeldingJournalsViewProps) {
  const app = useAppContext();

  const joints = props.joints ?? app.joints;
  const allJoints = props.allJoints ?? app.joints;
  const lines = props.lines ?? app.projectLineList ?? [];
  const materials = props.materials ?? app.weldingMaterials ?? [];
  const lrvCatalog = props.lrvCatalog ?? app.lrvCatalog ?? [];
  const selectedObjectName = props.selectedObjectName ?? app.selectedObjectName;
  const selectedRdCode = props.selectedRdCode ?? app.selectedRdCode ?? 'ALL';
  const onSelectRdCode = props.onSelectRdCode ?? app.setSelectedRdCode;
  const isDbConnected = props.isDbConnected ?? app.isDbConnected;
  const pendingSyncCount = props.pendingSyncCount ?? app.pendingSyncCount;

  // По умолчанию открываем форму по СТО Газпром 15-1.1-002-2023 (49 граф)
  const [standard, setStandard] = useState<JournalStandard>(
    'СТО Газпром 15-1.1-002-2023'
  );
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [actionToast, setActionToast] = useState<string>('');

  // 1. Состояние выбора шифра РД (синхронизируется с пропом selectedRdCode)
  const [currentRdCode, setCurrentRdCode] = useState<string>(
    selectedRdCode || 'ALL'
  );

  useEffect(() => {
    if (selectedRdCode !== undefined) {
      setCurrentRdCode(selectedRdCode);
    }
  }, [selectedRdCode]);

  // 2. Состояние выбора линии
  const [selectedLineKey, setSelectedLineKey] = useState<string>('ALL');

  // Все доступные стыки
  const effectiveAllJoints = useMemo(() => {
    return allJoints && allJoints.length > 0 ? allJoints : joints;
  }, [allJoints, joints]);

  // Стыки объекта, выбранного в глобальном меню-гамбургере (или всех объектов, если ALL)
  const objectScopedJoints = useMemo(() => {
    if (!selectedObjectName || selectedObjectName === 'ALL') return effectiveAllJoints;
    return effectiveAllJoints.filter((j) => j.objectName === selectedObjectName);
  }, [effectiveAllJoints, selectedObjectName]);

  // Линии объекта, выбранного в глобальном меню-гамбургере
  const objectScopedLines = useMemo(() => {
    if (!selectedObjectName || selectedObjectName === 'ALL') return lines;
    return lines.filter((l) => l.objectName === selectedObjectName);
  }, [lines, selectedObjectName]);

  // Варианты выбора шифра РД для текущего объекта
  const rdOptions = useMemo<JournalRdOption[]>(() => {
    const map = new Map<string, JournalRdOption>();

    // Добавляем шифры из проектных линий объекта
    for (const l of objectScopedLines) {
      if (!l.rdCode) continue;
      const key = l.rdCode.trim();
      if (!key) continue;
      const ex = map.get(key);
      if (ex) {
        ex.linesCount += 1;
      } else {
        map.set(key, {
          rdCode: key,
          suffix: extractRdSuffix(key),
          linesCount: 1,
          jointsCount: 0,
        });
      }
    }

    // Подсчитываем стыки по каждому шифру РД
    for (const j of objectScopedJoints) {
      if (!j.rdCode) continue;
      const key = j.rdCode.trim();
      if (!key) continue;
      const ex = map.get(key);
      if (ex) {
        ex.jointsCount += 1;
      } else {
        map.set(key, {
          rdCode: key,
          suffix: extractRdSuffix(key),
          linesCount: 0,
          jointsCount: 1,
        });
      }
    }

    const allOption: JournalRdOption = {
      rdCode: 'ALL',
      suffix: '',
      linesCount: objectScopedLines.length,
      jointsCount: objectScopedJoints.length,
    };

    const sorted = Array.from(map.values()).sort((a, b) =>
      a.rdCode.localeCompare(b.rdCode, 'ru', { numeric: true })
    );

    return [allOption, ...sorted];
  }, [objectScopedLines, objectScopedJoints]);

  // Список доступных линий для текущего объекта и шифра РД
  const availableLines = useMemo<JournalLineOption[]>(() => {
    const map = new Map<string, JournalLineOption>();

    // 1. Линии из projectLineList
    for (const pl of objectScopedLines) {
      if (currentRdCode !== 'ALL' && pl.rdCode !== currentRdCode) continue;
      const key = pl.uniqueLineId || pl.lineNumber;
      if (!key) continue;
      map.set(key, {
        id: pl.id || key,
        lineNumber: pl.lineNumber,
        uniqueLineId: pl.uniqueLineId || pl.lineNumber,
        lineName: pl.lineName || '',
        product: pl.product || '',
        objectName: pl.objectName,
        rdCode: pl.rdCode,
        pipelineCategory: pl.pipelineCategory || '',
        qualityLevel: pl.qualityLevel || '',
        weatherStationId: pl.weatherStationId,
        jointsCount: 0,
      });
    }

    // 2. Стыки объекта и шифра РД для подсчёта и выявления линий, отсутствующих в лайн-листе
    const relevantJoints =
      currentRdCode !== 'ALL'
        ? objectScopedJoints.filter((j) => j.rdCode === currentRdCode)
        : objectScopedJoints;

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
          rdCode: j.rdCode,
          pipelineCategory: '',
          qualityLevel: '',
          jointsCount: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.lineNumber.localeCompare(b.lineNumber, 'ru', { numeric: true })
    );
  }, [objectScopedLines, objectScopedJoints, currentRdCode]);

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

  // Оповещение: проверка полной завершённости сварочных работ по выбранной линии (для Блока 1)
  const lineWeldingAlert = useMemo<LineWeldingAlert | null>(() => {
    if (selectedLineKey === 'ALL') return null;

    // Все стыки выбранной линии в рамках текущего объекта
    const lineJoints = objectScopedJoints.filter((j) => {
      if (
        selectedLineItem?.uniqueLineId &&
        j.uniqueLineId &&
        j.uniqueLineId === selectedLineItem.uniqueLineId
      ) {
        return true;
      }
      if (
        selectedLineItem?.lineNumber &&
        j.lineNumber &&
        j.lineNumber === selectedLineItem.lineNumber
      ) {
        return true;
      }
      return (
        j.lineNumber === selectedLineKey || j.uniqueLineId === selectedLineKey
      );
    });

    const total = lineJoints.length;
    const weldedJoints = lineJoints.filter((j) =>
      Boolean(j.weldingDate && j.weldingDate.trim() !== '')
    );
    const welded = weldedJoints.length;
    const unweldedJoints = lineJoints.filter(
      (j) => !j.weldingDate || !j.weldingDate.trim()
    );
    const unweldedCount = unweldedJoints.length;
    const isFullyWelded = total > 0 && welded === total;

    return {
      total,
      welded,
      unweldedCount,
      isFullyWelded,
      unweldedJointNumbers: unweldedJoints
        .map((j) => j.jointNumber)
        .filter(Boolean),
    };
  }, [objectScopedJoints, selectedLineKey, selectedLineItem]);

  // Обработчики выбора шифра РД и линии
  const handleSelectRd = (rd: string) => {
    setCurrentRdCode(rd);
    onSelectRdCode?.(rd);

    // Если выбранная линия не принадлежит новому шифру РД, сбрасываем линию на 'ALL'
    if (selectedLineKey !== 'ALL' && rd !== 'ALL') {
      const lineExistsInNewRd =
        objectScopedLines.some(
          (l) =>
            l.rdCode === rd &&
            (l.id === selectedLineKey ||
              l.uniqueLineId === selectedLineKey ||
              l.lineNumber === selectedLineKey)
        ) ||
        objectScopedJoints.some(
          (j) =>
            j.rdCode === rd &&
            (j.uniqueLineId === selectedLineKey || j.lineNumber === selectedLineKey)
        );
      if (!lineExistsInNewRd) {
        setSelectedLineKey('ALL');
      }
    }
  };

  const handleSelectLine = (lineKey: string) => {
    setSelectedLineKey(lineKey);
  };

  // Проверка валидности шифра РД при смене объекта в меню-гамбургере
  useEffect(() => {
    if (currentRdCode !== 'ALL') {
      const rdStillValid =
        lines.some(
          (l) =>
            (selectedObjectName === 'ALL' || l.objectName === selectedObjectName) &&
            l.rdCode === currentRdCode
        ) ||
        joints.some(
          (j) =>
            (selectedObjectName === 'ALL' || j.objectName === selectedObjectName) &&
            j.rdCode === currentRdCode
        );
      if (!rdStillValid) {
        setCurrentRdCode('ALL');
        onSelectRdCode?.('ALL');
        setSelectedLineKey('ALL');
      }
    }
  }, [selectedObjectName, lines, joints, currentRdCode, onSelectRdCode]);

  // Стыки с фильтрацией по объекту (из гамбургера), шифру РД и выбранной линии
  const lineScopedJoints = useMemo(() => {
    let list = objectScopedJoints;

    if (currentRdCode !== 'ALL') {
      list = list.filter((j) => j.rdCode === currentRdCode);
    }

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
  }, [objectScopedJoints, currentRdCode, selectedLineKey, selectedLineItem]);

  // Регулирование ширины столбцов журнала по ГОСТ 32569-2013
  const {
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
  };

  // Сортировка стыков всегда производится исключительно по хронологии
  const baseChronologicalJoints = useMemo(() => {
    const welded = lineScopedJoints.filter(
      (j) => Boolean(j.weldingDate && j.weldingDate.trim() !== '')
    );
    return sortJointsChronologically(welded);
  }, [lineScopedJoints]);

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
        formatGost32569JournalRow(j, idx, materials, lrvCatalog)[col.key];
    }
    return map;
  }, [materials, lrvCatalog]);

  const activeGetters =
    standard === 'ГОСТ 32569-2013' ? gost32569Getters : stoGazpromGetters;

  // Применяем фильтры столбцов, сохраняя строгий хронологический порядок
  const chronologicalJoints = useMemo(
    () =>
      applyTableColumnFiltersAndSort(
        baseChronologicalJoints,
        columnFilters,
        activeGetters,
        null
      ),
    [baseChronologicalJoints, columnFilters, activeGetters]
  );

  // Нормативный контроль полноты журнала
  const journalCompleteness = useMemo(() => {
    return validateJournalCompleteness(chronologicalJoints, standard);
  }, [chronologicalJoints, standard]);

  const confirmCompletenessBeforeExport = (): {
    proceed: boolean;
    isDraftIncomplete: boolean;
    missingCount: number;
  } => {
    if (journalCompleteness.isFullyComplete) {
      return { proceed: true, isDraftIncomplete: false, missingCount: 0 };
    }

    const { missingSummary, jointsWithMissingDataCount, missingItems } = journalCompleteness;
    const linesArr: string[] = [];
    if (missingSummary.missingDates > 0) linesArr.push(`• Не указана дата сварки: ${missingSummary.missingDates}`);
    if (missingSummary.missingWelders > 0) linesArr.push(`• Не указано клеймо сварщика: ${missingSummary.missingWelders}`);
    if (missingSummary.missingTechCards > 0) linesArr.push(`• Не привязана техкарта (ТК): ${missingSummary.missingTechCards}`);
    if (missingSummary.missingVikReports > 0) linesArr.push(`• Первичный ВИК (нет номера/даты/результата): ${missingSummary.missingVikReports}`);
    if (missingSummary.missingNdtReports > 0) linesArr.push(`• Первичный НК (нет номера/даты/результата): ${missingSummary.missingNdtReports}`);
    if (missingSummary.missingDupNdtReports > 0) linesArr.push(`• Повторный/дублирующий НК (нет номера/даты/результата): ${missingSummary.missingDupNdtReports}`);
    if (missingSummary.missingRepairDetails > 0) linesArr.push(`• Сведения о ремонте и переконтроле: ${missingSummary.missingRepairDetails}`);
    if (missingSummary.missingRepairVikReports > 0) linesArr.push(`• ВИК после ремонта (нет номера/даты/результата): ${missingSummary.missingRepairVikReports}`);
    if (missingSummary.missingRepairNdtReports > 0) linesArr.push(`• НК после ремонта (нет номера/даты/результата): ${missingSummary.missingRepairNdtReports}`);
    if (missingSummary.missingRepairDupNdtReports > 0) linesArr.push(`• Повторный НК после ремонта (нет номера/даты/результата): ${missingSummary.missingRepairDupNdtReports}`);
    if (missingSummary.missingResponsiblePerson > 0) linesArr.push(`• Не указан ответственный мастер: ${missingSummary.missingResponsiblePerson}`);

    const sampleDetails = missingItems
      .slice(0, 5)
      .map(
        (item) =>
          `  — Стык №${item.jointNumber}${item.lineNumber ? ` (${item.lineNumber})` : ''}: ${item.missingFields.map((f) => f.label).join('; ')}`
      );
    if (missingItems.length > 5) {
      sampleDetails.push(`  … и ещё ${missingItems.length - 5} стыков`);
    }

    const proceed = window.confirm(
      `ПРЕДУПРЕЖДЕНИЕ О ПОЛНОТЕ ДАННЫХ ЖУРНАЛА:\n\nВ формируемом журнале «${standard}» (${chronologicalJoints.length} стыков) обнаружены пропуски обязательных реквизитов в ${jointsWithMissingDataCount} стыках:\n${linesArr.join('\n')}${sampleDetails.length > 0 ? `\n\nПримеры пропусков:\n${sampleDetails.join('\n')}` : ''}\n\nВАЖНО: Экспорт документа сам по себе не подтверждает нормативную пригодность и не заменяет проверку ответственного лица (главного сварщика / инженера ПТО).\n\nДокумент будет выгружен с грифом «ЧЕРНОВИК: ТРЕБУЕТСЯ ЗАПОЛНЕНИЕ РЕКВИЗИТОВ».\n\nПродолжить экспорт черновика?`
    );

    return {
      proceed,
      isDraftIncomplete: true,
      missingCount: jointsWithMissingDataCount,
    };
  };

  const handleApplyFilter = (colKey: string, vals: string[] | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (vals === undefined) delete next[colKey];
      else next[colKey] = vals;
      return next;
    });
  };

  const isOfflineOrUnsynced = !isDbConnected || pendingSyncCount > 0;

  const confirmIfUnsynced = (): boolean => {
    if (isOfflineOrUnsynced) {
      return window.confirm(
        `ВНИМАНИЕ: В системе имеются несинхронизированные данные (${pendingSyncCount} изм.) или отсутствует связь с сервером СУБД PostgreSQL.\n\nОфициальное формирование журнала заблокировано до подтверждения сервером.\nДокумент будет выгружен с грифом «ЧЕРНОВИК (НЕ СИНХРОНИЗИРОВАНО)». Продолжить выгрузку черновика?`
      );
    }
    return true;
  };

  const handleExportCsv = () => {
    if (!confirmIfUnsynced()) return;
    const comp = confirmCompletenessBeforeExport();
    if (!comp.proceed) return;
    const headers =
      standard === 'ГОСТ 32569-2013'
        ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => c.label)
        : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => c.fullLabel);

    const rows = chronologicalJoints.map((j, idx) => {
      if (standard === 'ГОСТ 32569-2013') {
        return formatGost32569JournalRow(j, idx, materials, lrvCatalog).cells;
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

    const rdSuffix =
      currentRdCode !== 'ALL'
        ? `_РД_${(extractRdSuffix(currentRdCode) || currentRdCode).replace(/[\\/:*?"<>|]/g, '_').slice(0, 15)}`
        : '';
    const lineSuffix =
      selectedLineKey !== 'ALL' && selectedLineItem
        ? `_Линия_${selectedLineItem.lineNumber.replace(/[\\/:*?"<>|]/g, '_')}`
        : '';
    const objSuffix =
      selectedObjectName !== 'ALL'
        ? `_${selectedObjectName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 25)}`
        : '';
    const fileName = `Журнал_сварки_${standard.replace(/\s+/g, '_')}${objSuffix}${rdSuffix}${lineSuffix}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, fileName);
    showToast(`Журнал (${chronologicalJoints.length} зап.) выгружен в файл «${fileName}».`);
  };

  const handleExportXlsx = async () => {
    if (!confirmIfUnsynced()) return;
    const comp = confirmCompletenessBeforeExport();
    if (!comp.proceed) return;
    try {
      await exportWeldingJournalToExcel(
        chronologicalJoints,
        standard,
        materials,
        lrvCatalog,
        {
          isDraftUnsynced: isOfflineOrUnsynced,
          unsyncedCount: pendingSyncCount,
          isDraftIncomplete: comp.isDraftIncomplete,
          missingCount: comp.missingCount,
          rdCode: currentRdCode,
          uniqueLineId: selectedLineKey,
          strict: !comp.isDraftIncomplete,
        }
      );
      showToast(
        `Книга Excel по форме «${standard}» (${chronologicalJoints.length} зап.) сформирована на сервере и скачана.`
      );
    } catch (err: unknown) {
      showToast(
        `Ошибка серверной выгрузки Excel: ${(err instanceof Error ? err.message : String(err)) || 'Проверьте авторизацию и подключение к FastAPI'}`
      );
    }
  };

  const currentFormationDate = formatDateDDMMYY(
    new Date().toISOString().slice(0, 10)
  );

  const relevantJointsCount = useMemo(() => {
    return (
      currentRdCode === 'ALL'
        ? objectScopedJoints
        : objectScopedJoints.filter((j) => j.rdCode === currentRdCode)
    ).length;
  }, [objectScopedJoints, currentRdCode]);

  return {
    standard,
    setStandard,
    columnFilters,
    setColumnFilters,
    actionToast,
    setActionToast,
    currentRdCode,
    selectedLineKey,
    rdOptions,
    availableLines,
    activeLineDisplayLabel,
    lineWeldingAlert,
    handleSelectRd,
    handleSelectLine,
    handleSwitchStandard,
    handleApplyFilter,
    handleExportCsv,
    handleExportXlsx,
    baseChronologicalJoints,
    chronologicalJoints,
    journalCompleteness,
    isOfflineOrUnsynced,
    currentFormationDate,
    relevantJointsCount,
    gost32569Getters,
    stoGazpromGetters,
    getGostColWidth,
    handleGostResizeStart,
    handleGostAutoFit,
    handleResetGostWidths,
    hasCustomGostWidths,
    getStoColWidth,
    handleStoResizeStart,
    handleStoAutoFit,
    handleResetStoWidths,
    hasCustomStoWidths,
    selectedObjectName,
  };
}
