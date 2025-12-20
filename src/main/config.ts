import { AppConfig } from '../shared/types';
import { loadConfigYaml, saveConfigYaml, normalizeConfig } from './config-yaml-migration';

const DEFAULT_CONFIG: AppConfig = {
  autoUpdate: true,
  logLevel: 'info',
  autoCheckInterval: '1h', // Auto-update footer: default to hourly checks
  messagePollingInterval: '10s', // Message polling: default to 10 seconds
};

export function loadConfig(): AppConfig {
  return loadConfigYaml(DEFAULT_CONFIG);
}

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const merged = normalizeConfig({ ...DEFAULT_CONFIG, ...config });
  saveConfigYaml(config, merged);
  return merged;
}
