import React, { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Edit3,
  Loader2,
  Lock,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  WeldingMaterialCertificate,
  WeldingType,
} from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import {
  applyTableColumnFiltersAndSort,
  TableColumnFilterHeader,
} from '../TableColumnFilterPopover';
import {
  useResizableColumns,
  ColumnResizeHandle,
} from '../../utils/useResizableColumns';
import { Button, Input, Select } from '../ui';

export interface MaterialsDirectoryViewProps {
  materials: WeldingMaterialCertificate[];
  usageCounts?: Map<string, number>;
  onSaveMaterial: (
    material: WeldingMaterialCertificate
  ) => Promise<{ ok: boolean; error?: string } | void> | void;
  onDeleteMaterial?: (id: string) => Promise<{ ok: boolean; error?: string } | void> | void;
  canEdit?: boolean;
}

type MaterialQuickStatusFilter = 'ALL' | 'Допущен в производство' | 'На испытании';

function createEmptyMaterialDraft(): WeldingMaterialCertificate {
  return {
    id: `wm-${Date.now()}`,
    brandAndDiameter: '',
    materialType: 'Комбинированный комплект (РАД+РД)',
    weldingMethod: 'РАД+РД',
    batchNumber: '',
    certificateNumber: '',
    incomingControlAct: '',
    incomingControlDate: new Date().toISOString().slice(0, 10),
    status: 'Допущен в производство',
  };
}

