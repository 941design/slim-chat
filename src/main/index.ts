import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { autoUpdater, UpdateDownloadedEvent } from 'electron-updater';
import crypto from 'crypto';
import fs from 'fs';
import nacl from 'tweetnacl';
import { AppConfig, AppStatus, SignedManifest, UpdateState } from '../shared/types';
import { getRecentLogs, log, setLogLevel } from './logging';
import { loadConfig, saveConfig } from './config';

let mainWindow: BrowserWindow | null = null;
let config: AppConfig = loadConfig();
setLogLevel(config.logLevel);

let updateState: UpdateState = { phase: 'idle' };
let lastUpdateCheck: string | undefined;

const PUBLIC_KEY = process.env.ED25519_PUBLIC_KEY ||
  'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE='; // placeholder base64

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
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

function broadcastUpdateState() {
  if (mainWindow) {
    mainWindow.webContents.send('update-state', updateState);
  }
}

async function verifyManifest(downloadEvent: UpdateDownloadedEvent) {
  const manifestUrl = process.env.MANIFEST_URL || config.manifestUrl;
  if (!manifestUrl) {
    throw new Error('No manifest URL configured');
  }
  log('info', `Fetching manifest from ${manifestUrl}`);
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status}`);
  }
  const manifest = (await response.json()) as SignedManifest;
  const manifestBytes = Buffer.from(
    JSON.stringify({
      version: manifest.version,
      files: manifest.files,
    })
  );
  const signature = Buffer.from(manifest.signature, 'base64');
  const publicKey = Buffer.from(PUBLIC_KEY, 'base64');
  const verified = nacl.sign.detached.verify(manifestBytes, signature, publicKey);
  if (!verified) {
    throw new Error('Manifest signature verification failed');
  }
  const filePath = (downloadEvent as any).downloadedFile || downloadEvent.downloadedFile;
  if (!filePath) {
    throw new Error('Downloaded file path missing');
  }
  const hash = await sha512File(filePath);
  const fileEntry = manifest.files.find((file) => hashMatches(file, hash));
  if (!fileEntry) {
    throw new Error('Downloaded file hash not present in manifest');
  }
  log('info', `Manifest verified for ${fileEntry.url}`);
}

function hashMatches(entry: { sha512: string }, hash: string) {
  return entry.sha512.toLowerCase() === hash.toLowerCase();
}

function sha512File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    updateState = { phase: 'checking' };
    broadcastUpdateState();
    lastUpdateCheck = new Date().toISOString();
  });

  autoUpdater.on('update-available', (info) => {
    updateState = { phase: 'available', version: info.version };
    log('info', `Update available: ${info.version}`);
    broadcastUpdateState();
  });

  autoUpdater.on('download-progress', () => {
    updateState = { phase: 'downloading', version: updateState.version };
    broadcastUpdateState();
  });

  autoUpdater.on('update-not-available', () => {
    updateState = { phase: 'idle' };
    broadcastUpdateState();
  });

  autoUpdater.on('error', (error) => {
    updateState = { phase: 'failed', detail: String(error) };
    log('error', `Updater error: ${String(error)}`);
    broadcastUpdateState();
  });

  autoUpdater.on('update-downloaded', async (info) => {
    updateState = { phase: 'downloaded', version: info.version };
    broadcastUpdateState();
    try {
      updateState = { phase: 'verifying', version: info.version };
      broadcastUpdateState();
      await verifyManifest(info);
      updateState = { phase: 'ready', version: info.version };
      broadcastUpdateState();
    } catch (error) {
      log('error', `Manifest verification failed: ${String(error)}`);
      updateState = { phase: 'failed', detail: String(error) };
      broadcastUpdateState();
    }
  });
}

ipcMain.handle('status:get', async (): Promise<AppStatus> => ({
  version: app.getVersion(),
  platform: process.platform,
  lastUpdateCheck,
  updateState,
  logs: getRecentLogs(),
}));

ipcMain.handle('update:check', async () => {
  if (!config.autoUpdate) {
    log('warn', 'Auto-update disabled in config');
    return;
  }
  updateState = { phase: 'checking' };
  broadcastUpdateState();
  lastUpdateCheck = new Date().toISOString();
  await autoUpdater.checkForUpdates();
});

ipcMain.handle('update:restart', async () => {
  if (updateState.phase === 'ready') {
    autoUpdater.quitAndInstall();
  }
});

ipcMain.handle('config:get', async () => {
  return config;
});

ipcMain.handle('config:set', async (_event, partial: Partial<AppConfig>) => {
  config = saveConfig({ ...config, ...partial });
  setLogLevel(config.logLevel);
  return config;
});

app.on('ready', () => {
  log('info', `Starting SlimChat ${app.getVersion()}`);
  config = loadConfig();
  setLogLevel(config.logLevel);
  createWindow();
  setupAutoUpdater();
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
