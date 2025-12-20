# YAML Config Format Migration - Requirements Specification

## Problem Statement

The current configuration format is JSON, which does not support comments. Users cannot document their config choices or understand what each option does without consulting external documentation. This makes the config files less user-friendly and harder to maintain.

Additionally, YAML is more human-readable and allows for comments, making it a better choice for user-facing configuration files.

## Core Functionality

Migrate all configuration files from JSON to YAML format while maintaining full backwards compatibility with existing JSON configs. The migration should be transparent to users, with clear deprecation warnings and a smooth transition path.

## Functional Requirements

### FR-1: YAML Format Support
- **Requirement**: Both app config and relay configs must support YAML format
- **Acceptance Criteria**:
  - App config can be read from `config.yaml`
  - Relay configs can be read from `identities/<id>/relays.yaml`
  - YAML files include helpful comments explaining each configuration option
  - All existing AppConfig fields are supported in YAML format
  - All relay config fields (url, read, write, order) are supported in YAML format

### FR-2: Backwards Compatibility
- **Requirement**: Existing JSON config files must continue to work
- **Acceptance Criteria**:
  - App can read existing `config.json` files
  - App can read existing `identities/<id>/relays.json` files
  - No data loss during migration
  - No breaking changes for existing users
  - Old configs with deprecated fields still load gracefully

### FR-3: Automatic Migration
- **Requirement**: JSON configs automatically migrate to YAML on first read (lazy migration)
- **Acceptance Criteria**:
  - On first config load: if only JSON exists, read it and write YAML version
  - Original JSON file is preserved (not deleted)
  - Migration logs info message: "Configuration migrated from JSON to YAML format"
  - For relay configs: each identity's relays.json migrates independently
  - Migration is idempotent (safe to run multiple times)

### FR-4: Dual-Format Support During Transition
- **Requirement**: When both YAML and JSON exist, support both with YAML taking precedence
- **Acceptance Criteria**:
  - **Read priority**: Always read from YAML if it exists, ignore JSON
  - **Write behavior**:
    - Always write to YAML (primary format)
    - If JSON file exists, also write to JSON (backup for downgrades)
    - If only YAML exists, only write YAML
  - Hash-based conflict detection works for YAML files (same as current JSON)

### FR-5: Deprecation Warnings
- **Requirement**: Log warnings when both formats are present
- **Acceptance Criteria**:
  - On every app startup: if both config.yaml and config.json exist, log warning
  - Warning message: "Config file exists in both YAML and JSON formats. The JSON format is deprecated. You can safely remove config.json - it will be auto-removed in the next major version."
  - Same warning for relay configs: "Relay config for identity <id> exists in both formats..."
  - Warnings logged at 'info' level, not 'warn' (to avoid alarm)

### FR-6: YAML Comments
- **Requirement**: YAML files include helpful comments explaining config options
- **Acceptance Criteria**:
  - App config YAML includes comments for each field explaining purpose and valid values
  - Example comment for logLevel: "# Log level: debug, info, warn, or error"
  - Example comment for autoCheckInterval: "# How often to check for updates: 1h, 2h, 4h, 12h, 24h, or never"
  - Relay config YAML includes header comment explaining the format
  - Comments are preserved on subsequent writes when possible

### FR-7: Test Coverage
- **Requirement**: Update unit tests and e2e tests for YAML format
- **Acceptance Criteria**:
  - Unit tests verify YAML parsing and serialization
  - Unit tests verify migration from JSON to YAML
  - Unit tests verify dual-format read priority (YAML over JSON)
  - Unit tests verify dual-write behavior
  - Property-based tests for YAML format (similar to existing config.test.ts)
  - E2E tests verify config persistence in YAML format
  - Tests verify deprecation warnings are logged

### FR-8: Documentation Updates
- **Requirement**: Update CHANGELOG.md and README.md
- **Acceptance Criteria**:
  - CHANGELOG.md entry describes migration, backwards compatibility, and deprecation timeline
  - README.md updated to reference YAML config format (if it mentions config files)
  - Migration instructions for users (basically: "it happens automatically")

