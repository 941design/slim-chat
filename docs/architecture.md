# Architecture

This document describes the technical architecture of Nostling.

## Electron Process Model

Nostling follows Electron's three-process architecture:

### Main Process

The Node.js backend that manages the application lifecycle, creates browser windows, and handles system-level operations.

**Responsibilities:**
- Application lifecycle management
- Window creation and management
- Auto-update orchestration and cryptographic verification
- IPC request handling
- File system access (config, logs)
- macOS DMG installation handling

**Key modules:**
- `src/main/index.ts` - Entry point, lifecycle management
- `src/main/update/` - Update controller and platform-specific handlers
- `src/main/security/` - RSA signature and hash verification
- `src/main/ipc/` - IPC handler registration
- `src/main/config.ts` - Configuration management
- `src/main/logging.ts` - Structured logging

### Preload Script

A security bridge running in an isolated context that selectively exposes APIs from the main process to the renderer.

**Security configuration:**
- `contextIsolation: true` - Isolated JavaScript context
- `nodeIntegration: false` - No Node.js APIs in renderer

**Exposed API:**
```typescript
window.api = {
  updates: {
    checkNow(): Promise<void>;
    downloadUpdate(): Promise<void>;
    restartToUpdate(): Promise<void>;
    onUpdateState(callback): () => void;
  },
  config: {
    get(): Promise<AppConfig>;
    set(config): Promise<AppConfig>;
  },
  system: {
    getStatus(): Promise<AppStatus>;
  }
}
```

### Renderer Process

The React application that users interact with. Runs in a sandboxed Chromium environment and communicates with the main process through the preload script's exposed API.

**Stack:**
- React 18 with hooks
- Chakra UI v3 for components
- TypeScript with strict mode
- Vite for bundling

**Key features:**
- Themed status messages using JSON-based configuration with runtime validation
- Memoized message selection for performance optimization

## Directory Structure

```
src/
├── main/           # Main process (Node.js)
│   ├── index.ts    # Entry point
│   ├── config.ts   # Configuration
│   ├── logging.ts  # Logging system
│   ├── ipc/        # IPC handlers
│   ├── security/   # Crypto verification
│   ├── relay/      # Relay configuration management
│   ├── update/     # Update management
│   └── nostling/   # Nostr protocol features
│       ├── profile-event-builder.ts      # Private profile event creation
│       ├── profile-sender.ts             # NIP-59 gift wrap sending
│       ├── profile-receiver.ts           # NIP-59 unwrapping
│       ├── profile-persistence.ts        # Database operations
│       ├── profile-service-integration.ts # Workflow orchestration
│       └── profile-discovery.ts          # Public profile discovery
├── preload/        # Preload script
│   └── index.ts    # API bridge
├── renderer/       # React frontend
│   ├── main.tsx    # React root
│   ├── index.html  # HTML entry
│   ├── components/ # UI components
│   │   ├── Avatar.tsx            # Base avatar with image/letter
│   │   ├── AvatarWithBadge.tsx   # Avatar + status badge
│   │   ├── avatar-icons.tsx      # Shield icon variants
│   │   ├── RelayManager.tsx      # Relay configuration UI
│   │   ├── ThemeSelector.tsx     # Theme selection UI
│   │   ├── QrCodeScanner.tsx     # Camera-based QR scanning
│   │   └── QrCodeDisplay.tsx     # QR code display modal
│   ├── themes/     # Theme system
│   │   ├── definitions.ts     # Theme registry and configs
│   │   └── useTheme.ts        # Theme application logic
│   └── utils/      # Utilities
│       ├── themed-messages.ts    # Theme configuration
│       ├── utils.themed.ts       # Update status theming
│       ├── state.themed.ts       # Nostling queue theming
│       └── url-sanitizer.ts      # XSS protection for URLs
└── shared/         # Shared types
    └── types.ts    # TypeScript definitions
```

## IPC Communication

IPC channels use domain-prefixed naming:

| Channel | Purpose |
|---------|---------|
| `system:get-status` | Get app status, logs, update state |
| `updates:check` | Trigger update check |
| `updates:download` | Start download |
| `updates:restart` | Apply update and restart |
| `config:get` | Get configuration |
| `config:set` | Update configuration |
| `relay:load` | Load relay configuration for identity |
| `relay:save` | Save relay configuration with hash verification |
| `nostling:identities:update-theme` | Update theme for identity |
| `update-state` | Broadcast state changes |

