import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  FileCheck2,
  Flame,
  Loader2,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ThermometerSnowflake,
  Trash2,
  X,
} from 'lucide-react';
import {
  ElementCombination,
  JointKind,
  PreheatRegimeRule,
  TechCardItem,
  WeldingMaterialCertificate,
  WeldingType,
} from '../../types/welding';
import {
  appendMaterialToRecommendedList,
  buildTechCardCopyDraft,
  createEmptyTechCardDraft,
  formatPreheatConditionLabel,
  validateTechCardDraft,
} from '../../utils/weldingTechUtils';
import { pluralizeRu } from '../journals/types';
import { Button, FormField, Input, Select } from '../ui';

export interface TechCardsDirectoryViewProps {
  techCards: TechCardItem[];
  materials?: WeldingMaterialCertificate[];
  usageCounts?: Map<string, number>;
  onSaveTechCard: (card: TechCardItem) => Promise<{ ok: boolean; error?: string } | void> | void;
  onDeleteTechCard?: (id: string) => Promise<{ ok: boolean; error?: string } | void> | void;
  canEdit?: boolean;
}

export const TechCardsDirectoryView: React.FC<TechCardsDirectoryViewProps> = ({
  techCards,
  materials = [],
  usageCounts,
  onSaveTechCard,
  onDeleteTechCard,
  canEdit = true,
}) => {
  const [confirmDeleteTcId, setConfirmDeleteTcId] = useState<string | null>(null);
  const [confirmModalDelete, setConfirmModalDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Состояния поиска и фильтрации ТК
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWeldingType, setFilterWeldingType] = useState<'ALL' | WeldingType>('ALL');
  const [filterJointKind, setFilterJointKind] = useState<'ALL' | JointKind>('ALL');
  const [filterElementCombination, setFilterElementCombination] = useState<
    'ALL' | ElementCombination
  >('ALL');
  const [filterDiameterMm, setFilterDiameterMm] = useState<string>('');
  const [filterWallThicknessMm, setFilterWallThicknessMm] = useState<string>('');

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      filterWeldingType !== 'ALL' ||
      filterJointKind !== 'ALL' ||
      filterElementCombination !== 'ALL' ||
      filterDiameterMm.trim() ||
      filterWallThicknessMm.trim()
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterWeldingType('ALL');
    setFilterJointKind('ALL');
    setFilterElementCombination('ALL');
    setFilterDiameterMm('');
    setFilterWallThicknessMm('');
  };

  const filteredTechCards = useMemo(() => {
    return techCards.filter((tc) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          tc.number.toLowerCase().includes(q) ||
          tc.title.toLowerCase().includes(q) ||
          (tc.steelGroup && tc.steelGroup.toLowerCase().includes(q)) ||
          (tc.recommendedMaterials && tc.recommendedMaterials.toLowerCase().includes(q)) ||
          (tc.ntd && tc.ntd.toLowerCase().includes(q)) ||
          (tc.weldingType && tc.weldingType.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      if (filterWeldingType !== 'ALL' && tc.weldingType !== filterWeldingType) {
        return false;
      }

      if (filterJointKind !== 'ALL') {
        const tcKind = tc.jointKind || 'Стыковое';
        if (tcKind !== filterJointKind) return false;
      }

      if (filterElementCombination !== 'ALL') {
        const tcComb = tc.elementCombination || 'Труба+Труба';
        if (tcComb !== filterElementCombination) return false;
      }

      if (filterDiameterMm.trim()) {
        const d = Number(filterDiameterMm.replace(',', '.'));
        if (!Number.isNaN(d) && d > 0) {
          const dMin = tc.minDiameterMm ?? 0;
          const dMax = tc.maxDiameterMm ?? 9999;
          if (d < dMin || d > dMax) return false;
        }
      }

      if (filterWallThicknessMm.trim()) {
        const s = Number(filterWallThicknessMm.replace(',', '.'));
        if (!Number.isNaN(s) && s > 0) {
          const sMin = tc.minWallThicknessMm ?? 0;
          const sMax = tc.maxWallThicknessMm ?? 9999;
          if (s < sMin || s > sMax) return false;
        }
      }

      return true;
    });
  }, [
    techCards,
    searchQuery,
    filterWeldingType,
    filterJointKind,
    filterElementCombination,
    filterDiameterMm,
    filterWallThicknessMm,
  ]);

  // Модальное окно технологической карты
  const [tcModal, setTcModal] = useState<{
    isOpen: boolean;
    item: TechCardItem | null;
    copiedFromId: string;
    copiedFromNumber: string;
  }>({ isOpen: false, item: null, copiedFromId: '', copiedFromNumber: '' });

  const [tcForm, setTcForm] = useState<TechCardItem>(() => createEmptyTechCardDraft());

  const closeTcModal = () => {
    if (isSaving) return;
    setTcModal({ isOpen: false, item: null, copiedFromId: '', copiedFromNumber: '' });
    setConfirmModalDelete(false);
    setModalError('');
  };

  const openTcModal = (item: TechCardItem | null, copySource?: TechCardItem) => {
    setModalError('');
    setConfirmModalDelete(false);
    if (copySource) {
      setTcForm(buildTechCardCopyDraft(copySource, techCards));
      setTcModal({
        isOpen: true,
        item: null,
        copiedFromId: copySource.id,
        copiedFromNumber: copySource.number,
      });
    } else if (item) {
      setTcForm({
        ...item,
        jointKind: item.jointKind || 'Стыковое',
        elementCombination: item.elementCombination || 'Труба+Труба',
        preheatRules: (item.preheatRules || []).map((r) => ({ ...r })),
      });
      setTcModal({ isOpen: true, item, copiedFromId: '', copiedFromNumber: '' });
    } else {
      setTcForm(createEmptyTechCardDraft());
      setTcModal({ isOpen: true, item: null, copiedFromId: '', copiedFromNumber: '' });
    }
  };

  const handleApplyTemplateInModal = (sourceId: string) => {
    setModalError('');
    if (!sourceId) {
      setTcForm(createEmptyTechCardDraft());
      setTcModal((prev) => ({ ...prev, copiedFromId: '', copiedFromNumber: '' }));
      return;
    }
    const source = techCards.find((tc) => tc.id === sourceId);
    if (!source) return;
    setTcForm(buildTechCardCopyDraft(source, techCards));
    setTcModal((prev) => ({
      ...prev,
      copiedFromId: source.id,
      copiedFromNumber: source.number,
    }));
  };

  const updatePreheatRule = (idx: number, patch: Partial<PreheatRegimeRule>) => {
    setTcForm((prev) => {
      const nextRules = prev.preheatRules.map((r, i) => {
        if (i !== idx) return r;
        const updated = { ...r, ...patch };
        updated.conditionLabel = formatPreheatConditionLabel(updated);
        return updated;
      });
      return { ...prev, preheatRules: nextRules };
    });
  };

  const addPreheatRule = () => {
    setTcForm((prev) => {
      const last = prev.preheatRules[prev.preheatRules.length - 1];
      const nextMin = last ? Number((last.ambientMaxC + 0.1).toFixed(1)) : -40;
      const nextMax = last ? Math.max(nextMin + 10, 50) : 50;
      const newRule: PreheatRegimeRule = {
        ambientMinC: nextMin,
        ambientMaxC: nextMax,
        minPreheatTempC: 0,
        conditionLabel: '',
      };
      newRule.conditionLabel = formatPreheatConditionLabel(newRule);
      return {
        ...prev,
        preheatRules: [...prev.preheatRules, newRule],
      };
    });
  };

  const removePreheatRule = (idx: number) => {
    setTcForm((prev) => ({
      ...prev,
      preheatRules: prev.preheatRules.filter((_, i) => i !== idx),
    }));
  };

  const handleAppendMaterialFromDirectory = (brandAndDiameter: string) => {
    if (!brandAndDiameter) return;
    setTcForm((prev) => ({
      ...prev,
      recommendedMaterials: appendMaterialToRecommendedList(
        prev.recommendedMaterials,
        brandAndDiameter
      ),
    }));
  };

  const handleTcSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setModalError('');

    const validationError = validateTechCardDraft(
      tcForm,
      techCards,
      tcModal.item ? tcModal.item.id : null
    );
    if (validationError) {
      setModalError(validationError);
      return;
    }

    const payload: TechCardItem = {
      ...tcForm,
      number: tcForm.number.trim(),
      title: tcForm.title.trim(),
      ntd: tcForm.ntd.trim(),
      steelGroup: tcForm.steelGroup.trim(),
      recommendedMaterials: tcForm.recommendedMaterials.trim(),
      preheatRules: tcForm.preheatRules.map((r) => ({
        ...r,
        conditionLabel: formatPreheatConditionLabel(r),
      })),
    };

    setIsSaving(true);
    try {
      const res = await onSaveTechCard(payload);
      if (res && res.ok === false) {
        setModalError(res.error || 'Не удалось сохранить технологическую карту.');
        return;
      }
      setTcModal({ isOpen: false, item: null, copiedFromId: '', copiedFromNumber: '' });
      setConfirmModalDelete(false);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Не удалось сохранить технологическую карту.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const sortedMaterialsForPicker = useMemo(() => {
    return [...materials].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'Допущен в производство' ? -1 : 1;
      }
      return a.brandAndDiameter.localeCompare(b.brandAndDiameter, 'ru');
    });
  }, [materials]);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <h3 className="text-xs font-bold text-slate-900">
          Технологические карты на сварку
        </h3>
        {canEdit && (
          <Button type="button" variant="primary" onClick={() => openTcModal(null)}>
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить ТК</span>
          </Button>
        )}
      </div>

      {/* Панель поиска и фильтрации ТК */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-end justify-between gap-2.5">
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Поиск">
            <div className="relative w-44 sm:w-52">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Шифр, сталь, марка..."
                className="pl-8 w-full"
              />
            </div>
          </FormField>

          <FormField label="Способ сварки">
            <Select
              value={filterWeldingType}
              onChange={(e) => setFilterWeldingType(e.target.value as 'ALL' | WeldingType)}
              className="w-32"
            >
              <option value="ALL">Все способы</option>
              <option value="РАД+РД">РАД+РД</option>
              <option value="РАД">РАД</option>
              <option value="РД">РД</option>
              <option value="МП">МП</option>
              <option value="АФ">АФ</option>
              <option value="АПГ">АПГ</option>
            </Select>
          </FormField>

          <FormField label="Тип соединения">
            <Select
              value={filterJointKind}
              onChange={(e) => setFilterJointKind(e.target.value as 'ALL' | JointKind)}
              className="w-32 sm:w-36"
            >
              <option value="ALL">Все типы</option>
              <option value="Стыковое">Стыковое</option>
              <option value="Угловое">Угловое</option>
            </Select>
          </FormField>

          <FormField label="Тип элементов">
            <Select
              value={filterElementCombination}
              onChange={(e) =>
                setFilterElementCombination(e.target.value as 'ALL' | ElementCombination)
              }
              className="w-36 sm:w-44"
            >
              <option value="ALL">Все элементы</option>
              <option value="Труба+Труба">Труба + Труба</option>
              <option value="Труба+СДТ">Труба + СДТ</option>
              <option value="СДТ+СДТ">СДТ + СДТ</option>
              <option value="Труба+ЗРА">Труба + ЗРА</option>
              <option value="СДТ+ЗРА">СДТ + ЗРА</option>
            </Select>
          </FormField>

          <FormField label="Диаметр Ø, мм">
            <Input
              type="text"
              value={filterDiameterMm}
              onChange={(e) => setFilterDiameterMm(e.target.value)}
              placeholder="219"
              className="w-24 font-mono"
            />
          </FormField>

          <FormField label="Толщина S, мм">
            <Input
              type="text"
              value={filterWallThicknessMm}
              onChange={(e) => setFilterWallThicknessMm(e.target.value)}
              placeholder="8.0"
              className="w-24 font-mono"
            />
          </FormField>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleResetFilters}
              title="Сбросить все фильтры"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </Button>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-medium pb-1.5 whitespace-nowrap">
          Найдено:{' '}
          <span className="font-bold text-[#1e3799]">{filteredTechCards.length}</span> из{' '}
          {techCards.length} ТК
        </div>
      </div>

      {filteredTechCards.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <p className="text-xs font-semibold text-slate-700">
            {techCards.length === 0
              ? 'Список технологических карт пуст'
              : 'По заданным параметрам технологических карт не найдено'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить фильтры</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {filteredTechCards.map((tc) => {
            const usedJointsCount = usageCounts?.get(tc.id) ?? 0;
            return (
              <div
                key={tc.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="px-4 py-3 bg-[#1e3799] text-white flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <Flame className="w-4 h-4 text-sky-200 shrink-0" />
                      <span className="font-mono font-bold text-sm truncate">{tc.number}</span>
                      <span className="px-2 py-0.5 rounded bg-white/15 text-[11px] font-mono">
                        {tc.weldingType}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          tc.jointKind === 'Угловое'
                            ? 'bg-white text-[#1e3799]'
                            : 'bg-sky-400/25 text-white'
                        }`}
                      >
                        {tc.jointKind || 'Стыковое'}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded bg-indigo-300/25 text-white text-[10px] font-medium truncate max-w-[150px]"
                        title={tc.elementCombination || 'Труба+Труба'}
                      >
                        {tc.elementCombination || 'Труба+Труба'}
                      </span>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openTcModal(null, tc)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-xs font-medium cursor-pointer"
                          title={`Создать новую ТК на основе «${tc.number}»`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Копировать</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openTcModal(tc)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-xs font-medium cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Изменить</span>
                        </button>
                        {onDeleteTechCard &&
                          (confirmDeleteTcId === tc.id ? (
                            <div className="inline-flex items-center gap-1 bg-white/95 px-2 py-0.5 rounded">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteTechCard(tc.id);
                                  setConfirmDeleteTcId(null);
                                }}
                                className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 cursor-pointer"
                              >
                                Удалить
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTcId(null)}
                                className="px-1.5 py-0.5 rounded text-slate-700 text-[10px] font-semibold cursor-pointer"
                              >
                                Отмена
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTcId(tc.id)}
                              className="p-1.5 rounded bg-white/15 hover:bg-red-600 text-white transition-colors cursor-pointer"
                              title={`Удалить техкарту «${tc.number}»`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-slate-900">{tc.title}</div>
                      {usageCounts && (
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                            usedJointsCount > 0
                              ? 'bg-sky-50 text-[#1e3799] border-sky-200'
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                          title="Количество стыков в реестре, привязанных к данной ТК"
                        >
                          {usedJointsCount > 0
                            ? `${usedJointsCount} ${pluralizeRu(usedJointsCount, 'стык', 'стыка', 'стыков')}`
                            : 'Не применяется'}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                      <div>
                        <div className="text-[10px] text-slate-500">Диаметры элементов</div>
                        <div className="font-mono font-bold text-[#1e3799]">
                          Ø {tc.minDiameterMm} – {tc.maxDiameterMm} мм
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Толщины стенки S</div>
                        <div className="font-mono font-bold text-[#1e3799]">
                          {tc.minWallThicknessMm} – {tc.maxWallThicknessMm} мм
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Тип соединения</div>
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${
                              tc.jointKind === 'Угловое' ? 'bg-amber-500' : 'bg-blue-600'
                            }`}
                          />
                          <span>{tc.jointKind || 'Стыковое'}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Типы элементов</div>
                        <div
                          className="font-semibold text-slate-800 truncate"
                          title={tc.elementCombination || 'Труба+Труба'}
                        >
                          {tc.elementCombination || 'Труба+Труба'}
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-4 pt-1 border-t border-slate-200/60 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-500 shrink-0">Группа сталей и НТД:</span>
                        <span
                          className="font-medium text-slate-800 truncate"
                          title={`${tc.steelGroup || '—'} · ${tc.ntd || '—'}`}
                        >
                          {tc.steelGroup || '—'}
                          {tc.ntd ? ` · ${tc.ntd}` : ''}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500">Применяемые сварочные материалы: </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {tc.recommendedMaterials || '—'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1e3799]">
                        <ThermometerSnowflake className="w-3.5 h-3.5" />
                        <span>Режимы подогрева в зависимости от температуры воздуха:</span>
                      </div>
                      {tc.preheatRules.length === 0 ? (
                        <div className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-500">
                          Режимы подогрева не заданы
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                          {tc.preheatRules.map((rule, idx) => (
                            <div
                              key={idx}
                              className="px-3 py-1.5 bg-sky-50/40 flex items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="text-slate-700 font-mono">
                                T возд.: от{' '}
                                {rule.ambientMinC > 0 ? `+${rule.ambientMinC}` : rule.ambientMinC} °C
                                {' '}до{' '}
                                {rule.ambientMaxC > 0 ? `+${rule.ambientMaxC}` : rule.ambientMaxC} °C
                              </span>
                              <span
                                className={`font-mono font-bold px-2 py-0.5 rounded ${
                                  rule.minPreheatTempC > 0
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {rule.minPreheatTempC > 0
                                  ? `Подогрев ≥ +${rule.minPreheatTempC} °C`
                                  : 'Не требуется'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tcModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Технологическая карта на сварку"
        >
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={closeTcModal}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileCheck2 className="w-5 h-5 text-sky-300 shrink-0" />
                <h2 className="text-sm font-bold truncate">
                  {tcModal.item
                    ? `Редактирование техкарты ${tcModal.item.number}`
                    : tcModal.copiedFromNumber
                      ? `Новая техкарта на основе ${tcModal.copiedFromNumber}`
                      : 'Новая технологическая карта на сварку'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeTcModal}
                disabled={isSaving}
                className="p-1 rounded text-sky-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleTcSubmit}
              className="p-6 space-y-4 text-xs overflow-y-auto flex-1"
            >
              {modalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold">
                  {modalError}
                </div>
              )}

              {/* Копирование данных из существующей ТК при создании новой */}
              {!tcModal.item && techCards.length > 0 && (
                <div className="p-3 rounded-lg bg-sky-50/70 border border-sky-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="tc-copy-source-select"
                      className="flex items-center gap-1.5 font-bold text-[#1e3799]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Заполнить на основе существующей ТК</span>
                    </label>
                    {tcModal.copiedFromId && (
                      <button
                        type="button"
                        onClick={() => handleApplyTemplateInModal('')}
                        className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                      >
                        Очистить форму
                      </button>
                    )}
                  </div>
                  <select
                    id="tc-copy-source-select"
                    value={tcModal.copiedFromId}
                    onChange={(e) => handleApplyTemplateInModal(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-sky-300 rounded-md text-xs text-slate-800"
                  >
                    <option value="">— Создать с нуля —</option>
                    {techCards.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.number} · {tc.weldingType} · Ø {tc.minDiameterMm}–{tc.maxDiameterMm} мм ·{' '}
                        {tc.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Шифр ТК *</label>
                  <input
                    type="text"
                    required
                    value={tcForm.number}
                    onChange={(e) =>
                      setTcForm((prev) => ({ ...prev, number: e.target.value }))
                    }
                    placeholder="Напр.: ТК-045-РАД/РД-01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono font-bold text-[#1e3799]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Способ сварки</label>
                  <select
                    value={tcForm.weldingType}
                    onChange={(e) =>
                      setTcForm((prev) => ({
                        ...prev,
                        weldingType: e.target.value as WeldingType,
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
                  <label className="block font-medium text-slate-700 mb-1">
                    НТД / Регламент *
                  </label>
                  <input
                    type="text"
                    required
                    value={tcForm.ntd}
                    onChange={(e) =>
                      setTcForm((prev) => ({ ...prev, ntd: e.target.value }))
                    }
                    placeholder="СТО Газпром 15-1.1-002-2023"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Тип соединения *
                  </label>
                  <select
                    value={tcForm.jointKind || 'Стыковое'}
                    onChange={(e) =>
                      setTcForm((prev) => ({
                        ...prev,
                        jointKind: e.target.value as JointKind,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-medium"
                  >
                    <option value="Стыковое">Стыковое соединение</option>
                    <option value="Угловое">Угловое соединение</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Тип элементов *
                  </label>
                  <select
                    value={tcForm.elementCombination || 'Труба+Труба'}
                    onChange={(e) =>
                      setTcForm((prev) => ({
                        ...prev,
                        elementCombination: e.target.value as ElementCombination,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-medium"
                  >
                    <option value="Труба+Труба">Труба + Труба</option>
                    <option value="Труба+СДТ">Труба + СДТ</option>
                    <option value="СДТ+СДТ">СДТ + СДТ</option>
                    <option value="Труба+ЗРА">Труба + ЗРА</option>
                    <option value="СДТ+ЗРА">СДТ + ЗРА</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Группа и марки сталей
                  </label>
                  <input
                    type="text"
                    value={tcForm.steelGroup}
                    onChange={(e) =>
                      setTcForm((prev) => ({ ...prev, steelGroup: e.target.value }))
                    }
                    placeholder="Напр.: М01 · 09Г2С, Ст20"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Наименование технологической карты *
                </label>
                <input
                  type="text"
                  required
                  value={tcForm.title}
                  onChange={(e) =>
                    setTcForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Сварка технологических трубопроводов из стали 09Г2С"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Мин. диаметр, мм
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={2520}
                    value={tcForm.minDiameterMm}
                    onChange={(e) =>
                      setTcForm((prev) => ({
                        ...prev,
                        minDiameterMm: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Макс. диаметр, мм
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={2520}
                    value={tcForm.maxDiameterMm}
                    onChange={(e) =>
                      setTcForm((prev) => ({
                        ...prev,
                        maxDiameterMm: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Мин. толщина S, мм
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={1}
                    max={150}
                    value={tcForm.minWallThicknessMm}
                    onChange={(e) =>
                      setTcForm((prev) => ({
                        ...prev,
                        minWallThicknessMm: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Макс. толщина S, мм
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={1}
                    max={150}
                    value={tcForm.maxWallThicknessMm}
                    onChange={(e) =>
                      setTcForm((prev) => ({
                        ...prev,
                        maxWallThicknessMm: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-medium text-slate-700">
                  Применяемые сварочные материалы
                </label>
                <input
                  type="text"
                  value={tcForm.recommendedMaterials}
                  onChange={(e) =>
                    setTcForm((prev) => ({
                      ...prev,
                      recommendedMaterials: e.target.value,
                    }))
                  }
                  placeholder="Напр.: Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                />
                {sortedMaterialsForPicker.length > 0 && (
                  <div className="flex items-center gap-2">
                    <PackageCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value=""
                      onChange={(e) => handleAppendMaterialFromDirectory(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-700"
                    >
                      <option value="">Добавить из справочника сварочных материалов...</option>
                      {sortedMaterialsForPicker.map((m) => (
                        <option key={m.id} value={m.brandAndDiameter}>
                          {m.brandAndDiameter} · {m.weldingMethod}
                          {m.status === 'На испытании' ? ' · На испытании' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#1e3799]">
                    Режимы температуры подогрева в зависимости от T окружающей среды
                  </span>
                  <button
                    type="button"
                    onClick={addPreheatRule}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-sky-300 bg-sky-50 text-[#1e3799] hover:bg-sky-100 text-[11px] font-semibold cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Добавить режим</span>
                  </button>
                </div>

                {tcForm.preheatRules.length === 0 ? (
                  <div className="p-3 rounded-lg bg-slate-50 border border-dashed border-slate-300 text-center text-[11px] text-slate-500">
                    Режимы подогрева не заданы. Нажмите «Добавить режим», чтобы задать температурный диапазон.
                  </div>
                ) : (
                  tcForm.preheatRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5"
                    >
                      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            T возд. от, °C
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={rule.ambientMinC}
                            onChange={(e) =>
                              updatePreheatRule(idx, {
                                ambientMinC: Number(e.target.value),
                              })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            T возд. до, °C
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={rule.ambientMaxC}
                            onChange={(e) =>
                              updatePreheatRule(idx, {
                                ambientMaxC: Number(e.target.value),
                              })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            Мин. подогрев, °C
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={600}
                            value={rule.minPreheatTempC}
                            onChange={(e) =>
                              updatePreheatRule(idx, {
                                minPreheatTempC: Number(e.target.value),
                              })
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-[#1e3799]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removePreheatRule(idx)}
                          className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Удалить строку режима подогрева"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {formatPreheatConditionLabel(rule)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
                <div>
                  {tcModal.item &&
                    onDeleteTechCard &&
                    (confirmModalDelete ? (
                      <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg">
                        <span className="text-[11px] font-semibold text-red-800">
                          Удалить техкарту?
                        </span>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={async () => {
                            if (!tcModal.item) return;
                            setModalError('');
                            setIsSaving(true);
                            try {
                              const res = await onDeleteTechCard(tcModal.item.id);
                              if (res && res.ok === false) {
                                setModalError(
                                  res.error || 'Не удалось удалить технологическую карту.'
                                );
                                setConfirmModalDelete(false);
                                return;
                              }
                              setTcModal({
                                isOpen: false,
                                item: null,
                                copiedFromId: '',
                                copiedFromNumber: '',
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
                        <span>Удалить техкарту</span>
                      </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={closeTcModal}
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
                    <span>{isSaving ? 'Сохранение...' : 'Сохранить ТК'}</span>
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
