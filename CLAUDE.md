# CLAUDE.md

Project-specific instructions for Claude Code.

## Version Tagging Convention

**Tags use semver format WITHOUT a 'v' prefix: `x.y.z`**

- Correct: `1.0.0`, `2.1.3`, `0.0.5`
- Incorrect: `v1.0.0`, `v2.1.3`, `v0.0.5`

### Why no 'v' prefix?

The release workflow (`.github/workflows/release.yml`) triggers only on tags matching `[0-9]+.[0-9]+.[0-9]+`. Tags with a 'v' prefix will not trigger automated releases.

### How to create version tags

Always use the Makefile commands which ensure consistency:

```bash
make version-patch   # 0.0.x → 0.0.x+1
make version-minor   # 0.x.0 → 0.x+1.0
make version-major   # x.0.0 → x+1.0.0
```

These commands use `npm version` with `--tag-version-prefix=""` to create tags without the 'v' prefix.

### Validation

- The pre-push git hook validates that version tags match `package.json`
- The release workflow validates tag matches `package.json` version before building

## Build Commands

```bash
make dev        # Development mode with hot reload
make build      # Production build
make test       # Unit tests
make test-e2e   # End-to-end tests
make lint       # Type checking
make package    # Create distributable packages
make release    # Full release build
```

## Architecture

Electron app with three processes:
- **Main**: Node.js backend (`src/main/`)
- **Preload**: Security bridge (`src/preload/`)
- **Renderer**: React frontend (`src/renderer/`)

## Documentation Guidelines

**specs/spec.md** — Software specification for agents
- High-level requirements, architecture, behavior, and acceptance criteria
- No concrete implementation advice unless there's a compelling functional/non-functional reason
- Avoid specific file paths, code snippets, or configuration JSON
- Focus on *what* and *why*, not *how*

**README.md** — For human readers
- Usage, installation, development workflow, and maintenance
- No implementation details; link to `docs/` for in-depth topics
- Keep command examples practical and copy-pasteable

**docs/** — Detailed guides
- Step-by-step procedures (e.g., RSA key setup, dev mode testing)
- Implementation-level documentation when depth is needed
- Technical architecture details (`docs/architecture.md`)
