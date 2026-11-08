import React, { useState } from 'react';
import {
  Check,
  Edit3,
  Lock,
  PackageCheck,
  Plus,
  RotateCcw,
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

export interface MaterialsDirectoryViewProps {
  materials: WeldingMaterialCertificate[];
  onSaveMaterial: (material: WeldingMaterialCertificate) => void;
  onDeleteMaterial?: (id: string) => void;
  canEdit?: boolean;
}

export const MaterialsDirectoryView: React.FC<MaterialsDirectoryViewProps> = ({
  materials,
  onSaveMaterial,
  onDeleteMaterial,
  canEdit = true,
}) => {

  const [confirmDeleteMatId, setConfirmDeleteMatId] = useState<string | null>(null);

  const [materialFilters, setMaterialFilters] = useState<Record<string, string[]>>({});
  const [materialSort, setMaterialSort] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);


  // Регулирование ширины столбцов таблицы сварочных материалов
  const {
    columnWidths: materialColumnWidths,
    getColumnWidth: getMaterialColWidth,
    handleResizeStart: handleMaterialResizeStart,
    handleAutoFit: handleMaterialAutoFit,
    handleResetWidths: handleResetMaterialWidths,
    hasCustomWidths: hasCustomMaterialWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_materials',
    defaultWidths: {
      brandAndDiameter: 200,
      materialType: 140,
      weldingMethod: 130,
      batchNumber: 150,
      certificateNumber: 170,
      incomingControlAct: 160,
      incomingControlDate: 130,
      status: 120,
      action: 95,
    },
  });


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

  const filteredMaterials = applyTableColumnFiltersAndSort(
    materials,
    materialFilters,
    materialGetters,
    materialSort
  );

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

  const [matForm, setMatForm] = useState<WeldingMaterialCertificate>({
    id: '',
    brandAndDiameter: '',
    materialType: 'Комбинированный комплект (РАД+РД)',
    weldingMethod: 'РАД+РД',
    batchNumber: '',
    certificateNumber: '',
    incomingControlAct: '',
    incomingControlDate: '2026-01-15',
    status: 'Допущен в производство',
  });

  const [modalError, setModalError] = useState('');

  const openMatModal = (item: WeldingMaterialCertificate | null) => {
    setModalError('');
    if (item) {
      setMatForm({ ...item });
      setMatModal({ isOpen: true, item });
    } else {
      setMatForm({
        id: `wm-${Date.now()}`,
        brandAndDiameter: 'Св-08Г2С Ø2.0 / LB-52U Ø2.6',
        materialType: 'Комбинированный комплект (РАД+РД)',
        weldingMethod: 'РАД+РД',
        batchNumber: 'Пл. 71902 / Партия 114',
        certificateNumber: 'Серт. № НАКС-СМ-9820',
        incomingControlAct: 'Акт ВК № 175/26-СМ',
        incomingControlDate: '2026-01-15',
        status: 'Допущен в производство',
      });
      setMatModal({ isOpen: true, item: null });
    }
  };

  const handleMatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    if (!matForm.brandAndDiameter.trim()) {
      setModalError('Укажите марку и диаметр сварочного материала.');
      return;
    }
    onSaveMaterial({
      ...matForm,
      brandAndDiameter: matForm.brandAndDiameter.trim(),
    });
    setMatModal({ isOpen: false, item: null });
  };

  return (
    <div className="space-y-4">

        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
            <div>
              <h3 className="text-xs font-bold text-slate-900">
                Перечень сварочных материалов с номерами сертификатов и датами проведения входного контроля (ВК)
              </h3>
              <p className="text-[11px] text-slate-500">
                Все даты проведения входного контроля отображаются строго в формате ДД.ММ.ГГ
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => openMatModal(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить сварочный материал</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto overflow-y-auto min-h-[340px] max-h-[calc(100vh-250px)] table-scroll-container">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-[#1e3799] text-white text-xs">
                  <TableColumnFilterHeader
                    columnKey="brandAndDiameter"
                    label="Марка и диаметр СМ"
                    rows={materials}
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
                    rows={materials}
                    getValue={materialGetters.materialType}
                    activeFilters={materialFilters}
                    onApplyFilter={handleApplyMaterialFilter}
                    sortConfig={materialSort}
                    onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                    width={getMaterialColWidth('materialType')}
                    minWidth={90}
                    onResizeStart={handleMaterialResizeStart}
                    onAutoFit={() => handleMaterialAutoFit('materialType', 140)}
                  />
                  <TableColumnFilterHeader
                    columnKey="weldingMethod"
                    label="Способ сварки"
                    rows={materials}
                    getValue={materialGetters.weldingMethod}
                    activeFilters={materialFilters}
                    onApplyFilter={handleApplyMaterialFilter}
                    sortConfig={materialSort}
                    onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                    width={getMaterialColWidth('weldingMethod')}
                    minWidth={90}
                    onResizeStart={handleMaterialResizeStart}
                    onAutoFit={() => handleMaterialAutoFit('weldingMethod', 130)}
                  />
                  <TableColumnFilterHeader
                    columnKey="batchNumber"
                    label="Партия / Плавка"
                    rows={materials}
                    getValue={materialGetters.batchNumber}
                    activeFilters={materialFilters}
                    onApplyFilter={handleApplyMaterialFilter}
                    sortConfig={materialSort}
                    onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                    width={getMaterialColWidth('batchNumber')}
                    minWidth={95}
                    onResizeStart={handleMaterialResizeStart}
                    onAutoFit={() => handleMaterialAutoFit('batchNumber', 150)}
                  />
                  <TableColumnFilterHeader
                    columnKey="certificateNumber"
                    label="№ сертификата качества"
                    rows={materials}
                    getValue={materialGetters.certificateNumber}
                    activeFilters={materialFilters}
                    onApplyFilter={handleApplyMaterialFilter}
                    sortConfig={materialSort}
                    onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                    width={getMaterialColWidth('certificateNumber')}
                    minWidth={110}
                    onResizeStart={handleMaterialResizeStart}
                    onAutoFit={() => handleMaterialAutoFit('certificateNumber', 170)}
                  />
                  <TableColumnFilterHeader
                    columnKey="incomingControlAct"
                    label="Акт входного контроля"
                    rows={materials}
                    getValue={materialGetters.incomingControlAct}
                    activeFilters={materialFilters}
                    onApplyFilter={handleApplyMaterialFilter}
                    sortConfig={materialSort}
                    onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                    width={getMaterialColWidth('incomingControlAct')}
                    minWidth={110}
                    onResizeStart={handleMaterialResizeStart}
                    onAutoFit={() => handleMaterialAutoFit('incomingControlAct', 160)}
                  />
                  <TableColumnFilterHeader
                    columnKey="incomingControlDate"
                    label="Дата ВК (ДД.ММ.ГГ)"
                    rows={materials}
                    getValue={materialGetters.incomingControlDate}
                    activeFilters={materialFilters}
                    onApplyFilter={handleApplyMaterialFilter}
                    sortConfig={materialSort}
                    onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                    width={getMaterialColWidth('incomingControlDate')}
                    minWidth={90}
                    onResizeStart={handleMaterialResizeStart}
                    onAutoFit={() => handleMaterialAutoFit('incomingControlDate', 130)}
                  />
                  <TableColumnFilterHeader
                    columnKey="status"
                    label="Статус"
                    rows={materials}
                    getValue={materialGetters.status}
                    activeFilters={materialFilters}
                    onApplyFilter={handleApplyMaterialFilter}
                    sortConfig={materialSort}
                    onSort={(k, dir) => setMaterialSort({ key: k, direction: dir })}
                    width={getMaterialColWidth('status')}
                    minWidth={90}
                    onResizeStart={handleMaterialResizeStart}
                    onAutoFit={() => handleMaterialAutoFit('status', 120)}
                  />
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
                {filteredMaterials.map((m) => (
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
                      {m.batchNumber}
                    </td>
                    <td
                      style={{
                        width: getMaterialColWidth('certificateNumber'),
                        minWidth: getMaterialColWidth('certificateNumber'),
                      }}
                      className="py-2.5 px-3 font-mono font-semibold text-slate-900"
                    >
                      {m.certificateNumber}
                    </td>
                    <td
                      style={{
                        width: getMaterialColWidth('incomingControlAct'),
                        minWidth: getMaterialColWidth('incomingControlAct'),
                      }}
                      className="py-2.5 px-3 font-mono text-slate-700"
                    >
                      {m.incomingControlAct}
                    </td>
                    <td
                      style={{
                        width: getMaterialColWidth('incomingControlDate'),
                        minWidth: getMaterialColWidth('incomingControlDate'),
                      }}
                      className="py-2.5 px-3 font-mono font-bold text-[#1e3799]"
                    >
                      {formatDateDDMMYY(m.incomingControlDate)}
                    </td>
                    <td
                      style={{
                        width: getMaterialColWidth('status'),
                        minWidth: getMaterialColWidth('status'),
                      }}
                      className="py-2.5 px-3"
                    >
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px]">
                        <ShieldCheck className="w-3 h-3" />
                        {m.status}
                      </span>
                    </td>
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
                            className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700"
                          >
                            Удалить
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMatId(null)}
                            className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 text-[10px]"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openMatModal(m)}
                            className="p-1.5 rounded text-slate-500 hover:text-[#1e3799] hover:bg-sky-50"
                            title="Редактировать запись сварочного материала"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {onDeleteMaterial && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMatId(m.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                              title={`Удалить сварочный материал «${m.brandAndDiameter}»`}
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
                  title="Сбросить ширину столбцов таблицы сварочных материалов к заводской"
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

      {matModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Сертификат и входной контроль сварочных материалов"
        >
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={() => setMatModal({ isOpen: false, item: null })}
          />
          <div className="relative z-10 w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white">
              <div className="flex items-center gap-2.5">
                <PackageCheck className="w-5 h-5 text-sky-300" />
                <h2 className="text-sm font-bold">
                  Сварочный материал — Сертификат и дата входного контроля
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMatModal({ isOpen: false, item: null })}
                className="p-1 rounded text-sky-100 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMatSubmit} className="p-6 space-y-4 text-xs">
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono font-bold text-[#1e3799]"
                />
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    № акта входного контроля (ВК)
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
                  {matModal.item && onDeleteMaterial && (
                    <button
                      type="button"
                      onClick={() => {
                        if (matModal.item) {
                          onDeleteMaterial(matModal.item.id);
                          setMatModal({ isOpen: false, item: null });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить материал</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMatModal({ isOpen: false, item: null })}
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
