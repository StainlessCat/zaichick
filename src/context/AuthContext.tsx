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
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  loginModalInitialMode: LoginModalMode;
  setLoginModalInitialMode: (mode: LoginModalMode) => void;
  onLogout: () => Promise<void>;
  onSwitchUser?: (login: string) => Promise<void>;
}

const defaultPermissions = getUserRolePermissions(ANONYMOUS_USER);

export const AuthContext = createContext<AuthContextValue>({
  currentUser: ANONYMOUS_USER,
  setCurrentUser: () => {},
  userPermissions: defaultPermissions,
  userAccounts: [ANONYMOUS_USER],
  setUserAccounts: () => {},
  isLoginModalOpen: false,
  setIsLoginModalOpen: () => {},
  loginModalInitialMode: 'login',
  setLoginModalInitialMode: () => {},
  onLogout: async () => {},
  onSwitchUser: async () => {},
});

export interface AuthProviderProps {
  currentUser: UserAccount;
  setCurrentUser: (user: UserAccount) => void;
  userAccounts: UserAccount[];
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  loginModalInitialMode: LoginModalMode;
  setLoginModalInitialMode: (mode: LoginModalMode) => void;
  onLogout: () => Promise<void>;
  onSwitchUser?: (login: string) => Promise<void>;
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  currentUser,
  setCurrentUser,
  userAccounts,
  setUserAccounts,
  isLoginModalOpen,
  setIsLoginModalOpen,
  loginModalInitialMode,
  setLoginModalInitialMode,
  onLogout,
  onSwitchUser,
  children,
}) => {
  const userPermissions = useMemo(() => {
    return getUserRolePermissions(currentUser);
  }, [currentUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      setCurrentUser,
      userPermissions,
      userAccounts,
      setUserAccounts,
      isLoginModalOpen,
      setIsLoginModalOpen,
      loginModalInitialMode,
      setLoginModalInitialMode,
      onLogout,
      onSwitchUser,
    }),
    [
      currentUser,
      setCurrentUser,
      userPermissions,
      userAccounts,
      setUserAccounts,
      isLoginModalOpen,
      setIsLoginModalOpen,
      loginModalInitialMode,
      setLoginModalInitialMode,
      onLogout,
      onSwitchUser,
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