## Update System

### State Machine

The update system operates as a state machine with these phases:

1. `idle` - No update activity
2. `checking` - Checking for updates
3. `available` - Update found, awaiting user action
4. `downloading` - Download in progress
5. `downloaded` - Download complete
6. `verifying` - Cryptographic verification
7. `ready` - Verified and ready to install
8. `failed` - Error occurred

**macOS-specific phases:**
- `mounting` - DMG being mounted
- `mounted` - Finder window open for installation

### Verification Flow

1. electron-updater downloads the artifact
2. Fetch `manifest.json` from the release
3. Verify RSA-4096 signature on manifest
4. Validate version is newer than current
5. Compute SHA-256 hash of downloaded file
6. Compare hash with manifest entry
7. Apply update only if all checks pass

### Concurrency Protection

The update system includes guards to prevent race conditions:
- Only one update check at a time
- Only one download at a time
- Manual refresh disabled during active operations

## Build System

### Build Tools

| Tool | Purpose |
|------|---------|
| tsup | Bundles main and preload processes |
| Vite | Bundles renderer (React app) |
| electron-builder | Creates distributable packages |

### Build Configuration

**tsup** (`tsup.config.ts`):
- Target: Node 18
- Embeds RSA public key at build time
- External: electron, electron-updater

**Vite** (`vite.renderer.config.ts`):
- Port: 5173 (dev server)
- React plugin enabled
- Output: `dist/renderer`

### Output Structure

```
dist/
├── main/           # Main process bundle
├── preload/        # Preload script bundle
└── renderer/       # React app (HTML, JS, CSS)

release/            # After packaging
├── Nostling-x.y.z.dmg      # macOS installer
├── Nostling-x.y.z.zip      # macOS zip
├── Nostling-x.y.z.AppImage # Linux portable
└── manifest.json           # Signed manifest
```

## Security Model

### Renderer Isolation

- No direct Node.js access from renderer
- All system operations via IPC
- Typed channels with input validation
- No generic eval or dynamic code loading

### Update Security

- RSA-4096 signature verification on manifests
- SHA-256 hash verification on artifacts
- Version validation (no downgrades)
- HTTPS-only in production
- Error messages sanitized in production

### Key Management

- **Private key**: CI secret only, never in repo
- **Public key**: Embedded at build time from `keys/nostling-release.pub`
- Override via `RSA_PUBLIC_KEY` environment variable for testing

## Platform-Specific Handling

### macOS

- Uses manual DMG installation (bypasses Squirrel.Mac)
- Mounts DMG and opens Finder for drag-to-Applications
- Cleans up stale mounts on startup
- Unsigned (`identity: null`) to avoid Gatekeeper issues with auto-updates

### Linux

- AppImage format for portability
- No root required for installation or updates
- Standard electron-updater flow

## Relay Configuration System

The relay manager provides per-identity relay configuration with filesystem-based persistence and conflict detection.

### Architecture

**Filesystem-Based Storage:**
- Configuration stored at `~/.config/nostling/identities/<identityId>/relays.json`
- One file per identity, isolated from database
- Human-readable JSON format for manual editing
- Automatic directory creation on first save

**File Format:**
```json
{
  "relays": [
    {
      "url": "wss://relay.example.com",
      "read": true,
      "write": true
    }
  ]
}
```

**Hash-Based Overwrite Protection:**
- SHA-256 hash computed on load and before save
- Detects external modifications to relay configuration files
- On conflict: presents modal with Reload/Overwrite/Cancel options
- Prevents accidental loss of manual edits

**Migration from Database:**
- One-time idempotent migration from SQLite `relays` table
- Runs automatically on first relay:load for each identity
- Creates filesystem config from database records
- Database records remain unchanged (safe rollback)

### UI Components

**Compact Table Layout:**
- High-density rows (≤36px) using @tanstack/react-table
- Columns: Status indicator, URL, Read checkbox, Write checkbox, Actions
- Drag handle for reordering
- Delete button per row

