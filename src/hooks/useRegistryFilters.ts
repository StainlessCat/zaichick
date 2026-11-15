import { useCallback, useMemo, useState } from 'react';
import {
  NdtLabRequest,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';
import {
  computeColumnUniqueValues,
  filterAndSortJoints,
  filterJointsByScope,
} from '../utils/filters';

export interface UseRegistryFiltersParams {
  joints: WeldJoint[];
  selectedObjectName: string;
  selectedRdCode: string;
  labRequests: NdtLabRequest[];
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
    visibleColumns,
    setVisibleColumns,
    setColumnOrder,
    setIsColumnsModalOpen,
  } = params;

  const [globalSearch, setGlobalSearch] = useState('');
  const [weldingDateFrom, setWeldingDateFrom] = useState('');
  const [weldingDateTo, setWeldingDateTo] = useState('');
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

  const scopedJoints = useMemo(() => {
    return filterJointsByScope(joints, selectedObjectName, selectedRdCode);
  }, [joints, selectedObjectName, selectedRdCode]);

  const filteredAndSortedJoints = useMemo(() => {
    return filterAndSortJoints(scopedJoints, {
      columnFilters,
      globalSearch,
      weldingDateFrom,
      weldingDateTo,
      sortConfig,
      labRequests,
    });
  }, [
    scopedJoints,
    columnFilters,
    globalSearch,
    weldingDateFrom,
    weldingDateTo,
    sortConfig,
    labRequests,
  ]);

  const getUniqueValuesForColumn = useCallback(
    (colKey: WeldJointFieldKey) => {
      return computeColumnUniqueValues(scopedJoints, colKey, labRequests);
    },
    [scopedJoints, labRequests]
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
    if (selectedJointIds.length === filteredAndSortedJoints.length) {
      setSelectedJointIds([]);
    } else {
      setSelectedJointIds(filteredAndSortedJoints.map((j) => j.id));
    }
  }, [filteredAndSortedJoints, selectedJointIds.length]);

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
