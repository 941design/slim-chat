# RelayPool Extensions Contract

## Target File
`src/main/nostling/relay-pool.ts`

## Objective
Extend existing RelayPool class to respect read/write flags when subscribing and publishing.

## Type Updates

Update `RelayEndpoint` interface:
```typescript
export interface RelayEndpoint {
  url: string;
  read: boolean;   // NEW: Allow receiving events from this relay
  write: boolean;  // NEW: Allow publishing events to this relay
}
```

## Method: setRelays(relays)

**Existing behavior**: Accepts array of RelayEndpoint with only `url` field

**New behavior**: Accept relays with read/write flags, store for filtering

CONTRACT:
  Inputs:
    - relays: array of RelayEndpoint objects with url, read, write fields
      Example: [{ url: "wss://relay.example.com", read: true, write: false }]

  Outputs:
    - void (method returns nothing)

  Invariants:
    - Stored relays are accessible for filtering by read/write flags
    - Existing connection management behavior is preserved
    - Connections are established to all relays regardless of read/write flags
    - Status tracking continues to work for all relays

  Properties:
    - Backward compatible: relays without read/write flags default to read=true, write=true
    - Non-destructive: existing tests should continue passing

  Algorithm:
    1. Store relays in internal map/structure
    2. For each relay: establish connection (existing behavior)
    3. Mark relays with read=true as "subscribable"
    4. Mark relays with write=true as "publishable"

## Method: subscribe(filters, onEvent)

**Existing behavior**: Subscribes to all connected relays

**New behavior**: Subscribe only to relays with read=true

CONTRACT:
  Inputs:
    - filters: array of Filter objects (existing)
    - onEvent: callback function for received events (existing)

  Outputs:
    - Subscription object with close() method (existing)

  Invariants:
    - Only relays with read=true receive subscription
    - Relays with read=false do not receive subscription request
    - Event deduplication still works (existing behavior)
    - Subscription lifecycle management unchanged (existing behavior)

  Properties:
    - Read-only enforcement: events only received from read=true relays
    - Backward compatible: if no relays have read flag, default to all relays

  Algorithm:
    1. Filter stored relays: select only where read=true
    2. For each read-enabled relay: create subscription (existing logic)
    3. Return Subscription handle (existing behavior)

## Method: publish(event)

**Existing behavior**: Publishes to all connected relays

**New behavior**: Publish only to relays with write=true

CONTRACT:
  Inputs:
    - event: NostrEvent object to publish (existing)

  Outputs:
    - Promise resolving to array of PublishResult (existing)

  Invariants:
    - Only relays with write=true receive publish request
    - Relays with write=false do not receive publish request
    - Publish result includes only write-enabled relays
    - Error handling unchanged (existing behavior)

  Properties:
    - Write-only enforcement: events only sent to write=true relays
    - Backward compatible: if no relays have write flag, default to all relays
    - Result consistency: PublishResult array contains only write-enabled relays

  Algorithm:
    1. Filter stored relays: select only where write=true
    2. For each write-enabled relay: attempt publish (existing logic)
    3. Collect results from write-enabled relays only
    4. Return array of PublishResult (existing behavior)

## Testing Requirements

- Existing RelayPool tests must continue passing
- Add property-based tests for read/write filtering:
  - Property: subscribe() never contacts relay with read=false
  - Property: publish() never contacts relay with write=false
  - Property: relays with both flags can do both operations
  - Property: status tracking works for all relays regardless of flags

## Integration Points

- NostlingService will pass relays with read/write flags via setRelays()
- UI will display status for all relays (read/write flags don't affect status)
- Existing tests should not require changes (backward compatibility)
