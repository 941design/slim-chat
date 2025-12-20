# Nostling

A desktop messaging application built on the Nostr protocol with secure auto-updates, built with Electron, React, and TypeScript.

## Features

- **Nostr encrypted messaging** with NIP-04 encryption via nostr-tools
- **Identity management** - Create/import identities from nsec keys
- **Contact whitelist** - Only receive messages from known contacts
- **QR code contact management** - Scan QR codes via camera to add contacts or display identity npub as scannable QR code
- **Private profile sharing** - Share profile information privately with contacts via NIP-59 encrypted messages
- **Contacts panel** - View full contact profiles with disk-cached images for offline access
- **Identity profile editor** - Edit identity profiles with live preview and staged updates
- **Emoji picker** - Insert emojis into messages with WCAG Level A accessibility, keyboard navigation, and screen reader support
- **Relay connectivity** - WebSocket connections to Nostr relays with auto-reconnection
- **Relay management** - Compact table with drag-and-drop reordering, per-relay read/write policies, and live connection status
- **Offline support** - Queue messages when offline, publish when connectivity restored
- **Secure auto-updates** with RSA-4096 cryptographic verification
- **Auto-update footer** with real-time progress, configurable check intervals, and manual refresh
- **Ostrich-themed status messages** - Playful, randomly-selected status messages throughout the app
- **Theme customization** - Per-identity theme selection with 10 distinctive color schemes
- **Persistence layer** with SQLite database and automatic schema migrations
- **Cross-platform** support for macOS and Linux
- **Dev mode testing** for validating updates before release
- Built with Electron 30, React 18, and TypeScript

### Ostrich-Themed Status Messages

Throughout the app, status messages use playful ostrich-themed language instead of standard technical terms:

- Update status: "Standing tall" (up to date), "Pecking up" (downloading), "Eyes peeled" (checking)
- Nostling queue: "Flock gathered" (messages queued), "Wings spread" (sending), "Nestling in" (receiving)
- Error states: "Ruffled feathers" (errors), "Head in sand" (offline)

Each status type randomly selects from 2-3 themed alternatives on every display, keeping the experience fresh while preserving all dynamic content like versions, progress percentages, and error details.

### Theme Customization

Each identity can have its own visual theme, allowing you to distinguish identities at a glance or match your personal preferences.

**Available themes:**
- **Light** - Clean, bright interface
- **Dark** - Default dark theme
- **Sunset** - Warm oranges and pinks
- **Ocean** - Cool blues and teals
- **Forest** - Natural greens
- **Purple Haze** - Deep purples
- **Ember** - Fiery reds and oranges
- **Twilight** - Muted blues and purples
- **Mint** - Fresh mint greens
- **Amber** - Golden yellows

**To select a theme:**
1. Click the hamburger menu (three horizontal lines) in the top-right
2. Click "Theme" to open the theme selector
3. Click on any theme to apply it immediately
4. Your theme choice is saved per-identity in the database

Themes are applied instantly when selected and persist across application restarts. If you switch to a different identity, the app will display that identity's saved theme.

### Private Profile Sharing

Share your profile information privately with contacts using NIP-59 encrypted messages, without publishing to public relays.

**How it works:**
- Your private profile (name, about, picture, etc.) is shared only with your contacts via encrypted messages
- When you add a contact, they automatically receive your current private profile
- When you update your private profile, all your contacts receive the update automatically
- Contacts' profiles are received and stored privately for display

**Display name precedence:**
- Alias (if you set a custom alias for a contact) takes highest priority
- Private profile (received from the contact via encrypted message)
- Public profile (discovered from relays as kind:0 metadata)
- npub fallback (shortened npub if no profile available)

**Profile avatars:**
- Avatar displays profile picture when available, or first letter of display name
- Status badge overlay indicates profile type:
  - Shield check icon (private profile available)
  - Shield warning icon (public profile discovered)
  - Shield off icon (no profile data, using alias/npub)
- Avatars appear in identity lists, contact lists, and conversation views
- Profile pictures protected against XSS attacks through URL sanitization

**To manage your private profile:**
1. Open your identity settings
2. Edit your profile information (name, about, picture, etc.)
3. Save - your profile is automatically sent to all contacts
4. No data is published to public relays by this app

**Note:** This app never publishes kind:0 public profile events. Your private profile is shared only with contacts you explicitly add via NIP-59 encrypted messages.

### Identity Profile Editor

Edit your identity's profile information with live preview and staged updates.

