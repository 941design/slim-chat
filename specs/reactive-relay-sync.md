# Reactive Relay Synchronization

## Overview

Replace continuous polling with event-driven catch-up synchronization triggered by relay connection state changes. Streaming subscriptions become the sole primary mechanism for real-time event delivery, with targeted polling activated only when connection reliability is in question.

## Problem Statement

### Current Behavior

The application currently employs two parallel mechanisms for receiving Nostr events:

1. **Streaming Subscriptions**: Persistent WebSocket connections with relay servers that deliver events in real-time via NIP-01 REQ/EVENT flow.

2. **Periodic Polling**: Timer-based queries executed at fixed intervals (configurable: 10s, 30s, 1m, 5m) regardless of streaming health.

### Issues

1. **Redundant Traffic**: Polling queries relays even when streaming is functioning correctly, requesting events that have already been received.

2. **Wasted Resources**: CPU cycles, battery drain (mobile/laptop), and network bandwidth consumed by unnecessary queries.

3. **Relay Load**: Contributes to relay infrastructure load with queries that provide no value during normal operation.

4. **False Sense of Reliability**: Periodic polling doesn't guarantee catching missed events—the polling interval creates windows where events can still be missed.

5. **Timestamp-Based Optimization Insufficient**: While timestamp-based `since` filters reduce redundant event processing, they don't eliminate the unnecessary network requests themselves.

## Goals

1. **Eliminate unnecessary polling** when streaming is healthy
2. **Detect streaming failures reliably** using observable signals
3. **Recover missed events promptly** when failures are detected
4. **Maintain simplicity** in the synchronization architecture
5. **Preserve existing reliability** guarantees for message delivery

## Non-Goals

1. Detecting silent event loss (events the relay accepted but failed to deliver)
2. Implementing complex heartbeat protocols with relays
3. Guaranteeing exactly-once delivery (deduplication already handles this)
4. Real-time detection of subscription-level failures without connection loss

## Terminology

| Term | Definition |
|------|------------|
| **Streaming** | Persistent subscription via WebSocket that receives events as they occur |
| **Polling** | One-shot query requesting events matching a filter, typically with temporal bounds |
| **Catch-up Poll** | A targeted poll triggered by a specific event (e.g., reconnection) to recover potentially missed events |
| **Sync State** | Persisted timestamp tracking the last known event per relay/identity/kind |

## Architecture

### State Model

The synchronization system operates in one of three states per relay:

```
                    ┌──────────────┐
                    │              │
         ┌─────────►│   STREAMING  │◄─────────┐
         │          │              │          │
         │          └──────┬───────┘          │
         │                 │                  │
         │          connection lost           │
         │                 │                  │
         │                 ▼                  │
         │          ┌──────────────┐          │
         │          │              │          │
         │          │ DISCONNECTED │          │
         │          │              │          │
         │          └──────┬───────┘          │
         │                 │                  │
         │          connection restored       │
         │                 │                  │
         │                 ▼                  │
         │          ┌──────────────┐          │
         │          │              │          │
         └──────────┤  RECOVERING  ├──────────┘
                    │              │
                    └──────────────┘
                    catch-up complete
```

### State Descriptions

#### STREAMING (Normal Operation)

- WebSocket connection is established
- Subscription is active and receiving events
- No polling occurs
- Incoming events update the sync state timestamp

#### DISCONNECTED (Degraded)

- WebSocket connection lost
- Events are not being received
- No polling attempted (relay unreachable)
- Sync state preserved from last received event

#### RECOVERING (Catch-up)

- WebSocket connection re-established
- Catch-up poll initiated using stored sync state timestamp
- Subscription restarted with `since` filter
- Transitions to STREAMING once catch-up completes

### Transition Triggers

| From | To | Trigger |
|------|----|---------|
| STREAMING | DISCONNECTED | WebSocket close/error event |
| DISCONNECTED | RECOVERING | WebSocket open event (reconnection) |
| RECOVERING | STREAMING | Catch-up poll completes successfully |
| RECOVERING | DISCONNECTED | Catch-up poll fails (connection lost again) |

## Behavior Specification

### B1: Normal Streaming Operation

**When** the relay connection is healthy and subscription is active
**Then** all events are received via streaming
**And** no polling queries are issued
**And** sync state timestamps are updated on each received event

### B2: Connection Loss Detection

**When** a relay WebSocket connection closes or errors
**Then** the relay transitions to DISCONNECTED state
**And** the last sync state timestamp is preserved
**And** no immediate action is required (SimplePool handles reconnection)

### B3: Reconnection Detection

**When** a relay transitions from disconnected to connected
**Then** the relay enters RECOVERING state
**And** a catch-up poll is scheduled

### B4: Catch-up Poll Execution

**When** a relay enters RECOVERING state
**Then** a poll is issued with filters using the stored sync state timestamp
**And** the `since` parameter equals `last_event_timestamp - clock_skew_buffer`
**And** received events are processed through normal ingestion (with deduplication)
**And** sync state is updated to reflect newly received events

### B5: Multiple Relay Reconnection

**When** multiple relays reconnect within a short time window (e.g., network restoration)
**Then** catch-up polls are debounced/batched
**And** a single consolidated catch-up operation covers all reconnected relays
**And** excessive relay load is avoided

### B6: Application Startup

**When** the application starts
**Then** subscriptions are created with `since` filters based on stored sync state
**And** a startup catch-up poll is performed if sync state exists
**And** if no sync state exists, a reasonable lookback window is used (e.g., 24 hours)

### B7: Subscription Restart

**When** a subscription is restarted (e.g., contact list changed)
**Then** the new subscription includes a `since` filter based on stored sync state
**And** no separate catch-up poll is required (subscription handles it)

