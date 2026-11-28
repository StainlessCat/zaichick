import React, { useMemo, useState } from 'react';
import { WelderEditModal } from './WelderEditModal';
import { usePersistentState } from '../../hooks/usePersistentState';
import {
  Award,
  Check,
  Edit3,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { WelderNaksCert, WelderProfile, WeldingType } from '../../types/welding';
import { checkNaksCertStatus, formatDateDDMMYY } from '../../utils/weldingLogic';
import {
  applyTableColumnFiltersAndSort,
  TableColumnFilterHeader,
} from '../TableColumnFilterPopover';
import {
  useResizableColumns,
  ColumnResizeHandle,
} from '../../utils/useResizableColumns';
import { Button, Input } from '../ui';

export interface WeldersDirectoryViewProps {
  welders: WelderProfile[];
  usageCounts?: Map<string, number>;
  onSaveWelder: (
    welder: WelderProfile
  ) => Promise<{ ok: boolean; error?: string } | void> | void;
  onDeleteWelder?: (stamp: string) => Promise<{ ok: boolean; error?: string } | void> | void;
  canEdit?: boolean;
  currentUserRoleLabel?: string;
}

type WelderQuickFilter = 'ALL' | 'VALID' | 'EXPIRING' | 'EXPIRED' | 'BRIGADES';

const ALL_WELDING_METHODS: WeldingType[] = ['РАД', 'РД', 'РАД+РД', 'МП', 'АФ', 'АПГ'];
const STANDARD_STEEL_GROUPS = ['М01', 'М02', 'М03', 'М04', 'М05', 'М11', 'М11/М01'];

function createEmptyWelderDraft(isBrigade: boolean): WelderProfile {
  return {
    id: `w-${Date.now()}`,
    stamp: '',
    isBrigade,
    brigadeMembers: [],
    fullName: '',
    certNumber: '',
    certIssueDate: '',
    certExpiryDate: '',
    attestationArea: '',
    admissionSheetNumber: '',
    admissionSheetDate: '',
    allowedMethods: ['РАД', 'РД', 'РАД+РД'],
    steelGroups: ['М01'],
    naksCerts: [],
    crewForeman: '',
  };
}

/**
 * Определяет итоговый статус срока действия НАКС сварщика (с учётом основного удостоверения и naksCerts).
 */
function getEffectiveWelderCertStatus(w: WelderProfile) {
  if (w.certExpiryDate) {
    return checkNaksCertStatus(w.certExpiryDate);
  }
  const certDates = (w.naksCerts || [])
    .map((c) => c.expiryDate)
    .filter((d): d is string => Boolean(d && d.trim()));
  if (certDates.length === 0) {
    return checkNaksCertStatus(undefined);
  }
  const statuses = certDates.map((d) => checkNaksCertStatus(d));
  const expired = statuses.find((s) => s.badgeVariant === 'expired');
  if (expired) return expired;
  const expiring = statuses.find((s) => s.badgeVariant === 'expiring');
  if (expiring) return expiring;
  return statuses[0];
}

export const WeldersDirectoryView: React.FC<WeldersDirectoryViewProps> = ({
  welders,
  usageCounts,
  onSaveWelder,
  onDeleteWelder,
  canEdit = true,
}) => {
  const [confirmDeleteWelderStamp, setConfirmDeleteWelderStamp] = useState<
    string | null
  >(null);
  const [confirmModalDelete, setConfirmModalDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Поиск и быстрые фильтры
  const [searchQuery, setSearchQuery] = usePersistentState('welders:searchQuery', '');
  const [quickFilter, setQuickFilter] = usePersistentState<WelderQuickFilter>(
    'welders:quickFilter',
    'ALL'
  );

  const [welderFilters, setWelderFilters] = usePersistentState<Record<string, string[]>>(
    'welders:filters',
    {}
  );
  const [welderSort, setWelderSort] = usePersistentState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>('welders:sort', null);

  // Регулирование ширины столбцов таблицы сварщиков
  const {
    getColumnWidth: getWelderColWidth,
    handleResizeStart: handleWelderResizeStart,
    handleAutoFit: handleWelderAutoFit,
    handleResetWidths: handleResetWelderWidths,
    hasCustomWidths: hasCustomWelderWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_welders',
    defaultWidths: {
      stamp: 95,
      type: 120,
      fullName: 225,
      certNumber: 190,
      dates: 175,
      attestationArea: 215,
      admissionSheet: 170,
      crewForeman: 165,
      usage: 80,
      action: 95,
    },
  });

  const quickCounts = useMemo(() => {
    let valid = 0;
    let expiring = 0;
    let expired = 0;
    let brigades = 0;
    for (const w of welders) {
      if (w.isBrigade) brigades += 1;
      const st = getEffectiveWelderCertStatus(w);
      if (st.badgeVariant === 'expired') expired += 1;
      else if (st.badgeVariant === 'expiring') expiring += 1;
      else if (st.badgeVariant === 'valid') valid += 1;
    }
    return { all: welders.length, valid, expiring, expired, brigades };
  }, [welders]);

  const existingForemen = useMemo(() => {
    const set = new Set<string>();
    for (const w of welders) {
      const f = (w.crewForeman || '').trim();
      if (f) set.add(f);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [welders]);

  const welderGetters: Record<string, (w: WelderProfile) => string> = {
    stamp: (w) => w.stamp,
    type: (w) =>
      w.isBrigade
        ? `Бригада · ${(w.brigadeMembers || []).join(', ')}`
        : 'Личное клеймо',
    fullName: (w) => w.fullName,
    certNumber: (w) =>
      w.naksCerts && w.naksCerts.length > 0
        ? w.naksCerts.map((c) => `${c.weldingType}: ${c.certNumber}`).join('; ')
        : w.certNumber,
    dates: (w) =>
      `${formatDateDDMMYY(w.certIssueDate) || '—'} — ${
        formatDateDDMMYY(w.certExpiryDate) || '—'
      }`,
    attestationArea: (w) => w.attestationArea || w.allowedMethods.join(', '),
    admissionSheet: (w) =>
      `${w.admissionSheetNumber || '—'}${
        w.admissionSheetDate ? ` от ${formatDateDDMMYY(w.admissionSheetDate)}` : ''
      }`,
    crewForeman: (w) => w.crewForeman,
  };

  const preFilteredWelders = useMemo(() => {
    return welders.filter((w) => {
      if (quickFilter === 'BRIGADES' && !w.isBrigade) return false;
      if (quickFilter === 'VALID' || quickFilter === 'EXPIRING' || quickFilter === 'EXPIRED') {
        const st = getEffectiveWelderCertStatus(w);
        if (quickFilter === 'VALID' && st.badgeVariant !== 'valid') return false;
        if (quickFilter === 'EXPIRING' && st.badgeVariant !== 'expiring') return false;
        if (quickFilter === 'EXPIRED' && st.badgeVariant !== 'expired') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const certsStr = (w.naksCerts || [])
          .map((c) => `${c.weldingType} ${c.certNumber}`)
          .join(' ')
          .toLowerCase();
        const matches =
          w.stamp.toLowerCase().includes(q) ||
          w.fullName.toLowerCase().includes(q) ||
          (w.certNumber || '').toLowerCase().includes(q) ||
          certsStr.includes(q) ||
          (w.attestationArea || '').toLowerCase().includes(q) ||
          (w.admissionSheetNumber || '').toLowerCase().includes(q) ||
          (w.crewForeman || '').toLowerCase().includes(q) ||
          (w.brigadeMembers || []).some((m) => m.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [welders, quickFilter, searchQuery]);

  const filteredWelders = applyTableColumnFiltersAndSort(
    preFilteredWelders,
    welderFilters,
    welderGetters,
    welderSort
  );

  const hasAnyFilter = Boolean(
    searchQuery.trim() ||
      quickFilter !== 'ALL' ||
      Object.keys(welderFilters).length > 0
  );

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setQuickFilter('ALL');
    setWelderFilters({});
    setWelderSort(null);
  };

  const handleApplyWelderFilter = (colKey: string, vals: string[] | undefined) => {
    setWelderFilters((prev) => {
      const next = { ...prev };
      if (vals === undefined) delete next[colKey];
      else next[colKey] = vals;
      return next;
    });
  };

  // Модальное окно сварщика / бригады
  const [welderModal, setWelderModal] = useState<{
    isOpen: boolean;
    isBrigade: boolean;
    item: WelderProfile | null;
  }>({ isOpen: false, isBrigade: false, item: null });

  const [welderForm, setWelderForm] = useState<WelderProfile>(() =>
    createEmptyWelderDraft(false)
  );
  const [customSteelGroup, setCustomSteelGroup] = useState('');
  const [modalError, setModalError] = useState('');

  const personalWelders = useMemo(
    () => welders.filter((w) => !w.isBrigade),
    [welders]
  );

  const closeWelderModal = () => {
    if (isSaving) return;
    setWelderModal({ isOpen: false, isBrigade: false, item: null });
    setConfirmModalDelete(false);
    setModalError('');
    setCustomSteelGroup('');
  };

  const openWelderModal = (item: WelderProfile | null, isBrigade = false) => {
    setModalError('');
    setConfirmModalDelete(false);
    setCustomSteelGroup('');
    if (item) {
      setWelderForm({
        ...item,
        brigadeMembers: item.brigadeMembers || [],
        allowedMethods:
          item.allowedMethods && item.allowedMethods.length > 0
            ? [...item.allowedMethods]
            : ['РАД', 'РД', 'РАД+РД'],
        steelGroups: item.steelGroups ? [...item.steelGroups] : [],
        naksCerts: (item.naksCerts || []).map((c) => ({
          ...c,
          steelGroups: c.steelGroups ? [...c.steelGroups] : undefined,
        })),
      });
      setWelderModal({ isOpen: true, isBrigade: Boolean(item.isBrigade), item });
    } else {
      setWelderForm(createEmptyWelderDraft(isBrigade));
      setWelderModal({ isOpen: true, isBrigade, item: null });
    }
  };

  const toggleBrigadeMemberInForm = (stamp: string) => {
    const current = welderForm.brigadeMembers || [];
    const next = current.includes(stamp)
      ? current.filter((s) => s !== stamp)
      : [...current, stamp];
    const members = next
      .map((st) => personalWelders.find((w) => w.stamp === st))
      .filter((w): w is WelderProfile => Boolean(w));

    const combinedMethods = Array.from(
      new Set(members.flatMap((m) => m.allowedMethods || []))
    );
    const combinedSteels = Array.from(
      new Set(members.flatMap((m) => m.steelGroups || []))
    );

    setWelderForm((prev) => ({
      ...prev,
      brigadeMembers: next,
      fullName: members.map((m) => m.fullName).join(', '),
      certNumber: members.map((m) => m.certNumber).filter(Boolean).join(', '),
      crewForeman: members[0]?.crewForeman || prev.crewForeman,
      allowedMethods:
        combinedMethods.length > 0 ? combinedMethods : prev.allowedMethods,
      steelGroups: combinedSteels.length > 0 ? combinedSteels : prev.steelGroups,
    }));
  };

  const toggleAllowedMethod = (method: WeldingType) => {
    setWelderForm((prev) => {
      const exists = prev.allowedMethods.includes(method);
      const next = exists
        ? prev.allowedMethods.filter((m) => m !== method)
        : [...prev.allowedMethods, method];
      return { ...prev, allowedMethods: next };
    });
  };

  const toggleSteelGroup = (group: string) => {
    setWelderForm((prev) => {
      const current = prev.steelGroups || [];
      const exists = current.includes(group);
      const next = exists ? current.filter((g) => g !== group) : [...current, group];
      return { ...prev, steelGroups: next };
    });
  };

  const handleAddCustomSteelGroup = () => {
    const clean = customSteelGroup.trim().toUpperCase();
    if (!clean) return;
    setWelderForm((prev) => {
      const current = prev.steelGroups || [];
      if (current.includes(clean)) return prev;
      return { ...prev, steelGroups: [...current, clean] };
    });
    setCustomSteelGroup('');
  };

  const handleAddNaksCert = () => {
    const defaultType: WeldingType =
      welderForm.allowedMethods[0] || 'РАД';
    const newCert: WelderNaksCert = {
      weldingType: defaultType,
      certNumber: '',
      issueDate: welderForm.certIssueDate || '',
      expiryDate: welderForm.certExpiryDate || '',
      admissionSheetNumber: welderForm.admissionSheetNumber || '',
      admissionSheetDate: welderForm.admissionSheetDate || '',
      minDiameterMm: welderForm.minDiameterMm,
      maxDiameterMm: welderForm.maxDiameterMm,
      minWallThicknessMm: welderForm.minWallThicknessMm,
      maxWallThicknessMm: welderForm.maxWallThicknessMm,
    };
    setWelderForm((prev) => ({
      ...prev,
      naksCerts: [...(prev.naksCerts || []), newCert],
    }));
  };

  const updateNaksCert = (idx: number, patch: Partial<WelderNaksCert>) => {
    setWelderForm((prev) => ({
      ...prev,
      naksCerts: (prev.naksCerts || []).map((c, i) =>
        i === idx ? { ...c, ...patch } : c
      ),
    }));
  };

  const removeNaksCert = (idx: number) => {
    setWelderForm((prev) => ({
      ...prev,
      naksCerts: (prev.naksCerts || []).filter((_, i) => i !== idx),
    }));
  };

  const handleWelderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setModalError('');

    const cleanStamp = welderForm.stamp.trim();
    if (!cleanStamp) {
      setModalError('Укажите личное или бригадное клеймо.');
      return;
    }

    if (!welderForm.fullName.trim()) {
      setModalError('Укажите ФИО сварщика или состав бригады.');
      return;
    }

    const editingId = welderModal.item?.id;
    const editingOriginalStamp = welderModal.item?.stamp?.trim().toLowerCase();
    if (
      welders.some((w) => {
        if (editingId && w.id === editingId) return false;
        if (!editingId && editingOriginalStamp && w.stamp.trim().toLowerCase() === editingOriginalStamp) {
          return false;
        }
        return w.stamp.trim().toLowerCase() === cleanStamp.toLowerCase();
      })
    ) {
      setModalError(
        `Клеймо «${cleanStamp}» уже зарегистрировано в справочнике. Дублирование клейм запрещено.`
      );
      return;
    }

    if (
      welderForm.certIssueDate &&
      welderForm.certExpiryDate &&
      welderForm.certExpiryDate < welderForm.certIssueDate
    ) {
      setModalError(
        'Дата окончания удостоверения НАКС не может быть раньше даты выдачи.'
      );
      return;
    }

    if (
      welderForm.certIssueDate &&
      welderForm.admissionSheetDate &&
      welderForm.admissionSheetDate < welderForm.certIssueDate
    ) {
      setModalError(
        'Дата допускного листа не может быть раньше даты выдачи удостоверения НАКС.'
      );
      return;
    }

    if (
      welderForm.minDiameterMm !== undefined &&
      welderForm.maxDiameterMm !== undefined &&
      welderForm.minDiameterMm > welderForm.maxDiameterMm
    ) {
      setModalError(
        'Минимальный аттестованный диаметр не может превышать максимальный.'
      );
      return;
    }

    if (
      welderForm.minWallThicknessMm !== undefined &&
      welderForm.maxWallThicknessMm !== undefined &&
      welderForm.minWallThicknessMm > welderForm.maxWallThicknessMm
    ) {
      setModalError(
        'Минимальная аттестованная толщина стенки не может превышать максимальную.'
      );
      return;
    }

    const cleanedCerts: WelderNaksCert[] = [];
    for (let i = 0; i < (welderForm.naksCerts || []).length; i++) {
      const c = welderForm.naksCerts![i];
      if (!c.certNumber.trim()) {
        setModalError(
          `Укажите номер удостоверения НАКС в дополнительной строке №${i + 1} или удалите пустую строку.`
        );
        return;
      }
      if (c.issueDate && c.expiryDate && c.expiryDate < c.issueDate) {
        setModalError(
          `В удостоверении НАКС №${i + 1} дата окончания раньше даты выдачи.`
        );
        return;
      }
      if (
        c.minDiameterMm !== undefined &&
        c.maxDiameterMm !== undefined &&
        c.minDiameterMm > c.maxDiameterMm
      ) {
        setModalError(
          `В удостоверении НАКС №${i + 1} минимальный диаметр превышает максимальный.`
        );
        return;
      }
      if (
        c.minWallThicknessMm !== undefined &&
        c.maxWallThicknessMm !== undefined &&
        c.minWallThicknessMm > c.maxWallThicknessMm
      ) {
        setModalError(
          `В удостоверении НАКС №${i + 1} минимальная толщина стенки превышает максимальную.`
        );
        return;
      }
      cleanedCerts.push({
        ...c,
        certNumber: c.certNumber.trim(),
        admissionSheetNumber: c.admissionSheetNumber?.trim() || undefined,
        issueDate: c.issueDate || undefined,
        expiryDate: c.expiryDate || undefined,
        admissionSheetDate: c.admissionSheetDate || undefined,
      });
    }

    const effectiveAllowedMethods =
      welderForm.allowedMethods.length > 0
        ? welderForm.allowedMethods
        : cleanedCerts.length > 0
          ? Array.from(new Set(cleanedCerts.map((c) => c.weldingType)))
          : (['РАД', 'РД', 'РАД+РД'] as WeldingType[]);

    const payload: WelderProfile = {
      ...welderForm,
      stamp: cleanStamp,
      fullName: welderForm.fullName.trim(),
      certNumber:
        welderForm.certNumber.trim() ||
        cleanedCerts[0]?.certNumber ||
        '',
      attestationArea: welderForm.attestationArea?.trim() || undefined,
      admissionSheetNumber: welderForm.admissionSheetNumber?.trim() || undefined,
      crewForeman: welderForm.crewForeman.trim(),
      allowedMethods: effectiveAllowedMethods,
      steelGroups: welderForm.steelGroups || [],
      naksCerts: cleanedCerts,
    };

    setIsSaving(true);
    try {
      const res = await onSaveWelder(payload);
      if (res && res.ok === false) {
        setModalError(res.error || 'Не удалось сохранить данные сварщика.');
        return;
      }
      setWelderModal({ isOpen: false, isBrigade: false, item: null });
      setConfirmModalDelete(false);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не удалось сохранить данные сварщика.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
          <h3 className="text-xs font-bold text-slate-900">
            Аттестованные сварщики НАКС и бригадные клейма
          </h3>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => openWelderModal(null, true)}
              >
                <Users className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>Бригадное клеймо</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => openWelderModal(null, false)}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить сварщика</span>
              </Button>
            </div>
          )}
        </div>

        {/* Панель поиска и быстрых фильтров по статусам НАКС */}
        <div className="px-4 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-52 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Клеймо, ФИО, НАКС, мастер..."
                className="pl-8 w-full"
              />
            </div>

            <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {(
                [
                  { key: 'ALL', label: 'Все', count: quickCounts.all, tone: 'default' },
                  { key: 'VALID', label: 'Действуют', count: quickCounts.valid, tone: 'emerald' },
                  {
                    key: 'EXPIRING',
                    label: 'Истекают ≤ 30 дн.',
                    count: quickCounts.expiring,
                    tone: 'amber',
                  },
                  { key: 'EXPIRED', label: 'Просрочены', count: quickCounts.expired, tone: 'rose' },
                  { key: 'BRIGADES', label: 'Бригады', count: quickCounts.brigades, tone: 'default' },
                ] as const
              ).map((tab) => {
                const isActive = quickFilter === tab.key;
                const badgeCls = isActive
                  ? 'bg-white/20 text-white'
                  : tab.tone === 'rose' && tab.count > 0
                    ? 'bg-rose-100 text-rose-700'
                    : tab.tone === 'amber' && tab.count > 0
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-200/80 text-slate-600';
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setQuickFilter(tab.key)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#1e3799] text-white shadow-2xs'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1 rounded text-[10px] font-mono ${badgeCls}`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {hasAnyFilter && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleResetAllFilters}
                title="Сбросить все фильтры"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сбросить</span>
              </Button>
            )}
          </div>

          <div className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
            Показано:{' '}
            <span className="font-mono font-bold text-[#1e3799]">
              {filteredWelders.length}
            </span>{' '}
            из <span className="font-mono">{welders.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto min-h-[340px] max-h-[calc(100vh-290px)] table-scroll-container">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr className="bg-[#1e3799] text-white text-xs">
                <TableColumnFilterHeader
                  columnKey="stamp"
                  label="Клеймо"
                  rows={preFilteredWelders}
                  getValue={welderGetters.stamp}
                  activeFilters={welderFilters}
                  onApplyFilter={handleApplyWelderFilter}
                  sortConfig={welderSort}
                  onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                  width={getWelderColWidth('stamp')}
                  minWidth={75}
                  onResizeStart={handleWelderResizeStart}
                  onAutoFit={() => handleWelderAutoFit('stamp', 95)}
                />
                <TableColumnFilterHeader
                  columnKey="type"
                  label="Тип"
                  rows={preFilteredWelders}
                  getValue={welderGetters.type}
                  activeFilters={welderFilters}
                  onApplyFilter={handleApplyWelderFilter}
                  sortConfig={welderSort}
                  onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                  width={getWelderColWidth('type')}
                  minWidth={90}
                  onResizeStart={handleWelderResizeStart}
                  onAutoFit={() => handleWelderAutoFit('type', 120)}
                />
                <TableColumnFilterHeader
                  columnKey="fullName"
                  label="ФИО сварщика / Состав бригады"
                  rows={preFilteredWelders}
                  getValue={welderGetters.fullName}
                  activeFilters={welderFilters}
                  onApplyFilter={handleApplyWelderFilter}
                  sortConfig={welderSort}
                  onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                  width={getWelderColWidth('fullName')}
                  minWidth={140}
                  onResizeStart={handleWelderResizeStart}
                  onAutoFit={() => handleWelderAutoFit('fullName', 225)}
                />
                <TableColumnFilterHeader
                  columnKey="certNumber"
                  label="№ удостоверения НАКС"
                  rows={preFilteredWelders}
                  getValue={welderGetters.certNumber}
                  activeFilters={welderFilters}
                  onApplyFilter={handleApplyWelderFilter}
                  sortConfig={welderSort}
                  onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                  width={getWelderColWidth('certNumber')}
                  minWidth={130}
                  onResizeStart={handleWelderResizeStart}
                  onAutoFit={() => handleWelderAutoFit('certNumber', 190)}
                />
                <TableColumnFilterHeader
                  columnKey="dates"
                  label="Дата выдачи / Срок"
                  rows={preFilteredWelders}
                  getValue={welderGetters.dates}
                  activeFilters={welderFilters}
                  onApplyFilter={handleApplyWelderFilter}
                  sortConfig={welderSort}
                  onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                  width={getWelderColWidth('dates')}
                  minWidth={130}
                  onResizeStart={handleWelderResizeStart}
                  onAutoFit={() => handleWelderAutoFit('dates', 175)}
                />
                <TableColumnFilterHeader
                  columnKey="attestationArea"
                  label="Область аттестации"
                  rows={preFilteredWelders}
                  getValue={welderGetters.attestationArea}
                  activeFilters={welderFilters}
                  onApplyFilter={handleApplyWelderFilter}
                  sortConfig={welderSort}
                  onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                  width={getWelderColWidth('attestationArea')}
                  minWidth={130}
                  onResizeStart={handleWelderResizeStart}
                  onAutoFit={() => handleWelderAutoFit('attestationArea', 215)}
                />
                <TableColumnFilterHeader
                  columnKey="admissionSheet"
                  label="Допускной лист"
                  rows={preFilteredWelders}
                  getValue={welderGetters.admissionSheet}
                  activeFilters={welderFilters}
                  onApplyFilter={handleApplyWelderFilter}
                  sortConfig={welderSort}
                  onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                  width={getWelderColWidth('admissionSheet')}
                  minWidth={120}
                  onResizeStart={handleWelderResizeStart}
                  onAutoFit={() => handleWelderAutoFit('admissionSheet', 170)}
                />
                <TableColumnFilterHeader
                  columnKey="crewForeman"
                  label="Мастер / Прораб"
                  rows={preFilteredWelders}
                  getValue={welderGetters.crewForeman}
                  activeFilters={welderFilters}
                  onApplyFilter={handleApplyWelderFilter}
                  sortConfig={welderSort}
                  onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                  width={getWelderColWidth('crewForeman')}
                  minWidth={110}
                  onResizeStart={handleWelderResizeStart}
                  onAutoFit={() => handleWelderAutoFit('crewForeman', 165)}
                />
                {usageCounts && (
                  <th
                    style={{
                      width: getWelderColWidth('usage'),
                      minWidth: getWelderColWidth('usage'),
                    }}
                    className="relative py-2.5 px-3 font-semibold text-center whitespace-nowrap"
                  >
                    Стыков
                    <ColumnResizeHandle
                      onResizeStart={handleWelderResizeStart}
                      onAutoFit={() => handleWelderAutoFit('usage', 80)}
                      colKey="usage"
                      currentWidth={getWelderColWidth('usage')}
                      minWidth={65}
                    />
                  </th>
                )}
                <th
                  style={{
                    width: getWelderColWidth('action'),
                    minWidth: getWelderColWidth('action'),
                  }}
                  className="relative py-2.5 px-3 font-semibold text-center whitespace-nowrap"
                >
                  Действие
                  <ColumnResizeHandle
                    onResizeStart={handleWelderResizeStart}
                    onAutoFit={() => handleWelderAutoFit('action', 95)}
                    colKey="action"
                    currentWidth={getWelderColWidth('action')}
                    minWidth={70}
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredWelders.length === 0 ? (
                <tr>
                  <td
                    colSpan={usageCounts ? 10 : 9}
                    className="py-10 text-center text-slate-500 text-xs"
                  >
                    {welders.length === 0
                      ? 'Справочник сварщиков пуст'
                      : 'По заданным фильтрам сварщиков не найдено'}
                  </td>
                </tr>
              ) : (
                filteredWelders.map((w) => {
                  const certStatus = getEffectiveWelderCertStatus(w);
                  const usedCount = usageCounts?.get(w.stamp) ?? 0;
                  const hasMultiCerts = Boolean(w.naksCerts && w.naksCerts.length > 0);
                  return (
                    <tr key={w.id || w.stamp} className="hover:bg-sky-50/40">
                      <td
                        style={{
                          width: getWelderColWidth('stamp'),
                          minWidth: getWelderColWidth('stamp'),
                        }}
                        className="py-2.5 px-3 font-mono font-bold text-[#1e3799]"
                      >
                        {w.stamp}
                      </td>
                      <td
                        style={{
                          width: getWelderColWidth('type'),
                          minWidth: getWelderColWidth('type'),
                        }}
                        className="py-2.5 px-3"
                      >
                        {w.isBrigade ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-[11px]">
                            Бригада · {(w.brigadeMembers || []).join(', ') || 'без состава'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-[#1e3799] border border-sky-200 font-medium text-[11px]">
                            Личное клеймо
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          width: getWelderColWidth('fullName'),
                          minWidth: getWelderColWidth('fullName'),
                        }}
                        className="py-2.5 px-3 font-semibold text-slate-900"
                      >
                        {w.fullName}
                      </td>
                      <td
                        style={{
                          width: getWelderColWidth('certNumber'),
                          minWidth: getWelderColWidth('certNumber'),
                        }}
                        className="py-2.5 px-3 font-mono text-slate-800"
                      >
                        {hasMultiCerts ? (
                          <div className="space-y-1">
                            {w.naksCerts!.map((c, idx) => (
                              <div
                                key={`${c.weldingType}-${c.certNumber}-${idx}`}
                                className="flex items-center gap-1.5 text-[11px]"
                              >
                                <span className="px-1.5 py-0.25 rounded bg-slate-100 border border-slate-200 text-[#1e3799] font-bold text-[10px] shrink-0">
                                  {c.weldingType}
                                </span>
                                <span className="truncate">{c.certNumber}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span>{w.certNumber || '—'}</span>
                        )}
                      </td>
                      <td
                        style={{
                          width: getWelderColWidth('dates'),
                          minWidth: getWelderColWidth('dates'),
                        }}
                        className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap"
                      >
                        <div>
                          <span>{formatDateDDMMYY(w.certIssueDate) || '—'} — </span>
                          <span className="font-semibold text-slate-900">
                            {formatDateDDMMYY(w.certExpiryDate) || '—'}
                          </span>
                        </div>
                        {certStatus.badgeVariant === 'expired' && (
                          <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            {certStatus.message}
                          </span>
                        )}
                        {certStatus.badgeVariant === 'expiring' && (
                          <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {certStatus.message}
                          </span>
                        )}
                        {certStatus.badgeVariant === 'valid' && (
                          <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {certStatus.message}
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          width: getWelderColWidth('attestationArea'),
                          minWidth: getWelderColWidth('attestationArea'),
                        }}
                        className="py-2.5 px-3 text-slate-700 max-w-xs"
                      >
                        <div>{w.attestationArea || w.allowedMethods.join(', ')}</div>
                        {(w.allowedMethods?.length > 0 || (w.steelGroups && w.steelGroups.length > 0)) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {w.allowedMethods.map((m) => (
                              <span
                                key={m}
                                className="px-1 py-0.25 rounded bg-sky-50 text-[#1e3799] border border-sky-200/80 font-mono text-[10px] font-semibold"
                              >
                                {m}
                              </span>
                            ))}
                            {(w.steelGroups || []).map((sg) => (
                              <span
                                key={sg}
                                className="px-1 py-0.25 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[10px]"
                              >
                                {sg}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          width: getWelderColWidth('admissionSheet'),
                          minWidth: getWelderColWidth('admissionSheet'),
                        }}
                        className="py-2.5 px-3 font-mono text-slate-800 whitespace-nowrap"
                      >
                        {w.admissionSheetNumber || '—'}{' '}
                        {w.admissionSheetDate
                          ? `от ${formatDateDDMMYY(w.admissionSheetDate)}`
                          : ''}
                      </td>
                      <td
                        style={{
                          width: getWelderColWidth('crewForeman'),
                          minWidth: getWelderColWidth('crewForeman'),
                        }}
                        className="py-2.5 px-3 text-slate-700"
                      >
                        {w.crewForeman || '—'}
                      </td>
                      {usageCounts && (
                        <td
                          style={{
                            width: getWelderColWidth('usage'),
                            minWidth: getWelderColWidth('usage'),
                          }}
                          className="py-2.5 px-3 text-center font-mono"
                        >
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                              usedCount > 0
                                ? 'bg-sky-50 text-[#1e3799] border border-sky-200'
                                : 'text-slate-400'
                            }`}
                          >
                            {usedCount}
                          </span>
                        </td>
                      )}
                      <td
                        style={{
                          width: getWelderColWidth('action'),
                          minWidth: getWelderColWidth('action'),
                        }}
                        className="py-2.5 px-3 text-center whitespace-nowrap"
                      >
                        {!canEdit ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : confirmDeleteWelderStamp === w.stamp ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteWelder?.(w.stamp);
                                setConfirmDeleteWelderStamp(null);
                              }}
                              className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 cursor-pointer"
                            >
                              Удалить
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteWelderStamp(null)}
                              className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 text-[10px] cursor-pointer"
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openWelderModal(w, Boolean(w.isBrigade))}
                              className="p-1.5 rounded text-slate-500 hover:text-[#1e3799] hover:bg-sky-50 cursor-pointer"
                              title="Редактировать данные сварщика или бригады"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {onDeleteWelder && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteWelderStamp(w.stamp)}
                                className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                title={`Удалить клеймо «${w.stamp}»`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 bg-[#f8fafd] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div>
              Всего сварщиков и бригад:{' '}
              <span className="font-mono font-bold text-slate-800">
                {filteredWelders.length}
              </span>{' '}
              из <span className="font-mono">{welders.length}</span>
            </div>
            {hasCustomWelderWidths && (
              <button
                type="button"
                onClick={handleResetWelderWidths}
                title="Сбросить ширину столбцов таблицы сварщиков"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Сбросить ширину столбцов</span>
              </button>
            )}
          </div>
          <div>
            Ширина столбцов регулируется перетаскиванием границы заголовка; двойной клик — автоподбор
          </div>
        </div>
      </div>

      <WelderEditModal
        welderModal={welderModal}
        setWelderModal={setWelderModal}
        welderForm={welderForm}
        setWelderForm={setWelderForm}
        personalWelders={personalWelders}
        existingForemen={existingForemen}
        customSteelGroup={customSteelGroup}
        setCustomSteelGroup={setCustomSteelGroup}
        modalError={modalError}
        setModalError={setModalError}
        isSaving={isSaving}
        setIsSaving={setIsSaving}
        confirmModalDelete={confirmModalDelete}
        setConfirmModalDelete={setConfirmModalDelete}
        onClose={closeWelderModal}
        onSubmit={handleWelderSubmit}
        onToggleBrigadeMember={toggleBrigadeMemberInForm}
        onToggleAllowedMethod={toggleAllowedMethod}
        onToggleSteelGroup={toggleSteelGroup}
        onAddCustomSteelGroup={handleAddCustomSteelGroup}
        onAddNaksCert={handleAddNaksCert}
        onUpdateNaksCert={updateNaksCert}
        onRemoveNaksCert={removeNaksCert}
        onDeleteWelder={onDeleteWelder}
        allWeldingMethods={ALL_WELDING_METHODS}
        standardSteelGroups={STANDARD_STEEL_GROUPS}
      />
    </div>
  );
};
