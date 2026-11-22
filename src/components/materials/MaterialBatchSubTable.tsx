import React from 'react';
import {
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  Plus,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { MaterialBatchAct } from '../../types/materialControl';
import { LRVItem } from '../../types/welding';
import { formatDateDisplay } from '../../utils/materialControlLogic';
import { Button } from '../ui';

interface MaterialBatchSubTableProps {
  material: LRVItem;
  canEdit?: boolean;
  onAddAct?: (materialId: string) => void;
  onInitiateReplacement?: (material: LRVItem, batch: MaterialBatchAct) => void;
}

export const MaterialBatchSubTable: React.FC<MaterialBatchSubTableProps> = ({
  material,
  canEdit = true,
  onAddAct,
  onInitiateReplacement,
}) => {
  const batches = material.batches || [];

  return (
    <div className="bg-slate-50/90 p-4 border-t border-b border-slate-300">
      <div className="sticky left-0 inline-flex flex-wrap items-center gap-3 mb-3 bg-slate-100/90 py-1.5 px-3 rounded-lg border border-slate-200/80 z-10 shadow-2xs">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#1e3799]" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Партии поступления и акты входного контроля
          </h4>
          <span className="text-xs text-slate-500 font-medium">
            Всего: {batches.length}
          </span>
        </div>

        {canEdit && onAddAct && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onAddAct(material.id)}
            className="flex items-center gap-1.5 text-xs bg-[#1e3799] hover:bg-[#15286e] text-white font-semibold shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Внести акт входного контроля</span>
          </Button>
        )}
      </div>

      {batches.length === 0 ? (
        <div className="sticky left-0 max-w-xl py-6 px-4 text-center rounded-lg border border-dashed border-slate-300 bg-white shadow-2xs">
          <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">
            По данной позиции спецификации акты входного контроля пока не зарегистрированы
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Материал заблокирован для вовлечения в сборку и сварку стыков до подписания заключения лаборатории
          </p>
          {canEdit && onAddAct && (
            <div className="mt-3.5">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => onAddAct(material.id)}
                className="inline-flex items-center gap-1.5 text-xs bg-[#1e3799] hover:bg-[#15286e] text-white font-semibold shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Внести акт входного контроля</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="sticky left-0 overflow-x-auto rounded border border-slate-200 bg-white shadow-xs max-w-5xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200">
                <th className="py-2 px-3 border-r border-slate-200">Номер акта</th>
                <th className="py-2 px-3 border-r border-slate-200">Дата акта</th>
                <th className="py-2 px-3 border-r border-slate-200">Сертификаты, паспорта</th>
                <th className="py-2 px-3 border-r border-slate-200">Плавка / партия</th>
                <th className="py-2 px-3 border-r border-slate-200">Заводские номера</th>
                <th className="py-2 px-3 border-r border-slate-200 text-right">Количество</th>
                <th className="py-2 px-3 border-r border-slate-200 text-center">Результат контроля</th>
                <th className="py-2 px-3 border-r border-slate-200">Контролёр</th>
                <th className="py-2 px-3 text-center">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((batch) => {
                const isAccepted = batch.verdict === 'accepted';
                const isRejected = batch.verdict === 'rejected';
                const isReplaced = batch.verdict === 'replaced';

                return (
                  <tr
                    key={batch.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isRejected ? 'bg-rose-50/40' : isReplaced ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 border-r border-slate-200 font-mono font-semibold text-[#1e3799] whitespace-nowrap">
                      {batch.actNumber}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-800 whitespace-nowrap">
                      {formatDateDisplay(batch.actDate)}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-slate-700 font-mono whitespace-nowrap">
                      {batch.certificateNumber || '—'}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap">
                      {batch.heatNumber || '—'}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-slate-800 max-w-[220px]">
                      {batch.serialNumbers && batch.serialNumbers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {batch.serialNumbers.map((s) => (
                            <span
                              key={s}
                              className="inline-block px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px] text-slate-700 border border-slate-200"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-right font-bold text-slate-900 whitespace-nowrap">
                      {batch.quantity} {batch.unit}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap">
                      {isAccepted && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Пройден</span>
                        </span>
                      )}
                      {isRejected && (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>Не пройден</span>
                          </span>
                          {batch.rejectionReason && (
                            <span
                              className="text-[10px] text-rose-600 max-w-[180px] truncate"
                              title={batch.rejectionReason}
                            >
                              {batch.rejectionReason}
                            </span>
                          )}
                        </div>
                      )}
                      {isReplaced && (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800">
                            <RefreshCw className="w-3 h-3 text-indigo-600" />
                            <span>Заменен по письму</span>
                          </span>
                          {batch.replacementLetter && (
                            <span className="text-[10px] text-indigo-700 font-mono">
                              {batch.replacementLetter}
                            </span>
                          )}
                        </div>
                      )}
                      {batch.verdict === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>Ожидает</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap">
                      {batch.inspectorName || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {isRejected && canEdit && onInitiateReplacement && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onInitiateReplacement(material, batch)}
                          className="inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-300 px-2 py-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Согласовать замену</span>
                        </Button>
                      )}
                      {isAccepted && (
                        <span className="text-emerald-700 text-[11px] font-medium flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Допущен в стыки</span>
                        </span>
                      )}
                      {isReplaced && (
                        <span className="text-indigo-700 text-[11px] font-medium">
                          Замена оформлена
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {material.replacementNotice && (
        <div className="mt-3 p-3 rounded bg-indigo-50/80 border border-indigo-200 flex items-start gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-semibold text-indigo-900">
              Позиция вовлечена в производство на основании согласования замены
            </div>
            <div className="text-indigo-800">
              {material.replacementNotice.letterNumber} от {formatDateDisplay(material.replacementNotice.letterDate)} ({material.replacementNotice.approvedBy})
            </div>
            <div className="text-slate-600 text-[11px]">
              Обоснование: {material.replacementNotice.reason}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
