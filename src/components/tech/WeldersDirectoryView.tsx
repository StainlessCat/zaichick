import React, { useState } from 'react';
import {
  Award,
  Check,
  Edit3,
  Flame,
  Lock,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { WelderProfile, WeldingType } from '../../types/welding';
import { checkNaksCertStatus, formatDateDDMMYY } from '../../utils/weldingLogic';
import {
  applyTableColumnFiltersAndSort,
  TableColumnFilterHeader,
} from '../TableColumnFilterPopover';
import {
  useResizableColumns,
  ColumnResizeHandle,
} from '../../utils/useResizableColumns';

export interface WeldersDirectoryViewProps {
  welders: WelderProfile[];
  onSaveWelder: (welder: WelderProfile) => void;
  onDeleteWelder?: (stamp: string) => void;
  canEdit?: boolean;
  currentUserRoleLabel?: string;
}

export const WeldersDirectoryView: React.FC<WeldersDirectoryViewProps> = ({
  welders,
  onSaveWelder,
  onDeleteWelder,
  canEdit = true,
  currentUserRoleLabel = 'Технолог по сварке',
}) => {

  const [confirmDeleteWelderStamp, setConfirmDeleteWelderStamp] = useState<
    string | null
  >(null);

  const [welderFilters, setWelderFilters] = useState<Record<string, string[]>>({});
  const [welderSort, setWelderSort] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  // Регулирование ширины столбцов таблицы сварщиков
  const {
    columnWidths: welderColumnWidths,
    getColumnWidth: getWelderColWidth,
    handleResizeStart: handleWelderResizeStart,
    handleAutoFit: handleWelderAutoFit,
    handleResetWidths: handleResetWelderWidths,
    hasCustomWidths: hasCustomWelderWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_welders',
    defaultWidths: {
      stamp: 100,
      type: 120,
      fullName: 240,
      certNumber: 180,
      dates: 180,
      attestationArea: 220,
      admissionSheet: 180,
      crewForeman: 170,
      action: 95,
    },
  });


  const welderGetters: Record<string, (w: WelderProfile) => string> = {
    stamp: (w) => w.stamp,
    type: (w) =>
      w.isBrigade
        ? `Бригада (${(w.brigadeMembers || []).join(', ')})`
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

  const filteredWelders = applyTableColumnFiltersAndSort(
    welders,
    welderFilters,
    welderGetters,
    welderSort
  );

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

  const [welderForm, setWelderForm] = useState<WelderProfile>({
    id: '',
    stamp: '',
    isBrigade: false,
    brigadeMembers: [],
    fullName: '',
    certNumber: '',
    certIssueDate: '2025-05-10',
    certExpiryDate: '2027-05-10',
    attestationArea: 'РАД, РД · НГДО (п. 3, 4) · М01 · Ø57–530 мм, S 4.0–20.0 мм',
    admissionSheetNumber: 'ДЛ-045/26-030',
    admissionSheetDate: '2026-01-15',
    allowedMethods: ['РАД', 'РД', 'РАД+РД'],
    crewForeman: 'Мастер СМР Громов И.А.',
  });

  const personalWelders = welders.filter((w) => !w.isBrigade);

  const openWelderModal = (item: WelderProfile | null, isBrigade = false) => {
    setModalError('');
    if (item) {
      setWelderForm({
        ...item,
        brigadeMembers: item.brigadeMembers || [],
      });
      setWelderModal({ isOpen: true, isBrigade: Boolean(item.isBrigade), item });
    } else {
      setWelderForm({
        id: `w-${Date.now()}`,
        stamp: isBrigade ? 'БР-03' : '',
        isBrigade,
        brigadeMembers: [],
        fullName: '',
        certNumber: '',
        certIssueDate: '2025-05-15',
        certExpiryDate: '2027-05-15',
        attestationArea: isBrigade
          ? 'Бригадное клеймо (РАД+РД · М01 · Ø159–530 мм)'
          : 'РАД, РД · НГДО (п. 3, 4) · М01 · Ø57–426 мм, S 4.0–18.0 мм',
        admissionSheetNumber: isBrigade ? 'ДЛ-045/26-Б03' : 'ДЛ-045/26-035',
        admissionSheetDate: '2026-01-15',
        allowedMethods: ['РАД', 'РД', 'РАД+РД'],
        crewForeman: 'Мастер СМР Громов И.А.',
      });
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

    setWelderForm((prev) => ({
      ...prev,
      brigadeMembers: next,
      fullName: members.map((m) => m.fullName).join(', '),
      certNumber: members.map((m) => m.certNumber).join(', '),
      crewForeman: members[0]?.crewForeman || prev.crewForeman,
    }));
  };

  const [modalError, setModalError] = useState('');

  const handleWelderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    const cleanStamp = welderForm.stamp.trim();
    if (!cleanStamp) {
      setModalError('Укажите личное или бригадное клеймо.');
      return;
    }

    // Проверка на дубликат клейма при создании или изменении клейма сварщика
    if (
      welders.some(
        (w) =>
          w.id !== welderForm.id &&
          w.stamp.trim().toLowerCase() === cleanStamp.toLowerCase()
      )
    ) {
      setModalError(
        `Клеймо «${cleanStamp}» уже зарегистрировано в справочнике. Дублирование клейм запрещено.`
      );
      return;
    }

    // Проверка хронологии дат удостоверения НАКС
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

    onSaveWelder({
      ...welderForm,
      stamp: cleanStamp,
    });
    setWelderModal({ isOpen: false, isBrigade: false, item: null });
  };


  return (
    <div className="space-y-4">

        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
            <div>
              <h3 className="text-xs font-bold text-slate-900">
                Реестр аттестованных сварщиков (НАКС), допускных листов и бригадных клейм
              </h3>
              <p className="text-[11px] text-slate-500">
                При выборе клейма (или нескольких сварщиков / бригадного клейма) в Паспорте стыка ФИО и номера удостоверений подтягиваются автоматически
              </p>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openWelderModal(null, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e3799] text-[#1e3799] bg-sky-50 hover:bg-sky-100 text-xs font-semibold transition-colors"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Создать бригадное клеймо</span>
                </button>
                <button
                  type="button"
                  onClick={() => openWelderModal(null, false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить сварщика</span>
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto overflow-y-auto min-h-[340px] max-h-[calc(100vh-250px)] table-scroll-container">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-[#1e3799] text-white text-xs">
                  <TableColumnFilterHeader
                    columnKey="stamp"
                    label="Клеймо"
                    rows={welders}
                    getValue={welderGetters.stamp}
                    activeFilters={welderFilters}
                    onApplyFilter={handleApplyWelderFilter}
                    sortConfig={welderSort}
                    onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                    width={getWelderColWidth('stamp')}
                    minWidth={75}
                    onResizeStart={handleWelderResizeStart}
                    onAutoFit={() => handleWelderAutoFit('stamp', 100)}
                  />
                  <TableColumnFilterHeader
                    columnKey="type"
                    label="Тип"
                    rows={welders}
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
                    rows={welders}
                    getValue={welderGetters.fullName}
                    activeFilters={welderFilters}
                    onApplyFilter={handleApplyWelderFilter}
                    sortConfig={welderSort}
                    onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                    width={getWelderColWidth('fullName')}
                    minWidth={140}
                    onResizeStart={handleWelderResizeStart}
                    onAutoFit={() => handleWelderAutoFit('fullName', 240)}
                  />
                  <TableColumnFilterHeader
                    columnKey="certNumber"
                    label="№ удостоверения НАКС"
                    rows={welders}
                    getValue={welderGetters.certNumber}
                    activeFilters={welderFilters}
                    onApplyFilter={handleApplyWelderFilter}
                    sortConfig={welderSort}
                    onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                    width={getWelderColWidth('certNumber')}
                    minWidth={120}
                    onResizeStart={handleWelderResizeStart}
                    onAutoFit={() => handleWelderAutoFit('certNumber', 180)}
                  />
                  <TableColumnFilterHeader
                    columnKey="dates"
                    label="Дата выдачи / Срок"
                    rows={welders}
                    getValue={welderGetters.dates}
                    activeFilters={welderFilters}
                    onApplyFilter={handleApplyWelderFilter}
                    sortConfig={welderSort}
                    onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                    width={getWelderColWidth('dates')}
                    minWidth={130}
                    onResizeStart={handleWelderResizeStart}
                    onAutoFit={() => handleWelderAutoFit('dates', 180)}
                  />
                  <TableColumnFilterHeader
                    columnKey="attestationArea"
                    label="Область аттестации"
                    rows={welders}
                    getValue={welderGetters.attestationArea}
                    activeFilters={welderFilters}
                    onApplyFilter={handleApplyWelderFilter}
                    sortConfig={welderSort}
                    onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                    width={getWelderColWidth('attestationArea')}
                    minWidth={130}
                    onResizeStart={handleWelderResizeStart}
                    onAutoFit={() => handleWelderAutoFit('attestationArea', 220)}
                  />
                  <TableColumnFilterHeader
                    columnKey="admissionSheet"
                    label="Допускной лист (№ и дата)"
                    rows={welders}
                    getValue={welderGetters.admissionSheet}
                    activeFilters={welderFilters}
                    onApplyFilter={handleApplyWelderFilter}
                    sortConfig={welderSort}
                    onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                    width={getWelderColWidth('admissionSheet')}
                    minWidth={120}
                    onResizeStart={handleWelderResizeStart}
                    onAutoFit={() => handleWelderAutoFit('admissionSheet', 180)}
                  />
                  <TableColumnFilterHeader
                    columnKey="crewForeman"
                    label="Мастер / Прораб"
                    rows={welders}
                    getValue={welderGetters.crewForeman}
                    activeFilters={welderFilters}
                    onApplyFilter={handleApplyWelderFilter}
                    sortConfig={welderSort}
                    onSort={(k, dir) => setWelderSort({ key: k, direction: dir })}
                    width={getWelderColWidth('crewForeman')}
                    minWidth={110}
                    onResizeStart={handleWelderResizeStart}
                    onAutoFit={() => handleWelderAutoFit('crewForeman', 170)}
                  />
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
                {filteredWelders.map((w) => (
                  <tr key={w.stamp} className="hover:bg-sky-50/40">
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
                          Бригада ({(w.brigadeMembers || []).join(', ')})
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
                      {w.certNumber}
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
                      {(() => {
                        const certStatus = checkNaksCertStatus(w.certExpiryDate);
                        if (certStatus.badgeVariant === 'expired') {
                          return (
                            <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              {certStatus.message}
                            </span>
                          );
                        }
                        if (certStatus.badgeVariant === 'expiring') {
                          return (
                            <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              {certStatus.message}
                            </span>
                          );
                        }
                        if (certStatus.badgeVariant === 'valid') {
                          return (
                            <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {certStatus.message}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </td>
                    <td
                      style={{
                        width: getWelderColWidth('attestationArea'),
                        minWidth: getWelderColWidth('attestationArea'),
                      }}
                      className="py-2.5 px-3 text-slate-700 max-w-xs"
                    >
                      {w.attestationArea || w.allowedMethods.join(', ')}
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
                      {w.crewForeman}
                    </td>
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
                            className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700"
                          >
                            Удалить
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteWelderStamp(null)}
                            className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 text-[10px]"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openWelderModal(w, Boolean(w.isBrigade))}
                            className="p-1.5 rounded text-slate-500 hover:text-[#1e3799] hover:bg-sky-50"
                            title="Редактировать данные сварщика / бригады"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {onDeleteWelder && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteWelderStamp(w.stamp)}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                              title={`Удалить сварщика / бригаду «${w.stamp}»`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 bg-[#f8fafd] border border-t-0 border-slate-200 rounded-b-xl flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
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
                  title="Сбросить ширину столбцов таблицы сварщиков к заводской"
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

      {welderModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Данные сварщика или бригадного клейма"
        >
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={() => setWelderModal({ isOpen: false, isBrigade: false, item: null })}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white">
              <div className="flex items-center gap-2.5">
                <Award className="w-5 h-5 text-sky-300" />
                <h2 className="text-sm font-bold">
                  {welderModal.isBrigade
                    ? 'Формирование / Редактирование бригадного клейма'
                    : 'Карточка аттестации сварщика (НАКС и допускной лист)'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setWelderModal({ isOpen: false, isBrigade: false, item: null })}
                className="p-1 rounded text-sky-100 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleWelderSubmit} className="p-6 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold">
                  {modalError}
                </div>
              )}
              {welderModal.isBrigade && (
                <div className="p-3 rounded-lg bg-[#e8f1fc] border border-sky-200 space-y-2">
                  <div className="font-bold text-[#1e3799]">
                    Выберите сварщиков, входящих в состав бригады (ФИО и удостоверения объединятся автоматически):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {personalWelders.map((pw) => {
                      const checked = (welderForm.brigadeMembers || []).includes(pw.stamp);
                      return (
                        <button
                          key={pw.stamp}
                          type="button"
                          onClick={() => toggleBrigadeMemberInForm(pw.stamp)}
                          className={`px-2.5 py-1.5 rounded-md border font-mono text-xs transition-colors ${
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
                    ФИО сварщика (или состав бригады) *
                  </label>
                  <input
                    type="text"
                    required
                    value={welderForm.fullName}
                    onChange={(e) =>
                      setWelderForm((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    № удостоверения НАКС *
                  </label>
                  <input
                    type="text"
                    required
                    value={welderForm.certNumber}
                    onChange={(e) =>
                      setWelderForm((prev) => ({ ...prev, certNumber: e.target.value }))
                    }
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
                            ⚠ {status.message}
                          </span>
                        )}
                        {status.badgeVariant === 'expiring' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                            ⏰ {status.message}
                          </span>
                        )}
                        {status.badgeVariant === 'valid' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                            ✓ {status.message}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Область аттестации (способ сварки, группа сталей, диапазон диаметров и толщин)
                </label>
                <input
                  type="text"
                  value={welderForm.attestationArea || ''}
                  onChange={(e) =>
                    setWelderForm((prev) => ({ ...prev, attestationArea: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>

              {/* Структурированные параметры аттестации НАКС для автоматической валидации */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                  <span>Параметры аттестации НАКС (для автоматической проверки стыков)</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    Если не заполнены — извлекаются автоматически из текста области
                  </span>
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
                      placeholder="Напр.: 57"
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
                      placeholder="Напр.: 530"
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
                      placeholder="Напр.: 4.0"
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
                      placeholder="Напр.: 20.0"
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                </div>
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
                    value={welderForm.crewForeman}
                    onChange={(e) =>
                      setWelderForm((prev) => ({ ...prev, crewForeman: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
                <div>
                  {welderModal.item && onDeleteWelder && (
                    <button
                      type="button"
                      onClick={() => {
                        if (welderModal.item) {
                          onDeleteWelder(welderModal.item.stamp);
                          setWelderModal({ isOpen: false, isBrigade: false, item: null });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить сварщика</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWelderModal({ isOpen: false, isBrigade: false, item: null })}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e]"
                  >
                    <Check className="w-4 h-4" />
                    <span>Сохранить</span>
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
