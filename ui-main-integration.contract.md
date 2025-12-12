# Main UI Integration Contract

## Target File
`src/renderer/main.tsx`

## Objective
Replace RelayConfigCard with RelayTable component and integrate conflict handling.

## Changes Overview

1. Remove existing RelayConfigCard component (lines ~491-722)
2. Import new components: RelayTable, RelayConflictModal
3. Update relay state management for per-identity config
4. Wire up auto-save and conflict detection
5. Subscribe to live relay status updates

## New Imports

```typescript
import RelayTable from './components/RelayTable';
import RelayConflictModal from './components/RelayConflictModal';
```

## State Management Updates

**Remove existing relay state:**
```typescript
// OLD: Remove these
const [relayConfig, setRelayConfig] = useState<NostlingRelayConfig | null>(null);
```

**Add new relay state:**
```typescript
// NEW: Add these
const [currentRelays, setCurrentRelays] = useState<NostlingRelayEndpoint[]>([]);
const [relayStatus, setRelayStatus] = useState<Record<string, string>>({});
const [conflictModalOpen, setConflictModalOpen] = useState(false);
const [conflictMessage, setConflictMessage] = useState('');
```

## Method: loadRelaysForIdentity(identityId)

CONTRACT:
  Inputs:
    - identityId: string, identity whose relays to load

  Outputs:
    - void (updates state)

  Invariants:
    - Calls IPC to get relays for specific identity
    - Updates currentRelays state with result
    - On error: logs warning, sets empty array

  Algorithm:
    1. Call window.api.nostling.relays.get(identityId)
    2. Set currentRelays state with result
    3. Catch errors: log, set currentRelays to []

## Method: saveRelaysForIdentity(identityId, relays)

CONTRACT:
  Inputs:
    - identityId: string, identity whose relays to save
    - relays: array of NostlingRelayEndpoint, updated configuration

  Outputs:
    - void (updates state or shows conflict modal)

  Invariants:
    - Calls IPC to save relays with conflict detection
    - If success: updates currentRelays state
    - If conflict: opens conflict modal with message
    - Never throws (errors handled gracefully)

  Properties:
    - Conflict detection: external modifications trigger modal
    - State consistency: currentRelays always reflects saved or conflicted state

  Algorithm:
    1. Call window.api.nostling.relays.set(identityId, relays)
    2. Check result for conflict:
       - If result.conflict?.conflicted === true:
         a. Set conflictMessage to result.conflict.message
         b. Open conflict modal (setConflictModalOpen(true))
       - If result.config exists:
         a. Update currentRelays state with result.config
         b. Close conflict modal if open
    3. Catch errors: log, show error toast

## Method: reloadRelaysForIdentity(identityId)

CONTRACT:
  Inputs:
    - identityId: string, identity whose relays to reload from disk

  Outputs:
    - void (updates state, closes modal)

  Invariants:
    - Discards in-memory changes
    - Loads fresh config from filesystem
    - Updates currentRelays state
    - Closes conflict modal

  Algorithm:
    1. Call window.api.nostling.relays.reload(identityId)
    2. Update currentRelays state with result
    3. Close conflict modal (setConflictModalOpen(false))
    4. Catch errors: log, show error toast

## Method: subscribeToRelayStatus()

CONTRACT:
  Inputs:
    - none (runs on component mount)

  Outputs:
    - unsubscribe function (for cleanup)

  Invariants:
    - Subscribes to relay status change events via IPC
    - Updates relayStatus state on every change
    - Unsubscribes on component unmount

  Algorithm:
    1. Call window.api.nostling.relays.onStatusChange((url, status) => { ... })
    2. In callback: update relayStatus state: { ...prev, [url]: status }
    3. Return unsubscribe function
    4. Use in useEffect with cleanup

## Method: initialLoadRelayStatus()

CONTRACT:
  Inputs:
    - none (runs on component mount)

  Outputs:
    - void (updates relayStatus state)

  Invariants:
    - Fetches initial relay status snapshot via IPC
    - Updates relayStatus state with full status map

  Algorithm:
    1. Call window.api.nostling.relays.getStatus()
    2. Update relayStatus state with result
    3. Catch errors: log, set relayStatus to {}

