import React, { useState } from 'react';
import {
  FileText,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  Clock,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
} from 'lucide-react';
import { MaterialBatchAct } from '../../types/materialControl';
import { LRVItem } from '../../types/welding';
import { formatDateDisplay } from '../../utils/materialControlLogic';

interface MaterialBatchSubTableProps {
  material: LRVItem;
  canManageActs?: boolean;
  canReplaceBatch?: boolean;
  onReplaceBatch?: (material: LRVItem, batch: MaterialBatchAct) => void;
  onAddAct?: (material: LRVItem) => void;
  onEditAct?: (material: LRVItem, batch: MaterialBatchAct) => void;
  onDeleteAct?: (material: LRVItem, batchId: string) => void;
}

export const MaterialBatchSubTable: React.FC<MaterialBatchSubTableProps> = ({
  material,
  canManageActs = false,
  canReplaceBatch = false,
  onReplaceBatch,
  onAddAct,
  onEditAct,
  onDeleteAct,
}) => {
  const batches = material.batches || [];
  const [confirmDeleteBatchId, setConfirmDeleteBatchId] = useState<string | null>(null);

  return (
    <div className="bg-slate-50/90 border-y border-slate-200 px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-700">
          <FileText className="w-4 h-4 text-[#1e3799]" />
          <span className="font-semibold text-slate-800">
            Партии поступления и акты входного контроля
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600 tabular-nums">Актов: {batches.length}</span>
        </div>

        {canManageActs && onAddAct && (
          <button
            type="button"
            onClick={() => onAddAct(material)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1e3799] text-white hover:bg-[#15286e] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Внести акт ВК</span>
          </button>
        )}
      </div>

      {batches.length === 0 ? (
        <div className="rounded-lg bg-amber-50/80 border border-amber-200 px-4 py-3 text-xs text-amber-900 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Акты входного контроля не внесены. Вовлечение материала в сварку заблокировано до оформления допуска.
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-2 px-3 whitespace-nowrap">Номер акта</th>
                <th className="py-2 px-3 whitespace-nowrap">Дата акта</th>
                <th className="py-2 px-3">Сертификаты, паспорта</th>
                <th className="py-2 px-3 whitespace-nowrap">Плавка / партия</th>
                <th className="py-2 px-3">Заводские номера</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Количество</th>
                <th className="py-2 px-3 whitespace-nowrap">Результат контроля</th>
                <th className="py-2 px-3 whitespace-nowrap">Контролёр</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((batch) => {
                const isAccepted = batch.verdict === 'accepted';
                const isRejected = batch.verdict === 'rejected';
                const isReplaced = batch.verdict === 'replaced';
                const isConfirmingDelete = confirmDeleteBatchId === batch.id;

                return (
                  <tr
                    key={batch.id}
                    className={`transition-colors ${
                      isRejected
                        ? 'bg-rose-50/40 hover:bg-rose-50/70'
                        : isReplaced
                        ? 'bg-indigo-50/30 hover:bg-indigo-50/50'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#1e3799] whitespace-nowrap">
                      {batch.actNumber}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {formatDateDisplay(batch.actDate)}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-slate-700 max-w-[200px]">
                      {batch.certificateNumber || '—'}
                    </td>

                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                      {batch.heatNumber || '—'}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 max-w-[220px]">
                      {batch.serialNumbers && batch.serialNumbers.length > 0 ? (
                        <span className="break-words">{batch.serialNumbers.join(', ')}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                      {batch.quantity} {batch.unit}
                    </td>

                    <td className="py-2.5 px-3">
                      {isAccepted && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Пройден</span>
                        </span>
                      )}
                      {isRejected && (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-rose-700 font-semibold whitespace-nowrap">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Не пройден</span>
                          </span>
                          {batch.rejectionReason && (
                            <p className="text-[11px] text-rose-700 max-w-[260px] leading-snug">
                              {batch.rejectionReason}
                            </p>
                          )}
                        </div>
                      )}
                      {isReplaced && (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-indigo-700 font-semibold whitespace-nowrap">
                            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                            <span>Заменена по письму</span>
                          </span>
                          {batch.replacementLetter && (
                            <p className="text-[11px] text-indigo-700 max-w-[240px] leading-snug">
                              {batch.replacementLetter}
                              {batch.replacementDate ? ` от ${formatDateDisplay(batch.replacementDate)}` : ''}
                            </p>
                          )}
                        </div>
                      )}
                      {!isAccepted && !isRejected && !isReplaced && (
                        <span className="inline-flex items-center gap-1 text-slate-600 font-medium whitespace-nowrap">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>Ожидает проверки</span>
                        </span>
                      )}
                      {batch.notes && (
                        <p className="text-[11px] text-slate-500 mt-0.5 max-w-[260px] leading-snug">
                          {batch.notes}
                        </p>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {batch.inspectorName || '—'}
                    </td>

                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {isRejected && canReplaceBatch && onReplaceBatch && (
                          <button
                            type="button"
                            onClick={() => onReplaceBatch(material, batch)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Оформить замену</span>
                          </button>
                        )}

                        {isAccepted && !canManageActs && (
                          <span className="text-[11px] text-emerald-700 font-medium">
                            Допущен в стыки
                          </span>
                        )}

                        {canManageActs && onEditAct && (
                          <button
                            type="button"
                            onClick={() => onEditAct(material, batch)}
                            title="Редактировать акт"
                            className="p-1.5 rounded-md text-slate-500 hover:text-[#1e3799] hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canManageActs && onDeleteAct && (
                          isConfirmingDelete ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteAct(material, batch.id);
                                  setConfirmDeleteBatchId(null);
                                }}
                                className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                              >
                                Удалить
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteBatchId(null)}
                                className="px-2 py-1 rounded text-[11px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                              >
                                Отмена
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteBatchId(batch.id)}
                              title="Удалить акт"
                              className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
