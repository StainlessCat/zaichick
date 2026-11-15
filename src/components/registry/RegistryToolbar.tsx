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
import { Button, FormField, Select } from '../ui';

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
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-end justify-between gap-2.5">
      {/* Левая группа: Диапазон дат сварки */}
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Период сварки">
          <div className="h-8 box-border inline-flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-md px-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
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
                className="ml-0.5 px-1.5 py-0.5 rounded bg-sky-100 text-[#1e3799] hover:bg-red-100 hover:text-red-700 font-bold text-[11px] transition-colors cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </FormField>
      </div>

      {/* Правая группа: Действия со стыками и настройка столбцов */}
      <div className="flex flex-wrap items-end gap-1.5">
        {userPermissions.canCreateOrDeleteJoints &&
          selectedJointIds.length > 0 &&
          (confirmBulkDeleteJoints ? (
            <div className="flex items-center gap-1 h-8 box-border px-2 rounded-md border border-red-300 bg-red-50 text-xs">
              <span className="font-bold text-red-800 text-[11px] whitespace-nowrap">
                Удалить {selectedJointIds.length} ст.?
              </span>
              <Button
                type="button"
                variant="danger"
                className="h-6 px-2 text-[11px]"
                onClick={onBulkDeleteSelectedJoints}
              >
                Да
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-6 px-2 text-[11px]"
                onClick={() => onSetConfirmBulkDeleteJoints(false)}
              >
                Отмена
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="danger"
              onClick={() => onSetConfirmBulkDeleteJoints(true)}
              title="Удалить выделенные сварные стыки"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить ({selectedJointIds.length})</span>
            </Button>
          ))}

        {canCreateLabRequest && (
          <Button
            type="button"
            variant="secondary"
            onClick={onOpenSubmitLabRequestModal}
            className="border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100 font-semibold"
            title="Направить заявку в Лабораторию НК по стыкам с заполненной датой сварки и клеймом сварщика без замечаний"
          >
            <Radiation className="w-3.5 h-3.5 text-amber-600" />
            <span>
              Направить заявку в ЛНК
              {selectedJointIds.length > 0 ? ` (${selectedJointIds.length})` : ''}
            </span>
          </Button>
        )}

        {(userPermissions.canEditPrepAndWeldingFields ||
          userPermissions.canEditNdtFields) && (
          <Button
            type="button"
            variant={selectedJointIds.length > 0 ? 'primary' : 'secondary'}
            onClick={onOpenBulkEdit}
            title="Массовое редактирование параметров выделенных стыков"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>
              Массовое ред.
              {selectedJointIds.length > 0 ? ` (${selectedJointIds.length})` : ''}
            </span>
          </Button>
        )}

        {userPermissions.canCreateOrDeleteJoints && (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={onQuickAddSupplementaryJoint}
              title="Добавить дополнительный стык с нумерацией 011, 012..."
            >
              <FilePlus2 className="w-3.5 h-3.5 text-[#1e3799]" />
              <span>Доп. стык</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={onOpenImportExcel}
              title="Загрузка стыков из файла Excel (.xlsx, .xls) с автоматической привязкой"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Загрузить из Excel</span>
            </Button>

            <Button
              type="button"
              variant="primary"
              onClick={onOpenCreatePassport}
              title="Создать новый сварной стык вручную"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить стык</span>
            </Button>
          </>
        )}

        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-0.5" />

        {/* Выбор шаблона таблицы */}
        <FormField
          label={
            <span className="inline-flex items-center gap-1">
              <Bookmark className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
              <span>Шаблон таблицы</span>
            </span>
          }
          className="w-44"
          title="Шаблон таблицы"
        >
          <Select
            value={activeTemplateId}
            onChange={(e) => {
              const found = templates.find((t) => t.id === e.target.value);
              if (found) onApplyTemplate(found);
            }}
            className="w-full truncate font-medium text-slate-800"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </FormField>

        {/* Настройка столбцов */}
        <Button
          type="button"
          variant="secondary"
          onClick={onOpenColumnsModal}
          className="w-8 h-8 p-0 flex items-center justify-center shrink-0"
          aria-label={`Настройка столбцов (${visibleColumnsCount} из ${totalColumnsCount})`}
          title={`Настройка столбцов (${visibleColumnsCount} из ${totalColumnsCount})`}
        >
          <Columns className="w-4.5 h-4.5 text-[#1e3799]" />
        </Button>
      </div>
    </div>
  );
};
