import React, { useState } from 'react';
import {
  Check,
  Edit3,
  FileCheck2,
  Flame,
  Lock,
  Plus,
  ThermometerSnowflake,
  Trash2,
  X,
} from 'lucide-react';
import {
  ElementCombination,
  JointKind,
  PreheatRegimeRule,
  TechCardItem,
  WeldingType,
} from '../../types/welding';

export interface TechCardsDirectoryViewProps {
  techCards: TechCardItem[];
  onSaveTechCard: (card: TechCardItem) => void;
  onDeleteTechCard?: (id: string) => void;
  canEdit?: boolean;
}

export const TechCardsDirectoryView: React.FC<TechCardsDirectoryViewProps> = ({
  techCards,
  onSaveTechCard,
  onDeleteTechCard,
  canEdit = true,
}) => {

  const [confirmDeleteTcId, setConfirmDeleteTcId] = useState<string | null>(null);

  const [modalError, setModalError] = useState('');

  // Модальное окно технологической карты (ТК)
  const [tcModal, setTcModal] = useState<{
    isOpen: boolean;
    item: TechCardItem | null;
  }>({ isOpen: false, item: null });

  const [tcForm, setTcForm] = useState<TechCardItem>({
    id: '',
    number: '',
    title: '',
    weldingType: 'РАД+РД',
    jointKind: 'Стыковое',
    elementCombination: 'Труба+Труба',
    ntd: 'СТО Газпром 15-1.1-002-2023',
    steelGroup: 'М01 (09Г2С, Ст20)',
    minDiameterMm: 57,
    maxDiameterMm: 325,
    minWallThicknessMm: 4,
    maxWallThicknessMm: 16,
    recommendedMaterials: 'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
    preheatRules: [
      {
        ambientMinC: -60,
        ambientMaxC: -5,
        minPreheatTempC: 150,
        conditionLabel: 'При T возд. ниже -5 °C: подогрев ≥ +150 °C',
      },
      {
        ambientMinC: -4.9,
        ambientMaxC: 5,
        minPreheatTempC: 100,
        conditionLabel: 'При T возд. от -5 °C до +5 °C: подогрев ≥ +100 °C',
      },
      {
        ambientMinC: 5.1,
        ambientMaxC: 50,
        minPreheatTempC: 0,
        conditionLabel: 'При T возд. выше +5 °C: подогрев не требуется',
      },
    ],
  });


  const openTcModal = (item: TechCardItem | null) => {
    setModalError('');
    if (item) {
      setTcForm({
        ...item,
        preheatRules: item.preheatRules.map((r) => ({ ...r })),
      });
      setTcModal({ isOpen: true, item });
    } else {
      setTcForm({
        id: `tc-${Date.now()}`,
        number: 'ТК-045-РАД/РД-05',
        title: 'Сварка технологических трубопроводов из стали 09Г2С',
        weldingType: 'РАД+РД',
        jointKind: 'Стыковое',
        elementCombination: 'Труба+Труба',
        ntd: 'СТО Газпром 15-1.1-002-2023',
        steelGroup: 'М01 (09Г2С, 09Г2С-15)',
        minDiameterMm: 89,
        maxDiameterMm: 325,
        minWallThicknessMm: 5,
        maxWallThicknessMm: 16,
        recommendedMaterials: 'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
        preheatRules: [
          {
            ambientMinC: -60,
            ambientMaxC: -5,
            minPreheatTempC: 150,
            conditionLabel: 'При T возд. ниже -5 °C: подогрев ≥ +150 °C',
          },
          {
            ambientMinC: -4.9,
            ambientMaxC: 5,
            minPreheatTempC: 100,
            conditionLabel: 'При T возд. от -5 °C до +5 °C: подогрев ≥ +100 °C',
          },
          {
            ambientMinC: 5.1,
            ambientMaxC: 50,
            minPreheatTempC: 0,
            conditionLabel: 'При T возд. выше +5 °C: подогрев не требуется',
          },
        ],
      });
      setTcModal({ isOpen: true, item: null });
    }
  };

  const updatePreheatRule = (
    idx: number,
    patch: Partial<PreheatRegimeRule>
  ) => {
    setTcForm((prev) => {
      const nextRules = prev.preheatRules.map((r, i) => {
        if (i !== idx) return r;
        const updated = { ...r, ...patch };
        updated.conditionLabel =
          updated.minPreheatTempC > 0
            ? `При T возд. от ${updated.ambientMinC} °C до ${updated.ambientMaxC} °C: подогрев ≥ +${updated.minPreheatTempC} °C`
            : `При T возд. от ${updated.ambientMinC} °C до ${updated.ambientMaxC} °C: подогрев не требуется`;
        return updated;
      });
      return { ...prev, preheatRules: nextRules };
    });
  };

  const handleTcSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    const cleanNum = tcForm.number.trim();
    if (!cleanNum) {
      setModalError('Укажите номер (шифр) технологической карты.');
      return;
    }

    if (
      !tcModal.item &&
      techCards.some((t) => t.number.trim().toLowerCase() === cleanNum.toLowerCase())
    ) {
      setModalError(`Технологическая карта «${cleanNum}» уже существует.`);
      return;
    }

    if (
      tcForm.minDiameterMm < 10 ||
      tcForm.maxDiameterMm > 2520 ||
      tcForm.minDiameterMm > tcForm.maxDiameterMm
    ) {
      setModalError(
        'Минимальный диаметр должен быть от 10 мм и не превышать максимальный диаметр (до 2520 мм).'
      );
      return;
    }

    if (
      tcForm.minWallThicknessMm < 1 ||
      tcForm.maxWallThicknessMm > 150 ||
      tcForm.minWallThicknessMm > tcForm.maxWallThicknessMm
    ) {
      setModalError(
        'Минимальная толщина стенки должна быть от 1 мм и не превышать максимальную толщину (до 150 мм).'
      );
      return;
    }

    onSaveTechCard({
      ...tcForm,
      number: cleanNum,
    });
    setTcModal({ isOpen: false, item: null });
  };


  return (
    <div className="space-y-4">

        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-900">
                Технологические карты на сварку (ТК) — Параметры свариваемых элементов, сварочные материалы и режимы подогрева
              </h3>
              <p className="text-[11px] text-slate-500">
                В Паспорте стыка выбор ТК выполняется из выпадающего списка, а введённая вручную температура подогрева автоматически проверяется по правилам выбранной ТК
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => openTcModal(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить технологическую карту (ТК)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {techCards.map((tc) => (
              <div
                key={tc.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="px-4 py-3 bg-[#1e3799] text-white flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Flame className="w-4 h-4 text-amber-300 shrink-0" />
                      <span className="font-mono font-bold text-sm truncate">
                        {tc.number}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/15 text-[11px] font-mono">
                        {tc.weldingType}
                      </span>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openTcModal(tc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/15 hover:bg-white/25 text-xs font-medium"
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
                                className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700"
                              >
                                Удалить ТК
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTcId(null)}
                                className="px-1.5 py-0.5 rounded text-slate-700 text-[10px] font-semibold"
                              >
                                Отмена
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTcId(tc.id)}
                              className="p-1.5 rounded bg-white/15 hover:bg-red-600 text-white transition-colors"
                              title={`Удалить техкарту «${tc.number}»`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-3 text-xs">
                    <div className="font-semibold text-slate-900">{tc.title}</div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
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
                      <div className="col-span-2 sm:col-span-1">
                        <div className="text-[10px] text-slate-500">Группа сталей / НТД</div>
                        <div className="font-medium text-slate-800 truncate" title={tc.steelGroup}>
                          {tc.steelGroup}
                        </div>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500">Применяемые сварочные материалы: </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {tc.recommendedMaterials}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1e3799]">
                        <ThermometerSnowflake className="w-3.5 h-3.5" />
                        <span>Режимы подогрева в зависимости от температуры воздуха:</span>
                      </div>
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                        {tc.preheatRules.map((rule, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-1.5 bg-sky-50/40 flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="text-slate-700 font-mono">
                              T возд.: от {rule.ambientMinC > 0 ? `+${rule.ambientMinC}` : rule.ambientMinC} °C до{' '}
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
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      {tcModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Технологическая карта на сварку"
        >
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={() => setTcModal({ isOpen: false, item: null })}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <FileCheck2 className="w-5 h-5 text-sky-300" />
                <h2 className="text-sm font-bold">
                  Технологическая карта на сварку (ТК) и режимы подогрева
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setTcModal({ isOpen: false, item: null })}
                className="p-1 rounded text-sky-100 hover:text-white"
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Шифр ТК *
                  </label>
                  <input
                    type="text"
                    required
                    value={tcForm.number}
                    onChange={(e) =>
                      setTcForm((prev) => ({ ...prev, number: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono font-bold text-[#1e3799]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Способ сварки
                  </label>
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Наименование технологической карты
                </label>
                <input
                  type="text"
                  value={tcForm.title}
                  onChange={(e) =>
                    setTcForm((prev) => ({ ...prev, title: e.target.value }))
                  }
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

              <div>
                <label className="block font-medium text-slate-700 mb-1">
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                />
              </div>

              <div className="space-y-2">
                <div className="font-bold text-[#1e3799]">
                  Режимы температуры подогрева в зависимости от T окружающей среды:
                </div>
                {tcForm.preheatRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                  >
                    <div>
                      <label className="block text-[10px] text-slate-500">
                        T возд. от (°C)
                      </label>
                      <input
                        type="number"
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
                      <label className="block text-[10px] text-slate-500">
                        T возд. до (°C)
                      </label>
                      <input
                        type="number"
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
                      <label className="block text-[10px] text-slate-500">
                        Мин. подогрев (°C)
                      </label>
                      <input
                        type="number"
                        value={rule.minPreheatTempC}
                        onChange={(e) =>
                          updatePreheatRule(idx, {
                            minPreheatTempC: Number(e.target.value),
                          })
                        }
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-[#1e3799]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
                <div>
                  {tcModal.item && onDeleteTechCard && (
                    <button
                      type="button"
                      onClick={() => {
                        if (tcModal.item) {
                          onDeleteTechCard(tcModal.item.id);
                          setTcModal({ isOpen: false, item: null });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить техкарту</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTcModal({ isOpen: false, item: null })}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e]"
                  >
                    <Check className="w-4 h-4" />
                    <span>Сохранить ТК</span>
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
