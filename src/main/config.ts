import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { AppConfig, LogLevel } from '../shared/types';
import { log } from './logging';

const DEFAULT_CONFIG: AppConfig = {
  autoUpdate: true,
  logLevel: 'info',
};

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

export function getConfigPath() {
  return CONFIG_FILE;
}

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

  return {
    autoUpdate: typeof raw?.autoUpdate === 'boolean' ? raw.autoUpdate : DEFAULT_CONFIG.autoUpdate,
    logLevel,
    manifestUrl: typeof raw?.manifestUrl === 'string' ? raw.manifestUrl : undefined,
  };
}
