import { app, BrowserWindow } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { AppConfig, AppStatus, UpdateState, DownloadProgress } from '../shared/types';
import { getRecentLogs, log, setLogLevel } from './logging';
import { loadConfig, saveConfig } from './config';
import { verifyDownloadedUpdate, constructManifestUrl, sanitizeError } from './integration';
import { registerHandlers, broadcastUpdateState } from './ipc/handlers';
import { downloadUpdate, setupUpdater } from './update/controller';
import { getDevUpdateConfig, isDevMode } from './dev-env';

let mainWindow: BrowserWindow | null = null;
let config: AppConfig = loadConfig();
setLogLevel(config.logLevel);

let updateState: UpdateState = { phase: 'idle' };
let lastUpdateCheck: string | undefined;

// Public key for manifest verification (injected at build time from keys/slimchat-release.pub)
const PUBLIC_KEY = process.env.RSA_PUBLIC_KEY || process.env.EMBEDDED_RSA_PUBLIC_KEY || '';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    mainWindow.loadURL(devServer);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function broadcastUpdateStateToMain() {
  if (mainWindow) {
    broadcastUpdateState(updateState, [mainWindow]);
  }
}

// CODE QUALITY: Extract duplicate timestamp recording logic
// Used when update check starts (both auto and manual triggers)
// Records timestamp that's displayed in footer via getStatus() IPC
// Bug report: bug-reports/footer-timestamp-not-updating-report.md
function recordUpdateCheckTimestamp() {
  lastUpdateCheck = new Date().toISOString();
}

function setupAutoUpdater() {
  // Configure autoUpdater based on user preference (GAP-005)
  // Default to 'manual' for safe, privacy-respecting behavior
  const autoDownloadEnabled = config.autoUpdateBehavior === 'auto-download';

  // Get dev mode configuration from environment variables
  const devConfig = getDevUpdateConfig();

  setupUpdater(autoDownloadEnabled, config, devConfig);

  autoUpdater.on('checking-for-update', () => {
    updateState = { phase: 'checking' };
    broadcastUpdateStateToMain();
    recordUpdateCheckTimestamp();
  });

  autoUpdater.on('update-available', (info) => {
    updateState = { phase: 'available', version: info.version };
    log('info', `Update available: ${info.version}`);
    broadcastUpdateStateToMain();
  });

  autoUpdater.on('download-progress', (progressInfo: any) => {
    const progress: DownloadProgress = {
      percent: progressInfo.percent,
      bytesPerSecond: progressInfo.bytesPerSecond,
      transferred: progressInfo.transferred,
      total: progressInfo.total,
    };
    updateState = {
      phase: 'downloading',
      version: updateState.version,
      progress,
    };
    broadcastUpdateStateToMain();
  });

  autoUpdater.on('update-not-available', () => {
    updateState = { phase: 'idle' };
    broadcastUpdateStateToMain();
  });

  autoUpdater.on('error', (error) => {
    const sanitized = sanitizeError(error, isDevMode());
    updateState = { phase: 'failed', detail: sanitized.message };
    log('error', `Updater error: ${sanitized.message}`);
    broadcastUpdateStateToMain();
  });

  autoUpdater.on('update-downloaded', async (info) => {
    updateState = { phase: 'downloaded', version: info.version };
    broadcastUpdateStateToMain();
    try {
      updateState = { phase: 'verifying', version: info.version };
      broadcastUpdateStateToMain();

      // Construct manifest URL from publish config or dev mode override
      // SECURITY: Use getDevUpdateConfig() to enforce production safety (C1)
      // Direct env var reads bypass production mode checks - see constraint C1
      const { GITHUB_OWNER, GITHUB_REPO } = await import('./update/controller');
      const publishConfig = { owner: GITHUB_OWNER, repo: GITHUB_REPO };
      const devConfig = getDevUpdateConfig();
      const devUpdateSource = devConfig.devUpdateSource; // Only set in dev mode
      const manifestUrl = constructManifestUrl(publishConfig, devUpdateSource);

      await verifyDownloadedUpdate(
        info,
        app.getVersion(),
        process.platform as 'darwin' | 'linux' | 'win32',
        PUBLIC_KEY,
        manifestUrl,
        Boolean(devUpdateSource)
      );

      updateState = { phase: 'ready', version: info.version };
      broadcastUpdateStateToMain();
    } catch (error) {
      const sanitized = sanitizeError(error, isDevMode());
      log('error', `Manifest verification failed: ${sanitized.message}`);
      updateState = { phase: 'failed', detail: sanitized.message };
      broadcastUpdateStateToMain();
    }
  });
}

