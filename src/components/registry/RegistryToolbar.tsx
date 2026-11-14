import React from 'react';
import {
  Bookmark,
  Calendar,
  Columns,
  FilePlus2,
  FileSpreadsheet,
  Layers,
  Plus,
  Radiation,
  Trash2,
} from 'lucide-react';
import { RegistryToolbarProps } from './types';

export const RegistryToolbar: React.FC<RegistryToolbarProps> = ({
  weldingDateFrom,
  weldingDateTo,
  onWeldingDateFromChange,
  onWeldingDateToChange,
  onResetDateRange,
  userPermissions,
  selectedJointIds,
  confirmBulkDeleteJoints,
  onSetConfirmBulkDeleteJoints,
  onBulkDeleteSelectedJoints,
  onOpenBulkEdit,
  onQuickAddSupplementaryJoint,
  onOpenImportExcel,
  onOpenCreatePassport,
  onOpenSubmitLabRequestModal,
  canCreateLabRequest,
  activeTemplateId,
  templates,
  onApplyTemplate,
  visibleColumnsCount,
  totalColumnsCount,
  onOpenColumnsModal,
}) => {
  return (
    <div className="flex flex-wrap xl:flex-nowrap items-center gap-2.5">
      {/* Блок 1: Диапазон дат сварки и действия */}
      <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        {/* Фильтр по диапазону дат сварки */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#1e3799] shrink-0" />
          <span className="text-xs font-bold text-slate-700 whitespace-nowrap hidden sm:inline">
            Период сварки:
          </span>
          <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1">
            <span className="text-[11px] text-slate-500 font-medium">с</span>
            <input
              type="date"
              value={weldingDateFrom}
              onChange={(e) => onWeldingDateFromChange(e.target.value)}
              aria-label="Дата сварки с"
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
            />
            <span className="text-[11px] text-slate-500 font-medium ml-1">
              по
            </span>
            <input
              type="date"
              value={weldingDateTo}
              onChange={(e) => onWeldingDateToChange(e.target.value)}
              aria-label="Дата сварки по"
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
            />
            {(weldingDateFrom || weldingDateTo) && (
              <button
                type="button"
                onClick={onResetDateRange}
                title="Сбросить диапазон дат сварки"
                aria-label="Сбросить диапазон дат сварки"
                className="ml-0.5 px-2 py-1 rounded bg-sky-100 text-[#1e3799] hover:bg-red-100 hover:text-red-700 font-bold text-xs transition-colors cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Кнопки действий: Массовое удаление, Подача заявки в ЛНК, Массовое редактирование, Доп. стык, Новый стык */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {userPermissions.canCreateOrDeleteJoints &&
            selectedJointIds.length > 0 &&
            (confirmBulkDeleteJoints ? (
              <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-xs">
                <span className="font-bold text-red-800">
                  Удалить {selectedJointIds.length} ст.?
                </span>
                <button
                  type="button"
                  onClick={onBulkDeleteSelectedJoints}
                  className="px-2.5 py-1 rounded bg-red-600 text-white font-bold hover:bg-red-700 cursor-pointer"
                >
                  Да
                </button>
                <button
                  type="button"
                  onClick={() => onSetConfirmBulkDeleteJoints(false)}
                  className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onSetConfirmBulkDeleteJoints(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                title="Удалить выделенные сварные стыки"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить ({selectedJointIds.length})</span>
              </button>
            ))}

          {canCreateLabRequest && (
            <button
              type="button"
              onClick={onOpenSubmitLabRequestModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-500/60 bg-amber-50 text-amber-950 hover:bg-amber-100 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
              title="Направить заявку в Лабораторию НК по стыкам с заполненной датой сварки и клеймом сварщика без замечаний"
            >
              <Radiation className="w-3.5 h-3.5 text-amber-600" />
              <span>
                Направить заявку в ЛНК
                {selectedJointIds.length > 0
                  ? ` (${selectedJointIds.length})`
                  : ''}
              </span>
            </button>
          )}

          {(userPermissions.canEditPrepAndWeldingFields ||
            userPermissions.canEditNdtFields) && (
            <button
              type="button"
              onClick={onOpenBulkEdit}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap border cursor-pointer shadow-2xs ${
                selectedJointIds.length > 0
                  ? 'bg-[#e8f1fc] border-[#1e3799] text-[#1e3799] hover:bg-sky-100'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-[#1e3799]" />
              <span>
                Массовое ред.
                {selectedJointIds.length > 0
                  ? ` (${selectedJointIds.length})`
                  : ''}
              </span>
            </button>
          )}

          {userPermissions.canCreateOrDeleteJoints && (
            <>
              <button
                type="button"
                onClick={onQuickAddSupplementaryJoint}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1e3799]/30 bg-[#f0f5fc] text-[#1e3799] hover:bg-sky-100 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                title="Добавить дополнительный стык с нумерацией 011, 012..."
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                <span>Доп. стык</span>
              </button>

              <button
                type="button"
                onClick={onOpenImportExcel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-600/50 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold transition-colors whitespace-nowrap shadow-2xs cursor-pointer"
                title="Загрузка стыков из файла Excel (.xlsx, .xls) с автоматической привязкой"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Загрузить из Excel</span>
              </button>

              <button
                type="button"
                onClick={onOpenCreatePassport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold shadow-xs transition-colors whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить стык</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Блок 2: Выбор шаблона таблицы и иконка настройки столбцов */}
      <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 flex items-center gap-2 shadow-2xs shrink-0">
        <Bookmark className="w-4 h-4 text-[#1e3799] shrink-0" />
        <select
          value={activeTemplateId}
          onChange={(e) => {
            const found = templates.find((t) => t.id === e.target.value);
            if (found) onApplyTemplate(found);
          }}
          aria-label="Шаблон отображения столбцов"
          className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              Шаблон: {t.name}
            </option>
          ))}
        </select>

        <div className="relative group">
          <button
            type="button"
            onClick={onOpenColumnsModal}
            aria-label={`Настройка столбцов (${visibleColumnsCount} из ${totalColumnsCount})`}
            title={`Настройка столбцов (${visibleColumnsCount} из ${totalColumnsCount})`}
            className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-[#f0f5fc] hover:border-[#1e3799] text-[#1e3799] transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
          >
            <Columns className="w-4 h-4" />
          </button>
          <div
            role="tooltip"
            className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 top-full mt-1.5 z-40 px-2.5 py-1 rounded bg-slate-900 text-white text-[11px] font-medium whitespace-nowrap shadow-lg"
          >
            Настройка столбцов ({visibleColumnsCount}/{totalColumnsCount})
          </div>
        </div>
      </div>
    </div>
  );
};
