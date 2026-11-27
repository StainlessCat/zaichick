import React from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Edit2,
  FilePlus2,
  Trash2,
} from 'lucide-react';
import { LRVItem } from '../../types/welding';
import { MaterialBatchAct } from '../../types/materialControl';
import { resolveLrvItemCategory } from '../../utils/pipeCalc';
import { calculateMaterialControlBalance } from '../../utils/materialControlLogic';
import {
  MaterialBalanceIndicator,
  MaterialControlBadge,
} from '../materials/MaterialControlBadge';
import { MaterialBatchSubTable } from '../materials/MaterialBatchSubTable';
import { LrvColumnDefinition } from './lrvColumns';

export interface LrvTableRowProps {
  item: LRVItem;
  activeColumns: LrvColumnDefinition[];
  totalColSpan: number;
  showCheckboxes: boolean;
  showActionsCol: boolean;
  canEditCatalog: boolean;
  canManageIncomingControl: boolean;
  lrvCodeLeftOffset: number;
  linkedJointsCount: number;
  isSelected: boolean;
  isExpanded: boolean;
  isConfirmingDelete: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onOpenAddAct: () => void;
  onOpenEditAct: (batch: MaterialBatchAct) => void;
  onDeleteAct: (batchId: string) => void;
  onOpenReplaceBatch: (batch: MaterialBatchAct) => void;
  onOpenJointsByLrvCode?: (lrvCode: string, rdCode?: string) => void;
  onRequestDeleteOrSupersede: () => void;
  onConfirmDeleteSingle: () => void;
  onCancelConfirmDelete: () => void;
}

function formatSizeSummary(item: LRVItem): { primary: string; secondary?: string } {
  const dnPart =
    item.dn1 !== undefined
      ? item.dn2 !== undefined
        ? `DN${item.dn1}/${item.dn2}`
        : `DN${item.dn1}`
      : '';
  const dim1 =
    item.diameterMm > 0
      ? `${item.diameterMm}×${Number(item.wallThickness || 0).toFixed(
          Number.isInteger(item.wallThickness) ? 0 : 1
        )}`
      : '';
  const dim2 =
    item.diameterMm2 && item.diameterMm2 > 0
      ? `${item.diameterMm2}×${Number(item.wallThickness2 || 0).toFixed(
          Number.isInteger(item.wallThickness2 || 0) ? 0 : 1
        )}`
      : '';
  const dimPart = dim1 ? (dim2 ? `Ø${dim1}–${dim2}` : `Ø${dim1}`) : '';

  if (dnPart && dimPart) {
    return { primary: dimPart, secondary: dnPart };
  }
  return { primary: dimPart || dnPart || '—' };
}