## Critical Constraints

### BC-1: No Breaking Changes
- Existing JSON configs must work without any user intervention
- Users on older versions who downgrade must not lose data (hence dual-write)
- Config structure and field names remain unchanged (only format changes)

### BC-2: Data Integrity
- Migration must preserve all config values exactly
- No loss of precision for numeric fields
- Boolean values remain boolean (not string "true"/"false")
- Arrays and objects maintain structure

### BC-3: File System Safety
- Use atomic writes (write to .tmp, then rename) for YAML files
- Hash-based conflict detection for YAML (same as current JSON)
- Original JSON files kept as backup until user removes them
- Migration is idempotent (safe if interrupted and re-run)

### BC-4: Performance
- Config loading should not be significantly slower with YAML
- Migration should happen transparently without blocking startup
- No noticeable delay for users

## Integration Points

### IP-1: Config Loading (src/main/config.ts)
- `loadConfig()` function needs to:
  1. Check for config.yaml first
  2. If YAML exists, read and parse it
  3. If YAML doesn't exist, check for config.json
  4. If JSON exists, read, parse, migrate to YAML, keep JSON
  5. If neither exists, create config.yaml with defaults

### IP-2: Config Saving (src/main/config.ts)
- `saveConfig()` function needs to:
  1. Always write to config.yaml (with comments)
  2. If config.json exists, also write to it (no comments)
  3. Use atomic write pattern (.tmp + rename)
  4. Update file hash for conflict detection

### IP-3: Relay Config Manager (src/main/nostling/relay-config-manager.ts)
- `loadRelays()` needs same YAML-first logic
- `saveRelays()` needs dual-write logic
- Hash computation works for YAML format
- Comments added to relay YAML files

### IP-4: Startup Deprecation Check
- New function to check for dual-format presence on startup
- Logs deprecation warning if both formats exist
- Called early in main process initialization

### IP-5: IPC Handlers (src/main/ipc/handlers.ts)
- No changes needed (calls loadConfig/saveConfig)
- Inherits YAML support transparently

### IP-6: Paths (src/main/paths.ts)
- No changes needed
- Config directory remains the same

## User Preferences

### UP-1: Comments in YAML
- User prefers helpful comments in YAML files
- Comments should explain each option without being verbose
- Comments should be preserved on writes when possible

### UP-2: Migration Transparency
- User wants automatic migration on first read
- User wants to keep old JSON files for downgrade safety
- User wants clear warnings about deprecated format

### UP-3: Future Auto-Removal
- User wants automatic JSON removal in "next major version"
- For this implementation: just document the plan, don't implement auto-removal
- Deprecation warning should mention this timeline

## Codebase Context

See `.exploration/yaml-config-format-context.md` for detailed exploration findings including:
- Existing migration pattern in relay-config-manager.ts (marker file, graceful degradation)
- Current backwards compatibility pattern in config.ts (field normalization)
- Property-based testing patterns with fast-check
- Hash-based conflict detection mechanism

## Related Artifacts

- **Exploration Context**: `.exploration/yaml-config-format-context.md`
- **Current Implementation**: `src/main/config.ts`, `src/main/nostling/relay-config-manager.ts`
- **Test Files**: `src/main/config.test.ts`, `src/main/nostling/relay-config-manager.test.ts`

## Out of Scope

- Automatic removal of JSON files (deferred to next major version)
- UI for managing config files
- Config file validation beyond current level
- Support for other formats (TOML, INI, etc.)
- Migration of database-stored state (theme preference, etc.) - those stay in DB
- Changes to config structure or field names
- Config file encryption or security enhancements

---

**Note**: This is a requirements specification, not an architecture design.
Edge cases, error handling details, and implementation approach will be
determined by the integration-architect during Phase 2.
