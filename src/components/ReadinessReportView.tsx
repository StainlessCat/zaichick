import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type {
  ReadinessGroupCondition,
  ReadinessSummaryRow,
  WeldJoint,
} from '../types/welding';
import {
  AnalyticsDynamicsPanel,
  ContourBlockersBar,
  DEFAULT_VISIBLE_COLUMNS,
  ReadinessKpiGrid,
  ReadinessTable,
  ReadinessToolbar,
  useReadinessReportState,
  WelderAnalyticsTab,
} from './analytics';

export interface RegistryDrillDownOptions {
  onlyActiveRepairs?: boolean;
  weldingDateFrom?: string;
  weldingDateTo?: string;
}

export interface ExecutiveDocsDrillDownMeta {
  rdCode?: string;
  lineNumber?: string;
}

interface ReadinessReportViewProps {
  joints: WeldJoint[];
  onFilterRegistryByCondition: (
    condition: ReadinessGroupCondition,
    value: string,
    options?: RegistryDrillDownOptions
  ) => void;
  onFilterRegistryByWelderStamp?: (
    stamp: string,
    options?: RegistryDrillDownOptions
  ) => void;
  onOpenRegistryActiveRepairs?: (options?: RegistryDrillDownOptions) => void;
  onOpenExecutiveDocsByCondition?: (
    condition: ReadinessGroupCondition,
    value: string,
    meta?: ExecutiveDocsDrillDownMeta
  ) => void;
  onOpenExecutiveDocs?: () => void;
}

