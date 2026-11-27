import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  NdtLabRequest,
  TestCircuit,
  WelderProfile,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';
import {
  buildDuplicateJointIdsSet,
  computeColumnUniqueValues,
  computeRegistryQuickFilterCounts,
  filterAndSortJoints,
  filterJointsByScope,
  RegistryQuickFilter,
} from '../utils/filters';

export interface UseRegistryFiltersParams {
  joints: WeldJoint[];
  selectedObjectName: string;
  selectedRdCode: string;
  labRequests: NdtLabRequest[];
  testCircuits?: TestCircuit[];
  welders?: WelderProfile[];
  visibleColumns: WeldJointFieldKey[];
  setVisibleColumns: React.Dispatch<React.SetStateAction<WeldJointFieldKey[]>>;
  setColumnOrder: React.Dispatch<React.SetStateAction<WeldJointFieldKey[]>>;
  setIsColumnsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useRegistryFilters(params: UseRegistryFiltersParams) {
  const {
    joints,
    selectedObjectName,
    selectedRdCode,
    labRequests,
    testCircuits,
    welders = [],
    visibleColumns,
    setVisibleColumns,
    setColumnOrder,
    setIsColumnsModalOpen,
  } = params;

  const [globalSearch, setGlobalSearch] = useState('');
  const [weldingDateFrom, setWeldingDateFrom] = useState('');
  const [weldingDateTo, setWeldingDateTo] = useState('');
  const [onlyActiveRepairs, setOnlyActiveRepairsState] = useState(false);
  const [quickFilter, setQuickFilterState] = useState<RegistryQuickFilter>('all');
  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<WeldJointFieldKey, string[]>>
  >({});
  const [openFilterColumnKey, setOpenFilterColumnKey] =
    useState<WeldJointFieldKey | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: WeldJointFieldKey;
    direction: 'asc' | 'desc';
  } | null>(null);

  const [selectedJointIds, setSelectedJointIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  const [passportModal, setPassportModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    joint: WeldJoint | null;
  }>({
    isOpen: false,
    mode: 'create',
    joint: null,
  });

  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);

  const setOnlyActiveRepairs = useCallback(
    (value: React.SetStateAction<boolean>) => {
      setOnlyActiveRepairsState((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        if (next) {
          setQuickFilterState('in_repair');
        } else {
          setQuickFilterState((qf) => (qf === 'in_repair' ? 'all' : qf));
        }
        return next;
      });
    },
    []
  );

  const setQuickFilter = useCallback((next: RegistryQuickFilter) => {
    setQuickFilterState(next);
    setOnlyActiveRepairsState(next === 'in_repair');
  }, []);

  const scopedJoints = useMemo(() => {
    return filterJointsByScope(joints, selectedObjectName, selectedRdCode);
  }, [joints, selectedObjectName, selectedRdCode]);

  const duplicateJointIds = useMemo(() => {
    return buildDuplicateJointIdsSet(scopedJoints);
  }, [scopedJoints]);

  const quickFilterCounts = useMemo(() => {
    return computeRegistryQuickFilterCounts(scopedJoints, {
      labRequests,
      welders,
      duplicateJointIds,
    });
  }, [scopedJoints, labRequests, welders, duplicateJointIds]);

  const filteredAndSortedJoints = useMemo(() => {
    return filterAndSortJoints(scopedJoints, {
      columnFilters,
      globalSearch,
      weldingDateFrom,
      weldingDateTo,
      sortConfig,
      labRequests,
      testCircuits,
      onlyActiveRepairs,
      quickFilter,
      welders,
      duplicateJointIds,
    });
  }, [
    scopedJoints,
    columnFilters,
    globalSearch,
    weldingDateFrom,
    weldingDateTo,
    sortConfig,
    labRequests,
    testCircuits,
    onlyActiveRepairs,
    quickFilter,
    welders,
    duplicateJointIds,
  ]);

  // Автоматическая очистка скрытых выделенных строк при изменении фильтров
  useEffect(() => {
    if (selectedJointIds.length === 0) return;
    const visibleIdSet = new Set(filteredAndSortedJoints.map((j) => j.id));
    setSelectedJointIds((prev) => {
      const pruned = prev.filter((id) => visibleIdSet.has(id));
      return pruned.length === prev.length ? prev : pruned;
    });
  }, [filteredAndSortedJoints, selectedJointIds.length]);

  const getUniqueValuesForColumn = useCallback(
    (colKey: WeldJointFieldKey) => {
      return computeColumnUniqueValues(scopedJoints, colKey, labRequests, testCircuits);
    },
    [scopedJoints, labRequests, testCircuits]
  );

