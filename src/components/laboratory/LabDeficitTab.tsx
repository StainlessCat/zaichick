import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { NdtLineDeficitRow, NdtRdDeficitGroup } from '../../utils/laboratoryLogic';
import { LabMarkingCell } from './LabMarkingCell';

interface LabDeficitTabProps {
  onlyDeficitLines: boolean;
  setOnlyDeficitLines: (val: boolean) => void;
  filteredRdGroups: NdtRdDeficitGroup[];
  expandedRdCodes: Record<string, boolean>;
  setExpandedRdCodes: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onOpenCreateRequestModal: (line: NdtLineDeficitRow) => void;
  canCreateRequest?: boolean;
}

export const LabDeficitTab: React.FC<LabDeficitTabProps> = ({
  onlyDeficitLines,
  setOnlyDeficitLines,
  filteredRdGroups,
  expandedRdCodes,
  setExpandedRdCodes,
  onOpenCreateRequestModal,
  canCreateRequest = true,
}) => {
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900">
            Дефицитная ведомость неразрушающего контроля
          </h3>
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyDeficitLines}
              onChange={(e) => setOnlyDeficitLines(e.target.checked)}
              className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
            />
            <span>Только линии с дефицитом</span>
          </label>
        </div>

        <div className="text-[11px] text-slate-500">
          Норматив по Лайнлисту: <span className="font-mono">Q_треб = ceil(N_свар × % / 100)</span>
        </div>
      </div>

      {filteredRdGroups.length === 0 ? (
        <div className="p-8 text-center space-y-2">
          <div className="text-sm font-semibold text-slate-700">
            По заданным фильтрам линии с дефицитом НК не найдены
          </div>
          <p className="text-xs text-slate-500">
            Сбросьте фильтр «Только линии с дефицитом» или выберите другой объект / шифр РД.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {filteredRdGroups.map((group) => {
            const isExpanded = expandedRdCodes[group.rdCode] !== false;
            return (
              <div key={group.rdCode} className="bg-white">
                {/* Заголовок группы Шифра РД */}
                <div className="px-4 py-2.5 bg-[#f4f8fe] flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRdCodes((prev) => ({
                        ...prev,
                        [group.rdCode]: !isExpanded,
                      }))
                    }
                    className="inline-flex items-center gap-2 text-left cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-[#1e3799]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#1e3799]" />
                    )}
                    <span className="font-mono font-bold text-xs sm:text-sm text-[#1e3799]">
                      Шифр РД: {group.rdCode}
                    </span>
                    <span className="text-xs text-slate-600">
                      · {group.objectName} · Линий: {group.lines.length}
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-700">
                    <span>
                      Сварено: <strong>{group.weldedCount}</strong>/{group.totalJoints} ст.
                    </span>
                    <span>
                      ВИК: <strong>{group.vikCompleted}</strong>/{group.vikRequired}
                      {group.vikDeficit > 0 && (
                        <span className="text-amber-700 font-bold ml-1">
                          · дефицит {group.vikDeficit}
                        </span>
                      )}
                    </span>
                    <span>
                      РК: <strong>{group.rkCompleted}</strong>/{group.rkRequired}
                      {group.rkDeficit > 0 && (
                        <span className="text-rose-700 font-bold ml-1">
                          · дефицит {group.rkDeficit}
                        </span>
                      )}
                    </span>
                    <span>
                      УЗК: <strong>{group.uzkCompleted}</strong>/{group.uzkRequired}
                      {group.uzkDeficit > 0 && (
                        <span className="text-amber-700 font-bold ml-1">
                          · дефицит {group.uzkDeficit}
                        </span>
                      )}
                    </span>
                    {group.pvkRequired > 0 && (
                      <span>
                        ПВК: <strong>{group.pvkCompleted}</strong>/{group.pvkRequired}
                        {group.pvkDeficit > 0 && (
                          <span className="text-amber-700 font-bold ml-1">
                            · дефицит {group.pvkDeficit}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Таблица линий внутри Шифра РД */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#1e3799] text-white select-none text-xs font-semibold shadow-xs">
                          <th className="py-2.5 px-2 w-8 border-r border-white/15 text-center" />
                          <th className="py-2.5 px-3 border-r border-white/15">Линия / Контур ГИ</th>
                          <th className="py-2.5 px-2.5 text-center border-r border-white/15">Кат. / Ур.</th>
                          <th className="py-2.5 px-2.5 text-right border-r border-white/15">Сварено / Всего</th>
                          <th className="py-2.5 px-3 text-center border-r border-white/15">ВИК</th>
                          <th className="py-2.5 px-3 text-center border-r border-white/15">РК</th>
                          <th className="py-2.5 px-3 text-center border-r border-white/15">УЗК</th>
                          <th className="py-2.5 px-3 text-center border-r border-white/15">ПВК</th>
                          <th className="py-2.5 px-3 border-r border-white/15">Квота по сварщикам</th>
                          <th className="py-2.5 px-3 text-center border-r border-white/15">Статус квоты</th>
                          <th className="py-2.5 px-3 text-right">Заявка в ЛНК</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {group.lines.map((line) => {
                          const isLineOpen = Boolean(expandedLines[line.uniqueLineId]);
                          return (
                            <React.Fragment key={line.uniqueLineId}>
                              <tr
                                className={
                                  line.hasDeficit
                                    ? 'bg-amber-50/40 hover:bg-amber-50/80 transition-colors'
                                    : 'bg-white hover:bg-slate-50 transition-colors'
                                }
                              >
                                <td className="py-2.5 px-2 text-center">
                                  {line.allWeldedJoints.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedLines((prev) => ({
                                          ...prev,
                                          [line.uniqueLineId]: !isLineOpen,
                                        }))
                                      }
                                      title="Показать стыки линии и маркировку"
                                      className="p-1 rounded hover:bg-slate-200/70 text-[#1e3799] cursor-pointer"
                                    >
                                      {isLineOpen ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  )}
                                </td>

                                <td className="py-2.5 px-3">
                                  <div className="font-mono font-bold text-slate-900">
                                    {line.lineNumber}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {line.contour} · {line.controlNtd}
                                  </div>
                                </td>

                                <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-slate-700">
                                  {line.pipelineCategory || '—'} / {line.qualityLevel || '—'}
                                </td>

                                <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                                  <span className="font-bold text-slate-900">
                                    {line.weldedCount}
                                  </span>
                                  <span className="text-slate-400"> / {line.totalJoints}</span>
                                  {line.inRepairCount > 0 && (
                                    <div className="text-[10px] text-rose-700 font-semibold">
                                      В ремонте: {line.inRepairCount} ст.
                                    </div>
                                  )}
                                </td>

                                {/* ВИК */}
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                                  <div>
                                    <span className="font-bold text-slate-900">
                                      {line.vikCompleted}
                                    </span>
                                    <span className="text-slate-500">
                                      /{line.vikRequired} · {line.vikActualPct}%
                                    </span>
                                  </div>
                                  {line.vikDeficit > 0 ? (
                                    <div className="text-[11px] text-amber-800 font-semibold">
                                      Дефицит: {line.vikDeficit} ст.
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-emerald-700">Выполнено</div>
                                  )}
                                </td>

                                {/* РК */}
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                                  <div className="text-[11px] text-slate-500">
                                    Норма {line.rkPlanPct}% · {line.rkRequired} ст.
                                  </div>
                                  <div>
                                    Факт{' '}
                                    <strong className="text-slate-900">
                                      {line.rkCompleted}
                                    </strong>{' '}
                                    · {line.rkActualPct}%
                                  </div>
                                  {line.rkDeficit > 0 && (
                                    <div className="text-[11px] font-bold text-rose-700">
                                      Дефицит: {line.rkDeficit} ст.
                                    </div>
                                  )}
                                </td>

                                {/* УЗК */}
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                                  {line.uzkPlanPct === 0 ? (
                                    <span className="text-slate-400">0%</span>
                                  ) : (
                                    <>
                                      <div className="text-[11px] text-slate-500">
                                        Норма {line.uzkPlanPct}% · {line.uzkRequired} ст.
                                      </div>
                                      <div>
                                        Факт{' '}
                                        <strong className="text-slate-900">
                                          {line.uzkCompleted}
                                        </strong>{' '}
                                        · {line.uzkActualPct}%
                                      </div>
                                      {line.uzkDeficit > 0 && (
                                        <div className="text-[11px] font-bold text-amber-800">
                                          Дефицит: {line.uzkDeficit} ст.
                                        </div>
                                      )}
                                    </>
                                  )}
                                </td>

                                {/* ПВК */}
                                <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                                  {line.pvkPlanPct === 0 ? (
                                    <span className="text-slate-400">0%</span>
                                  ) : (
                                    <>
                                      <div className="text-[11px] text-slate-500">
                                        Норма {line.pvkPlanPct}% · {line.pvkRequired} ст.
                                      </div>
                                      <div>
                                        Факт{' '}
                                        <strong className="text-slate-900">
                                          {line.pvkCompleted}
                                        </strong>{' '}
                                        · {line.pvkActualPct}%
                                      </div>
                                      {line.pvkDeficit > 0 && (
                                        <div className="text-[11px] font-bold text-amber-800">
                                          Дефицит: {line.pvkDeficit} ст.
                                        </div>
                                      )}
                                    </>
                                  )}
                                </td>

                                {/* Квота по сварщикам */}
                                <td className="py-2.5 px-3 font-mono text-[11px]">
                                  {line.welderDeficits.length === 0 ? (
                                    <span className="text-emerald-700">
                                      Квота закрыта
                                    </span>
                                  ) : (
                                    <div className="space-y-0.5 text-amber-900">
                                      {line.welderDeficits.map((w) => (
                                        <div key={w.stamp}>
                                          Клеймо <strong>{w.stamp}</strong>: {w.controlledCount}/
                                          {w.requiredCount}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>

                                {/* Статус квоты */}
                                <td className="py-2.5 px-3 text-center">
                                  {line.weldedCount === 0 ? (
                                    <span className="text-slate-400 text-[11px]">
                                      Нет сварки
                                    </span>
                                  ) : line.hasDeficit ? (
                                    <span className="text-rose-700 font-bold text-[11px]">
                                      Требуется НК · дефицит{' '}
                                      {Math.max(
                                        line.totalPhysicalDeficit,
                                        line.vikDeficit,
                                        line.inRepairCount
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 font-bold text-[11px]">
                                      Норматив выполнен
                                    </span>
                                  )}
                                </td>

                                {/* Действие */}
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    disabled={line.weldedCount === 0 || !canCreateRequest}
                                    onClick={() => onOpenCreateRequestModal(line)}
                                    title={
                                      !canCreateRequest
                                        ? 'Для формирования заявки требуется роль инженера ПТО'
                                        : undefined
                                    }
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>
                                      Заявка · {line.candidateJoints.length || line.weldedCount} ст.
                                    </span>
                                  </button>
                                </td>
                              </tr>

                              {isLineOpen && line.allWeldedJoints.length > 0 && (
                                <tr className="bg-slate-50/80">
                                  <td colSpan={11} className="px-6 py-2.5">
                                    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                                      <table className="w-full text-left border-collapse text-[11px]">
                                        <thead>
                                          <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                                            <th className="py-1.5 px-2.5">№ стыка</th>
                                            <th className="py-1.5 px-2.5">Маркировка стыка</th>
                                            <th className="py-1.5 px-2.5">Типоразмер</th>
                                            <th className="py-1.5 px-2.5">Сварка</th>
                                            <th className="py-1.5 px-2.5">ВИК</th>
                                            <th className="py-1.5 px-2.5">НК</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {line.allWeldedJoints.map((j) => (
                                            <tr key={j.id} className="hover:bg-slate-50">
                                              <td className="py-1.5 px-2.5 font-mono font-bold text-[#1e3799]">
                                                {j.jointNumber}
                                              </td>
                                              <td className="py-1.5 px-2.5">
                                                <LabMarkingCell joint={j} compact />
                                              </td>
                                              <td className="py-1.5 px-2.5 font-mono">
                                                {j.diameterMm}×{j.wallThickness} мм
                                              </td>
                                              <td className="py-1.5 px-2.5 font-mono">
                                                {j.weldingType} · {j.welderStamp}
                                              </td>
                                              <td className="py-1.5 px-2.5 font-mono">
                                                {j.vikResult}
                                              </td>
                                              <td className="py-1.5 px-2.5 font-mono">
                                                {j.ndtType}: {j.ndtResult}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
