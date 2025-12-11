export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AutoCheckInterval = '1h' | '2h' | '4h' | '12h' | '24h' | 'never';

export interface AppConfig {
  autoUpdate: boolean;
  logLevel: LogLevel;
  // manifestUrl removed - manifest URL now always derived from GitHub repo in production
  // or from devUpdateSource in dev mode
  autoUpdateBehavior?: 'manual' | 'auto-download'; // GAP-005
  autoCheckInterval?: AutoCheckInterval; // Auto-update footer feature: configurable check interval
  logRetentionDays?: number; // GAP-011
  logMaxFileSizeMB?: number; // GAP-011
  forceDevUpdateConfig?: boolean; // Dev mode: force update checks in unpacked app
  devUpdateSource?: string; // Dev mode: custom update source (GitHub URL or local file://)
  allowPrerelease?: boolean; // Dev mode: allow pre-release versions
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
  | 'mounting'  // macOS: DMG being downloaded/mounted
  | 'mounted'   // macOS: Finder open, waiting for user drag-and-drop
  | 'failed';

export interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateState {
  phase: UpdatePhase;
  detail?: string;
  version?: string;
  progress?: DownloadProgress; // GAP-009
}

// GAP-001, GAP-008: Updated manifest structure with SHA-256 and artifacts
export interface ManifestArtifact {
  url: string;
  sha256: string; // Changed from sha512
  platform: 'darwin' | 'linux' | 'win32';
  type: 'dmg' | 'zip' | 'AppImage' | 'exe';
}

export interface SignedManifest {
  version: string;
  artifacts: ManifestArtifact[]; // Changed from files: ManifestFileEntry[]
  createdAt: string; // ISO 8601 timestamp
  signature: string; // base64
}

// GAP-007: Nested API structure
export interface UpdatesApi {
  checkNow(): Promise<void>;
  downloadUpdate(): Promise<void>; // GAP-005
  restartToUpdate(): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
}

export interface ConfigApi {
  get(): Promise<AppConfig>;
  set(config: Partial<AppConfig>): Promise<AppConfig>;
}

export interface SystemApi {
  getStatus(): Promise<AppStatus>;
}

// Persistence Layer: Application state types
export type ThemePreference = 'light' | 'dark' | 'system';

export interface AppStateValue {
  theme?: ThemePreference;
  // Additional state fields can be added here
  [key: string]: string | number | boolean | undefined;
}

export interface StateApi {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
}

export interface RendererApi {
  updates: UpdatesApi;
  config: ConfigApi;
  system: SystemApi;
  state: StateApi; // Added persistence layer API
  nostling?: NostlingApi;
}

// Legacy flat API for backward compatibility (optional)
export interface LegacyRendererApi {
  getStatus(): Promise<AppStatus>;
  checkForUpdates(): Promise<void>;
  restartToUpdate(): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
  getConfig(): Promise<AppConfig>;
  setConfig(config: Partial<AppConfig>): Promise<AppConfig>;
}

// Nostling MVP domain types
export type NostlingContactState = 'pending' | 'connected';
export type NostlingMessageStatus = 'queued' | 'sending' | 'sent' | 'error';
export type NostlingMessageDirection = 'incoming' | 'outgoing';

export interface NostlingIdentity {
  id: string; // internal UUID
  npub: string;
  secretRef: string;
  label: string;
  relays?: string[];
  createdAt: string;
}

export interface NostlingContact {
  id: string; // internal UUID
  identityId: string;
  npub: string;
  alias: string;
  state: NostlingContactState;
  createdAt: string;
  lastMessageAt?: string;
}

export interface NostlingMessage {
  id: string; // internal UUID
  identityId: string;
  contactId: string;
  senderNpub: string;
  recipientNpub: string;
  ciphertext: string;
  eventId?: string;
  timestamp: string;
  status: NostlingMessageStatus;
  direction: NostlingMessageDirection;
}

export interface NostlingRelayEndpoint {
  url: string;
  read: boolean;
  write: boolean;
  createdAt: string;
}

export interface NostlingRelayConfig {
  defaults: NostlingRelayEndpoint[];
  perIdentity?: Record<string, NostlingRelayEndpoint[]>;
}

export interface CreateIdentityRequest {
  label: string;
  nsec?: string; // when importing from secret
  npub?: string; // when creating from external store reference
  secretRef?: string; // optional hint for existing secret storage
  relays?: string[];
}

export interface AddContactRequest {
  identityId: string;
  npub: string;
  alias?: string;
}

export interface SendNostrMessageRequest {
  identityId: string;
  contactId: string;
  plaintext: string;
}

export interface NostlingApi {
  identities: {
    list(): Promise<NostlingIdentity[]>;
    create(request: CreateIdentityRequest): Promise<NostlingIdentity>;
    remove(id: string): Promise<void>;
  };
  contacts: {
    list(identityId: string): Promise<NostlingContact[]>;
    add(request: AddContactRequest): Promise<NostlingContact>;
    remove(contactId: string): Promise<void>;
    markConnected(contactId: string): Promise<NostlingContact>;
  };
  messages: {
    list(identityId: string, contactId: string): Promise<NostlingMessage[]>;
    send(request: SendNostrMessageRequest): Promise<NostlingMessage>;
    discardUnknown(eventId: string): Promise<void>;
  };
  relays: {
    get(): Promise<NostlingRelayConfig>;
    set(config: NostlingRelayConfig): Promise<NostlingRelayConfig>;
  };
}
