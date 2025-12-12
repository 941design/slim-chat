# IPC Relay Handlers Contract

## Target File
`src/main/ipc/handlers.ts`

## Objective
Update IPC handlers for relay operations to use filesystem-based configuration with per-identity storage and conflict detection.

## Handler: nostling:relays:get

**Existing behavior**: Returns global relay config from database

**New behavior**: Returns per-identity relays from filesystem

CONTRACT:
  Inputs:
    - identityId: string, passed as parameter from renderer
      Example IPC call: window.api.nostling.relays.get(identityId)

  Outputs:
    - Promise<NostlingRelayEndpoint[]>: array of relays for the identity

  Invariants:
    - Loads fresh data from filesystem (no stale cache)
    - Returns relays sorted by order field
    - If identity has no config: returns DEFAULT_RELAYS and creates file
    - Never throws to renderer (wrap errors, return empty array on failure)

  Properties:
    - Graceful degradation: malformed config → empty array, not crash
    - Self-healing: missing file → create with defaults

  Algorithm:
    1. Extract identityId from IPC event args
    2. Call nostlingService.getRelaysForIdentity(identityId)
    3. Return result
    4. Catch any errors: log, return empty array

## Handler: nostling:relays:set

**Existing behavior**: Saves global relay config to database

**New behavior**: Saves per-identity relays to filesystem with conflict detection

CONTRACT:
  Inputs:
    - identityId: string, identity whose relays to update
    - relays: array of NostlingRelayEndpoint, new configuration
      Example IPC call: window.api.nostling.relays.set(identityId, relays)

  Outputs:
    - Promise<RelayConfigResult>: success with config, or conflict info
      success: { config: saved_relays, conflict: undefined }
      conflict: { config: undefined, conflict: { conflicted: true, message: "..." } }

  Invariants:
    - Before saving: checks for external file modifications
    - If conflict detected: returns conflict result without writing
    - If no conflict: saves to file, updates relay pool, returns success
    - JSON written with 2-space pretty printing

  Properties:
    - Conflict detection: external changes trigger conflict response
    - Atomic: either fully succeeds or returns conflict (no partial state)

  Algorithm:
    1. Extract identityId and relays from IPC event args
    2. Call nostlingService.setRelaysForIdentity(identityId, relays)
    3. Return result (config or conflict)
    4. Catch any errors: log, return conflict result with error message

## Handler: nostling:relays:reload

**New handler**

CONTRACT:
  Inputs:
    - identityId: string, identity whose relays to reload from disk
      Example IPC call: window.api.nostling.relays.reload(identityId)

  Outputs:
    - Promise<NostlingRelayEndpoint[]>: fresh relays from filesystem

  Invariants:
    - Discards any cached/in-memory state
    - Reads from filesystem unconditionally
    - Updates relay pool with fresh configuration
    - Never throws to renderer (wrap errors, return empty array on failure)

  Properties:
    - Discards cache: ignores previous loaded state
    - Idempotent: calling twice gives same result as once

  Algorithm:
    1. Extract identityId from IPC event args
    2. Call nostlingService.reloadRelaysForIdentity(identityId)
    3. Return result
    4. Catch any errors: log, return empty array

## Handler: nostling:relays:getStatus

**New handler**

CONTRACT:
  Inputs:
    - none (reads current relay pool status)
      Example IPC call: window.api.nostling.relays.getStatus()

  Outputs:
    - Promise<Record<string, 'connected' | 'connecting' | 'disconnected' | 'error'>>
      Example: { "wss://relay.example.com": "connected", "wss://other.relay.io": "disconnected" }

  Invariants:
    - Returns status for all configured relays
    - Status reflects current connection state
    - Missing relays have no entry (not included in result)

  Algorithm:
    1. Get relay pool instance from nostlingService
    2. Query current status for all relays
    3. Return status map

## Handler: nostling:relays:onStatusChange

**New handler** (event subscription pattern)

CONTRACT:
  Inputs:
    - callback: function(url: string, status: string) => void
      Example IPC setup: window.api.nostling.relays.onStatusChange((url, status) => { ... })

  Outputs:
    - unsubscribe function: () => void (to remove listener)

  Invariants:
    - Callback invoked whenever any relay status changes
    - Multiple listeners can be registered
    - Unsubscribe removes only the specific listener

  Properties:
    - Event-driven: updates pushed to renderer in real-time
    - No polling: status changes trigger callbacks immediately

  Algorithm:
    1. Register callback with relay pool's status change event
    2. Return unsubscribe function that removes this specific callback

## Preload API Updates

Update `src/preload/index.ts` to expose new API structure:

```typescript
nostling: {
  // ... existing identities, contacts, messages APIs ...
  relays: {
    get: (identityId: string) => ipcRenderer.invoke('nostling:relays:get', identityId),
    set: (identityId: string, relays: NostlingRelayEndpoint[]) =>
      ipcRenderer.invoke('nostling:relays:set', identityId, relays),
    reload: (identityId: string) => ipcRenderer.invoke('nostling:relays:reload', identityId),
    getStatus: () => ipcRenderer.invoke('nostling:relays:getStatus'),
    onStatusChange: (callback: (url: string, status: string) => void) => {
      const listener = (_: any, url: string, status: string) => callback(url, status);
      ipcRenderer.on('nostling:relay-status-changed', listener);
      return () => ipcRenderer.removeListener('nostling:relay-status-changed', listener);
    },
  },
}
```

## Main Process Event Emission

In RelayPool status callback registration:
```typescript
relayPool.onStatusChange((url, status) => {
  // Emit to all renderer windows
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('nostling:relay-status-changed', url, status);
  });
});
```

## Testing Requirements

- Mock NostlingService methods in IPC handler tests
- Property-based tests:
  - Property: get never throws to renderer (errors → empty array)
  - Property: set with conflict returns conflict result, not error
  - Property: reload discards cache (two calls with external change show new data)
  - Property: onStatusChange callback invoked on status updates

## Integration Points

- Renderer components call these IPC methods via window.api.nostling.relays.*
- RelayTable component subscribes to onStatusChange for live status updates
- ConflictModal appears when set() returns conflict result
