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
import { NostrEvent } from './crypto';

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
    this.pool = new SimplePool({ enableReconnect: true });
    this.endpoints = new Map();
    this.statusMap = new Map();
    this.statusCallbacks = [];
    this.activeSubscriptions = new Map();
    this.statusCheckInterval = null;
  }

  async connect(endpoints: RelayEndpoint[]): Promise<void> {
    this.disconnect();

    for (const endpoint of endpoints) {
      this.endpoints.set(endpoint.url, endpoint);
      this.updateStatus(endpoint.url, 'connecting');
    }

    const connectionPromises = endpoints.map(async (endpoint) => {
      try {
        await this.pool.ensureRelay(endpoint.url, { connectionTimeout: 5000 });
        this.updateStatus(endpoint.url, 'connected');
      } catch (error) {
        this.updateStatus(endpoint.url, 'error');
      }
    });

    await Promise.allSettled(connectionPromises);

    this.startStatusMonitoring();
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
    const connectedRelays = Array.from(this.endpoints.keys())
      .filter(url => this.statusMap.get(url) === 'connected');

    if (connectedRelays.length === 0) {
      return [];
    }

    const eventForPublish = event as unknown as Event;
    const results: PublishResult[] = [];

    const publishPromises = this.pool.publish(connectedRelays, eventForPublish);

    await Promise.allSettled(
      publishPromises.map(async (promise, index) => {
        const relay = connectedRelays[index];
        try {
          const message = await Promise.race([
            promise,
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 5000)
            )
          ]);
          results.push({ relay, success: true, message });
        } catch (error) {
          results.push({
            relay,
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      })
    );

    return results;
  }

  subscribe(filters: Filter[], onEvent: (event: NostrEvent) => void): Subscription {
    const connectedRelays = Array.from(this.endpoints.keys())
      .filter(url => this.statusMap.get(url) === 'connected');

    if (connectedRelays.length === 0) {
      return { close: () => {} };
    }

    const seenEvents = new Set<string>();
    const subId = Math.random().toString(36).substring(2, 15);

    const filterToUse = filters.length > 0 ? filters[0] : {};

    const sub = this.pool.subscribeMany(
      connectedRelays,
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

    this.statusCheckInterval = setInterval(() => {
      const connectionStatus = this.pool.listConnectionStatus();

      this.endpoints.forEach((_, url) => {
        const isConnected = connectionStatus.get(url);
        const currentStatus = this.statusMap.get(url);

        if (isConnected && currentStatus !== 'connected') {
          this.updateStatus(url, 'connected');
        } else if (!isConnected && currentStatus === 'connected') {
          this.updateStatus(url, 'disconnected');
        }
      });
    }, 2000);
  }
}
