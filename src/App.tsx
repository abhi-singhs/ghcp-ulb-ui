import { Link } from '@primer/react';
import { CopilotIcon, AlertIcon } from '@primer/octicons-react';
import { useConnection } from './context/connection';
import { ConnectionConfigRow, ConnectionControls } from './components/ConnectionBar';
import { UniversalBudgetCard } from './components/UniversalBudgetCard';
import { OverridesPanel } from './components/OverridesPanel';

function App() {
  const { settings, isConfigured } = useConnection();

  return (
    <div className="app-shell">
      <div className="app-disclaimer" role="note">
        <AlertIcon size={14} />
        <span>
          <strong>Unofficial:</strong> This is an unofficial solution and is not
          affiliated with, endorsed by, or supported by GitHub.
        </span>
      </div>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__title">
            <CopilotIcon size={28} />
            <div>
              <h1>Copilot AI Credits · User-Level Budgets</h1>
              <p>Set the universal budget and manage per-user overrides</p>
            </div>
          </div>
          <ConnectionControls />
        </div>
        <ConnectionConfigRow />
      </header>

      <main className="app-main">
        {settings.mode === 'live' && !isConfigured ? (
          <section className="card">
            <div className="empty-state">
              <CopilotIcon size={32} />
              <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--fgColor-default)' }}>
                Connect to your enterprise
              </p>
              <p>
                Enter your enterprise slug and a personal access token above to
                manage live budgets. The token needs the{' '}
                <code>manage_billing:enterprise</code> scope (or fine-grained{' '}
                “Enterprise billing” permission).
              </p>
              <p className="field-hint">
                Prefer to explore first? Switch to <strong>Demo</strong> mode in
                the top-right.{' '}
                <Link
                  href="https://docs.github.com/en/enterprise-cloud@latest/rest/billing/budgets?apiVersion=2026-03-10"
                  target="_blank"
                  rel="noreferrer"
                >
                  API documentation
                </Link>
              </p>
            </div>
          </section>
        ) : (
          <>
            <UniversalBudgetCard />
            <OverridesPanel />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