**How it works:**
- Access the editor from the hamburger menu (three horizontal lines) by clicking "Edit Identity Profile"
- Edit 8 profile fields: Label, Name, About, Picture URL, Banner URL, Website, NIP-05, Lightning Address
- Changes are staged immediately as you type (Apply button enables when changes detected)
- Live image preview for Picture and Banner URL fields
- Click Apply to save changes or Cancel to discard
- Press Escape to close the panel
- Profile updates automatically sent to all contacts via encrypted messages

**To edit your profile:**
1. Click the hamburger menu in the top-right
2. Click "Edit Identity Profile"
3. Modify any profile fields
4. Click Apply to save or Cancel to discard
5. Your updated profile is automatically shared with all contacts

**Note:** The panel locks during save operations to prevent data conflicts.

### Contacts Panel

View complete contact profiles with offline-capable image caching.

**How it works:**
- Access the contacts panel from the hamburger menu by clicking "View Contact Profiles"
- View all profile fields: Name, About, Picture, Banner, Website, NIP-05, Lightning Address
- Banner displayed as header background image (social media style)
- Profile picture overlaid on banner with fallback to letter circle
- Sidebar shows contact list filtered by selected identity
- All profile images and banners cached to disk for offline access
- Cache automatically manages storage with 100MB limit using LRU eviction
- Images only re-fetched when URLs change

**To view contact profiles:**
1. Click the hamburger menu in the top-right
2. Click "View Contact Profiles"
3. Select a contact from the sidebar to view their full profile
4. Press Escape or click Cancel to return to chat view

**Cache behavior:**
- Images stored in your application data directory with secure permissions
- Cached images available offline for fast loading
- Cache automatically evicts least recently used images when approaching size limit
- All image URLs protected against XSS attacks through sanitization

**Note:** Contact profiles are read-only. You can only edit your own identity profile.

### QR Code Contact Management

Add contacts by scanning QR codes or share your identity's npub as a scannable QR code.

**To scan a contact's QR code:**
1. Open the contact management modal
2. Click the camera icon button to activate the scanner
3. Point your camera at a QR code containing a Nostr npub
4. The scanned npub will populate the input field for review
5. Verify the npub and add the contact

**To display your identity as a QR code:**
1. Navigate to the identity list
2. Click the QR code icon next to your identity
3. A modal displays your npub as a scannable QR code
4. Other users can scan this with their camera to add you as a contact

**Features:**
- Theme-aware QR codes adapt colors for light and dark themes
- Performance optimized with 20fps frame rate limiting
- Automatic camera cleanup and resource management
- Database constraint prevents duplicate contacts

### Emoji Picker

Insert emojis into messages using an integrated emoji picker with full keyboard and screen reader support.

**To insert an emoji:**
1. Click the emoji button (😀) in the bottom-right corner of the message input field
2. Browse the 26 available emojis displayed in a 4×7 grid
3. Click an emoji to insert it at the current cursor position
4. The emoji is inserted and the cursor moves to after the inserted emoji

**Keyboard navigation:**
- Arrow keys move focus between emojis (Right/Left for horizontal, Up/Down for vertical)
- Enter or Space to select the focused emoji
- Tab to navigate to the emoji button
- Click outside the picker to close without selecting

**Accessibility features:**
- WCAG Level A compliant with proper ARIA roles and labels
- Full keyboard navigation support
- Screen reader announces each emoji with descriptive labels
- Layout resilient positioning using relative units
- Theme-aware colors that adapt to selected theme

**Available emojis:** 😀 😂 😊 😢 😍 🥰 😎 🤔 👍 👋 🙏 ✌️ 👏 💪 ❤️ ✨ 🔥 💯 ✅ ❌ 🎉 💡 📌 🔔 📝 ✉️

## Quick Start

```bash
npm install
npm run dev
```

## Installation

### macOS

This app is not notarized with Apple. On first launch, macOS will block it.