export const MaterialsDirectoryView: React.FC<MaterialsDirectoryViewProps> = ({
  materials,
  usageCounts,
  onSaveMaterial,
  onDeleteMaterial,
  canEdit = true,
}) => {
  const [confirmDeleteMatId, setConfirmDeleteMatId] = useState<string | null>(null);
  const [confirmModalDelete, setConfirmModalDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Быстрый поиск и фильтры
  const [searchQuery, setSearchQuery] = useState('');
  const [quickStatusFilter, setQuickStatusFilter] =
    useState<MaterialQuickStatusFilter>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | WeldingType>('ALL');

  const [materialFilters, setMaterialFilters] = useState<Record<string, string[]>>({});
  const [materialSort, setMaterialSort] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  // Регулирование ширины столбцов таблицы сварочных материалов
  const {
    getColumnWidth: getMaterialColWidth,
    handleResizeStart: handleMaterialResizeStart,
    handleAutoFit: handleMaterialAutoFit,
    handleResetWidths: handleResetMaterialWidths,
    hasCustomWidths: hasCustomMaterialWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_materials',
    defaultWidths: {
      brandAndDiameter: 200,
      materialType: 150,
      weldingMethod: 120,
      batchNumber: 145,
      certificateNumber: 165,
      incomingControlAct: 155,
      incomingControlDate: 115,
      status: 145,
      usage: 80,
      action: 95,
    },
  });

  const statusCounts = useMemo(() => {
    let approved = 0;
    let testing = 0;
    for (const m of materials) {
      if (m.status === 'На испытании') testing += 1;
      else approved += 1;
    }
    return { all: materials.length, approved, testing };
  }, [materials]);

  const materialGetters: Record<string, (m: WeldingMaterialCertificate) => string> = {
    brandAndDiameter: (m) => m.brandAndDiameter,
    materialType: (m) => m.materialType,
    weldingMethod: (m) => m.weldingMethod,
    batchNumber: (m) => m.batchNumber,
    certificateNumber: (m) => m.certificateNumber,
    incomingControlAct: (m) => m.incomingControlAct,
    incomingControlDate: (m) => formatDateDDMMYY(m.incomingControlDate),
    status: (m) => m.status,
  };

  const preFilteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (quickStatusFilter !== 'ALL' && m.status !== quickStatusFilter) {
        return false;
      }
      if (methodFilter !== 'ALL' && m.weldingMethod !== methodFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          m.brandAndDiameter.toLowerCase().includes(q) ||
          m.materialType.toLowerCase().includes(q) ||
          m.weldingMethod.toLowerCase().includes(q) ||
          m.batchNumber.toLowerCase().includes(q) ||
          m.certificateNumber.toLowerCase().includes(q) ||
          m.incomingControlAct.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [materials, quickStatusFilter, methodFilter, searchQuery]);

  const filteredMaterials = applyTableColumnFiltersAndSort(
    preFilteredMaterials,
    materialFilters,
    materialGetters,
    materialSort
  );

  const hasAnyFilter = Boolean(
    searchQuery.trim() ||
      quickStatusFilter !== 'ALL' ||
      methodFilter !== 'ALL' ||
      Object.keys(materialFilters).length > 0
  );

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setQuickStatusFilter('ALL');
    setMethodFilter('ALL');
    setMaterialFilters({});
    setMaterialSort(null);
  };

  const handleApplyMaterialFilter = (colKey: string, vals: string[] | undefined) => {
    setMaterialFilters((prev) => {
      const next = { ...prev };
      if (vals === undefined) delete next[colKey];
      else next[colKey] = vals;
      return next;
    });
  };

  const [matModal, setMatModal] = useState<{
    isOpen: boolean;
    item: WeldingMaterialCertificate | null;
  }>({ isOpen: false, item: null });

  const [matForm, setMatForm] = useState<WeldingMaterialCertificate>(() =>
    createEmptyMaterialDraft()
  );
  const [modalError, setModalError] = useState('');

  const closeMatModal = () => {
    if (isSaving) return;
    setMatModal({ isOpen: false, item: null });
    setConfirmModalDelete(false);
    setModalError('');
  };

  const openMatModal = (item: WeldingMaterialCertificate | null) => {
    setModalError('');
    setConfirmModalDelete(false);
    if (item) {
      setMatForm({ ...item });
      setMatModal({ isOpen: true, item });
    } else {
      setMatForm(createEmptyMaterialDraft());
      setMatModal({ isOpen: true, item: null });
    }
  };

  const handleMatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setModalError('');

    const cleanBrand = matForm.brandAndDiameter.trim();
    if (!cleanBrand) {
      setModalError('Укажите марку и диаметр сварочного материала.');
      return;
    }
    if (!matForm.certificateNumber.trim()) {
      setModalError('Укажите номер сертификата качества.');
      return;
    }

    const payload: WeldingMaterialCertificate = {
      ...matForm,
      brandAndDiameter: cleanBrand,
      batchNumber: matForm.batchNumber.trim(),
      certificateNumber: matForm.certificateNumber.trim(),
      incomingControlAct: matForm.incomingControlAct.trim(),
    };

    setIsSaving(true);
    try {
      const res = await onSaveMaterial(payload);
      if (res && res.ok === false) {
        setModalError(res.error || 'Не удалось сохранить сварочный материал.');
        return;
      }
      setMatModal({ isOpen: false, item: null });
      setConfirmModalDelete(false);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не удалось сохранить сварочный материал.'
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
            Сварочные материалы и сертификаты входного контроля
          </h3>
          {canEdit && (
            <Button type="button" variant="primary" onClick={() => openMatModal(null)}>
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить материал</span>
            </Button>
          )}
        </div>

        {/* Панель поиска и быстрых фильтров */}
        <div className="px-4 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-52 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Марка, партия, сертификат, акт..."
                className="pl-8 w-full"
              />
            </div>

            <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {(
                [
                  { key: 'ALL', label: 'Все', count: statusCounts.all },
                  {
                    key: 'Допущен в производство',
                    label: 'Допущены',
                    count: statusCounts.approved,
                  },
                  {
                    key: 'На испытании',
                    label: 'На испытании',
                    count: statusCounts.testing,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setQuickStatusFilter(tab.key)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    quickStatusFilter === tab.key
                      ? 'bg-[#1e3799] text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1 rounded text-[10px] font-mono ${
                      quickStatusFilter === tab.key
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <Select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value as 'ALL' | WeldingType)}
              className="w-32"
              title="Фильтр по способу сварки"
            >
              <option value="ALL">Все способы</option>
              <option value="РАД+РД">РАД+РД</option>
              <option value="РАД">РАД</option>
              <option value="РД">РД</option>
              <option value="МП">МП</option>
              <option value="АФ">АФ</option>
              <option value="АПГ">АПГ</option>
            </Select>

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
              {filteredMaterials.length}
            </span>{' '}
            из <span className="font-mono">{materials.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto min-h-[340px] max-h-[calc(100vh-290px)] table-scroll-container">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr className="bg-[#1e3799] text-white text-xs">
                <TableColumnFilterHeader
                  columnKey="brandAndDiameter"
                  label="Марка и диаметр СМ"
                  rows={preFilteredMaterials}
                  getValue={materialGetters.brandAndDiameter}
                  activeFilters={materialFilters}
                  onApplyFilter={handleApplyMaterialFilter}
                  sortConfig={materialSort}
                  onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                  width={getMaterialColWidth('brandAndDiameter')}
                  minWidth={130}
                  onResizeStart={handleMaterialResizeStart}
                  onAutoFit={() => handleMaterialAutoFit('brandAndDiameter', 200)}
                />
                <TableColumnFilterHeader
                  columnKey="materialType"
                  label="Вид материалов"
                  rows={preFilteredMaterials}
                  getValue={materialGetters.materialType}
                  activeFilters={materialFilters}
                  onApplyFilter={handleApplyMaterialFilter}
                  sortConfig={materialSort}
                  onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                  width={getMaterialColWidth('materialType')}
                  minWidth={90}
                  onResizeStart={handleMaterialResizeStart}
                  onAutoFit={() => handleMaterialAutoFit('materialType', 150)}
                />
                <TableColumnFilterHeader
                  columnKey="weldingMethod"
                  label="Способ сварки"
                  rows={preFilteredMaterials}
                  getValue={materialGetters.weldingMethod}
                  activeFilters={materialFilters}
                  onApplyFilter={handleApplyMaterialFilter}
                  sortConfig={materialSort}
                  onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                  width={getMaterialColWidth('weldingMethod')}
                  minWidth={90}
                  onResizeStart={handleMaterialResizeStart}
                  onAutoFit={() => handleMaterialAutoFit('weldingMethod', 120)}
                />
                <TableColumnFilterHeader
                  columnKey="batchNumber"
                  label="Партия / Плавка"
                  rows={preFilteredMaterials}
                  getValue={materialGetters.batchNumber}
                  activeFilters={materialFilters}
                  onApplyFilter={handleApplyMaterialFilter}
                  sortConfig={materialSort}
                  onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                  width={getMaterialColWidth('batchNumber')}
                  minWidth={95}
                  onResizeStart={handleMaterialResizeStart}
                  onAutoFit={() => handleMaterialAutoFit('batchNumber', 145)}
                />
                <TableColumnFilterHeader
                  columnKey="certificateNumber"
                  label="№ сертификата качества"
                  rows={preFilteredMaterials}
                  getValue={materialGetters.certificateNumber}
                  activeFilters={materialFilters}
                  onApplyFilter={handleApplyMaterialFilter}
                  sortConfig={materialSort}
                  onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                  width={getMaterialColWidth('certificateNumber')}
                  minWidth={110}
                  onResizeStart={handleMaterialResizeStart}
                  onAutoFit={() => handleMaterialAutoFit('certificateNumber', 165)}
                />
                <TableColumnFilterHeader
                  columnKey="incomingControlAct"
                  label="Акт входного контроля"
                  rows={preFilteredMaterials}
                  getValue={materialGetters.incomingControlAct}
                  activeFilters={materialFilters}
                  onApplyFilter={handleApplyMaterialFilter}
                  sortConfig={materialSort}
                  onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                  width={getMaterialColWidth('incomingControlAct')}
                  minWidth={110}
                  onResizeStart={handleMaterialResizeStart}
                  onAutoFit={() => handleMaterialAutoFit('incomingControlAct', 155)}
                />
                <TableColumnFilterHeader
                  columnKey="incomingControlDate"
                  label="Дата ВК"
                  rows={preFilteredMaterials}
                  getValue={materialGetters.incomingControlDate}
                  activeFilters={materialFilters}
                  onApplyFilter={handleApplyMaterialFilter}
                  sortConfig={materialSort}
                  onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                  width={getMaterialColWidth('incomingControlDate')}
                  minWidth={85}
                  onResizeStart={handleMaterialResizeStart}
                  onAutoFit={() => handleMaterialAutoFit('incomingControlDate', 115)}
                />
                <TableColumnFilterHeader
                  columnKey="status"
                  label="Статус"
                  rows={preFilteredMaterials}
                  getValue={materialGetters.status}
                  activeFilters={materialFilters}
                  onApplyFilter={handleApplyMaterialFilter}
                  sortConfig={materialSort}
                  onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                  width={getMaterialColWidth('status')}
                  minWidth={100}
                  onResizeStart={handleMaterialResizeStart}
                  onAutoFit={() => handleMaterialAutoFit('status', 145)}
                />
                {usageCounts && (
                  <th
                    style={{
                      width: getMaterialColWidth('usage'),
                      minWidth: getMaterialColWidth('usage'),
                    }}
                    className="relative py-2.5 px-3 font-semibold text-center whitespace-nowrap"
                  >
                    Стыков
                    <ColumnResizeHandle
                      onResizeStart={handleMaterialResizeStart}
                      onAutoFit={() => handleMaterialAutoFit('usage', 80)}
                      colKey="usage"
                      currentWidth={getMaterialColWidth('usage')}
                      minWidth={65}
                    />
                  </th>
                )}
                <th
                  style={{
                    width: getMaterialColWidth('action'),
                    minWidth: getMaterialColWidth('action'),
                  }}
                  className="relative py-2.5 px-3 font-semibold text-center whitespace-nowrap"
                >
                  Действие
                  <ColumnResizeHandle
                    onResizeStart={handleMaterialResizeStart}
                    onAutoFit={() => handleMaterialAutoFit('action', 95)}
                    colKey="action"
                    currentWidth={getMaterialColWidth('action')}
                    minWidth={70}
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredMaterials.length === 0 ? (
                <tr>
                  <td
                    colSpan={usageCounts ? 10 : 9}
                    className="py-10 text-center text-slate-500 text-xs"
                  >
                    {materials.length === 0
                      ? 'Справочник сварочных материалов пуст'
                      : 'По заданным фильтрам сварочных материалов не найдено'}
                  </td>
                </tr>
              ) : (
                filteredMaterials.map((m) => {
                  const isTesting = m.status === 'На испытании';
                  const usedCount = usageCounts?.get(m.id) ?? 0;
                  return (
                    <tr key={m.id} className="hover:bg-sky-50/40">
                      <td
                        style={{
                          width: getMaterialColWidth('brandAndDiameter'),
                          minWidth: getMaterialColWidth('brandAndDiameter'),
                        }}
                        className="py-2.5 px-3 font-mono font-bold text-[#1e3799]"
                      >
                        {m.brandAndDiameter}
                      </td>
                      <td
                        style={{
                          width: getMaterialColWidth('materialType'),
                          minWidth: getMaterialColWidth('materialType'),
                        }}
                        className="py-2.5 px-3 text-slate-700"
                      >
                        {m.materialType}
                      </td>
                      <td
                        style={{
                          width: getMaterialColWidth('weldingMethod'),
                          minWidth: getMaterialColWidth('weldingMethod'),
                        }}
                        className="py-2.5 px-3 font-mono font-semibold text-slate-800"
                      >
                        {m.weldingMethod}
                      </td>
                      <td
                        style={{
                          width: getMaterialColWidth('batchNumber'),
                          minWidth: getMaterialColWidth('batchNumber'),
                        }}
                        className="py-2.5 px-3 font-mono text-slate-700"
                      >
                        {m.batchNumber || '—'}
                      </td>
                      <td
                        style={{
                          width: getMaterialColWidth('certificateNumber'),
                          minWidth: getMaterialColWidth('certificateNumber'),
                        }}
                        className="py-2.5 px-3 font-mono font-semibold text-slate-900"
                      >
                        {m.certificateNumber || '—'}
                      </td>
                      <td
                        style={{
                          width: getMaterialColWidth('incomingControlAct'),
                          minWidth: getMaterialColWidth('incomingControlAct'),
                        }}
                        className="py-2.5 px-3 font-mono text-slate-700"
                      >
                        {m.incomingControlAct || '—'}
                      </td>
                      <td
                        style={{
                          width: getMaterialColWidth('incomingControlDate'),
                          minWidth: getMaterialColWidth('incomingControlDate'),
                        }}
                        className="py-2.5 px-3 font-mono font-bold text-[#1e3799] whitespace-nowrap"
                      >
                        {formatDateDDMMYY(m.incomingControlDate) || '—'}
                      </td>
                      <td
                        style={{
                          width: getMaterialColWidth('status'),
                          minWidth: getMaterialColWidth('status'),
                        }}
                        className="py-2.5 px-3"
                      >
                        {isTesting ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-[11px] whitespace-nowrap">
                            <Clock className="w-3 h-3" />
                            {m.status}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px] whitespace-nowrap">
                            <ShieldCheck className="w-3 h-3" />
                            {m.status}
                          </span>
                        )}
                      </td>
                      {usageCounts && (
                        <td
                          style={{
                            width: getMaterialColWidth('usage'),
                            minWidth: getMaterialColWidth('usage'),
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
                          width: getMaterialColWidth('action'),
                          minWidth: getMaterialColWidth('action'),
                        }}
                        className="py-2.5 px-3 text-center whitespace-nowrap"
                      >
                        {!canEdit ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : confirmDeleteMatId === m.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteMaterial?.(m.id);
                                setConfirmDeleteMatId(null);
                              }}
                              className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 cursor-pointer"
                            >
                              Удалить
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMatId(null)}
                              className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 text-[10px] cursor-pointer"
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openMatModal(m)}
                              className="p-1.5 rounded text-slate-500 hover:text-[#1e3799] hover:bg-sky-50 cursor-pointer"
                              title="Редактировать запись сварочного материала"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {onDeleteMaterial && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMatId(m.id)}
                                className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                title={`Удалить сварочный материал «${m.brandAndDiameter}»`}
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
              Всего сварочных материалов:{' '}
              <span className="font-mono font-bold text-slate-800">
                {filteredMaterials.length}
              </span>{' '}
              из <span className="font-mono">{materials.length}</span>
            </div>
            {hasCustomMaterialWidths && (
              <button
                type="button"
                onClick={handleResetMaterialWidths}
                title="Сбросить ширину столбцов таблицы сварочных материалов"
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

      {matModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Сертификат и входной контроль сварочных материалов"
        >
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={closeMatModal}
          />
          <div className="relative z-10 w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <PackageCheck className="w-5 h-5 text-sky-300" />
                <h2 className="text-sm font-bold">
                  {matModal.item
                    ? 'Редактирование сварочного материала'
                    : 'Новый сварочный материал и акт входного контроля'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeMatModal}
                disabled={isSaving}
                className="p-1 rounded text-sky-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleMatSubmit}
              className="p-6 space-y-4 text-xs overflow-y-auto flex-1"
            >
              {modalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Марка и диаметр сварочного материала *
                </label>
                <input
                  type="text"
                  required
                  value={matForm.brandAndDiameter}
                  onChange={(e) =>
                    setMatForm((prev) => ({
                      ...prev,
                      brandAndDiameter: e.target.value,
                    }))
                  }
                  placeholder="Напр.: Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono font-bold text-[#1e3799]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Вид материалов *
                  </label>
                  <select
                    value={matForm.materialType}
                    onChange={(e) =>
                      setMatForm((prev) => ({
                        ...prev,
                        materialType: e.target.value as WeldingMaterialCertificate['materialType'],
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  >
                    <option value="Комбинированный комплект (РАД+РД)">
                      Комбинированный комплект РАД+РД
                    </option>
                    <option value="Проволока сварочная">Проволока сварочная</option>
                    <option value="Электроды покрытые">Электроды покрытые</option>
                    <option value="Защитный газ">Защитный газ</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Способ сварки *
                  </label>
                  <select
                    value={matForm.weldingMethod}
                    onChange={(e) =>
                      setMatForm((prev) => ({
                        ...prev,
                        weldingMethod: e.target.value as WeldingType,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  >
                    <option value="РАД+РД">РАД+РД</option>
                    <option value="РАД">РАД</option>
                    <option value="РД">РД</option>
                    <option value="МП">МП</option>
                    <option value="АФ">АФ</option>
                    <option value="АПГ">АПГ</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Статус *</label>
                  <select
                    value={matForm.status}
                    onChange={(e) =>
                      setMatForm((prev) => ({
                        ...prev,
                        status: e.target.value as WeldingMaterialCertificate['status'],
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-semibold"
                  >
                    <option value="Допущен в производство">Допущен в производство</option>
                    <option value="На испытании">На испытании</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Номер сертификата качества *
                  </label>
                  <input
                    type="text"
                    required
                    value={matForm.certificateNumber}
                    onChange={(e) =>
                      setMatForm((prev) => ({
                        ...prev,
                        certificateNumber: e.target.value,
                      }))
                    }
                    placeholder="Напр.: Серт. № НАКС-СМ-9820"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Партия / Плавка
                  </label>
                  <input
                    type="text"
                    value={matForm.batchNumber}
                    onChange={(e) =>
                      setMatForm((prev) => ({ ...prev, batchNumber: e.target.value }))
                    }
                    placeholder="Напр.: Пл. 71902 / Партия 114"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    № акта входного контроля
                  </label>
                  <input
                    type="text"
                    value={matForm.incomingControlAct}
                    onChange={(e) =>
                      setMatForm((prev) => ({
                        ...prev,
                        incomingControlAct: e.target.value,
                      }))
                    }
                    placeholder="Напр.: Акт ВК № 175/26-СМ"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="flex justify-between font-medium text-slate-700 mb-1">
                    <span>Дата входного контроля</span>
                    <span className="font-mono font-bold text-[#1e3799]">
                      {formatDateDDMMYY(matForm.incomingControlDate)}
                    </span>
                  </label>
                  <input
                    type="date"
                    value={matForm.incomingControlDate}
                    onChange={(e) =>
                      setMatForm((prev) => ({
                        ...prev,
                        incomingControlDate: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
                <div>
                  {matModal.item &&
                    onDeleteMaterial &&
                    (confirmModalDelete ? (
                      <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg">
                        <span className="text-[11px] font-semibold text-red-800">
                          Удалить материал?
                        </span>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={async () => {
                            if (!matModal.item) return;
                            setModalError('');
                            setIsSaving(true);
                            try {
                              const res = await onDeleteMaterial(matModal.item.id);
                              if (res && res.ok === false) {
                                setModalError(
                                  res.error || 'Не удалось удалить сварочный материал.'
                                );
                                setConfirmModalDelete(false);
                                return;
                              }
                              setMatModal({ isOpen: false, item: null });
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
                        <span>Удалить материал</span>
                      </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={closeMatModal}
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