**Drag-and-Drop Reordering:**
- Implemented with dnd-kit library
- Visual feedback during drag operations
- Preserves read/write policies during reorder
- Updates configuration order immediately

**Read/Write Policies:**
- Read checkbox: controls relay subscription (receiving events)
- Write checkbox: controls relay publishing (sending events)
- Independent controls per relay
- Persisted in relays.json

**Live Status Indicators:**
- Green dot: connected
- Yellow dot: connecting/reconnecting
- Red dot: disconnected/error
- Based on WebSocket connection state

### Conflict Resolution

When external modifications detected:

1. **Reload**: Discard UI changes, load file from disk
2. **Overwrite**: Save UI state, replace file contents
3. **Cancel**: Keep UI state, remain in conflict state

User must explicitly resolve conflict before saving again.

## Themed Messages System

The application uses ostrich-themed status messages throughout the UI to provide a playful, branded experience while maintaining technical clarity.

### Architecture

**Three-layer system:**

1. **Configuration Layer** (`themed-messages.ts`):
   - JSON-based theme definition with 2-3 alternatives per status type
   - Runtime validation with schema checking
   - Graceful fallback to default messages on validation failure
   - Single source of truth for all themed messages

2. **Update Status Theming** (`utils.themed.ts`):
   - Themes update-related status messages (checking, downloading, up to date, etc.)
   - Preserves dynamic content (version numbers, progress percentages, download speeds)
   - Random selection from configured alternatives on each display
   - Memoized with React.useMemo for performance

3. **Nostling Queue Theming** (`state.themed.ts`):
   - Themes Nostling message queue status (queued, sending, receiving, etc.)
   - Preserves dynamic content (message counts, error details)
   - Consistent random selection behavior
   - Integrated with queue state display components

### Message Categories

**Update Status Messages:**
- Idle states: "Standing tall", "Tall and proud", "Head held high"
- Active states: "Eyes peeled", "Pecking up", "Looking sharp"
- Error states: "Ruffled feathers", "Tangled nest"

**Nostling Queue Status:**
- Queue states: "Flock gathered", "Nestling in"
- Active states: "Wings spread", "Feathers flying"
- Completion states: "Nest secured", "Roost reached"

### Design Principles

- **Preserve technical information**: All version numbers, counts, and error details remain intact
- **Random variety**: Each display randomly selects from available alternatives to keep experience fresh
- **Graceful degradation**: Invalid configuration falls back to default messages without breaking UI
- **Performance**: Message selection memoized to avoid unnecessary recalculation
- **Testability**: Property-based tests verify message structure, dynamic content preservation, and randomness

## Theme System

The application provides per-identity theme customization with 10 distinctive color schemes, allowing users to personalize their visual experience and distinguish identities at a glance.

### Architecture

**Theme Registry:**
- Centralized theme definitions in `src/renderer/themes/definitions.ts`
- 10 predefined themes with complete Chakra UI v3 color token sets
- Each theme includes metadata for UI display (name, description, preview colors)
- Type-safe theme IDs via TypeScript union type

**Theme Application:**
- Theme stored per-identity in SQLite database (identities table, theme column)
- Automatic theme loading on identity selection
- Real-time theme switching via React state propagation
- Invalid/missing themes fall back to dark theme

**Integration Points:**
1. **Database Layer** (`src/main/ipc/nostling.ts`):
   - `identities.updateTheme(identityId, themeId)` - Persists theme to database
   - Identity records include optional `theme` field

2. **UI Layer** (`src/renderer/main.tsx`):
   - `ChakraProvider` wraps app with dynamic theme system
   - `useTheme` hook manages theme state and identity-based resolution
   - Theme changes trigger immediate UI re-render

3. **Theme Selector** (`src/renderer/components/ThemeSelector.tsx`):
   - Integrated into hamburger menu
   - Visual color swatches for each theme
   - Disabled when no identity selected
   - Immediate persistence on theme selection

### Theme Definitions

**Available Themes:**
- **Light** - Clean bright interface with dark text on light background
- **Dark** - Default dark theme with light text on dark background
- **Sunset** - Warm oranges and pinks
- **Ocean** - Cool blues and teals
- **Forest** - Natural greens
- **Purple Haze** - Deep purples
- **Ember** - Fiery reds and oranges
- **Twilight** - Muted blues and purples
- **Mint** - Fresh mint greens
- **Amber** - Golden yellows

