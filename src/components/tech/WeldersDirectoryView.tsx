import React, { useMemo, useState } from 'react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<WelderQuickFilter>('ALL');

  const [welderFilters, setWelderFilters] = useState<Record<string, string[]>>({});
  const [welderSort, setWelderSort] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

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

      {welderModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Данные сварщика или бригадного клейма"
        >
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={closeWelderModal}
          />
          <div className="relative z-10 w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <Award className="w-5 h-5 text-sky-300" />
                <h2 className="text-sm font-bold">
                  {welderModal.isBrigade
                    ? welderModal.item
                      ? `Редактирование бригадного клейма ${welderModal.item.stamp}`
                      : 'Новое бригадное клеймо'
                    : welderModal.item
                      ? `Карточка сварщика ${welderModal.item.stamp}`
                      : 'Новый аттестованный сварщик НАКС'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeWelderModal}
                disabled={isSaving}
                className="p-1 rounded text-sky-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleWelderSubmit}
              className="p-6 space-y-4 text-xs overflow-y-auto flex-1"
            >
              {modalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold">
                  {modalError}
                </div>
              )}

              {welderModal.isBrigade && (
                <div className="p-3 rounded-lg bg-[#e8f1fc] border border-sky-200 space-y-2">
                  <div className="font-bold text-[#1e3799]">
                    Выберите сварщиков в состав бригады — ФИО, удостоверения и способы сварки объединятся автоматически
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {personalWelders.map((pw) => {
                      const checked = (welderForm.brigadeMembers || []).includes(pw.stamp);
                      return (
                        <button
                          key={pw.stamp}
                          type="button"
                          onClick={() => toggleBrigadeMemberInForm(pw.stamp)}
                          className={`px-2.5 py-1.5 rounded-md border font-mono text-xs transition-colors cursor-pointer ${
                            checked
                              ? 'bg-[#1e3799] text-white border-[#1e3799] font-bold'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {pw.stamp} · {pw.fullName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {welderModal.isBrigade ? 'Бригадное клеймо *' : 'Личное клеймо сварщика *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={welderForm.stamp}
                    onChange={(e) =>
                      setWelderForm((prev) => ({ ...prev, stamp: e.target.value }))
                    }
                    placeholder={welderModal.isBrigade ? 'БР-01' : 'А142'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono font-bold text-[#1e3799]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    {welderModal.isBrigade ? 'Состав бригады *' : 'ФИО сварщика *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={welderForm.fullName}
                    onChange={(e) =>
                      setWelderForm((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                    placeholder={
                      welderModal.isBrigade
                        ? 'Иванов И.И., Петров П.П.'
                        : 'Иванов Иван Иванович'
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    № основного удостоверения НАКС *
                  </label>
                  <input
                    type="text"
                    required={(welderForm.naksCerts || []).length === 0}
                    value={welderForm.certNumber}
                    onChange={(e) =>
                      setWelderForm((prev) => ({ ...prev, certNumber: e.target.value }))
                    }
                    placeholder="Напр.: УР-1АЦ-I-04512"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="flex justify-between font-medium text-slate-700 mb-1">
                    <span>Дата выдачи</span>
                    <span className="font-mono text-[#1e3799]">
                      {formatDateDDMMYY(welderForm.certIssueDate)}
                    </span>
                  </label>
                  <input
                    type="date"
                    value={welderForm.certIssueDate || ''}
                    onChange={(e) =>
                      setWelderForm((prev) => ({ ...prev, certIssueDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="flex justify-between font-medium text-slate-700 mb-1">
                    <span>Срок действия до</span>
                    <span className="font-mono text-[#1e3799]">
                      {formatDateDDMMYY(welderForm.certExpiryDate)}
                    </span>
                  </label>
                  <input
                    type="date"
                    value={welderForm.certExpiryDate || ''}
                    onChange={(e) =>
                      setWelderForm((prev) => ({ ...prev, certExpiryDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                  {welderForm.certExpiryDate && (() => {
                    const status = checkNaksCertStatus(welderForm.certExpiryDate);
                    return (
                      <div className="mt-1">
                        {status.badgeVariant === 'expired' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                            {status.message}
                          </span>
                        )}
                        {status.badgeVariant === 'expiring' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                            {status.message}
                          </span>
                        )}
                        {status.badgeVariant === 'valid' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                            {status.message}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Область аттестации
                </label>
                <input
                  type="text"
                  value={welderForm.attestationArea || ''}
                  onChange={(e) =>
                    setWelderForm((prev) => ({ ...prev, attestationArea: e.target.value }))
                  }
                  placeholder="Напр.: РАД, РД · НГДО п. 3, 4 · М01 · Ø57–530 мм, S 4.0–20.0 мм"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>

              {/* Допущенные способы сварки и группы сталей */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="text-[11px] font-bold text-slate-800">
                  Параметры аттестации НАКС для автоматической проверки стыков
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-semibold text-slate-600 mb-1.5">
                      Допущенные способы сварки
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_WELDING_METHODS.map((method) => {
                        const active = welderForm.allowedMethods.includes(method);
                        return (
                          <button
                            key={method}
                            type="button"
                            onClick={() => toggleAllowedMethod(method)}
                            className={`px-2 py-1 rounded border font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                              active
                                ? 'bg-[#1e3799] text-white border-[#1e3799]'
                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {method}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold text-slate-600 mb-1.5">
                      Группы свариваемых сталей
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {Array.from(
                        new Set([...STANDARD_STEEL_GROUPS, ...(welderForm.steelGroups || [])])
                      ).map((sg) => {
                        const active = (welderForm.steelGroups || []).includes(sg);
                        return (
                          <button
                            key={sg}
                            type="button"
                            onClick={() => toggleSteelGroup(sg)}
                            className={`px-2 py-1 rounded border font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                              active
                                ? 'bg-[#1e3799] text-white border-[#1e3799]'
                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {sg}
                          </button>
                        );
                      })}
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          value={customSteelGroup}
                          onChange={(e) => setCustomSteelGroup(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomSteelGroup();
                            }
                          }}
                          placeholder="Своя"
                          className="w-16 px-1.5 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomSteelGroup}
                          className="p-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Добавить группу стали"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-600 mb-0.5">
                      Мин. диаметр Ø, мм
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={welderForm.minDiameterMm ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : undefined;
                        setWelderForm((prev) => ({ ...prev, minDiameterMm: val }));
                      }}
                      placeholder="57"
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-600 mb-0.5">
                      Макс. диаметр Ø, мм
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={welderForm.maxDiameterMm ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : undefined;
                        setWelderForm((prev) => ({ ...prev, maxDiameterMm: val }));
                      }}
                      placeholder="530"
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-600 mb-0.5">
                      Мин. толщина S, мм
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={welderForm.minWallThicknessMm ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : undefined;
                        setWelderForm((prev) => ({ ...prev, minWallThicknessMm: val }));
                      }}
                      placeholder="4.0"
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-600 mb-0.5">
                      Макс. толщина S, мм
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={welderForm.maxWallThicknessMm ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : undefined;
                        setWelderForm((prev) => ({ ...prev, maxWallThicknessMm: val }));
                      }}
                      placeholder="20.0"
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Удостоверения НАКС по отдельным способам сварки */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#1e3799]">
                    Удостоверения НАКС по отдельным способам сварки
                  </span>
                  <button
                    type="button"
                    onClick={handleAddNaksCert}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-sky-300 bg-sky-50 text-[#1e3799] hover:bg-sky-100 text-[11px] font-semibold cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Добавить удостоверение</span>
                  </button>
                </div>

                {(welderForm.naksCerts || []).length === 0 ? (
                  <div className="px-3 py-2 rounded-lg bg-slate-50 border border-dashed border-slate-300 text-[11px] text-slate-500">
                    Если у сварщика несколько удостоверений НАКС на разные способы сварки, добавьте их здесь для раздельной проверки сроков и допусков.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(welderForm.naksCerts || []).map((cert, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr_130px_130px_auto] gap-2 items-end">
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Способ
                            </label>
                            <select
                              value={cert.weldingType}
                              onChange={(e) =>
                                updateNaksCert(idx, {
                                  weldingType: e.target.value as WeldingType,
                                })
                              }
                              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                            >
                              {ALL_WELDING_METHODS.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              № удостоверения НАКС *
                            </label>
                            <input
                              type="text"
                              value={cert.certNumber}
                              onChange={(e) =>
                                updateNaksCert(idx, { certNumber: e.target.value })
                              }
                              placeholder="УР-1АЦ-I-04512"
                              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Выдано
                            </label>
                            <input
                              type="date"
                              value={cert.issueDate || ''}
                              onChange={(e) =>
                                updateNaksCert(idx, { issueDate: e.target.value })
                              }
                              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Действует до
                            </label>
                            <input
                              type="date"
                              value={cert.expiryDate || ''}
                              onChange={(e) =>
                                updateNaksCert(idx, { expiryDate: e.target.value })
                              }
                              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeNaksCert(idx)}
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            title="Удалить удостоверение"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                          <div className="col-span-2 sm:col-span-2">
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              № допускного листа
                            </label>
                            <input
                              type="text"
                              value={cert.admissionSheetNumber || ''}
                              onChange={(e) =>
                                updateNaksCert(idx, {
                                  admissionSheetNumber: e.target.value,
                                })
                              }
                              placeholder="ДЛ-045/26-01"
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Ø от, мм
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={cert.minDiameterMm ?? ''}
                              onChange={(e) =>
                                updateNaksCert(idx, {
                                  minDiameterMm: e.target.value
                                    ? parseFloat(e.target.value)
                                    : undefined,
                                })
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Ø до, мм
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={cert.maxDiameterMm ?? ''}
                              onChange={(e) =>
                                updateNaksCert(idx, {
                                  maxDiameterMm: e.target.value
                                    ? parseFloat(e.target.value)
                                    : undefined,
                                })
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              S от, мм
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={cert.minWallThicknessMm ?? ''}
                              onChange={(e) =>
                                updateNaksCert(idx, {
                                  minWallThicknessMm: e.target.value
                                    ? parseFloat(e.target.value)
                                    : undefined,
                                })
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              S до, мм
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={cert.maxWallThicknessMm ?? ''}
                              onChange={(e) =>
                                updateNaksCert(idx, {
                                  maxWallThicknessMm: e.target.value
                                    ? parseFloat(e.target.value)
                                    : undefined,
                                })
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    № допускного листа
                  </label>
                  <input
                    type="text"
                    value={welderForm.admissionSheetNumber || ''}
                    onChange={(e) =>
                      setWelderForm((prev) => ({
                        ...prev,
                        admissionSheetNumber: e.target.value,
                      }))
                    }
                    placeholder="Напр.: ДЛ-045/26-030"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="flex justify-between font-medium text-slate-700 mb-1">
                    <span>Дата допускного листа</span>
                    <span className="font-mono text-[#1e3799]">
                      {formatDateDDMMYY(welderForm.admissionSheetDate)}
                    </span>
                  </label>
                  <input
                    type="date"
                    value={welderForm.admissionSheetDate || ''}
                    onChange={(e) =>
                      setWelderForm((prev) => ({
                        ...prev,
                        admissionSheetDate: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Ответственный мастер / прораб
                  </label>
                  <input
                    type="text"
                    list="welder-foremen-suggestions"
                    value={welderForm.crewForeman}
                    onChange={(e) =>
                      setWelderForm((prev) => ({ ...prev, crewForeman: e.target.value }))
                    }
                    placeholder="Напр.: Мастер СМР Иванов И.И."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                  {existingForemen.length > 0 && (
                    <datalist id="welder-foremen-suggestions">
                      {existingForemen.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
                <div>
                  {welderModal.item &&
                    onDeleteWelder &&
                    (confirmModalDelete ? (
                      <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg">
                        <span className="text-[11px] font-semibold text-red-800">
                          Удалить запись?
                        </span>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={async () => {
                            if (!welderModal.item) return;
                            setModalError('');
                            setIsSaving(true);
                            try {
                              const res = await onDeleteWelder(welderModal.item.stamp);
                              if (res && res.ok === false) {
                                setModalError(
                                  res.error || 'Не удалось удалить запись сварщика.'
                                );
                                setConfirmModalDelete(false);
                                return;
                              }
                              setWelderModal({
                                isOpen: false,
                                isBrigade: false,
                                item: null,
                              });
                              setConfirmModalDelete(false);
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 cursor-pointer"
                        >
                          Подтвердить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmModalDelete(false)}
                          className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold cursor-pointer"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => setConfirmModalDelete(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-semibold cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                          {welderModal.isBrigade ? 'Удалить бригаду' : 'Удалить сварщика'}
                        </span>
                      </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={closeWelderModal}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] disabled:opacity-60 cursor-pointer"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>{isSaving ? 'Сохранение...' : 'Сохранить'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
