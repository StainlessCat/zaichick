import React, { createContext, useContext, useMemo } from 'react';
import { ANONYMOUS_USER, UserAccount } from '../types/welding';
import { getUserRolePermissions, RolePermissions } from '../utils/rbac';
import type { LoginModalMode } from '../components/LoginModal';

export interface AuthContextValue {
  currentUser: UserAccount;
  setCurrentUser: (user: UserAccount) => void;
  userPermissions: RolePermissions;
  userAccounts: UserAccount[];
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  isAuthenticated: boolean;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  loginModalInitialMode: LoginModalMode;
  setLoginModalInitialMode: (mode: LoginModalMode) => void;
  sessionExpiredNotice: string | null;
  clearSessionExpiredNotice: () => void;
  isSessionsModalOpen: boolean;
  setIsSessionsModalOpen: (open: boolean) => void;
  onLogout: () => Promise<void>;
  onLogoutAllDevices: () => Promise<void>;
}

const defaultPermissions = getUserRolePermissions(ANONYMOUS_USER);

export const AuthContext = createContext<AuthContextValue>({
  currentUser: ANONYMOUS_USER,
  setCurrentUser: () => {},
  userPermissions: defaultPermissions,
  userAccounts: [ANONYMOUS_USER],
  setUserAccounts: () => {},
  isAuthenticated: false,
  isLoginModalOpen: false,
  setIsLoginModalOpen: () => {},
  loginModalInitialMode: 'login',
  setLoginModalInitialMode: () => {},
  sessionExpiredNotice: null,
  clearSessionExpiredNotice: () => {},
  isSessionsModalOpen: false,
  setIsSessionsModalOpen: () => {},
  onLogout: async () => {},
  onLogoutAllDevices: async () => {},
});

export interface AuthProviderProps {
  currentUser: UserAccount;
  setCurrentUser: (user: UserAccount) => void;
  userAccounts: UserAccount[];
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  isAuthenticated?: boolean;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  loginModalInitialMode: LoginModalMode;
  setLoginModalInitialMode: (mode: LoginModalMode) => void;
  sessionExpiredNotice?: string | null;
  clearSessionExpiredNotice?: () => void;
  isSessionsModalOpen?: boolean;
  setIsSessionsModalOpen?: (open: boolean) => void;
  onLogout: () => Promise<void>;
  onLogoutAllDevices?: () => Promise<void>;
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  currentUser,
  setCurrentUser,
  userAccounts,
  setUserAccounts,
  isAuthenticated: isAuthenticatedProp,
  isLoginModalOpen,
  setIsLoginModalOpen,
  loginModalInitialMode,
  setLoginModalInitialMode,
  sessionExpiredNotice = null,
  clearSessionExpiredNotice = () => {},
  isSessionsModalOpen = false,
  setIsSessionsModalOpen = () => {},
  onLogout,
  onLogoutAllDevices,
  children,
}) => {
  const userPermissions = useMemo(() => {
    return getUserRolePermissions(currentUser);
  }, [currentUser]);

  const isAuthenticated = useMemo(() => {
    if (typeof isAuthenticatedProp === 'boolean') {
      return isAuthenticatedProp;
    }
    return (
      Boolean(currentUser.login) &&
      currentUser.login !== 'anonymous' &&
      currentUser.login !== ANONYMOUS_USER.login &&
      currentUser.isActive !== false
    );
  }, [isAuthenticatedProp, currentUser.login, currentUser.isActive]);

  const resolvedLogoutAll = onLogoutAllDevices ?? onLogout;

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      setCurrentUser,
      userPermissions,
      userAccounts,
      setUserAccounts,
      isAuthenticated,
      isLoginModalOpen,
      setIsLoginModalOpen,
      loginModalInitialMode,
      setLoginModalInitialMode,
      sessionExpiredNotice,
      clearSessionExpiredNotice,
      isSessionsModalOpen,
      setIsSessionsModalOpen,
      onLogout,
      onLogoutAllDevices: resolvedLogoutAll,
    }),
    [
      currentUser,
      setCurrentUser,
      userPermissions,
      userAccounts,
      setUserAccounts,
      isAuthenticated,
      isLoginModalOpen,
      setIsLoginModalOpen,
      loginModalInitialMode,
      setLoginModalInitialMode,
      sessionExpiredNotice,
      clearSessionExpiredNotice,
      isSessionsModalOpen,
      setIsSessionsModalOpen,
      onLogout,
      resolvedLogoutAll,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
