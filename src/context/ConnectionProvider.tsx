import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GitHubBudgetClient } from '../api/githubClient';
import { getMockClient } from '../api/mockClient';
import type { BudgetClient } from '../api/client';
import {
  ConnectionContext,
  type ConnectionSettings,
} from './connection';

const SETTINGS_KEY = 'ghcp-ulb-settings';
const TOKEN_KEY = 'ghcp-ulb-token';

const DEFAULTS: ConnectionSettings = {
  mode: 'live',
  enterprise: '',
  token: '',
  rememberToken: false,
};

function loadInitial(): ConnectionSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<ConnectionSettings>) : {};
    const token = stored.rememberToken
      ? localStorage.getItem(TOKEN_KEY) ?? ''
      : '';
    return { ...DEFAULTS, ...stored, token };
  } catch {
    return { ...DEFAULTS };
  }
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ConnectionSettings>(loadInitial);

  useEffect(() => {
    const { mode, enterprise, rememberToken } = settings;
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ mode, enterprise, rememberToken }),
      );
      if (rememberToken && settings.token) {
        localStorage.setItem(TOKEN_KEY, settings.token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, [settings]);

  const update = (patch: Partial<ConnectionSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const client = useMemo<BudgetClient | null>(() => {
    if (settings.mode === 'demo') return getMockClient();
    if (settings.enterprise.trim() && settings.token.trim()) {
      return new GitHubBudgetClient(settings.enterprise, settings.token);
    }
    return null;
  }, [settings.mode, settings.enterprise, settings.token]);

  const isConfigured =
    settings.mode === 'demo' ||
    (settings.enterprise.trim().length > 0 && settings.token.trim().length > 0);

  const value = {
    settings,
    update,
    client,
    isConfigured,
    clientKey: client?.id ?? 'unconfigured',
  };

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}
