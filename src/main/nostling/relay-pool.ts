/**
 * Nostr Relay Pool Manager
 *
 * Manages WebSocket connections to multiple Nostr relays, handles publishing
 * events, subscribing to filters, and tracks connection status.
 *
 * Reliability: Automatic reconnection with exponential backoff (max 30s).
 * Graceful degradation: Partial relay failures don't block the application.
 */

import { SimplePool } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';
import { NostrEvent } from './crypto';
import { log } from '../logging';

// BUG FIX: Set WebSocket implementation for Node.js/Electron environment
// Root cause: nostr-tools needs explicit WebSocket for non-browser contexts
// Bug report: bug-fix-contract-websocket.md
// Fixed: 2025-12-12
useWebSocketImplementation(WebSocket);

type SubCloser = {
  close: (reason?: string) => void;
};

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Relay connection status
 */
export type RelayStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Result of publishing an event to a single relay
 */
export interface PublishResult {
  relay: string;      // Relay URL
  success: boolean;   // Whether publish succeeded
  message?: string;   // Error message if failed, OK message if succeeded
}

/**
 * Filter for subscribing to Nostr events (NIP-01)
 */
export interface Filter {
  ids?: string[];          // Event IDs
  authors?: string[];      // Public keys (hex)
  kinds?: number[];        // Event kinds
  '#e'?: string[];         // Referenced event IDs (e tag)
  '#p'?: string[];         // Referenced public keys (p tag)
  since?: number;          // Unix timestamp (inclusive)
  until?: number;          // Unix timestamp (inclusive)
  limit?: number;          // Maximum number of events
  [key: `#${string}`]: string[] | undefined;  // Generic tag filters
}

/**
 * Subscription handle for managing event subscriptions
 */
export interface Subscription {
  /**
   * Closes the subscription on all relays
   */
  close(): void;
}

/**
 * Configuration for a single relay endpoint
 */
export interface RelayEndpoint {
  url: string;
  read?: boolean;   // Allow receiving events from this relay (default: true)
  write?: boolean;  // Allow publishing events to this relay (default: true)
}

// ============================================================================
// CONTRACT: RelayPool class
// ============================================================================

/**
 * Manages connections to multiple Nostr relays
 *
 * CONTRACT:
 *   State:
 *     - connections: Map of relay URL to WebSocket connection
 *     - status: Map of relay URL to current status
 *     - subscriptions: Map of subscription ID to relay subscriptions
 *     - reconnectTimers: Map of relay URL to reconnect timer
 *
 *   Invariants:
 *     - Each relay URL has at most one active connection
 *     - Status map is synchronized with actual connection states
 *     - Subscriptions are active only on connected read relays
 *     - Reconnection attempts use exponential backoff: 1s, 2s, 4s, ..., max 30s
 *     - All operations are non-blocking (callbacks for async results)
 */
export class RelayPool {
  private pool: SimplePool;
  private endpoints: Map<string, RelayEndpoint>;
  private statusMap: Map<string, RelayStatus>;
  private statusCallbacks: Array<(url: string, status: RelayStatus) => void>;
  private activeSubscriptions: Map<string, { sub: SubCloser; seenEvents: Set<string> }>;
  private statusCheckInterval: NodeJS.Timeout | null;

