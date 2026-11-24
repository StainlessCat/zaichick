import { useModalDismiss } from '../../hooks/useModalDismiss';
import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { LRVItem, WeldJoint } from '../../types/welding';
import { getJointsUsingLrvItem } from '../../utils/weldingLogic';

interface LrvSupersedeModalProps {
  item: LRVItem | null;
  onClose: () => void;
  onConfirm: (item: LRVItem, letter: string, date: string) => void;
  joints?: WeldJoint[];
}

export const LrvSupersedeModal: React.FC<LrvSupersedeModalProps> = ({
  item,
  onClose,
  onConfirm,
  joints,
}) => {
  if (!item) return null;

  const [letterInput, setLetterInput] = useState(item.replacementLetter || '');
  const [dateInput, setDateInput] = useState(
    item.replacementDate || new Date().toISOString().slice(0, 10)
  );

  const affectedJoints = joints ? getJointsUsingLrvItem(item, joints) : [];
  const isDirty = Boolean(letterInput.trim() && letterInput !== item?.replacementLetter);
  const { handleRequestClose } = useModalDismiss({
    isOpen: Boolean(item),
    isDirty,
    onClose,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden space-y-4 p-5">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Аннулирование позиции материала
              </h3>
              <p className="text-xs text-slate-500">
                Защита целостности базы данных и исполнительной документации
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1.5 leading-relaxed">
          <div className="font-bold">
            Позиция ЛРВ {item.lrvCode} («{item.shortName}») привязана к сварным стыкам: {affectedJoints.length} шт.
          </div>
          <div>
            Согласно правилам отраслевого учёта и нормативным требованиям (ГОСТ 32569, СТО Газпром), физическое удаление запрещено, так как это разрушит исполнительную документацию уже сваренных соединений.
          </div>
          <div>
            Позиция будет <strong>логически аннулирована</strong> и заменена. Она перестанет предлагаться для новых стыков, но сохранится в истории и журналах существующих стыков.
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Номер и дата официального письма или акта пересогласования
            </label>
            <input
              type="text"
              value={letterInput}
              onChange={(e) => setLetterInput(e.target.value)}
              placeholder="Напр.: Письмо № 142/ПТО от 15.08.2026"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#1e3799]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Дата пересогласования
            </label>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#1e3799]/30"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handleRequestClose}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onConfirm(item, letterInput, dateInput)}
            className="px-4 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 shadow-2xs cursor-pointer"
          >
            Аннулировать и заменить
          </button>
        </div>
      </div>
    </div>
  );
};
