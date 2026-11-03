import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookmarkCheck,
  Check,
  Columns,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { ColumnDefinition, ColumnTemplate, WeldJointFieldKey } from '../types/welding';
import { ALL_COLUMNS, DEFAULT_COLUMN_KEYS } from '../utils/weldingLogic';

interface ColumnTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnOrder: WeldJointFieldKey[];
  visibleColumns: WeldJointFieldKey[];
  onChangeColumns: (order: WeldJointFieldKey[], visible: WeldJointFieldKey[]) => void;
  templates: ColumnTemplate[];
  activeTemplateId: string;
  onApplyTemplate: (template: ColumnTemplate) => void;
  onSaveNewTemplate: (name: string, description: string) => void;
  onDeleteTemplate: (id: string) => void;
  onResetColumnWidths?: () => void;
}

export const ColumnTemplatesModal: React.FC<ColumnTemplatesModalProps> = ({
  isOpen,
  onClose,
  columnOrder,
  visibleColumns,
  onChangeColumns,
  templates,
  activeTemplateId,
  onApplyTemplate,
  onSaveNewTemplate,
  onDeleteTemplate,
  onResetColumnWidths,
}) => {
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  if (!isOpen) return null;

  const visibleSet = new Set(visibleColumns);

  const orderedDefs: ColumnDefinition[] = columnOrder
    .map((key) => ALL_COLUMNS.find((c) => c.key === key))
    .filter((c): c is ColumnDefinition => Boolean(c));

  const toggleColumnVisibility = (key: WeldJointFieldKey) => {
    if (key === 'jointNumber') return; // № стыка всегда включён
    const next = new Set(visibleSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChangeColumns(columnOrder, Array.from(next));
  };

  const moveColumn = (key: WeldJointFieldKey, direction: 'up' | 'down') => {
    const idx = columnOrder.indexOf(key);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= columnOrder.length) return;
    const nextOrder = [...columnOrder];
    const [removed] = nextOrder.splice(idx, 1);
    nextOrder.splice(targetIdx, 0, removed);
    onChangeColumns(nextOrder, visibleColumns);
  };

  const toggleGroupVisibility = (groupKey: string, enable: boolean) => {
    const next = new Set(visibleSet);
    for (const col of ALL_COLUMNS) {
      if (col.group === groupKey && col.key !== 'jointNumber') {
        if (enable) next.add(col.key);
        else next.delete(col.key);
      }
    }
    onChangeColumns(columnOrder, Array.from(next));
  };

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTemplateName.trim();
    if (!trimmed) return;
    onSaveNewTemplate(
      trimmed,
      newTemplateDesc.trim() || `Пользовательский шаблон (${visibleColumns.length} столбцов)`
    );
    setSavedBanner(`Шаблон «${trimmed}» сохранён`);
    setNewTemplateName('');
    setNewTemplateDesc('');
    setTimeout(() => setSavedBanner(null), 3000);
  };

  const groups = [
    { id: 'ALL', label: 'Все группы' },
    { id: 'project_id', label: 'Идентификация' },
    { id: 'prep', label: 'Подготовка (Проект)' },
    { id: 'welding', label: 'Сварка (Производство)' },
    { id: 'vik', label: 'Контроль ВИК' },
    { id: 'ndt', label: 'Контроль НК' },
    { id: 'dup_ndt', label: 'Дублирующий НК' },
  ];

  const displayedDefs =
    groupFilter === 'ALL' ? orderedDefs : orderedDefs.filter((d) => d.group === groupFilter);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Управление столбцами и шаблонами таблицы"
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[88vh] overflow-hidden">
        {/* Шапка цвета #1e3799 */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <Columns className="w-5 h-5 text-sky-300" />
            <div>
              <h2 className="font-display text-base font-bold">
                Настройка столбцов и шаблонов представления
              </h2>
              <p className="text-xs text-sky-200">
                Перемещение, включение/отключение столбцов и сохранение пользовательских шаблонов
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть настройку столбцов"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Левая колонка: Шаблоны представления */}
          <div className="lg:col-span-5 p-5 bg-[#f8fafd] space-y-5">
            <div>
              <h3 className="text-xs font-bold text-slate-700 mb-2.5 flex items-center gap-1.5">
                <BookmarkCheck className="w-4 h-4 text-[#1e3799]" />
                <span>Доступные шаблоны столбцов</span>
              </h3>
              <div className="space-y-2">
                {templates.map((tpl) => {
                  const isActive = tpl.id === activeTemplateId;
                  return (
                    <div
                      key={tpl.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        isActive
                          ? 'bg-[#e8f1fc] border-[#1e3799]'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onApplyTemplate(tpl)}
                          className="text-left flex-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{tpl.name}</span>
                            {isActive && (
                              <Check className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {tpl.description}
                          </p>
                          <div className="text-[11px] font-mono text-[#1e3799] mt-1">
                            Включено столбцов: {tpl.visibleColumns.length} из {ALL_COLUMNS.length}
                          </div>
                        </button>
                        {!tpl.isSystem && (
                          <button
                            type="button"
                            onClick={() => onDeleteTemplate(tpl.id)}
                            aria-label={`Удалить шаблон ${tpl.name}`}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Форма сохранения текущего положения столбцов как нового шаблона */}
            <form
              onSubmit={handleCreateTemplate}
              className="p-4 rounded-lg bg-white border border-slate-200 space-y-3"
            >
              <div className="text-xs font-bold text-slate-800">
                Сохранить текущее положение и состав столбцов
              </div>
              {savedBanner && (
                <div className="px-3 py-1.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                  {savedBanner}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Название шаблона *
                </label>
                <input
                  type="text"
                  required
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Напр.: Мой шаблон ПТО (УКПГ)"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Краткое примечание
                </label>
                <input
                  type="text"
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  placeholder="Описание набора полей..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Сохранить как шаблон ({visibleColumns.length} ст.)</span>
              </button>
            </form>
          </div>

          {/* Правая колонка: Перемещение и отключение столбцов */}
          <div className="lg:col-span-7 p-5 flex flex-col space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800">
                Порядок и видимость столбцов ({visibleColumns.length} из {ALL_COLUMNS.length}{' '}
                активно)
              </div>
              <div className="flex items-center gap-3">
                {onResetColumnWidths && (
                  <button
                    type="button"
                    onClick={onResetColumnWidths}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#1e3799] hover:underline cursor-pointer"
                    title="Сбросить ширину всех столбцов до заводских значений"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Сбросить ширину</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onChangeColumns([...DEFAULT_COLUMN_KEYS], [...DEFAULT_COLUMN_KEYS])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1e3799] hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить порядок и включить все</span>
                </button>
              </div>
            </div>

            {/* Фильтр по группам полей */}
            <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupFilter(g.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    groupFilter === g.id
                      ? 'bg-[#1e3799] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {groupFilter !== 'ALL' && (
              <div className="flex items-center justify-between px-3 py-2 bg-sky-50 border border-sky-200 rounded-lg text-xs">
                <span className="text-slate-700 font-medium">Быстрое действие для группы:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleGroupVisibility(groupFilter, true)}
                    className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    Включить всю группу
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleGroupVisibility(groupFilter, false)}
                    className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    Скрыть группу
                  </button>
                </div>
              </div>
            )}

            {/* Список столбцов с кнопками перемещения Вверх/Вниз и Вкл/Выкл */}
            <div className="flex-1 overflow-y-auto max-h-[380px] border border-slate-200 rounded-lg divide-y divide-slate-100">
              {displayedDefs.map((col) => {
                const isVisible = visibleSet.has(col.key);
                const globalIdx = columnOrder.indexOf(col.key);
                return (
                  <div
                    key={col.key}
                    className={`flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                      isVisible ? 'bg-white' : 'bg-slate-50 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-[11px] text-slate-400 w-6 text-right">
                        #{globalIdx + 1}
                      </span>
                      <button
                        type="button"
                        disabled={col.key === 'jointNumber'}
                        onClick={() => toggleColumnVisibility(col.key)}
                        className={`flex items-center gap-2 text-left ${
                          col.key === 'jointNumber' ? 'cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        {isVisible ? (
                          <Eye className="w-4 h-4 text-[#1e3799] shrink-0" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <span
                            className={`font-semibold ${
                              isVisible ? 'text-slate-800' : 'text-slate-400 line-through'
                            }`}
                          >
                            {col.label}
                          </span>
                          <span className="ml-2 text-[11px] text-slate-400">
                            · {col.groupLabel}
                          </span>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={globalIdx === 0}
                        onClick={() => moveColumn(col.key, 'up')}
                        aria-label={`Переместить ${col.label} левее`}
                        className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-sky-50 disabled:opacity-30"
                        title="Переместить столбец левее"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={globalIdx === columnOrder.length - 1}
                        onClick={() => moveColumn(col.key, 'down')}
                        aria-label={`Переместить ${col.label} правее`}
                        className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-sky-50 disabled:opacity-30"
                        title="Переместить столбец правее"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-3 bg-slate-50 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e]"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
