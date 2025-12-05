export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  autoUpdate: boolean;
  logLevel: LogLevel;
  manifestUrl?: string;
}

export interface AppStatus {
  version: string;
  platform: NodeJS.Platform;
  lastUpdateCheck?: string;
  updateState: UpdateState;
  logs: LogEntry[];
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'verifying'
  | 'ready'
  | 'failed';

export interface UpdateState {
  phase: UpdatePhase;
  detail?: string;
  version?: string;
}

export interface ManifestFileEntry {
  url: string;
  sha512: string;
}

export interface SignedManifest {
  version: string;
  files: ManifestFileEntry[];
  signature: string; // base64
}

export interface RendererApi {
  getStatus(): Promise<AppStatus>;
  checkForUpdates(): Promise<void>;
  restartToUpdate(): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
  getConfig(): Promise<AppConfig>;
  setConfig(config: Partial<AppConfig>): Promise<AppConfig>;
}
