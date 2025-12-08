import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { AppConfig, LogLevel, AutoCheckInterval } from '../shared/types';
import { log } from './logging';

const DEFAULT_CONFIG: AppConfig = {
  autoUpdate: true,
  logLevel: 'info',
  autoCheckInterval: '1h', // Auto-update footer: default to hourly checks
};

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

export function loadConfig(): AppConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch (error) {
    log('warn', `Failed to load config, using defaults: ${String(error)}`);
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const merged = normalizeConfig({ ...DEFAULT_CONFIG, ...config });
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  log('info', 'Configuration saved');
  return merged;
}

function normalizeConfig(raw: any): AppConfig {
  const logLevel: LogLevel = ['debug', 'info', 'warn', 'error'].includes(raw?.logLevel)
    ? raw.logLevel
    : DEFAULT_CONFIG.logLevel;

  const autoCheckInterval: AutoCheckInterval = ['1h', '2h', '4h', '12h', '24h', 'never'].includes(raw?.autoCheckInterval)
    ? raw.autoCheckInterval
    : DEFAULT_CONFIG.autoCheckInterval!;

  return {
    autoUpdate: typeof raw?.autoUpdate === 'boolean' ? raw.autoUpdate : DEFAULT_CONFIG.autoUpdate,
    logLevel,
    autoCheckInterval,
    // manifestUrl removed - manifest URL now always derived from GitHub repo in production
    // or from devUpdateSource in dev mode. Old configs with this field are ignored gracefully.
    autoUpdateBehavior: ['manual', 'auto-download'].includes(raw?.autoUpdateBehavior)
      ? raw.autoUpdateBehavior
      : undefined,
    logRetentionDays: typeof raw?.logRetentionDays === 'number' ? raw.logRetentionDays : undefined,
    logMaxFileSizeMB: typeof raw?.logMaxFileSizeMB === 'number' ? raw.logMaxFileSizeMB : undefined,
    forceDevUpdateConfig: typeof raw?.forceDevUpdateConfig === 'boolean' ? raw.forceDevUpdateConfig : undefined,
    devUpdateSource: typeof raw?.devUpdateSource === 'string' ? raw.devUpdateSource : undefined,
    allowPrerelease: typeof raw?.allowPrerelease === 'boolean' ? raw.allowPrerelease : undefined,
  };
}
