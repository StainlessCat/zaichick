import React from 'react';
import { ChevronDown, ChevronRight, Edit3, Trash2 } from 'lucide-react';
import { LRVItem, WeldJoint } from '../../types/welding';
import { MaterialBatchAct } from '../../types/materialControl';
import {
  getLrvItemDn1,
  getLrvItemDn2,
  isLrvItemUsedInJoints,
  resolveLrvConnectionType,
  resolveLrvFullName,
  resolveLrvItemCategory,
} from '../../utils/weldingLogic';
import {
  MaterialControlBadge,
  MaterialBalanceIndicator,
  MaterialBatchSubTable,
} from '../materials';

interface LrvTableRowProps {
  item: LRVItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  canEdit: boolean;
  onEdit: (item: LRVItem) => void;
  onDeleteRequest: (item: LRVItem) => void;
  confirmDeleteId: string | null;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onAddAct: (item: LRVItem) => void;
  onInitiateReplacement: (material: LRVItem, batch: MaterialBatchAct) => void;
  onDeleteLrvItems?: (ids: string[]) => void;
  joints?: WeldJoint[];
  getColumnWidth: (key: string) => number;
}

export const LrvTableRow: React.FC<LrvTableRowProps> = ({
  item,
  isSelected,
  onToggleSelect,
  isExpanded,
  onToggleExpand,
  canEdit,
  onEdit,
  onDeleteRequest,
  confirmDeleteId,
  onConfirmDelete,
  onCancelDelete,
  onAddAct,
  onInitiateReplacement,
  onDeleteLrvItems,
  joints,
  getColumnWidth,
}) => {
  const dn1Val = getLrvItemDn1(item);
  const dn2Val = getLrvItemDn2(item);
  const category = resolveLrvItemCategory(item);
  const fullNameDisplay = resolveLrvFullName(item);
  const isUsed = Boolean(joints && isLrvItemUsedInJoints(item, joints));

  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a, label')) {
      return;
    }
    onToggleExpand(item.id);
  };

  return (
    <React.Fragment key={item.id}>
      <tr
        onClick={handleRowClick}
        title="Нажмите на строку, чтобы раскрыть партии и акты входного контроля"
        className={`hover:bg-[#e8f1fc] transition-colors cursor-pointer select-none ${
          isSelected
            ? 'bg-[#e8f1fc]'
            : isExpanded
            ? 'bg-sky-50/70'
            : 'odd:bg-white even:bg-slate-50/60'
        }`}
      >
        <td
          className={`py-2.5 px-1.5 text-center border-r border-slate-200 sticky left-0 z-10 w-8 min-w-[32px] max-w-[32px] ${
            isSelected
              ? 'bg-[#e8f1fc]'
              : isExpanded
              ? 'bg-sky-50'
              : 'bg-white'
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(item.id);
            }}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer"
            aria-label="Раскрыть партии и акты входного контроля"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#1e3799]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        </td>

        {onDeleteLrvItems && (
          <td
            className={`py-2.5 px-2.5 border-r border-slate-200 text-center sticky left-8 z-10 w-9 min-w-[36px] max-w-[36px] ${
              isSelected
                ? 'bg-[#e8f1fc]'
                : isExpanded
                ? 'bg-sky-50'
                : 'bg-white'
            }`}
          >
            <input
              type="checkbox"
              aria-label={`Выбрать позицию ЛРВ ${item.lrvCode}`}
              checked={isSelected}
              onChange={() => onToggleSelect(item.id)}
              onClick={(e) => e.stopPropagation()}
              className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] cursor-pointer"
            />
          </td>
        )}

        <td
          style={{
            width: getColumnWidth('lrvCode'),
            minWidth: getColumnWidth('lrvCode'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono font-bold text-[#1e3799] whitespace-nowrap"
        >
          <div className="flex items-center gap-1.5">
            <span>{item.lrvCode}</span>
            {item.parentMaterialId && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                Замена
              </span>
            )}
            {(item.status === 'superseded' || item.status === 'archived') && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 select-none"
                title={`Аннулировано по письму: ${item.replacementLetter || 'Не указано'}${item.replacementDate ? ' от ' + item.replacementDate : ''}`}
              >
                Аннулирована
              </span>
            )}
          </div>
        </td>

        <td
          style={{
            width: getColumnWidth('rdCode'),
            minWidth: getColumnWidth('rdCode'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-900 whitespace-nowrap"
        >
          {item.rdCode}
        </td>

        <td
          style={{
            width: getColumnWidth('shortName'),
            minWidth: getColumnWidth('shortName'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-semibold text-slate-900"
        >
          <div>{item.shortName}</div>
        </td>

        <td
          style={{
            width: getColumnWidth('marking'),
            minWidth: getColumnWidth('marking'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap"
        >
          {item.marking ? (
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[11px] font-mono font-medium text-indigo-700">
              {item.marking}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>

        <td
          style={{
            width: getColumnWidth('fullName'),
            minWidth: getColumnWidth('fullName'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 text-slate-800"
        >
          <div className="text-[11px] leading-tight line-clamp-2" title={fullNameDisplay}>
            {fullNameDisplay}
          </div>
        </td>

        <td
          style={{
            width: getColumnWidth('category'),
            minWidth: getColumnWidth('category'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap"
        >
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
            {category}
          </span>
        </td>

        <td
          style={{
            width: getColumnWidth('pnMpa'),
            minWidth: getColumnWidth('pnMpa'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap"
        >
          {item.pnMpa ? (
            <span className="font-mono text-slate-800 text-[11px]">
              {item.pnMpa} МПа
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>

        <td
          style={{
            width: getColumnWidth('connectionType'),
            minWidth: getColumnWidth('connectionType'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap"
        >
          {category === 'ЗРА' ? (
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                resolveLrvConnectionType(item) === 'фланцевый'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {resolveLrvConnectionType(item) === 'фланцевый' ? 'Фланцевый' : 'Приварной'}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>

        <td
          style={{
            width: getColumnWidth('material'),
            minWidth: getColumnWidth('material'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap"
        >
          {item.material}
        </td>

        <td
          style={{
            width: getColumnWidth('ntd'),
            minWidth: getColumnWidth('ntd'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap"
        >
          {item.ntd}
        </td>

        <td
          style={{
            width: getColumnWidth('manufacturer'),
            minWidth: getColumnWidth('manufacturer'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 text-slate-700"
        >
          {item.manufacturer || '—'}
        </td>

        <td
          style={{
            width: getColumnWidth('dn1'),
            minWidth: getColumnWidth('dn1'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono font-bold text-right text-slate-900 whitespace-nowrap"
        >
          {dn1Val !== undefined ? dn1Val : '—'}
        </td>

        <td
          style={{
            width: getColumnWidth('diameterMm'),
            minWidth: getColumnWidth('diameterMm'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono font-bold text-right text-slate-900 whitespace-nowrap"
        >
          {item.diameterMm}
        </td>

        <td
          style={{
            width: getColumnWidth('wallThickness'),
            minWidth: getColumnWidth('wallThickness'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono font-bold text-right text-slate-900 whitespace-nowrap"
        >
          {item.wallThickness.toFixed(1)}
        </td>

        <td
          style={{
            width: getColumnWidth('dn2'),
            minWidth: getColumnWidth('dn2'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono font-semibold text-right text-slate-700 whitespace-nowrap"
        >
          {dn2Val !== undefined ? dn2Val : '—'}
        </td>

        <td
          style={{
            width: getColumnWidth('diameterMm2'),
            minWidth: getColumnWidth('diameterMm2'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono text-right text-slate-700 whitespace-nowrap"
        >
          {item.diameterMm2 !== undefined ? item.diameterMm2 : '—'}
        </td>

        <td
          style={{
            width: getColumnWidth('wallThickness2'),
            minWidth: getColumnWidth('wallThickness2'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono text-right text-slate-700 whitespace-nowrap"
        >
          {item.wallThickness2 !== undefined ? item.wallThickness2.toFixed(1) : '—'}
        </td>

        <td
          style={{
            width: getColumnWidth('specQty'),
            minWidth: getColumnWidth('specQty'),
          }}
          className="py-2.5 px-3 border-r border-slate-200 font-mono text-right font-bold text-slate-900 whitespace-nowrap"
        >
          {item.specQty} {item.unit}
        </td>

        <td
          style={{
            width: getColumnWidth('controlStatus'),
            minWidth: getColumnWidth('controlStatus'),
          }}
          className="py-2 px-2.5 border-r border-slate-200 text-center whitespace-nowrap"
        >
          <MaterialControlBadge
            status={item.controlStatus || 'pending'}
          />
        </td>

        <td
          style={{
            width: getColumnWidth('balance'),
            minWidth: getColumnWidth('balance'),
          }}
          className="py-2 px-2.5 border-r border-slate-200"
        >
          <MaterialBalanceIndicator
            totalSpecQty={item.totalSpecQty ?? item.specQty}
            acceptedQty={item.acceptedQty || 0}
            rejectedQty={item.rejectedQty || 0}
            unit={item.unit}
          />
        </td>

        {onDeleteLrvItems && (
          <td
            style={{
              width: getColumnWidth('action'),
              minWidth: getColumnWidth('action'),
            }}
            className="py-2.5 px-2 text-center whitespace-nowrap"
          >
            {confirmDeleteId === item.id ? (
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => onConfirmDelete(item.id)}
                  className="px-2 py-0.5 rounded bg-red-600 text-white font-bold text-[10px] hover:bg-red-700 cursor-pointer"
                >
                  Да
                </button>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] hover:bg-slate-300 cursor-pointer"
                >
                  Нет
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="p-1.5 rounded text-slate-400 hover:text-[#1e3799] hover:bg-[#1e3799]/10 transition-colors cursor-pointer"
                    title={`Редактировать позицию ЛРВ «${item.lrvCode}»`}
                    aria-label={`Редактировать позицию ЛРВ ${item.lrvCode}`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDeleteRequest(item)}
                  className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  title={
                    isUsed
                      ? 'Позиция привязана к стыкам: аннулировать и заменить'
                      : `Удалить материал ЛРВ «${item.lrvCode}»`
                  }
                  aria-label={`Удалить материал ${item.lrvCode}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </td>
        )}
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={onDeleteLrvItems ? 20 : 19} className="p-0 bg-slate-50">
            <MaterialBatchSubTable
              material={item}
              canEdit={canEdit}
              onAddAct={() => onAddAct(item)}
              onInitiateReplacement={(mat, batch) => onInitiateReplacement(mat, batch)}
            />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
};
