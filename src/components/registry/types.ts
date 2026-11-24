import {
  ColumnDefinition,
  ColumnTemplate,
  NdtLabRequest,
  ProjectLineItem,
  RecordStatus,
  WelderProfile,
  WeldJoint,
  WeldJointFieldKey,
} from '../../types/welding';
import { getUserRolePermissions } from '../../utils/rbac';

export type UserRolePermissions = ReturnType<typeof getUserRolePermissions>;

export interface RegistryToolbarProps {
  weldingDateFrom: string;
  weldingDateTo: string;
  onWeldingDateFromChange: (val: string) => void;
  onWeldingDateToChange: (val: string) => void;
  onResetDateRange: () => void;
  userPermissions: UserRolePermissions;
  selectedJointIds: string[];
  confirmBulkDeleteJoints: boolean;
  onSetConfirmBulkDeleteJoints: (val: boolean) => void;
  onBulkDeleteSelectedJoints: () => void;
  onOpenBulkEdit: () => void;
  onQuickAddSupplementaryJoint?: () => void;
  onOpenImportExcel: () => void;
  onOpenCreatePassport: () => void;
  onOpenSubmitLabRequestModal: () => void;
  canCreateLabRequest: boolean;
  activeTemplateId: string;
  templates: ColumnTemplate[];
  onApplyTemplate: (template: ColumnTemplate) => void;
  visibleColumnsCount: number;
  totalColumnsCount: number;
  onOpenColumnsModal: () => void;
  hasActiveFilters?: boolean;
  onResetAllFilters?: () => void;
}

export interface RegistryActiveFilterBarProps {
  weldingDateFrom: string;
  weldingDateTo: string;
  onResetDateRange: () => void;
  activeFilterKeys: string[];
  columnFilters: Record<string, string[] | undefined>;
  onSetColumnFilter: (key: WeldJointFieldKey, values: string[] | undefined) => void;
  selectedJointIdsCount: number;
  onClearSelection: () => void;
  onResetAllFilters: () => void;
}

export interface RegistryTableProps {
  joints: WeldJoint[];
  filteredAndSortedJoints: WeldJoint[];
  selectedJointIds: string[];
  onToggleSelectRow: (jointId: string) => void;
  onToggleSelectAll: () => void;
  activeColumnDefs: ColumnDefinition[];
  columnWidths: Record<string, number>;
  columnFilters: Record<string, string[] | undefined>;
  sortConfig: { key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null;
  onSetSortConfig: React.Dispatch<
    React.SetStateAction<{ key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null>
  >;
  openFilterColumnKey: WeldJointFieldKey | null;
  onSetOpenFilterColumnKey: (key: WeldJointFieldKey | null) => void;
  getUniqueValuesForColumn: (
    key: WeldJointFieldKey
  ) => { value: string; count: number }[];
  onSetColumnFilter: (key: WeldJointFieldKey, values: string[] | undefined) => void;
  onMoveColumnInline: (key: WeldJointFieldKey, dir: 'left' | 'right') => void;
  onHideColumnInline: (key: WeldJointFieldKey) => void;
  onColumnResizeStart: (
    e: React.PointerEvent,
    colKey: WeldJointFieldKey,
    currentWidth: number
  ) => void;
  onColumnAutoFit: (colKey: WeldJointFieldKey) => void;
  onResetAllFilters: () => void;
  onOpenEditPassport: (joint: WeldJoint) => void;
  onOpenSubmitLabRequestForJoint: (jointId: string) => void;
  labRequests: NdtLabRequest[];
  welders: WelderProfile[];
  duplicateJointIds: Set<string>;
  canCreateLabRequest: boolean;
  onChangeJointStatus?: (
    joint: WeldJoint,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;
}

export interface RegistryFooterProps {
  filteredCount: number;
  totalCount: number;
  activeTemplateName?: string;
  selectedCount: number;
}

export interface RegistryLabRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateJointIds: string[];
  joints: WeldJoint[];
  lines: ProjectLineItem[];
  welders: WelderProfile[];
  labRequests: NdtLabRequest[];
  currentUserFullName: string;
  onCreateLabRequest: (req: NdtLabRequest) => Promise<boolean> | boolean | void;
  onSuccess: (message: string) => void;
}