**Color Token Requirements:**
- WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- Complete Chakra UI v3 color token set
- Compatible with all existing UI components
- Distinctive visual identity per theme

### User Workflow

1. User selects identity from identity list
2. App loads theme from database for that identity (or defaults to dark)
3. Theme system creates Chakra configuration from theme ID
4. UI re-renders with new theme applied
5. User can change theme via hamburger menu → Theme selector
6. Theme change persists to database and updates UI immediately
7. When switching identities, app applies the new identity's saved theme

### Design Principles

- **Per-identity isolation**: Each identity maintains its own theme preference
- **Immediate feedback**: Theme changes apply instantly without save button
- **Graceful fallback**: Invalid themes default to dark without breaking UI
- **Type safety**: Theme IDs validated at compile-time via TypeScript
- **Performance**: Theme system creation memoized to avoid unnecessary recalculation
- **Testability**: Property-based tests verify persistence, application, fallback, and identity switching

## QR Code Contact Management

The application provides camera-based QR code scanning for adding contacts and QR code display for sharing identity npub values.

### Architecture

**Dual Functionality:**
1. **QR Code Scanning** - Camera-based scanning to add contacts
2. **QR Code Display** - Show identity npub as scannable QR code

**Scanner Integration:**
- Integrated into contact modal via camera icon button
- Uses html5-qrcode library for cross-platform camera access
- Frame rate limited to 20fps for performance optimization
- Automatic camera cleanup on modal close or component unmount

**Display Integration:**
- Accessible from identity list via QR code icon
- Uses qrcode library to generate QR code from npub
- Rendered as canvas element in modal dialog

### Scanner Lifecycle

**Initialization:**
1. User clicks camera icon in contact modal
2. Scanner requests camera permissions
3. Camera stream starts at 20fps
4. QR code detection begins

**Detection:**
1. Frame capture and QR code detection via html5-qrcode
2. Successful detection extracts npub from QR code
3. Scanner populates npub field in contact form
4. User reviews and verifies npub before adding contact

**Cleanup:**
1. User closes modal or stops scanner
2. Camera stream stopped via html5-qrcode.stop()
3. Camera permissions released
4. Lifecycle guards prevent double-cleanup

### QR Code Display

**Generation:**
1. User clicks QR icon next to identity in identity list
2. npub extracted from identity record
3. QR code generated via qrcode.toCanvas()
4. Canvas rendered in modal dialog

**Theme Adaptation:**
- QR codes adapt colors based on current theme
- Light themes: dark foreground, light background
- Dark themes: light foreground, dark background
- Ensures scanability across all theme combinations

### Data Integrity

**Database Constraint:**
- UNIQUE constraint on (identity_id, contact_npub) in contacts table
- Prevents duplicate contacts within same identity
- Different identities can have same contact (isolation)
- Constraint enforced at database level for reliability

### Performance Optimizations

**Scanner Performance:**
- Frame rate limited to 20fps (50ms between frames)
- Prevents excessive CPU usage during scanning
- Balances detection speed with resource efficiency

**Resource Management:**
- Camera cleanup on all exit paths (modal close, unmount, error)
- Lifecycle guards prevent resource leaks
- Proper async cleanup handling

### User Workflow

**Adding Contact via QR Scan:**
1. User opens contact management modal
2. Clicks camera icon to activate scanner
3. Points camera at QR code containing npub
4. Scanner detects QR code and populates npub field
5. User reviews populated npub
6. User adds contact (duplicate detection via database constraint)

**Displaying Identity QR Code:**
1. User navigates to identity list
2. Clicks QR code icon next to desired identity
3. Modal opens showing npub as scannable QR code
4. Other users scan with their camera to add contact

### Design Principles

- **Camera lifecycle safety**: Proper cleanup on all exit paths
- **Theme consistency**: QR codes adapt to current theme colors
- **Performance**: Frame rate limiting prevents resource exhaustion
- **Data integrity**: Database constraints prevent duplicates
- **User control**: Scanner activation explicit via button click
- **Testability**: Property-based tests verify scanner lifecycle, display, theme adaptation

## Profile Avatars with Status Badges

The application displays visual profile representations with status indicators throughout the UI.

