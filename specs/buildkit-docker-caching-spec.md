# BuildKit Docker Caching for E2E Tests

## Problem Statement

The e2e test Docker build (`npm run test:e2e:docker`) downloads ~550-850 MB on every rebuild:

| Component | Size |
|-----------|------|
| npm dependencies | ~300-500 MB |
| Playwright Chromium | ~150-200 MB |
| Ubuntu apt packages | ~100-150 MB |

This wastes bandwidth and time, especially when only source code changes — not dependencies.

### Root Cause

1. The `--build` flag in `test:e2e:docker` forces a rebuild every run
2. Docker layer caching is invalidated when any source file changes
3. No persistent caching for npm, Playwright, or apt downloads

## Requirements

### Functional Requirements

1. **FR-1**: Subsequent Docker builds SHALL reuse cached npm packages when `package.json` has not changed
2. **FR-2**: Subsequent Docker builds SHALL reuse cached Playwright browser binaries when Playwright version has not changed
3. **FR-3**: Subsequent Docker builds SHALL reuse cached apt packages
4. **FR-4**: Cache invalidation SHALL occur automatically when dependency versions change
5. **FR-5**: The solution SHALL work transparently with existing `npm run test:e2e:docker` command

### Non-Functional Requirements

1. **NFR-1**: First build on a clean system MAY take the same time as current implementation
2. **NFR-2**: Subsequent rebuilds with unchanged dependencies SHALL complete without network downloads for cached components
3. **NFR-3**: Solution SHALL be compatible with Docker version 23.0+
4. **NFR-4**: Solution SHALL not require changes to CI pipeline for local development benefits
5. **NFR-5**: Cache storage SHALL be managed by Docker (no manual cleanup required)

## Solution Overview

Implement BuildKit cache mounts in `Dockerfile.e2e` to persist package manager caches across builds.

### Affected Files

- `Dockerfile.e2e` — Add BuildKit syntax and cache mount directives

### Implementation Details

#### 1. Enable BuildKit Syntax

Add at the very top of `Dockerfile.e2e`:

```dockerfile
# syntax=docker/dockerfile:1
```

#### 2. Cache apt Packages

Replace current apt-get installation with cache-mounted version:

```dockerfile
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache && \
    apt-get update && apt-get install -y \
    curl \
    git \
    xvfb \
    # ... rest of packages
    && rm -rf /var/lib/apt/lists/*
```

Note: The `rm -rf /var/lib/apt/lists/*` at the end clears the package lists (metadata) but the actual `.deb` files in `/var/cache/apt` remain in the cache mount.

#### 3. Cache npm Packages

Replace current npm ci with:

```dockerfile
RUN --mount=type=cache,target=/root/.npm \
    echo "==> Installing npm dependencies..." && npm ci
```

#### 4. Cache Playwright Browsers

Replace current Playwright install with:

```dockerfile
RUN --mount=type=cache,target=/root/.cache/ms-playwright \
    echo "==> Installing Playwright browsers..." && \
    npx playwright install --with-deps chromium
```

### Cache Mount Behavior

| Mount Target | Contents | Persistence |
|--------------|----------|-------------|
| `/var/cache/apt` | Downloaded .deb packages | Survives rebuilds |
| `/root/.npm` | npm package tarballs | Survives rebuilds |
| `/root/.cache/ms-playwright` | Playwright browser binaries | Survives rebuilds |

### Layer Invalidation vs Cache Mounts

Even when a Docker layer is invalidated (e.g., `COPY . .` changes), cache mounts are still available:

```
Build 1: Downloads everything → populates cache mounts
Build 2: Layer invalidated → cache mounts still have packages → minimal downloads
```

## Acceptance Criteria

1. **AC-1**: Running `npm run test:e2e:docker` twice in succession with no dependency changes results in zero npm/Playwright downloads on the second run
2. **AC-2**: Modifying a source file (not `package.json`) and rebuilding does not trigger npm package downloads
3. **AC-3**: Changing a dependency version in `package.json` correctly downloads only the changed package
4. **AC-4**: Running `docker builder prune` clears the caches (standard Docker cache management)
5. **AC-5**: Build succeeds on Docker version 23.0+

## Verification

### Manual Verification

```bash
# Clean state
docker builder prune -af

# First build (downloads everything)
npm run test:e2e:docker
# Observe: Full downloads of npm, Playwright, apt

# Modify a source file
echo "// comment" >> src/main/index.ts

# Second build (should use cache)
npm run test:e2e:docker
# Observe: "npm ci" runs but uses cached packages (no download progress bars)
# Observe: "playwright install" runs but uses cached browser (instant completion)

# Revert change
git checkout src/main/index.ts
```

### Observing Cache Hits

npm cache hit indicators:
- No download progress bars during `npm ci`
- Significantly faster completion time

Playwright cache hit indicators:
- Output shows "chromium is already installed"
- Or near-instant completion without download progress

## Out of Scope

1. **CI caching** — GitHub Actions cache integration requires additional workflow configuration (`docker/build-push-action` with `cache-from`/`cache-to`). This is a separate concern.
2. **Pre-built base images** — Using `mcr.microsoft.com/playwright` as base image is a valid alternative but changes the Dockerfile structure significantly.
3. **Removing `--build` flag** — Splitting into separate build/run commands is a workflow change, not a caching improvement.
4. **Multi-stage builds** — Does not address the download problem; orthogonal optimization.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docker version < 23.0 | BuildKit syntax not recognized | Document minimum Docker version; BuildKit available since Docker 18.09 with `DOCKER_BUILDKIT=1` |
| Cache corruption | Build failures | `docker builder prune` clears caches; caches are not critical data |
| Disk space accumulation | Cache grows unbounded | Docker manages cache with LRU eviction; manual prune available |
| Cache mount not supported in rootless Docker | Feature may not work | Rare edge case; document limitation |

## Dependencies

- Docker version 23.0+ (or 18.09+ with `DOCKER_BUILDKIT=1` environment variable)
- No additional software dependencies

## Effort Estimate

Minimal code changes — approximately 10-15 lines modified in `Dockerfile.e2e`.
