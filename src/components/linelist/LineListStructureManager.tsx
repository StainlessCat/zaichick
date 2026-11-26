import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ProjectLineItem, WeldJoint } from '../../types/welding';

interface LineListStructureManagerProps {
  isOpen: boolean;
  onClose: () => void;
  uniqueObjectNames: string[];
  uniqueRdCodes: string[];
  lineList: ProjectLineItem[];
  joints: WeldJoint[];
  onDeleteObject: (objectName: string) => void;
  onDeleteRdCode: (rdCode: string) => void;
}

export const LineListStructureManager: React.FC<LineListStructureManagerProps> = ({
  isOpen,
  onClose,
  uniqueObjectNames,
  uniqueRdCodes,
  lineList,
  joints,
  onDeleteObject,
  onDeleteRdCode,
}) => {
  const [confirmDeleteObj, setConfirmDeleteObj] = useState<string | null>(null);
  const [confirmDeleteRd, setConfirmDeleteRd] = useState<string | null>(null);

  const { objectStats, rdStats } = useMemo(() => {
    const objMap = new Map<string, { lines: number; joints: number }>();
    const rdMap = new Map<string, { lines: number; joints: number; parentObj: string }>();

    if (!isOpen) {
      return { objectStats: objMap, rdStats: rdMap };
    }

    for (const l of lineList) {
      if (l.objectName) {
        const cur = objMap.get(l.objectName);
        if (cur) cur.lines += 1;
        else objMap.set(l.objectName, { lines: 1, joints: 0 });
      }
      if (l.rdCode) {
        const cur = rdMap.get(l.rdCode);
        if (cur) {
          cur.lines += 1;
        } else {
          rdMap.set(l.rdCode, {
            lines: 1,
            joints: 0,
            parentObj: l.objectName || '—',
          });
        }
      }
    }

    for (const j of joints) {
      if (j.objectName) {
        const cur = objMap.get(j.objectName);
        if (cur) cur.joints += 1;
        else objMap.set(j.objectName, { lines: 0, joints: 1 });
      }
      if (j.rdCode) {
        const cur = rdMap.get(j.rdCode);
        if (cur) cur.joints += 1;
        else rdMap.set(j.rdCode, { lines: 0, joints: 1, parentObj: j.objectName || '—' });
      }
    }

    return { objectStats: objMap, rdStats: rdMap };
  }, [isOpen, lineList, joints]);

  if (!isOpen) return null;

  return (
    <div className="bg-white rounded-xl border-2 border-red-200 p-4 shadow-sm space-y-4 text-xs">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
        <div>
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-600" />
            <span>Управление объектами строительства и шифрами РД</span>
          </h3>
          <p className="text-slate-500 mt-0.5">
            При удалении объекта или шифра РД каскадно удаляются связанные с ним линии лайнлиста, позиции ЛРВ и сварные стыки. Операция необратима на сервере.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
        >
          Закрыть
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Список объектов */}
        <div className="space-y-2">
          <div className="font-bold text-[#1e3799]">
            Объекты строительства · {uniqueObjectNames.length}
          </div>
          {uniqueObjectNames.length === 0 ? (
            <div className="p-3 rounded-lg bg-slate-50 text-slate-400">
              Объекты отсутствуют
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {uniqueObjectNames.map((objName) => {
                const stat = objectStats.get(objName);
                const linesCount = stat?.lines ?? 0;
                const jointsCount = stat?.joints ?? 0;
                const isConfirming = confirmDeleteObj === objName;
                return (
                  <div
                    key={objName}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50/70"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{objName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Линий: {linesCount} · Стыков: {jointsCount}
                      </div>
                    </div>
                    {!isConfirming ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteObj(objName)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 font-semibold shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Удалить объект</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteObject(objName);
                            setConfirmDeleteObj(null);
                          }}
                          className="px-2.5 py-1 rounded bg-red-600 text-white font-bold hover:bg-red-700 cursor-pointer"
                        >
                          Подтвердить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteObj(null)}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                        >
                          Отмена
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Список шифров РД */}
        <div className="space-y-2">
          <div className="font-bold text-[#1e3799]">
            Шифры рабочей документации РД · {uniqueRdCodes.length}
          </div>
          {uniqueRdCodes.length === 0 ? (
            <div className="p-3 rounded-lg bg-slate-50 text-slate-400">
              Шифры РД отсутствуют
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {uniqueRdCodes.map((rd) => {
                const stat = rdStats.get(rd);
                const parentObj = stat?.parentObj || '—';
                const linesCount = stat?.lines ?? 0;
                const jointsCount = stat?.joints ?? 0;
                const isConfirming = confirmDeleteRd === rd;
                return (
                  <div
                    key={rd}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50/70"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-slate-900 truncate">
                        {rd}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {parentObj} · Линий: {linesCount} · Стыков: {jointsCount}
                      </div>
                    </div>
                    {!isConfirming ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRd(rd)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 font-semibold shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Удалить РД</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteRdCode(rd);
                            setConfirmDeleteRd(null);
                          }}
                          className="px-2.5 py-1 rounded bg-red-600 text-white font-bold hover:bg-red-700 cursor-pointer"
                        >
                          Подтвердить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteRd(null)}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                        >
                          Отмена
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