### Architecture

**Avatar Components:**

1. **Avatar.tsx**: Base avatar component
   - Displays profile picture from URL when available
   - Falls back to letter circle (first letter of display name)
   - XSS protection through URL sanitization
   - Image error handling with automatic fallback
   - Circular cropping and aspect ratio preservation

2. **AvatarWithBadge.tsx**: Avatar with profile status overlay
   - Combines base avatar with badge overlay
   - Badge positioned at top-right corner
   - Status determination based on ProfileSource
   - WCAG AA compliant contrast (4.5:1)
   - Enhanced visibility with border and shadow

3. **avatar-icons.tsx**: Status badge icon components
   - ShieldCheckIcon: Private profile (private_authored, private_received)
   - ShieldWarningIcon: Public profile (public_discovered)
   - ShieldOffIcon: No profile data (alias/npub fallback)
   - Custom SVG components following project pattern

4. **url-sanitizer.ts**: XSS protection utility
   - Validates and sanitizes profile picture URLs
   - Allows only http/https protocols
   - Prevents javascript: and data: URL attacks
   - Returns null for invalid URLs

5. **service-profile-status.ts**: Backend profile enhancement
   - Batch SQL queries for efficient profile loading
   - Enriches identity and contact records with profileSource and picture
   - Single query per list (no N+1 query problem)
   - Integration with existing list handlers

### Integration Points

**Identity List:**
- Avatar displays identity's own profile picture
- Badge shows private_authored (private profile) or public_discovered status
- 32px avatar size for list items

**Contact List:**
- Avatar displays contact's shared profile picture
- Badge shows private_received (private profile) or public_discovered status
- Same visual treatment as identity list for consistency

**Profile Data Flow:**
1. Frontend requests identity/contact list
2. Backend queries profiles table with batch SQL
3. Backend enriches records with profileSource and picture fields
4. Frontend receives complete data for rendering
5. Avatar component handles URL sanitization and fallback logic

### Design Principles

- **Security-first**: All profile picture URLs sanitized to prevent XSS
- **Graceful degradation**: Image load failures fall back to letter circle
- **Performance**: Batch queries avoid N+1 problem
- **Accessibility**: WCAG AA contrast, semantic icons, proper alt text
- **Consistency**: Same avatar treatment across all UI locations
- **Theme compatibility**: Works with all 10 theme variants

## Private Profile Sharing

The application enables private profile sharing with contacts via NIP-59 encrypted messages, without publishing profiles to public relays.

### Architecture

**Six Core Components:**

1. **profile-event-builder**: Creates private profile events (kind 30078)
   - Builds signed Nostr events with profile content
   - Ensures deterministic serialization for idempotency
   - Validates profile content structure

2. **profile-sender**: Sends private profiles via NIP-59 gift wrap
   - Wraps profile events for specific recipients
   - Publishes to configured relays
   - Handles send failures gracefully

3. **profile-receiver**: Receives and unwraps incoming profiles
   - Unwraps NIP-59 gift-wrapped messages
   - Validates signatures before storage
   - Handles invalid/malformed messages

4. **profile-persistence**: Database operations for profiles
   - Stores profiles with source tagging (private_authored, private_received, public_discovered)
   - Tracks per-contact send state
   - Records public profile presence checks

5. **profile-service-integration**: Orchestrates profile workflows
   - Coordinates sending on contact addition
   - Broadcasts updates to all contacts
   - Resolves display names with precedence rules

6. **profile-discovery**: Discovers public profiles from relays
   - Hourly checks for kind:0 metadata
   - Updates presence indicators
   - Runs on app startup

### Database Schema