export const LrvTableRow: React.FC<LrvTableRowProps> = ({
  item,
  activeColumns,
  totalColSpan,
  showCheckboxes,
  showActionsCol,
  canEditCatalog,
  canManageIncomingControl,
  lrvCodeLeftOffset,
  linkedJointsCount,
  isSelected,
  isExpanded,
  isConfirmingDelete,
  onToggleSelect,
  onToggleExpand,
  onStartEdit,
  onOpenAddAct,
  onOpenEditAct,
  onDeleteAct,
  onOpenReplaceBatch,
  onOpenJointsByLrvCode,
  onRequestDeleteOrSupersede,
  onConfirmDeleteSingle,
  onCancelConfirmDelete,
}) => {
  const batches = item.batches || [];
  const totalSpec = item.totalSpecQty ?? item.specQty;
  const balance = calculateMaterialControlBalance(totalSpec, batches);
  const isSuperseded = item.status === 'superseded';
  const category = resolveLrvItemCategory(item);
  const fullNameText =
    item.fullName ||
    [item.shortName, item.material, item.ntd].filter(Boolean).join(', ');

  const rowBgClass = isSuperseded
    ? 'bg-slate-100/75 text-slate-500'
    : isSelected
    ? 'bg-blue-50/60'
    : isExpanded
    ? 'bg-blue-50/30'
    : 'bg-white hover:bg-slate-50/80';

  const stickyBgClass = isSuperseded
    ? 'bg-slate-100'
    : isSelected
    ? 'bg-blue-50'
    : isExpanded
    ? 'bg-blue-50/90'
    : 'bg-white group-hover:bg-slate-50';

  const renderCell = (col: LrvColumnDefinition) => {
    switch (col.key) {
      case 'lrvCode':
        return (
          <td
            key={col.key}
            style={{ left: lrvCodeLeftOffset }}
            className={`px-2.5 py-2.5 sticky z-10 border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)] ${stickyBgClass}`}
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span
                className={`font-mono font-bold text-[11px] truncate ${
                  isSuperseded ? 'line-through text-slate-400' : 'text-[#1e3799]'
                }`}
                title={item.lrvCode}
              >
                {item.lrvCode}
              </span>
              {batches.length > 0 && (
                <span className="text-[10px] text-slate-400 tabular-nums">
                  Актов ВК: {batches.length}
                </span>
              )}
              {isSuperseded && (
                <span className="text-[10px] font-semibold text-indigo-700 truncate">
                  Аннулирована
                </span>
              )}
            </div>
          </td>
        );

      case 'rdCode':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 font-mono text-[11px] text-slate-600 border-r border-slate-100 truncate"
            title={item.rdCode}
          >
            {item.rdCode}
          </td>
        );

      case 'shortName':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 border-r border-slate-100"
            title={item.shortName}
          >
            <div className="font-semibold text-slate-900 leading-snug line-clamp-2">
              {item.shortName}
            </div>
            {item.replacementNotice?.letterNumber && (
              <div className="text-[10px] text-indigo-700 mt-0.5 truncate">
                Замена по {item.replacementNotice.letterNumber}
              </div>
            )}
            {isSuperseded && item.replacementLetter && (
              <div className="text-[10px] text-amber-700 mt-0.5 truncate">
                Письмо: {item.replacementLetter}
              </div>
            )}
          </td>
        );

      case 'marking':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 font-mono text-[11px] text-slate-700 border-r border-slate-100 truncate"
            title={item.marking || ''}
          >
            {item.marking || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'fullName':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 text-[11px] text-slate-600 border-r border-slate-100 leading-snug"
            title={fullNameText}
          >
            <span className="line-clamp-2">{fullNameText || '—'}</span>
          </td>
        );

      case 'category':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 text-center text-[11px] font-medium text-slate-700 border-r border-slate-100 whitespace-nowrap"
          >
            {category}
          </td>
        );

      case 'pnMpa':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 text-center font-mono text-[11px] text-slate-700 border-r border-slate-100 tabular-nums whitespace-nowrap"
          >
            {item.pnMpa || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'connectionType':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 text-center text-[11px] text-slate-700 border-r border-slate-100 capitalize whitespace-nowrap"
          >
            {item.connectionType || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'material':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 font-mono text-[11px] font-semibold text-slate-800 border-r border-slate-100 truncate"
            title={item.material}
          >
            {item.material || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'ntd':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 text-[11px] text-slate-600 border-r border-slate-100 truncate"
            title={item.ntd}
          >
            {item.ntd || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'manufacturer':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 text-[11px] text-slate-600 border-r border-slate-100 truncate"
            title={item.manufacturer || ''}
          >
            {item.manufacturer || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'sizeSummary': {
        const size = formatSizeSummary(item);
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 text-center font-mono text-[11px] border-r border-slate-100 tabular-nums"
          >
            <div className="font-semibold text-slate-800 whitespace-nowrap">{size.primary}</div>
            {size.secondary && (
              <div className="text-[10px] text-slate-500 whitespace-nowrap">{size.secondary}</div>
            )}
          </td>
        );
      }

      case 'dn1':
        return (
          <td
            key={col.key}
            className="px-2 py-2.5 text-center font-mono text-[11px] text-slate-700 border-r border-slate-100 tabular-nums"
          >
            {item.dn1 !== undefined ? item.dn1 : <span className="text-slate-300">—</span>}
          </td>
        );

      case 'diameterMm':
        return (
          <td
            key={col.key}
            className="px-2 py-2.5 text-center font-mono text-[11px] font-semibold text-slate-800 border-r border-slate-100 tabular-nums"
          >
            {item.diameterMm > 0 ? item.diameterMm : <span className="text-slate-300">—</span>}
          </td>
        );

      case 'wallThickness':
        return (
          <td
            key={col.key}
            className="px-2 py-2.5 text-center font-mono text-[11px] text-slate-700 border-r border-slate-100 tabular-nums"
          >
            {item.wallThickness > 0 ? (
              item.wallThickness.toFixed(1)
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>
        );

      case 'dn2':
        return (
          <td
            key={col.key}
            className="px-2 py-2.5 text-center font-mono text-[11px] text-slate-700 border-r border-slate-100 tabular-nums"
          >
            {item.dn2 !== undefined ? item.dn2 : <span className="text-slate-300">—</span>}
          </td>
        );

      case 'diameterMm2':
        return (
          <td
            key={col.key}
            className="px-2 py-2.5 text-center font-mono text-[11px] text-slate-700 border-r border-slate-100 tabular-nums"
          >
            {item.diameterMm2 !== undefined ? (
              item.diameterMm2
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>
        );

      case 'wallThickness2':
        return (
          <td
            key={col.key}
            className="px-2 py-2.5 text-center font-mono text-[11px] text-slate-700 border-r border-slate-100 tabular-nums"
          >
            {item.wallThickness2 !== undefined ? (
              item.wallThickness2.toFixed(1)
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>
        );

      case 'specQty':
        return (
          <td
            key={col.key}
            className="px-2.5 py-2.5 text-right font-mono text-[11px] font-semibold text-slate-900 border-r border-slate-100 tabular-nums whitespace-nowrap"
          >
            {totalSpec} {item.unit}
          </td>
        );

      case 'linkedJoints':
        return (
          <td
            key={col.key}
            className="px-2 py-2.5 text-center border-r border-slate-100 tabular-nums"
          >
            {linkedJointsCount > 0 && onOpenJointsByLrvCode ? (
              <button
                type="button"
                onClick={() => onOpenJointsByLrvCode(item.lrvCode, item.rdCode)}
                title="Открыть привязанные стыки в реестре"
                className="inline-flex items-center gap-0.5 font-mono text-[11px] font-bold text-[#1e3799] hover:underline cursor-pointer"
              >
                <span>{linkedJointsCount}</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            ) : (
              <span className="font-mono text-[11px] text-slate-400">{linkedJointsCount}</span>
            )}
          </td>
        );

      case 'controlStatus':
        return (
          <td key={col.key} className="px-2.5 py-2.5 border-r border-slate-100">
            <MaterialControlBadge status={balance.controlStatus} />
          </td>
        );

      case 'balance':
        return (
          <td key={col.key} className="px-2.5 py-2.5 border-r border-slate-100">
            <MaterialBalanceIndicator
              acceptedQty={balance.acceptedQty}
              totalSpecQty={totalSpec}
              unit={item.unit}
              rejectedQty={balance.rejectedQty}
              replacedQty={balance.replacedQty}
            />
          </td>
        );

      default:
        return (
          <td key={col.key} className="px-2.5 py-2.5 border-r border-slate-100 text-slate-400">
            —
          </td>
        );
    }
  };

  return (
    <>
      <tr className={`group transition-colors ${rowBgClass}`}>
        <td
          className={`px-2 py-2.5 text-center sticky left-0 z-10 border-r border-slate-100 ${stickyBgClass}`}
        >
          <button
            type="button"
            onClick={onToggleExpand}
            title={isExpanded ? 'Свернуть акты входного контроля' : 'Показать акты входного контроля'}
            aria-label={isExpanded ? 'Свернуть акты входного контроля' : 'Показать акты входного контроля'}
            className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-[#1e3799] transition-colors cursor-pointer"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </td>

        {showCheckboxes && (
          <td
            style={{ left: 36 }}
            className={`px-2 py-2.5 text-center sticky z-10 border-r border-slate-100 ${stickyBgClass}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              aria-label={`Выбрать ${item.lrvCode}`}
              className="w-3.5 h-3.5 rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] cursor-pointer"
            />
          </td>
        )}

        {activeColumns.map(renderCell)}

        {showActionsCol && (
          <td className="px-2 py-2.5 text-center whitespace-nowrap">
            {isConfirmingDelete ? (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={onConfirmDeleteSingle}
                  className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                >
                  Да
                </button>
                <button
                  type="button"
                  onClick={onCancelConfirmDelete}
                  className="px-2 py-1 rounded text-[11px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Нет
                </button>
              </div>
            ) : (
              <div className="inline-flex items-center justify-center gap-1">
                {canManageIncomingControl && !isSuperseded && (
                  <button
                    type="button"
                    onClick={onOpenAddAct}
                    title="Внести акт входного контроля"
                    className="p-1.5 rounded-md text-[#1e3799] hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {canEditCatalog && (
                  <button
                    type="button"
                    onClick={onStartEdit}
                    title="Редактировать позицию"
                    className="p-1.5 rounded-md text-slate-500 hover:text-[#1e3799] hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {canEditCatalog && showCheckboxes && !isSuperseded && (
                  <button
                    type="button"
                    onClick={onRequestDeleteOrSupersede}
                    title={
                      linkedJointsCount > 0
                        ? 'Аннулировать позицию'
                        : 'Удалить позицию'
                    }
                    className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </td>
        )}
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={totalColSpan} className="p-0">
            <MaterialBatchSubTable
              material={{
                ...item,
                totalSpecQty: totalSpec,
                acceptedQty: balance.acceptedQty,
                rejectedQty: balance.rejectedQty,
                replacedQty: balance.replacedQty,
                pendingQty: balance.pendingQty,
                controlStatus: balance.controlStatus,
              }}
              canManageActs={canManageIncomingControl && !isSuperseded}
              canReplaceBatch={canEditCatalog && !isSuperseded}
              onAddAct={onOpenAddAct}
              onEditAct={(_mat, batch) => onOpenEditAct(batch)}
              onDeleteAct={(_mat, batchId) => onDeleteAct(batchId)}
              onReplaceBatch={(_mat, batch) => onOpenReplaceBatch(batch)}
            />
          </td>
        </tr>
      )}
    </>
  );
};