1. Download the `.dmg` from the [latest release](https://github.com/941design/nostling/releases/latest)
2. Open the DMG and drag `Nostling.app` to **Applications**
3. Try opening the app (it will fail with a warning)
4. Go to **System Settings → Privacy & Security**
5. Find the blocked app message and click **"Allow Anyway"**
6. Open the app again and click **"Open"**

**Alternative**: Right-click the app → **Open** → **Open**, or run:
```bash
xattr -rd com.apple.quarantine /Applications/Nostling.app
```

### Linux

1. Download the `.AppImage` from the [latest release](https://github.com/941design/nostling/releases/latest)
2. Make executable and run:
   ```bash
   chmod +x Nostling-*.AppImage
   ./Nostling-*.AppImage
   ```

## Development

### Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start with hot reload |
| `make build` | Production build |
| `make test` | Unit tests |
| `make test-e2e` | End-to-end tests |
| `make lint` | Type checking |
| `make package` | Create distributable packages |
| `make release` | Full release build |

Run `make help` for all available commands.

### Individual Process Development

```bash
npm run dev:main      # Main process only
npm run dev:preload   # Preload script only
npm run dev:renderer  # Frontend only
```

### Testing

```bash
npm test                    # Unit tests
npm run test:watch          # Watch mode
npm run test:e2e            # E2E tests (headless)
npm run test:e2e:ui         # E2E interactive runner
npm run test:e2e:headed     # E2E with visible window
npm run test:e2e:debug      # E2E with Playwright Inspector
npm run test:e2e:docker     # E2E in Docker (simulates CI)
```

### Dev Mode Update Testing

Test the auto-update system locally before releasing:

```bash
# Basic dev mode
make dev

# Test against specific release
DEV_UPDATE_SOURCE=https://github.com/941design/nostling/releases/download/1.0.0 make dev

# Test with local manifest
DEV_UPDATE_SOURCE=file:///tmp/test-updates make dev

# Test pre-release versions
ALLOW_PRERELEASE=true make dev
```

See [docs/dev-mode-update-testing.md](docs/dev-mode-update-testing.md) for comprehensive testing guide.

## Building & Packaging

### Production Build

```bash
npm run build
```

### Create Packages

```bash
npm run package
```

Creates platform-specific distributables:
- **macOS**: DMG and ZIP
- **Linux**: AppImage

## Release Process

### Creating a Release

1. Bump version (creates tag without 'v' prefix):
   ```bash
   make version-patch   # or version-minor, version-major
   ```

2. Push to trigger automated release:
   ```bash
   git push && git push --tags
   ```

The GitHub Actions workflow will build packages, sign the manifest, and create the release.

**Important**: Tags must be `x.x.x` format (e.g., `1.0.0`), not `v1.0.0`.

### Local Release Build

```bash
make release
```

Artifacts will be in the `release/` directory.

## Configuration

The app stores configuration and data in:
- **macOS**: `~/Library/Application Support/Nostling/`
- **Linux**: `~/.config/Nostling/`

Files:
- `config.yaml` - Application configuration (YAML format with helpful comments)
- `nostling.db` - SQLite database for application state
- `identities/<id>/relays.yaml` - Per-identity relay configurations with read/write policies (YAML format)
- `image-cache/` - Cached profile images and banners with 100MB LRU limit

### Configuration Migration

The app automatically migrates configuration files from JSON to YAML format:

- **Automatic migration**: When you first run an updated version, any existing `config.json` or `relays.json` files are automatically converted to YAML format
- **Backwards compatible**: Original JSON files are preserved for downgrade safety
- **Dual-write support**: While both formats exist, the app keeps them in sync
- **Deprecation warnings**: Info messages are logged when both formats are detected
- **Safe to remove JSON**: Once you've confirmed the app works correctly, you can safely delete the old JSON files

YAML files include helpful comments explaining each configuration option. The JSON format is deprecated and will be auto-removed in the next major version

## Log Files

Logs are written to:
- **macOS**: `~/Library/Application Support/Nostling/logs/app.log`
- **Linux**: `~/.config/Nostling/logs/app.log`

Format: JSON Lines with `level`, `message`, and `timestamp` fields.

## Security

- **RSA-4096 signature verification** on all update manifests
- **SHA-256 hash verification** on downloaded artifacts
- **Version validation** prevents downgrade attacks
- **HTTPS-only** update delivery in production
- **Secure secret storage** with OS keychain integration (macOS/Linux)
- **Strict error handling** for decryption failures with no plaintext fallback

For RSA key setup, see [docs/rsa-key-setup.md](docs/rsa-key-setup.md).

### macOS Code Signing

This app is intentionally unsigned (`identity: null`). This avoids Gatekeeper issues with ad-hoc signatures on auto-updated apps. Users approve the app once during installation; subsequent updates work without additional prompts.

## Documentation

- [Architecture](docs/architecture.md) - Technical architecture and design
- [Dev Mode Update Testing](docs/dev-mode-update-testing.md) - Testing auto-updates locally
- [RSA Key Setup](docs/rsa-key-setup.md) - Cryptographic key configuration
- [E2E Tests](e2e/README.md) - End-to-end test documentation

## License

MIT