**nostr_profiles:**
```sql
id TEXT PRIMARY KEY
owner_pubkey TEXT NOT NULL
source TEXT NOT NULL  -- 'private_authored' | 'private_received' | 'public_discovered'
content_json TEXT NOT NULL
event_id TEXT
valid_signature INTEGER DEFAULT 1
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

**nostr_profile_send_state:**
```sql
identity_pubkey TEXT NOT NULL
contact_pubkey TEXT NOT NULL
last_sent_profile_event_id TEXT
last_sent_profile_hash TEXT
last_attempt_at TEXT
last_success_at TEXT
last_error TEXT
PRIMARY KEY (identity_pubkey, contact_pubkey)
```

**nostr_public_profile_presence:**
```sql
pubkey TEXT PRIMARY KEY
exists INTEGER DEFAULT 0
last_checked_at TEXT
last_check_success INTEGER DEFAULT 0
last_seen_event_id TEXT
```

### Workflows

**Send on Add Contact:**
1. User adds new contact
2. System loads current private profile for identity
3. Check send state - skip if already sent this version
4. Build private profile event (kind 30078)
5. Wrap event with NIP-59 for recipient
6. Publish to configured relays
7. Record send state with profile hash

**Send on Profile Update:**
1. User updates private profile
2. Store new profile version in database
3. Load all contacts for identity
4. For each contact:
   - Build private profile event
   - Wrap with NIP-59
   - Publish to relays
   - Update send state
5. Best-effort delivery (no retry queue)

**Receive Private Profile:**
1. Receive NIP-59 wrapped message (kind 1059)
2. Unwrap to extract inner event
3. Check inner kind == 30078 (private profile)
4. Validate signature matches sender
5. Parse content as profile metadata
6. Store/replace in database as 'private_received'
7. Update display name resolution

**Display Name Resolution:**
1. Check for custom alias (highest priority)
2. Check for private profile (private_received or private_authored)
3. Check for public profile (public_discovered)
4. Fallback to npub (shortened)

### NIP-59 Integration

**Gift Wrap Process:**
- Inner event: Private profile (kind 30078) signed by sender
- Seal layer: Encrypted inner event
- Outer event: Gift wrap (kind 1059) with random keypair
- Addressed to specific recipient pubkey
- Published to configured write relays

**Unwrap Process:**
- Receive kind 1059 event
- Decrypt seal with recipient's secret key
- Extract inner event
- Validate inner event signature
- Process based on inner event kind

### Privacy Guarantees

**What is NOT published publicly:**
- Private profile events (kind 30078) - never published unwrapped
- Profile content - only transmitted via NIP-59 encryption
- List of contacts who received profiles

**What is published publicly:**
- NIP-59 gift wrap envelopes (kind 1059) - encrypted, no readable metadata
- Encrypted seal events - no plaintext content

**What is discovered publicly:**
- Public profiles (kind 0) from contacts - read-only, never published by app

### Send State Tracking

**Purpose:**
- Prevent redundant sends when re-adding contacts
- Track delivery success/failure per contact
- Enable idempotent operations

**State Fields:**
- `last_sent_profile_hash`: SHA-256 hash of sent profile content
- `last_attempt_at`: Timestamp of last send attempt
- `last_success_at`: Timestamp of successful send
- `last_error`: Error message if send failed

**Idempotency:**
- Compare current profile hash with last_sent_profile_hash
- Skip send if hashes match (already sent this version)
- Update state only on successful send

### Public Profile Discovery

**Schedule:**
- On app startup (after initialization)
- Every hour thereafter

**Process:**
1. Query configured relays for kind:0 metadata
2. For each identity and contact:
   - Fetch latest kind:0 event
   - Verify signature
   - Store content as 'public_discovered'
   - Update presence table
3. Update UI indicators based on presence

**Indicator Behavior:**
- Show indicator only after successful check confirms existence
- Hide indicator if latest check fails (no "unknown" state)
- Separate tracking for identities and contacts

### Error Handling

**Send Failures:**
- Log failure with contact pubkey and error
- Store error in send_state table
- Continue sending to remaining contacts
- Surface failure count in UI (optional)

**Receive Failures:**
- Invalid signature: discard, log warning
- Malformed content: discard, log error
- Unwrap failure: discard (not a private profile)

**Discovery Failures:**
- Relay timeout: hide presence indicator
- No kind:0 found: mark as not present
- Invalid signature: ignore event

### Design Principles

- **Privacy-first**: No public profile publishing, encrypted transmission only
- **Best-effort delivery**: No retry queues, sends once per update
- **Idempotent sends**: Track state to prevent redundant sends
- **Graceful degradation**: Send failures don't block normal operation
- **Display precedence**: Clear hierarchy (alias > private > public > npub)
- **Zero regressions**: All implementations preserve existing test suite
- **Comprehensive testing**: 121 tests (109 unit + 12 integration)