// Helper functions for IPC handlers
async function getStatus(): Promise<AppStatus> {
  return {
    version: app.getVersion(),
    platform: process.platform,
    lastUpdateCheck,
    updateState,
    logs: getRecentLogs(),
  };
}

let checkInProgress = false;

async function checkForUpdates(): Promise<void> {
  if (!config.autoUpdate) {
    log('warn', 'Auto-update disabled in config');
    return;
  }

  if (checkInProgress) {
    log('warn', 'Update check already in progress, skipping concurrent request');
    return;
  }

  checkInProgress = true;
  try {
    updateState = { phase: 'checking' };
    broadcastUpdateStateToMain();
    recordUpdateCheckTimestamp();
    await autoUpdater.checkForUpdates();
  } finally {
    checkInProgress = false;
  }

  restartAutoCheckTimer();
}

async function restartToUpdate(): Promise<void> {
  if (updateState.phase === 'ready') {
    // BUG FIX: Log quitAndInstall() invocation for production debugging
    // Root cause: Missing visibility into update installation flow
    // Bug report: bug-reports/macos-gatekeeper-warning-unsigned-app.md
    // Fixed: 2025-12-08
    log('info', `Initiating app restart to install update: ${app.getVersion()} -> ${updateState.version}`);
    autoUpdater.quitAndInstall();
  }
}

async function getConfig(): Promise<AppConfig> {
  return config;
}

async function setConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  config = saveConfig({ ...config, ...partial });
  setLogLevel(config.logLevel);
  // Auto-update footer: restart timer if autoCheckInterval changed
  if (partial.autoCheckInterval !== undefined) {
    restartAutoCheckTimer();
  }
  return config;
}

/**
 * AUTO-UPDATE FOOTER FEATURE: Automatic Update Check Timer (FR2, FR7)
 *
 * Implements automatic update check timer with configurable intervals.
 * Timer respects autoUpdate config and restarts on manual checks.
 */
// Module-level timer variable
let autoCheckTimer: NodeJS.Timeout | null = null;

// Helper function to convert interval string to milliseconds
function intervalToMilliseconds(interval: string): number {
  const intervalMap: Record<string, number> = {
    '1h': 3600000,    // 1 hour
    '2h': 7200000,    // 2 hours
    '4h': 14400000,   // 4 hours
    '12h': 43200000,  // 12 hours
    '24h': 86400000,  // 24 hours
  };
  return intervalMap[interval] || 3600000; // Default to 1h if unknown
}

// Start automatic update check timer based on config
function startAutoCheckTimer(): void {
  // Disable timer if autoUpdate is false or interval is 'never'
  if (!config.autoUpdate || config.autoCheckInterval === 'never') {
    if (autoCheckTimer !== null) {
      clearTimeout(autoCheckTimer);
      autoCheckTimer = null;
    }
    return;
  }

  // Clear any existing timer
  if (autoCheckTimer !== null) {
    clearTimeout(autoCheckTimer);
    autoCheckTimer = null;
  }

  // Convert interval to milliseconds
  const intervalMs = intervalToMilliseconds(config.autoCheckInterval || '1h');

  // Schedule first check after startup delay (5 seconds)
  autoCheckTimer = setTimeout(() => {
    checkForUpdates();

    // Schedule periodic checks at the configured interval
    autoCheckTimer = setInterval(() => {
      checkForUpdates();
    }, intervalMs);
  }, 5000);
}

// Clear and restart automatic update check timer
function restartAutoCheckTimer(): void {
  if (autoCheckTimer !== null) {
    clearTimeout(autoCheckTimer);
    autoCheckTimer = null;
  }
  startAutoCheckTimer();
}

app.on('ready', () => {
  // Register IPC handlers with domain-based organization
  registerHandlers({
    getStatus,
    checkForUpdates,
    downloadUpdate,
    restartToUpdate,
    getConfig,
    setConfig,
  });
  log('info', `Starting SlimChat ${app.getVersion()}`);
  config = loadConfig();
  setLogLevel(config.logLevel);
  createWindow();
  setupAutoUpdater();
  startAutoCheckTimer();
});

app.on('before-quit', () => {
  if (autoCheckTimer !== null) {
    clearTimeout(autoCheckTimer);
    autoCheckTimer = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
