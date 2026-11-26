import React, { useEffect, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import {
  LAB_DIAMETER_CODE_TABLE,
  LAB_WELDING_TYPE_CODE_TABLE,
} from '../../utils/labMarking';
import { Button, Input } from '../ui';

interface LabCodeReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LabCodeReferenceModal: React.FC<LabCodeReferenceModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFilterText('');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = filterText.trim().toLowerCase();
  const filteredDiameters = q
    ? LAB_DIAMETER_CODE_TABLE.filter(
        (d) =>
          d.diameterMm.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q)
      )
    : LAB_DIAMETER_CODE_TABLE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Справочник кодов маркировки стыков"
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-[#1e3799] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 shrink-0" />
            <h3 className="text-sm font-bold">
              Справочник кодов маркировки стыков
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть справочник"
            className="p-1 rounded hover:bg-white/15 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
            <div className="font-semibold text-slate-900">
              Формат маркировки стыка:
            </div>
            <div className="font-mono text-[#1e3799] font-bold">
              Краткий шифр РД - Номер линии - Индекс диаметра - Код сварки - Номер стыка
            </div>
            <div className="text-[11px] text-slate-500">
              Номер заключения формируется по шаблону: Метод-Маркировка
            </div>
          </div>

          {/* Таблица цифровых кодов видов сварки */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2">
              Коды видов сварки
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {LAB_WELDING_TYPE_CODE_TABLE.map((item) => (
                <div
                  key={item.weldingType}
                  title={item.description}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-semibold text-slate-800">
                    {item.weldingType}
                  </span>
                  <span className="font-mono font-bold text-[#1e3799] bg-blue-50 px-1.5 py-0.5 rounded">
                    {item.code}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Таблица диаметров и буквенных индексов */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h4 className="text-xs font-bold text-slate-800">
                Индексы диаметров и врезок
              </h4>
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Поиск диаметра или кода..."
                  className="w-full pl-8 pr-7 h-8 text-xs"
                />
                {filterText && (
                  <button
                    type="button"
                    onClick={() => setFilterText('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
              {filteredDiameters.map((item) => (
                <div
                  key={item.diameterMm}
                  className={`px-2 py-1.5 rounded border text-xs flex items-center justify-between gap-1 ${
                    item.diameterMm === 'врезка'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-slate-50/70 border-slate-200'
                  }`}
                >
                  <span className="font-mono text-slate-700 truncate">
                    {item.diameterMm === 'врезка' ? 'врезка' : `Ø${item.diameterMm}`}
                  </span>
                  <span className="font-mono font-bold text-[#1e3799] shrink-0">
                    {item.code}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <Button type="button" variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
};
