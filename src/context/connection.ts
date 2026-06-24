import { createContext, useContext } from 'react';
import type { BudgetClient } from '../api/client';

export type AppMode = 'demo' | 'live';

export interface ConnectionSettings {
  mode: AppMode;
  enterprise: string;
  token: string;
  rememberToken: boolean;
}

export interface ConnectionContextValue {
  settings: ConnectionSettings;
  update: (patch: Partial<ConnectionSettings>) => void;
  /** Active client, or null when Live mode is not yet configured. */
  client: BudgetClient | null;
  /** True when the current mode has everything it needs to make requests. */
  isConfigured: boolean;
  /** Stable cache key for the active client. */
  clientKey: string;
}

export const ConnectionContext = createContext<ConnectionContextValue | null>(
  null,
);

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return ctx;
}
