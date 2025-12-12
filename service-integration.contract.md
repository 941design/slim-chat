# NostlingService Integration Contract

## Target File
`src/main/nostling/service.ts`

## Objective
Integrate RelayConfigManager into NostlingService, replacing database-based relay management with filesystem-based configuration.

## New Dependencies

Add imports:
```typescript
import { RelayConfigManager, DEFAULT_RELAYS } from './relay-config-manager';
```

## Service Constructor Changes

Add field:
```typescript
private relayConfigManager: RelayConfigManager;
```

Initialize in constructor:
```typescript
this.relayConfigManager = new RelayConfigManager(configDir); // configDir passed from app config
```

## Method: initialize()

**Existing behavior**: Initializes service, loads relay config from database

**New behavior**: Run migration, then load relays from filesystem

CONTRACT:
  Inputs:
    - options: NostlingServiceOptions (existing parameter)

  Outputs:
    - Promise<void>

  Invariants:
    - Migration runs before any relay loading (one-time, idempotent)
    - After migration: relays are loaded from filesystem for all identities
    - Relay pool is configured with relays including read/write flags
    - Existing initialization steps (subscriptions, etc.) continue unchanged

  Algorithm:
    1. Call existing initialization steps (preserve current behavior)
    2. Get list of identities from database
    3. Call relayConfigManager.migrateFromDatabase(database, identities)
    4. For the first/current identity (if exists):
       a. Load relays via relayConfigManager.loadRelays(identityId)
       b. Configure relay pool with loaded relays (including read/write flags)
    5. Continue with existing subscription setup

## Method: getRelayConfig() - REMOVE

**Action**: Remove this method entirely (no longer needed)

Rationale: Per-identity config is now loaded on-demand, not stored in global config

## Method: setRelayConfig() - REMOVE

**Action**: Remove this method entirely (no longer needed)

Rationale: Relay config is now saved via IPC handlers calling RelayConfigManager directly

## New Method: getRelaysForIdentity(identityId)

CONTRACT:
  Inputs:
    - identityId: non-empty string, identity whose relays to retrieve

  Outputs:
    - Promise<NostlingRelayEndpoint[]>: array of relays for this identity

  Invariants:
    - Returns fresh data from filesystem (no caching)
    - Relays are sorted by order field
    - If identity has no config file: returns DEFAULT_RELAYS and creates file

  Algorithm:
    1. Call relayConfigManager.loadRelays(identityId)
    2. Return result

## New Method: setRelaysForIdentity(identityId, relays)

CONTRACT:
  Inputs:
    - identityId: non-empty string, identity whose relays to update
    - relays: array of NostlingRelayEndpoint, new configuration

  Outputs:
    - Promise<RelayConfigResult>: success or conflict result

  Invariants:
    - Saves relays to filesystem with overwrite protection
    - If external changes detected: returns conflict result
    - On success: updates relay pool configuration
    - On conflict: does not update relay pool

  Properties:
    - Conflict detection: detects concurrent external modifications
    - Atomic: either fully succeeds or returns conflict (no partial writes)

  Algorithm:
    1. Call relayConfigManager.saveRelays(identityId, relays)
    2. If result indicates conflict: return conflict result
    3. If result indicates success:
       a. Update relay pool with new relays via relayPool.setRelays()
       b. Return success result

## New Method: reloadRelaysForIdentity(identityId)

CONTRACT:
  Inputs:
    - identityId: non-empty string, identity whose relays to reload

  Outputs:
    - Promise<NostlingRelayEndpoint[]>: fresh relays from disk

  Invariants:
    - Discards any cached state
    - Reads from filesystem unconditionally
    - Updates relay pool with fresh configuration

  Algorithm:
    1. Call relayConfigManager.reloadRelays(identityId)
    2. Update relay pool via relayPool.setRelays(relays)
    3. Return loaded relays

## Method: createIdentity(request)

**Existing behavior**: Creates identity in database

**New behavior**: Also initialize relay config file with defaults

CONTRACT:
  Inputs:
    - request: CreateIdentityRequest (existing)

  Outputs:
    - Promise<NostlingIdentity> (existing)

  Invariants:
    - After identity created: relays.json file exists with DEFAULT_RELAYS
    - If file creation fails: log warning but don't fail identity creation

  Algorithm:
    1. Create identity in database (existing logic)
    2. Call relayConfigManager.saveRelays(newIdentityId, DEFAULT_RELAYS)
    3. If saveRelays fails: log warning, continue
    4. Return created identity

## Testing Requirements

- Existing NostlingService tests must continue passing
- Mock RelayConfigManager in tests
- Property-based tests for integration:
  - Property: after createIdentity(), relay config file exists
  - Property: getRelaysForIdentity() always returns sorted relays
  - Property: setRelaysForIdentity() with conflict returns conflict result
  - Property: reloadRelaysForIdentity() discards cached state

## Integration Points

- IPC handlers will call getRelaysForIdentity/setRelaysForIdentity/reloadRelaysForIdentity
- Migration runs once on first service initialization after update
- Relay pool receives relays with read/write flags for filtering
