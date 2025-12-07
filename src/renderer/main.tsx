import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { AppStatus, UpdateState } from '../shared/types';
import './types.d.ts';

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
      <div className="subtitle">Secure auto-update shell</div>
    </header>
  );
}

function Footer({ version, lastUpdateCheck }: { version?: string; lastUpdateCheck?: string }) {
  return (
    <footer className="app-footer">
      <span>{version ? `v${version}` : 'Loading version...'}</span>
      <span className="mono">RSA manifest verification enabled</span>
      <span className="mono">Last check: {lastUpdateCheck ? new Date(lastUpdateCheck).toLocaleString() : 'Not yet checked'}</span>
    </footer>
  );
}

function Sidebar({ updateState, onCheck, onRestart, onDownload }: { updateState: UpdateState; onCheck: () => void; onRestart: () => void; onDownload: () => void }) {
  const buttonLabel = useMemo(() => {
    switch (updateState.phase) {
      case 'checking':
        return 'Checking...';
      case 'available':
        return 'Download update';
      case 'downloading':
        return 'Downloading...';
      case 'downloaded':
      case 'verifying':
        return 'Verifying...';
      case 'ready':
        return 'Restart to apply';
      case 'failed':
        return 'Retry';
      default:
        return 'Check for updates';
    }
  }, [updateState.phase]);

  const detail = updateState.detail || updateState.version;

  // BUG FIX: Differentiate 'available' phase to call onDownload
  // Root cause: Was calling onCheck() for all non-ready phases including 'available'
  // Bug report: bug-reports/download-update-button-not-working-report.md
  // Fixed: 2025-12-07
  const handlePrimary = () => {
    if (updateState.phase === 'ready') {
      onRestart();
    } else if (updateState.phase === 'available') {
      onDownload();
    } else {
      onCheck();
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <h3>Status</h3>
        <p className="update-phase">Update: {updateState.phase}</p>
        {detail && <p className="muted">{detail}</p>}
      </div>
      <div className="sidebar-section">
        <button className="primary" onClick={handlePrimary} disabled={updateState.phase === 'checking' || updateState.phase === 'downloading' || updateState.phase === 'verifying'}>
          {buttonLabel}
        </button>
        {updateState.phase === 'ready' && (
          <button className="secondary" onClick={onRestart}>
            Restart now
          </button>
        )}
      </div>
      <div className="sidebar-footer">
        <div className="small">Updates served via GitHub Releases</div>
        <div className="small">Manifest signature required</div>
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
        <Sidebar updateState={updateState} onCheck={refresh} onRestart={restart} onDownload={download} />
        <main className="content"></main>
      </div>
      <Footer version={status?.version} lastUpdateCheck={status?.lastUpdateCheck} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
