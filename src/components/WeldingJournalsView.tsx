import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  JournalStandard,
  WeatherDailyItem,
  WeldJoint,
} from '../types/welding';
import {
  fetchWeatherDaily,
  refreshWeatherStation,
} from '../api/weatherApi';
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
} from '../utils/weldingLogic';
import {
  exportWeldingJournalToExcel,
  triggerBlobDownload,
} from '../utils/excelUtils';
import { validateJournalCompleteness } from '../utils/journals';
import { useResizableColumns } from '../utils/useResizableColumns';
import { applyTableColumnFiltersAndSort } from './TableColumnFilterPopover';
import {
  JournalCompletenessBanner,
  JournalGostTable,
  JournalLineOption,
  JournalRdOption,
  JournalStoTable,
  JournalToolbar,
  LineWeldingAlert,
  WeldingJournalsViewProps,
} from './journals';
import { useAppContext } from '../context';

export const WeldingJournalsView: React.FC<WeldingJournalsViewProps> = (props) => {
  const app = useAppContext();

  const joints = props.joints ?? app.joints;
  const allJoints = props.allJoints ?? app.joints;
  const lines = props.lines ?? app.projectLineList ?? [];
  const facilities = props.facilities ?? app.derivedFacilities ?? [];
  const materials = props.materials ?? app.weldingMaterials ?? [];
  const lrvCatalog = props.lrvCatalog ?? app.lrvCatalog ?? [];
  const selectedObjectName = props.selectedObjectName ?? app.selectedObjectName;
  const selectedRdCode = props.selectedRdCode ?? app.selectedRdCode ?? 'ALL';
  const onSelectObjectName = props.onSelectObjectName ?? app.setSelectedObjectName;
  const onSelectRdCode = props.onSelectRdCode ?? app.setSelectedRdCode;
  const isDbConnected = props.isDbConnected ?? app.isDbConnected;
  const pendingSyncCount = props.pendingSyncCount ?? app.pendingSyncCount;
  const onEditJoint = props.onEditJoint;
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

  // Состояния метеомодуля РФ (SYNOP + NOAA GSOD)
  // Метеостанция берётся строго из настроек объекта (в меню) и распространяется на журналы
  const currentFacility = useMemo(() => {
    return (
      facilities.find((f) => f.name === selectedObjectName) ||
      (selectedObjectName === 'ALL' ? facilities[0] : undefined)
    );
  }, [facilities, selectedObjectName]);

  const selectedWeatherStationId = currentFacility?.weatherStationId || '';
  const selectedWeatherStationName = currentFacility?.weatherStation || '';

  const [dailyWeather, setDailyWeather] = useState<WeatherDailyItem | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(false);

  // Определение даты для фактических метеонаблюдений (дата сварки первого/последнего стыка или сегодня)
  const activeJointDate = useMemo(() => {
    const dates = lineScopedJoints
      .map((j) => j.weldingDate)
      .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (dates.length > 0) {
      return dates[dates.length - 1];
    }
    return new Date().toISOString().slice(0, 10);
  }, [lineScopedJoints]);

  // Загрузка суточной температуры при смене метеостанции или даты
  useEffect(() => {
    if (!selectedWeatherStationId || !activeJointDate) {
      setDailyWeather(null);
      return;
    }
    let isMounted = true;
    setIsLoadingWeather(true);
    fetchWeatherDaily(selectedWeatherStationId, activeJointDate, activeJointDate)
      .then((records) => {
        if (!isMounted) return;
        const record = records.find((r) => r.obsDate === activeJointDate) || records[0] || null;
        setDailyWeather(record);
      })
      .finally(() => {
        if (isMounted) setIsLoadingWeather(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedWeatherStationId, activeJointDate]);

  // Принудительное обновление погоды со шлюза SYNOP
  const handleRefreshWeather = async () => {
    if (!selectedWeatherStationId) return;
    setIsLoadingWeather(true);
    try {
      const res = await refreshWeatherStation(selectedWeatherStationId, 3);
      const records = await fetchWeatherDaily(selectedWeatherStationId, activeJointDate, activeJointDate);
      const record = records.find((r) => r.obsDate === activeJointDate) || records[0] || null;
      setDailyWeather(record);
      showToast(`Метеоданные обновлены со шлюза SYNOP (${res.refreshedCount} сут.).`);
    } catch {
      showToast('Ошибка при обновлении метеоданных со шлюза.');
    } finally {
      setIsLoadingWeather(false);
    }
  };

  // Подстановка фактической температуры в стыки линии строго по дате сварки
  const handleApplyWeatherTemp = (tempMean: number) => {
    if (!activeJointDate) {
      showToast('Дата сварки не определена.');
      return;
    }
    const formatted = tempMean > 0 ? `+${tempMean.toFixed(1)}` : tempMean.toFixed(1);
    let updatedCount = 0;
    let otherDatesCount = 0;

    lineScopedJoints.forEach((j) => {
      if (!j.ambientTemp && onEditJoint) {
        if (j.weldingDate === activeJointDate) {
          onEditJoint({
            ...j,
            ambientTemp: formatted,
            weatherSource: dailyWeather?.source === 'SYNOP_LIVE' ? 'SYNOP Ogimet' : 'NOAA GSOD',
          });
          updatedCount++;
        } else if (j.weldingDate) {
          otherDatesCount++;
        }
      }
    });

    if (updatedCount > 0) {
      let msg = `Фактическая температура ${formatted}°C внесена в ${updatedCount} стык(ов) за дату ${activeJointDate}.`;
      if (otherDatesCount > 0) {
        msg += ` Стыки других дат (${otherDatesCount} шт.) защищены от подмены данных.`;
      }
      showToast(msg);
    } else if (otherDatesCount > 0) {
      showToast(`Стыков без температуры за дату ${activeJointDate} нет. На линии есть ${otherDatesCount} стыков за другие даты.`);
    } else {
      showToast(`Все стыки за дату ${activeJointDate} уже имеют заполненную температуру.`);
    }
  };

  // Пакетное заполнение температуры по всем уникальным датам сварки линии
  const handleApplyAllDatesWeather = async () => {
    if (!selectedWeatherStationId) {
      showToast('Метеостанция не привязана к объекту.');
      return;
    }
    const emptyJoints = lineScopedJoints.filter(
      (j) => !j.ambientTemp && j.weldingDate && /^\d{4}-\d{2}-\d{2}$/.test(j.weldingDate)
    );
    if (emptyJoints.length === 0) {
      showToast('Нет стыков с незаполненной температурой.');
      return;
    }
    const uniqueDates = Array.from(new Set(emptyJoints.map((j) => j.weldingDate!))).sort();
    const minDate = uniqueDates[0];
    const maxDate = uniqueDates[uniqueDates.length - 1];

    setIsLoadingWeather(true);
    try {
      const dailyRecords = await fetchWeatherDaily(selectedWeatherStationId, minDate, maxDate);
      const recordsByDate = new Map<string, WeatherDailyItem>();
      dailyRecords.forEach((r) => {
        if (r.obsDate) recordsByDate.set(r.obsDate, r);
      });

      let updatedCount = 0;
      let missingCount = 0;
      const updatedDates = new Set<string>();

      emptyJoints.forEach((j) => {
        const rec = recordsByDate.get(j.weldingDate!);
        if (rec && rec.tMean != null && onEditJoint) {
          const formatted = rec.tMean > 0 ? `+${rec.tMean.toFixed(1)}` : rec.tMean.toFixed(1);
          onEditJoint({
            ...j,
            ambientTemp: formatted,
            weatherSource: rec.source === 'SYNOP_LIVE' ? 'SYNOP Ogimet' : 'NOAA GSOD',
          });
          updatedCount++;
          updatedDates.add(j.weldingDate!);
        } else {
          missingCount++;
        }
      });

      if (updatedCount > 0) {
        showToast(
          `Внесена температура для ${updatedCount} стык(ов) по ${updatedDates.size} датам сварки.${
            missingCount > 0 ? ` Пропущено ${missingCount} стык(ов) без данных в метеоархиве.` : ''
          }`
        );
      } else {
        showToast(`В архиве метеостанции нет данных на даты сварки (${uniqueDates.join(', ')}).`);
      }
    } catch {
      showToast('Ошибка при загрузке архивных метеоданных.');
    } finally {
      setIsLoadingWeather(false);
    }
  };

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
    } catch (err: any) {
      showToast(
        `Ошибка серверной выгрузки .XLSX: ${err?.message || 'Проверьте авторизацию и подключение к FastAPI'}`
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

  return (
    <div className="space-y-4 print-journal-container">
      {isOfflineOrUnsynced && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3 no-print shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">
              ВНИМАНИЕ: Автономный режим (ожидает синхронизации {pendingSyncCount} изм.)
            </span>
            <p className="mt-0.5 text-amber-800 text-[11px]">
              Данные журнала в данный момент не подтверждены серверной СУБД SQLite. Официальная печать и сдача журнала технадзору заблокированы до восстановления связи с сервером. Выгрузка доступна исключительно в виде черновика с водяным знаком.
            </p>
          </div>
        </div>
      )}

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

      {/* Панель управления журналом (Блок 1: селекторы, форма стандарта, экспорт) */}
      <JournalToolbar
        currentRdCode={currentRdCode}
        rdOptions={rdOptions}
        selectedObjectName={selectedObjectName}
        onSelectRd={handleSelectRd}
        selectedLineKey={selectedLineKey}
        activeLineDisplayLabel={activeLineDisplayLabel}
        availableLines={availableLines}
        relevantJointsCount={relevantJointsCount}
        onSelectLine={handleSelectLine}
        lineWeldingAlert={lineWeldingAlert}
        standard={standard}
        onSwitchStandard={handleSwitchStandard}
        onExportXlsx={handleExportXlsx}
        onExportCsv={handleExportCsv}
        weatherStationName={selectedWeatherStationName}
        activeJointDate={activeJointDate}
        dailyWeather={dailyWeather}
        isLoadingWeather={isLoadingWeather}
        onRefreshWeather={handleRefreshWeather}
        onApplyWeatherTemp={handleApplyWeatherTemp}
        onApplyAllDatesWeather={handleApplyAllDatesWeather}
      />

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
                  {selectedObjectName === 'ALL' ? 'Сводный реестр (все объекты)' : selectedObjectName}
                </span>
              </span>
              <span>·</span>
              <span>
                Шифр РД:{' '}
                <span className="font-mono font-medium text-[#1e3799]">
                  {currentRdCode === 'ALL' ? 'Все шифры' : currentRdCode}
                </span>
              </span>
              <span>·</span>
              <span>
                Линия:{' '}
                <span className="font-mono font-medium text-[#1e3799]">
                  {selectedLineKey === 'ALL' ? 'Все линии' : activeLineDisplayLabel}
                </span>
              </span>
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono flex flex-col sm:items-end gap-1">
            <div className="flex items-center gap-2">
              {Object.keys(columnFilters).length > 0 && (
                <button
                  type="button"
                  onClick={() => setColumnFilters({})}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-50 border border-sky-200 text-xs font-semibold text-[#1e3799] hover:bg-sky-100 cursor-pointer font-sans"
                  title="Сбросить все фильтры столбцов"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить фильтры ({Object.keys(columnFilters).length})</span>
                </button>
              )}
              <span>
                Записей в журнале:{' '}
                <strong className="text-slate-800 font-bold">
                  {chronologicalJoints.length}
                </strong>
              </span>
            </div>
            <div>Дата формирования: {currentFormationDate}</div>
          </div>
        </div>

        <JournalCompletenessBanner
          journalCompleteness={journalCompleteness}
          totalJointsCount={chronologicalJoints.length}
        />

        <div className="overflow-x-auto overflow-y-auto min-h-[380px] max-h-[calc(100vh-235px)] print-journal-scroll table-scroll-container">
          {standard === 'ГОСТ 32569-2013' ? (
            <JournalGostTable
              chronologicalJoints={chronologicalJoints}
              baseChronologicalJoints={baseChronologicalJoints}
              materials={materials}
              lrvCatalog={lrvCatalog}
              columnFilters={columnFilters}
              onApplyFilter={handleApplyFilter}
              gost32569Getters={gost32569Getters}
              getGostColWidth={getGostColWidth}
              handleGostResizeStart={handleGostResizeStart}
              handleGostAutoFit={handleGostAutoFit}
              handleResetGostWidths={handleResetGostWidths}
              hasCustomGostWidths={hasCustomGostWidths}
              onEditJoint={onEditJoint}
              selectedLineKey={selectedLineKey}
              activeLineDisplayLabel={activeLineDisplayLabel}
            />
          ) : (
            <JournalStoTable
              chronologicalJoints={chronologicalJoints}
              baseChronologicalJoints={baseChronologicalJoints}
              lrvCatalog={lrvCatalog}
              columnFilters={columnFilters}
              onApplyFilter={handleApplyFilter}
              stoGazpromGetters={stoGazpromGetters}
              getStoColWidth={getStoColWidth}
              handleStoResizeStart={handleStoResizeStart}
              handleStoAutoFit={handleStoAutoFit}
              handleResetStoWidths={handleResetStoWidths}
              hasCustomStoWidths={hasCustomStoWidths}
              onEditJoint={onEditJoint}
              selectedLineKey={selectedLineKey}
              activeLineDisplayLabel={activeLineDisplayLabel}
            />
          )}
        </div>
      </div>
    </div>
  );
};