## useEffect Hook: Load Relays on Identity Change

CONTRACT:
  Inputs:
    - currentIdentity state (from existing useNostlingState)

  Outputs:
    - void (side effect: loads relays)

  Invariants:
    - Runs when currentIdentity changes
    - Calls loadRelaysForIdentity if identity exists
    - Clears relays if no identity selected

  Algorithm:
    1. Check if currentIdentity exists
    2. If yes: call loadRelaysForIdentity(currentIdentity.id)
    3. If no: set currentRelays to []

## useEffect Hook: Subscribe to Status Updates

CONTRACT:
  Inputs:
    - none (runs once on mount)

  Outputs:
    - cleanup function (unsubscribe)

  Invariants:
    - Subscribes to status changes on mount
    - Loads initial status snapshot
    - Unsubscribes on unmount

  Algorithm:
    1. Call initialLoadRelayStatus()
    2. Call subscribeToRelayStatus(), store unsubscribe function
    3. Return cleanup function that calls unsubscribe

## RelayTable Integration

**Replace RelayConfigCard usage:**

OLD:
```typescript
<RelayConfigCard
  config={relayConfig}
  identities={identities}
  loading={loadingRelays}
  hasBridge={hasBridge}
  onRefresh={handleRefreshRelays}
  onSave={handleSaveRelays}
  onDone={() => setShowRelayConfig(false)}
/>
```

NEW:
```typescript
<RelayTable
  identityId={currentIdentity?.id || ''}
  relays={currentRelays}
  status={relayStatus}
  onChange={(updated) => saveRelaysForIdentity(currentIdentity!.id, updated)}
  onConflict={(msg) => {
    setConflictMessage(msg);
    setConflictModalOpen(true);
  }}
/>
```

## ConflictModal Integration

Add modal after main content:
```typescript
<RelayConflictModal
  isOpen={conflictModalOpen}
  conflictMessage={conflictMessage}
  onReload={() => reloadRelaysForIdentity(currentIdentity!.id)}
  onOverwrite={() => {
    // Retry save - this will use updated hash from reload
    // Implementation note: may need force flag in IPC
    saveRelaysForIdentity(currentIdentity!.id, currentRelays);
  }}
  onCancel={() => {
    setConflictModalOpen(false);
    // Optionally reload to see external changes
    reloadRelaysForIdentity(currentIdentity!.id);
  }}
/>
```

## Testing Requirements

- Integration tests (E2E):
  - Test: Load identity → relays displayed in table
  - Test: Toggle checkbox → auto-saves, no conflict
  - Test: External file edit + UI save → conflict modal appears
  - Test: Conflict modal "Reload" → discards UI changes, shows file content
  - Test: Conflict modal "Overwrite" → saves UI changes, replaces file
  - Test: Conflict modal "Cancel" → closes modal, leaves UI unchanged
  - Test: Status updates → dots change color in real-time

- Property-based tests:
  - Property: onChange always triggers saveRelaysForIdentity
  - Property: conflict result always opens modal
  - Property: reload always updates currentRelays state
  - Property: status subscription fires on every relay status change

## Cleanup Actions

1. Remove RelayConfigCard component definition
2. Remove related handler methods: handleRefreshRelays, handleSaveRelays (old implementations)
3. Remove relayConfig state variable
4. Remove any relay config loading logic that used global config

## Migration Notes

- Old global config pattern: `{ defaults: [...], perIdentity: {...} }`
- New per-identity pattern: single array of relays per identity
- UI now loads relays for current identity only (not all at once)
- No "Save Changes" button: all changes auto-save immediately
- Conflict detection prevents data loss from concurrent edits

## Integration Points

- Existing identity selection drives relay loading (via useEffect)
- Existing Chakra theme and styling apply to new components
- Existing error handling patterns (toasts, logs) used for relay errors
- Existing IPC patterns (`window.api.nostling.*`) extended for relays
