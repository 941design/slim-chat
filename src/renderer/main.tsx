import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { AppStatus, UpdateState } from '../shared/types';
import './types.d.ts';
import { getStatusText, isRefreshEnabled } from './utils';

const initialUpdateState: UpdateState = { phase: 'idle' };

function useStatus() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>(initialUpdateState);

  useEffect(() => {
    async function load() {
      const next = await window.api.getStatus();
      setStatus(next);
      setUpdateState(next.updateState);
    }
    load();
    const unsubscribe = window.api.onUpdateState(async (state) => {
      setUpdateState(state);

      // BUG FIX: Re-fetch full status when update check completes
      // Root cause: onUpdateState only updated updateState, not full status including lastUpdateCheck
      // Bug report: bug-reports/footer-timestamp-not-updating-report.md
      // Fixed: 2025-12-07
      // This ensures lastUpdateCheck timestamp is displayed immediately when checks complete
      // Note: Only refresh for 'idle' and 'failed' states (check completion)
      // 'ready' state doesn't need timestamp update (comes from 'downloaded' -> 'verifying' -> 'ready')
      if (state.phase === 'idle' || state.phase === 'failed') {
        const refreshed = await window.api.getStatus();
        setStatus(refreshed);
      }
    });
    return unsubscribe;
  }, []);

  // CODE QUALITY: Add error handling for async IPC calls
  // Prevents unhandled promise rejections from IPC failures
  const refresh = async () => {
    try {
      await window.api.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const restart = async () => {
    try {
      await window.api.restartToUpdate();
    } catch (error) {
      console.error('Failed to restart:', error);
    }
  };

  // BUG FIX: Add download function for 'available' phase
  // Root cause: handlePrimary() was calling onCheck() for all non-ready phases
  // Bug report: bug-reports/download-update-button-not-working-report.md
  // Fixed: 2025-12-07
  const download = async () => {
    try {
      await window.api.updates.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
    }
  };

  return { status, updateState, refresh, restart, download };
}

function Header() {
  return (
    <header className="app-header">
      <div className="brand">SlimChat Bootstrap</div>
    </header>
  );
}

/**
 * AUTO-UPDATE FOOTER FEATURE: Enhanced Footer Component (FR1, FR3, FR4, FR5, FR6, FR8)
 *
 * Displays current version, update status, progress, and provides update controls.
 * Implements all footer requirements from specification.
 */

interface FooterProps {
  version?: string;
  updateState: UpdateState;
  onRefresh: () => void;
  onDownload: () => void;
  onRestart: () => void;
}

function Footer({ version, updateState, onRefresh, onDownload, onRestart }: FooterProps) {
  const statusText = useMemo(() => getStatusText(updateState), [updateState]);
  const refreshEnabled = useMemo(() => isRefreshEnabled(updateState.phase), [updateState.phase]);

  const showDownloadButton = updateState.phase === 'available';
  const showRestartButton = updateState.phase === 'ready';

  return (
    <footer className="app-footer">
      <div className="footer-left">
        <span className="footer-version">{version ? `v${version}` : 'Loading version...'}</span>
        <span className="footer-separator">•</span>
        <span className="footer-status">{statusText}</span>
      </div>
      <div className="footer-right">
        {showDownloadButton && (
          <button className="footer-button" onClick={onDownload}>
            Download Update
          </button>
        )}
        {showRestartButton && (
          <button className="footer-button" onClick={onRestart}>
            Restart to Update
          </button>
        )}
        <button
          className="footer-icon-button"
          onClick={onRefresh}
          disabled={!refreshEnabled}
          title="Check for updates"
        >
          ↻
        </button>
      </div>
    </footer>
  );
}

function Sidebar() {
  // Auto-update footer feature: Update controls moved to footer (FR9)
  // Sidebar kept intact for future features
  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <h3>Placeholder</h3>
        <p className="muted">Future features here</p>
      </div>
    </aside>
  );
}

function App() {
  const { status, updateState, refresh, restart, download } = useStatus();

  return (
    <div className="app-shell">
      <Header />
      <div className="body">
        <Sidebar />
        <main className="content"></main>
      </div>
      <Footer
        version={status?.version}
        updateState={updateState}
        onRefresh={refresh}
        onDownload={download}
        onRestart={restart}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