export const ReadinessReportView: React.FC<ReadinessReportViewProps> = ({
  joints,
  onFilterRegistryByCondition,
  onFilterRegistryByWelderStamp,
  onOpenRegistryActiveRepairs,
  onOpenExecutiveDocsByCondition,
  onOpenExecutiveDocs,
}) => {
  const state = useReadinessReportState(joints);

  const handleDrillDownRegistry = (groupKey: string, onlyActiveRepairs = false) => {
    onFilterRegistryByCondition(state.condition, groupKey, {
      onlyActiveRepairs,
      weldingDateFrom: state.weldingDateFrom || undefined,
      weldingDateTo: state.weldingDateTo || undefined,
    });
  };

  const handleDrillDownExecutiveDocs = (row: ReadinessSummaryRow) => {
    if (!onOpenExecutiveDocsByCondition || row.totalLinesCount === 0) return;
    const meta =
      state.condition === 'uniqueLineId'
        ? state.lineMetaByUniqueId.get(row.groupKey)
        : undefined;
    onOpenExecutiveDocsByCondition(state.condition, row.groupKey, meta);
  };

  return (
    <div className="space-y-3.5">
      {state.exportToast && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{state.exportToast}</span>
          </div>
          <button
            type="button"
            onClick={() => state.setExportToast('')}
            className="text-emerald-700 hover:text-emerald-950 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <ReadinessToolbar
        activeTab={state.activeTab}
        condition={state.condition}
        onSelectCondition={(next) => {
          state.setActiveTab('readiness');
          state.setCondition(next);
          state.setSelectedGroupKey(null);
          state.setColumnFilters({});
          state.setSortConfig(null);
          if (next !== 'contour') state.setContourQuickFilter('all');
        }}
        onSelectWeldersTab={() => state.setActiveTab('welders')}
        searchQuery={state.searchQuery}
        onSearchQueryChange={state.setSearchQuery}
        datePreset={state.datePreset}
        weldingDateFrom={state.weldingDateFrom}
        weldingDateTo={state.weldingDateTo}
        hasDateRangeFilter={state.hasDateRangeFilter}
        onSelectDatePreset={state.handleSelectDatePreset}
        onWeldingDateFromChange={(val) => {
          state.setWeldingDateFrom(val);
          state.setDatePreset(val || state.weldingDateTo ? 'custom' : 'all');
        }}
        onWeldingDateToChange={(val) => {
          state.setWeldingDateTo(val);
          state.setDatePreset(state.weldingDateFrom || val ? 'custom' : 'all');
        }}
        visibleColumns={state.visibleColumns}
        isColVisible={state.isColVisible}
        onToggleColumn={state.toggleColumnVisibility}
        onShowAllColumns={() => state.setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
        isColumnsPopoverOpen={state.isColumnsPopoverOpen}
        onToggleColumnsPopover={() => state.setIsColumnsPopoverOpen((prev) => !prev)}
        columnsMenuRef={state.columnsMenuRef}
        hasActiveFilters={state.hasActiveFilters}
        onResetAllFilters={state.handleResetAllFilters}
        onExportXlsx={state.handleExportXlsx}
        onExportCsv={state.handleExportCsv}
      />

      {state.activeTab === 'welders' ? (
        <WelderAnalyticsTab
          joints={state.periodJoints}
          lines={state.scopedLines}
          welders={state.welders}
          onFilterByWelderStamp={(stamp) =>
            onFilterRegistryByWelderStamp?.(stamp, {
              weldingDateFrom: state.weldingDateFrom || undefined,
              weldingDateTo: state.weldingDateTo || undefined,
            })
          }
        />
      ) : (
        <>
          <ReadinessKpiGrid
            condition={state.condition}
            hasDateRangeFilter={state.hasDateRangeFilter}
            summary={state.summary}
          />

          <AnalyticsDynamicsPanel
            condition={state.condition}
            rows={state.rows}
            selectedGroupKey={state.selectedGroupKey}
            onSelectGroupKey={state.setSelectedGroupKey}
            joints={state.dynamicsJoints}
            lines={state.dynamicsLines}
            docByLineId={state.docByLineId}
            onClickRepairsShortcut={() => {
              if (state.selectedGroupKey) {
                handleDrillDownRegistry(state.selectedGroupKey, true);
                return;
              }
              onOpenRegistryActiveRepairs?.({
                weldingDateFrom: state.weldingDateFrom || undefined,
                weldingDateTo: state.weldingDateTo || undefined,
              });
            }}
            onClickExecDocsShortcut={() => {
              if (state.selectedGroupKey) {
                const selectedRow = state.rows.find(
                  (r) => r.groupKey === state.selectedGroupKey
                );
                if (selectedRow && selectedRow.totalLinesCount > 0 && onOpenExecutiveDocsByCondition) {
                  handleDrillDownExecutiveDocs(selectedRow);
                  return;
                }
              }
              onOpenExecutiveDocs?.();
            }}
          />

          {state.condition === 'contour' && (
            <ContourBlockersBar
              rows={state.baseRows}
              activeFilter={state.contourQuickFilter}
              onChangeFilter={state.setContourQuickFilter}
            />
          )}

          <ReadinessTable
            condition={state.condition}
            baseRows={state.baseRows}
            rows={state.rows}
            rowGetters={state.rowGetters}
            columnFilters={state.columnFilters}
            onApplyFilter={state.handleApplyFilter}
            sortConfig={state.sortConfig}
            onSort={state.handleSort}
            visibleColumns={state.visibleColumns}
            isColVisible={state.isColVisible}
            getColumnWidth={state.resizable.getColumnWidth}
            handleResizeStart={state.resizable.handleResizeStart}
            handleAutoFit={state.resizable.handleAutoFit}
            handleResetWidths={state.resizable.handleResetWidths}
            hasCustomWidths={state.resizable.hasCustomWidths}
            summary={state.summary}
            tableFooterTotals={state.tableFooterTotals}
            canOpenExecutiveDocs={Boolean(onOpenExecutiveDocsByCondition)}
            selectedGroupKey={state.selectedGroupKey}
            onSelectGroupKey={state.setSelectedGroupKey}
            onDrillDownRegistry={handleDrillDownRegistry}
            onDrillDownExecutiveDocs={handleDrillDownExecutiveDocs}
          />
        </>
      )}
    </div>
  );
};