  const activeFilterKeys = useMemo(
    () =>
      Object.keys(columnFilters).filter(
        (k) => columnFilters[k as WeldJointFieldKey] !== undefined
      ) as WeldJointFieldKey[],
    [columnFilters]
  );

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedJointIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    const visibleIds = filteredAndSortedJoints.map((j) => j.id);
    if (visibleIds.length === 0) {
      setSelectedJointIds([]);
      return;
    }
    const selectedSet = new Set(selectedJointIds);
    const allVisibleSelected = visibleIds.every((id) => selectedSet.has(id));
    if (allVisibleSelected) {
      setSelectedJointIds([]);
    } else {
      setSelectedJointIds(visibleIds);
    }
  }, [filteredAndSortedJoints, selectedJointIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedJointIds([]);
  }, []);

  const handleWeldingDateFromChange = useCallback((v: string) => {
    setWeldingDateFrom(v);
  }, []);

  const handleWeldingDateToChange = useCallback((v: string) => {
    setWeldingDateTo(v);
  }, []);

  const handleResetDateRange = useCallback(() => {
    setWeldingDateFrom('');
    setWeldingDateTo('');
  }, []);

  const handleSetColumnFilter = useCallback(
    (key: WeldJointFieldKey, values: string[] | undefined) => {
      setColumnFilters((prev) => {
        if (!values || values.length === 0) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: values };
      });
    },
    []
  );

  const handleResetAllFilters = useCallback(() => {
    setColumnFilters({});
    setGlobalSearch('');
    setWeldingDateFrom('');
    setWeldingDateTo('');
    setOnlyActiveRepairsState(false);
    setQuickFilterState('all');
  }, []);

  const handleSetOpenFilterColumnKey = useCallback(
    (k: WeldJointFieldKey | null) => {
      setOpenFilterColumnKey(k);
    },
    []
  );

  const handleMoveColumnInline = useCallback(
    (key: WeldJointFieldKey, dir: 'left' | 'right') => {
      setColumnOrder((prev) => {
        const idx = prev.indexOf(key);
        if (idx === -1) return prev;
        const targetIdx = dir === 'left' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= prev.length) return prev;
        const next = [...prev];
        const [moved] = next.splice(idx, 1);
        next.splice(targetIdx, 0, moved);
        return next;
      });
    },
    [setColumnOrder]
  );

  const handleHideColumnInline = useCallback(
    (key: WeldJointFieldKey) => {
      setVisibleColumns((prev) => prev.filter((k) => k !== key));
    },
    [setVisibleColumns]
  );

  const handleOpenBulkEdit = useCallback(() => {
    setIsBulkEditOpen(true);
  }, []);

  const handleOpenImportExcel = useCallback(() => {
    setIsImportExcelOpen(true);
  }, []);

  const handleOpenCreatePassport = useCallback(() => {
    setPassportModal({
      isOpen: true,
      mode: 'create',
      joint: null,
    });
  }, []);

  const handleOpenEditPassport = useCallback((j: WeldJoint) => {
    setPassportModal({
      isOpen: true,
      mode: 'edit',
      joint: j,
    });
  }, []);

  const handleOpenColumnsModal = useCallback(() => {
    setIsColumnsModalOpen(true);
  }, [setIsColumnsModalOpen]);

  return {
    globalSearch,
    setGlobalSearch,
    weldingDateFrom,
    weldingDateTo,
    onlyActiveRepairs,
    setOnlyActiveRepairs,
    quickFilter,
    setQuickFilter,
    quickFilterCounts,
    duplicateJointIds,
    columnFilters,
    setColumnFilters,
    openFilterColumnKey,
    sortConfig,
    setSortConfig,
    selectedJointIds,
    setSelectedJointIds,
    isBulkEditOpen,
    setIsBulkEditOpen,
    passportModal,
    setPassportModal,
    isImportExcelOpen,
    setIsImportExcelOpen,
    scopedJoints,
    filteredAndSortedJoints,
    activeFilterKeys,
    getUniqueValuesForColumn,
    toggleSelectRow,
    toggleSelectAllVisible,
    handleClearSelection,
    handleWeldingDateFromChange,
    handleWeldingDateToChange,
    handleResetDateRange,
    handleSetColumnFilter,
    handleResetAllFilters,
    handleSetOpenFilterColumnKey,
    handleMoveColumnInline,
    handleHideColumnInline,
    handleOpenBulkEdit,
    handleOpenImportExcel,
    handleOpenCreatePassport,
    handleOpenEditPassport,
    handleOpenColumnsModal,
  };
}
