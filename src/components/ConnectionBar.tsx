import { useState } from 'react';
import {
  Button,
  Checkbox,
  FormControl,
  Label,
  SegmentedControl,
  TextInput,
} from '@primer/react';
import {
  CheckCircleIcon,
  PlugIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { useConnection } from '../context/connection';
import { useToast } from '../context/toast';
import { getMockClient } from '../api/mockClient';
import { BudgetClientError } from '../api/client';
import { ThemeToggle } from './ThemeToggle';

export function ConnectionControls() {
  const { settings, update } = useConnection();
  return (
    <div className="row">
      <SegmentedControl
        aria-label="Data mode"
        onChange={(i) => update({ mode: i === 0 ? 'live' : 'demo' })}
      >
        <SegmentedControl.Button selected={settings.mode === 'live'}>
          Live
        </SegmentedControl.Button>
        <SegmentedControl.Button selected={settings.mode === 'demo'}>
          Demo
        </SegmentedControl.Button>
      </SegmentedControl>
      <ThemeToggle />
    </div>
  );
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

export function ConnectionConfigRow() {
  const { settings, update, client, isConfigured } = useConnection();
  const { addToast } = useToast();
  const [status, setStatus] = useState<TestStatus>('idle');

  if (settings.mode === 'demo') {
    return (
      <div className="app-subbar">
        <div className="app-subbar__inner">
          <Label variant="accent">Demo</Label>
          <span className="muted">
            Sample data lives in your browser (localStorage). No requests leave
            your machine.
          </span>
          <span className="table-toolbar__spacer" />
          <Button
            variant="default"
            onClick={() => {
              getMockClient().reset();
              window.location.reload();
            }}
          >
            Reset demo data
          </Button>
        </div>
      </div>
    );
  }

  const runTest = async () => {
    if (!client) return;
    setStatus('testing');
    try {
      await client.testConnection();
      setStatus('ok');
      addToast({ variant: 'success', message: 'Connected to GitHub successfully.' });
    } catch (err) {
      setStatus('error');
      const message =
        err instanceof BudgetClientError
          ? `${err.message}${err.status ? ` (HTTP ${err.status})` : ''}`
          : (err as Error).message;
      addToast({ variant: 'danger', title: 'Connection failed', message });
    }
  };

  return (
    <div className="app-subbar">
      <div className="app-subbar__inner connection-bar__live">
        <FormControl>
          <FormControl.Label>Enterprise slug</FormControl.Label>
          <TextInput
            value={settings.enterprise}
            placeholder="my-enterprise"
            autoComplete="off"
            onChange={(e) => {
              update({ enterprise: e.target.value });
              setStatus('idle');
            }}
          />
        </FormControl>
        <FormControl>
          <FormControl.Label>Personal access token</FormControl.Label>
          <TextInput
            type="password"
            className="token-input"
            value={settings.token}
            placeholder="github_pat_… (manage_billing:enterprise)"
            autoComplete="off"
            onChange={(e) => {
              update({ token: e.target.value });
              setStatus('idle');
            }}
          />
        </FormControl>
        <FormControl>
          <Checkbox
            checked={settings.rememberToken}
            onChange={(e) => update({ rememberToken: e.target.checked })}
          />
          <FormControl.Label>Remember token</FormControl.Label>
        </FormControl>
        <Button
          leadingVisual={PlugIcon}
          onClick={runTest}
          disabled={!isConfigured || status === 'testing'}
          loading={status === 'testing'}
        >
          Test connection
        </Button>
        {status === 'ok' && (
          <span
            className="row"
            style={{ color: 'var(--fgColor-success)' }}
            title="Connected"
          >
            <CheckCircleIcon /> Connected
          </span>
        )}
        {status === 'error' && (
          <span className="row" style={{ color: 'var(--fgColor-danger)' }}>
            <XCircleIcon /> Failed
          </span>
        )}
      </div>
    </div>
  );
}