### B8: Graceful Degradation

**When** all relays are disconnected
**Then** the application continues operating with cached data
**And** catch-up recovery occurs automatically when any relay reconnects
**And** user is not required to take manual action

## Failure Modes and Mitigations

### FM1: Silent Subscription Failure

**Scenario**: Relay accepts subscription but stops delivering events without closing connection.

**Detection**: Not reliably detectable without application-level heartbeat.

**Mitigation**:
- Periodic subscription refresh (e.g., every 30 minutes) re-establishes subscriptions
- User can manually trigger refresh if suspecting issues
- Future enhancement: implement NIP-45 (Event Counts) for subscription health validation

### FM2: Clock Skew

**Scenario**: Relay server clock differs significantly from client clock.

**Mitigation**: Subtract a buffer (e.g., 60 seconds) from `since` timestamps to create overlap window. Deduplication handles any duplicate events.

### FM3: Rapid Reconnection Cycles

**Scenario**: Unstable network causes frequent connect/disconnect cycles.

**Mitigation**:
- Debounce catch-up polls with minimum interval between executions
- Track recent catch-up attempts to avoid redundant work
- Exponential backoff on repeated failures

### FM4: Stale Sync State

**Scenario**: Application hasn't run for extended period; stored timestamps are very old.

**Mitigation**:
- Cap lookback window to reasonable maximum (e.g., 7 days)
- Beyond cap, use default lookback and accept potential event loss
- Log warning for user awareness

### FM5: Database Corruption

**Scenario**: Sync state table is corrupted or unavailable.

**Mitigation**:
- Fall back to default lookback window (24 hours)
- Recreate sync state from incoming events
- Do not block application startup

## Edge Cases

### EC1: First-Time User

No sync state exists. Use conservative lookback window for initial subscription (24 hours for streaming, 5 minutes for any catch-up poll).

### EC2: Identity Removal

When an identity is removed, delete all associated sync state to prevent orphaned data.

### EC3: Relay Removal from Configuration

When a relay is removed from an identity's relay list, sync state for that relay may be retained or pruned (implementation discretion).

### EC4: Event with Future Timestamp

Events with `created_at` in the future should still update sync state using the event's timestamp, ensuring they're not re-fetched.

### EC5: Empty Catch-up Poll

Catch-up poll returns zero events. This is normal (no events during disconnection). Transition to STREAMING state proceeds normally.

### EC6: Very Large Catch-up Result

Catch-up poll returns thousands of events. Process normally through ingestion pipeline with existing deduplication and rate limiting.

## Acceptance Criteria

### AC1: No Periodic Polling

- [ ] Application does not issue polling queries on a timer
- [ ] No configuration option for polling interval (or option is deprecated/removed)
- [ ] Network traffic analysis shows no regular polling pattern during stable connection

### AC2: Reconnection Triggers Catch-up

- [ ] Disconnecting and reconnecting a relay triggers exactly one catch-up poll
- [ ] Catch-up poll uses stored timestamp from sync state
- [ ] Events missed during disconnection are recovered

### AC3: Debounced Batch Catch-up

- [ ] Disconnecting network and reconnecting triggers at most one catch-up operation
- [ ] Multiple relays reconnecting near-simultaneously result in batched handling
- [ ] No relay is queried more than once per catch-up cycle

### AC4: Startup Recovery

- [ ] Application startup with existing sync state issues catch-up poll
- [ ] Application startup without sync state uses default lookback
- [ ] Subscriptions include appropriate `since` filters

### AC5: Streaming Remains Primary

- [ ] During stable connection, all events arrive via streaming
- [ ] No polling occurs when streaming is healthy
- [ ] Sync state is updated on streaming event receipt

### AC6: Backward Compatibility

- [ ] Existing message history is preserved
- [ ] Migration from periodic polling is seamless
- [ ] No user action required to adopt new behavior

## Performance Requirements

### PR1: Catch-up Latency

Catch-up poll should complete within 10 seconds of relay reconnection under normal conditions.

### PR2: Debounce Window

Catch-up debounce window should be 2-5 seconds to balance responsiveness with batching efficiency.

### PR3: Resource Usage

During stable streaming, CPU and network usage attributable to sync mechanisms should be negligible (event processing only).

### PR4: Sync State Overhead

Sync state database writes should be batched/debounced to minimize I/O (existing 2-second debounce is appropriate).

## Security and Privacy Considerations

### SP1: Timestamp Leakage

Sync state timestamps reveal when the user was last active. This data is stored locally only and not transmitted to relays beyond the `since` filter (which is inherent to the Nostr protocol).

### SP2: Catch-up Query Patterns

Catch-up polls reveal to relays that the client was recently disconnected. This is unavoidable and consistent with normal Nostr client behavior.

### SP3: Relay Fingerprinting

Per-relay sync state could theoretically be used to fingerprint relay usage patterns if the database were accessed. Sync state should be considered sensitive user data.

## Future Considerations

### FC1: Subscription Health Monitoring

Implement optional periodic subscription refresh to mitigate silent subscription failures. Could use NIP-45 (Event Counts) when supported by relays.

### FC2: Predictive Catch-up

Analyze historical disconnection patterns to predictively pre-cache events during periods of expected instability (e.g., known flaky network).

### FC3: Relay Quality Scoring

Track relay reliability (uptime, event delivery success) to prioritize more reliable relays for catch-up operations.

### FC4: Offline-First Sync

Extend sync state to support full offline operation with conflict resolution for events created while offline.

## References

- NIP-01: Basic Protocol Flow (subscriptions, events)
- NIP-45: Event Counts (potential future health check mechanism)
- Current implementation: timestamp-based sparse polling (to be superseded)