  constructor() {
    // Pass WebSocket implementation directly to SimplePool for Node.js/Electron environment
    // The websocketImplementation option is supported at runtime but not in TypeScript types
    // enablePing: keeps connections alive by sending periodic pings (prevents idle disconnections)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.pool = new SimplePool({
      enableReconnect: true,
      enablePing: true,
      websocketImplementation: WebSocket
    } as any);
    this.endpoints = new Map();
    this.statusMap = new Map();
    this.statusCallbacks = [];
    this.activeSubscriptions = new Map();
    this.statusCheckInterval = null;
  }

  /**
   * Normalizes relay endpoint to ensure read/write flags are set with defaults
   */
  private normalizeEndpoint(endpoint: RelayEndpoint): RelayEndpoint {
    // Normalize URL to match SimplePool's format (adds trailing slash)
    let url = endpoint.url;
    if (!url.endsWith('/')) {
      url = url + '/';
    }
    return {
      url,
      read: endpoint.read !== false,  // Default to true
      write: endpoint.write !== false // Default to true
    };
  }

  /**
   * Get readable relays (connected relays with read=true)
   */
  private getReadableRelays(): string[] {
    return Array.from(this.endpoints.entries())
      .filter(([url, endpoint]) =>
        this.statusMap.get(url) === 'connected' && endpoint.read !== false
      )
      .map(([url]) => url);
  }

  /**
   * Get writable relays (connected relays with write=true)
   */
  private getWritableRelays(): string[] {
    return Array.from(this.endpoints.entries())
      .filter(([url, endpoint]) =>
        this.statusMap.get(url) === 'connected' && endpoint.write !== false
      )
      .map(([url]) => url);
  }

  async connect(endpoints: RelayEndpoint[]): Promise<void> {
    this.disconnect();

    log('info', `Connecting to ${endpoints.length} relay(s): ${endpoints.map(e => e.url).join(', ')}`);
    for (const endpoint of endpoints) {
      const normalized = this.normalizeEndpoint(endpoint);
      this.endpoints.set(normalized.url, normalized);
      this.updateStatus(normalized.url, 'connecting');
    }

    const connectionPromises = endpoints.map(async (endpoint) => {
      // Use normalized URL consistently to match SimplePool's format
      const normalizedUrl = this.normalizeEndpoint(endpoint).url;
      const startTime = Date.now();
      try {
        log('debug', `Relay ${normalizedUrl}: attempting connection...`);
        await this.pool.ensureRelay(normalizedUrl, { connectionTimeout: 5000 });
        const elapsed = Date.now() - startTime;
        this.updateStatus(normalizedUrl, 'connected');
        log('info', `Relay ${normalizedUrl}: connected (${elapsed}ms)`);
      } catch (error) {
        const elapsed = Date.now() - startTime;
        this.updateStatus(normalizedUrl, 'error');
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('error', `Relay ${normalizedUrl}: connection failed after ${elapsed}ms - ${errorMessage}`);
      }
    });

    await Promise.allSettled(connectionPromises);

    // Log connection summary
    const connectedCount = Array.from(this.statusMap.values()).filter(s => s === 'connected').length;
    const errorCount = Array.from(this.statusMap.values()).filter(s => s === 'error').length;
    log('info', `Relay connection complete: ${connectedCount} connected, ${errorCount} failed out of ${endpoints.length}`);

    // Create a keepalive subscription to prevent idle disconnections
    // SimplePool closes connections without active subscriptions
    this.startKeepaliveSubscription();

    this.startStatusMonitoring();
  }

  /**
   * Creates a minimal subscription to keep relay connections alive.
   * SimplePool closes idle connections without active subscriptions.
   */
  private startKeepaliveSubscription(): void {
    const connectedRelays = this.getReadableRelays();
    if (connectedRelays.length === 0) {
      log('debug', 'No connected relays for keepalive subscription');
      return;
    }

    // Subscribe to a filter that won't match anything but keeps connection alive
    // Using a far-future timestamp ensures no events match
    const keepaliveFilter = {
      kinds: [1],
      since: Math.floor(Date.now() / 1000) + 86400 * 365 * 100, // 100 years in future
      limit: 1
    };

    try {
      const sub = this.pool.subscribeMany(connectedRelays, keepaliveFilter, {
        onevent: () => {
          // This should never be called since filter won't match
        }
      });

      // Store the keepalive subscription so it stays active
      this.activeSubscriptions.set('__keepalive__', { sub, seenEvents: new Set() });
      log('debug', `Keepalive subscription active on ${connectedRelays.length} relay(s)`);
    } catch (error) {
      log('warn', `Failed to create keepalive subscription: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  disconnect(): void {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }

    const subscriptionArray = Array.from(this.activeSubscriptions.values());
    for (const { sub } of subscriptionArray) {
      sub.close();
    }
    this.activeSubscriptions.clear();

    this.pool.close(Array.from(this.endpoints.keys()));
    this.endpoints.clear();
    this.statusMap.clear();
  }

  async publish(event: NostrEvent): Promise<PublishResult[]> {
    const writableRelays = this.getWritableRelays();

    if (writableRelays.length === 0) {
      // Diagnostic: explain why no writable relays are available
      const totalEndpoints = this.endpoints.size;
      const statusCounts = { connected: 0, connecting: 0, disconnected: 0, error: 0 };
      this.statusMap.forEach(status => { statusCounts[status]++; });
      const relayDetails = Array.from(this.endpoints.entries())
        .map(([url, ep]) => `${url} (status=${this.statusMap.get(url)}, write=${ep.write})`)
        .join(', ');
      log('error', `No writable relays available. Configured: ${totalEndpoints}, Connected: ${statusCounts.connected}, Connecting: ${statusCounts.connecting}, Error: ${statusCounts.error}. Relays: [${relayDetails}]`);
      return [];
    }

    log('debug', `Publishing event to ${writableRelays.length} writable relay(s): ${writableRelays.join(', ')}`);
    const eventForPublish = event as unknown as Event;
    const results: PublishResult[] = [];

    const publishPromises = this.pool.publish(writableRelays, eventForPublish);

    await Promise.allSettled(
      publishPromises.map(async (promise, index) => {
        const relay = writableRelays[index];
        try {
          const message = await Promise.race([
            promise,
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 5000)
            )
          ]);
          results.push({ relay, success: true, message });
          log('debug', `Relay ${relay}: publish succeeded`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.push({
            relay,
            success: false,
            message: errorMessage
          });
          log('error', `Relay ${relay}: publish failed - ${errorMessage}`);
        }
      })
    );

    // Log summary of publish results
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    log('info', `Publish complete: ${succeeded} succeeded, ${failed} failed out of ${results.length} relays`);

    return results;
  }

  subscribe(filters: Filter[], onEvent: (event: NostrEvent) => void): Subscription {
    const readableRelays = this.getReadableRelays();

    if (readableRelays.length === 0) {
      return { close: () => {} };
    }

    const seenEvents = new Set<string>();
    const subId = Math.random().toString(36).substring(2, 15);

    const filterToUse = filters.length > 0 ? filters[0] : {};

    const sub = this.pool.subscribeMany(
      readableRelays,
      filterToUse,
      {
        onevent: (event: Event) => {
          const nostrEvent = event as unknown as NostrEvent;
          if (!seenEvents.has(nostrEvent.id)) {
            seenEvents.add(nostrEvent.id);
            onEvent(nostrEvent);
          }
        }
      }
    );

    this.activeSubscriptions.set(subId, { sub, seenEvents });

    return {
      close: () => {
        const subscription = this.activeSubscriptions.get(subId);
        if (subscription) {
          subscription.sub.close();
          this.activeSubscriptions.delete(subId);
        }
      }
    };
  }

  getStatus(): Map<string, RelayStatus> {
    return new Map(this.statusMap);
  }

  onStatusChange(callback: (url: string, status: RelayStatus) => void): void {
    this.statusCallbacks.push(callback);
  }

  private updateStatus(url: string, status: RelayStatus): void {
    const oldStatus = this.statusMap.get(url);
    if (oldStatus !== status) {
      this.statusMap.set(url, status);
      for (const callback of this.statusCallbacks) {
        callback(url, status);
      }
    }
  }

  private startStatusMonitoring(): void {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }

    // Log initial connection status summary
    const connectionStatus = this.pool.listConnectionStatus();
    const connectedCount = Array.from(connectionStatus.values()).filter(v => v).length;
    log('info', `Status monitoring started. Pool reports ${connectedCount}/${this.endpoints.size} relays connected`);

    this.statusCheckInterval = setInterval(() => {
      const connectionStatus = this.pool.listConnectionStatus();

      this.endpoints.forEach((_, url) => {
        const isConnected = connectionStatus.get(url);
        const currentStatus = this.statusMap.get(url);

        if (isConnected && currentStatus !== 'connected') {
          this.updateStatus(url, 'connected');
          log('info', `Relay ${url}: reconnected`);
        } else if (!isConnected && currentStatus === 'connected') {
          this.updateStatus(url, 'disconnected');
          log('warn', `Relay ${url}: connection dropped`);
        }
      });
    }, 2000);
  }
}
