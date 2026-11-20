import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  DepartmentCode,
  RecordStatus,
  SystemRole,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';
import {
  canUserEditJointField,
  canUserMutateRecord,
  canUserTransitionRecordStatus,
  LockableRecordLike,
  ROLE_RANK,
} from '../utils/rbac';

export interface UsePermissionsResult {
  role: SystemRole;
  department: DepartmentCode;
  isActive: boolean;
  isSuperAdmin: boolean;
  isDeptAdmin: (dept?: DepartmentCode) => boolean;
  canManageUsers: boolean;
  canManageAllUsers: boolean;
  canPurgeProject: boolean;
  canApproveRecords: (dept?: DepartmentCode | DepartmentCode[]) => boolean;
  canUnlockRecords: boolean;
  canCreateInDept: (dept: DepartmentCode) => boolean;
  canEditDirectory: (dept: DepartmentCode) => boolean;
  canEditRecord: (
    record: LockableRecordLike | null | undefined,
    allowedDepartments: DepartmentCode[],
    isDirectory?: boolean
  ) => { allowed: boolean; reason?: string };
  canDeleteRecord: (
    record: LockableRecordLike | null | undefined,
    allowedDepartments: DepartmentCode[],
    isDirectory?: boolean
  ) => { allowed: boolean; reason?: string };
  canTransitionStatus: (
    currentStatus: RecordStatus,
    targetStatus: RecordStatus,
    allowedDepartments: DepartmentCode[]
  ) => { allowed: boolean; requiresReason?: boolean; reason?: string };
  canEditJointField: (
    fieldKey: keyof WeldJoint | WeldJointFieldKey,
    record?: LockableRecordLike | null
  ) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { currentUser, userPermissions } = useAuth();

  return useMemo<UsePermissionsResult>(() => {
    const role = userPermissions.systemRole;
    const department = userPermissions.department;
    const isActive = userPermissions.isActive;
    const isSuperAdmin = userPermissions.isSuperAdmin;

    const isDeptAdmin = (dept?: DepartmentCode): boolean => {
      if (!isActive) return false;
      if (isSuperAdmin) return true;
      if (role !== 'DEPT_ADMIN') return false;
      return dept ? department === dept : true;
    };

    const canApproveRecords = (dept?: DepartmentCode | DepartmentCode[]): boolean => {
      if (!isActive) return false;
      if (isSuperAdmin) return true;
      if (ROLE_RANK[role] < ROLE_RANK.DEPT_ADMIN) return false;
      if (!dept) return true;
      const list = Array.isArray(dept) ? dept : [dept];
      return list.includes(department);
    };

    const canCreateInDept = (dept: DepartmentCode): boolean => {
      if (!isActive || role === 'VIEWER') return false;
      if (isSuperAdmin) return true;
      return department === dept;
    };

    const canEditDirectory = (dept: DepartmentCode): boolean => {
      if (!isActive) return false;
      if (isSuperAdmin) return true;
      return role === 'DEPT_ADMIN' && department === dept;
    };

    return {
      role,
      department,
      isActive,
      isSuperAdmin,
      isDeptAdmin,
      canManageUsers: userPermissions.canManageUsers,
      canManageAllUsers: userPermissions.canManageAllUsers,
      canPurgeProject: userPermissions.canPurgeProject,
      canApproveRecords,
      canUnlockRecords: userPermissions.canUnlockRecords,
      canCreateInDept,
      canEditDirectory,
      canEditRecord: (record, allowedDepartments, isDirectory = false) =>
        canUserMutateRecord(currentUser, record, allowedDepartments, 'edit', isDirectory),
      canDeleteRecord: (record, allowedDepartments, isDirectory = false) =>
        canUserMutateRecord(currentUser, record, allowedDepartments, 'delete', isDirectory),
      canTransitionStatus: (currentStatus, targetStatus, allowedDepartments) =>
        canUserTransitionRecordStatus(
          currentUser,
          currentStatus,
          targetStatus,
          allowedDepartments
        ),
      canEditJointField: (fieldKey, record) =>
        canUserEditJointField(currentUser, fieldKey, record),
    };
  }, [currentUser, userPermissions]);
}
