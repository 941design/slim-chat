# Docker E2E Testing Guide

This guide explains how to run E2E tests in a Docker container that simulates the GitHub Actions Ubuntu CI environment.

## Quick Start

```bash
# Run E2E tests in Docker
make test-e2e-docker
# or
npm run test:e2e:docker

# Clean up afterwards
make test-e2e-docker-clean
# or
npm run test:e2e:docker:clean
```

## What to Expect

### First Run (Initial Build)

The first time you run the Docker tests, you'll see:

1. **Docker image build** (~2-5 minutes):
   ```
   [+] Building 123.4s (15/15) FINISHED
   => [internal] load build definition
   => [internal] load .dockerignore
   => [1/8] FROM ubuntu:22.04
   => [2/8] RUN apt-get update && apt-get install...
   => [3/8] RUN curl -fsSL https://deb.nodesource.com...
   => [4/8] COPY package*.json ./
   => [5/8] RUN npm ci
   => [6/8] COPY . .
   => [7/8] RUN npm run build
   ```

2. **Container startup**:
   ```
   [+] Running 2/2
   ✔ slim-chat-e2e-test  Built
   ✔ Container slim-chat-e2e-test-1  Created
   Attaching to e2e-test-1
   ```

3. **Test execution banner**:
   ```
   ====================================
   Running E2E Tests in Docker (Ubuntu)
   ====================================

   Environment:
     - Platform: Linux...
     - Node.js: v20.x.x
     - NPM: x.x.x
     - CI: true

   Starting Xvfb and running tests...
   ```

4. **Playwright test output**:
   ```
   Running 5 tests using 1 worker

   ✓  e2e/app.spec.ts:5:7 › SlimChat Application › should launch application successfully (2s)
   ✓  e2e/window.spec.ts:5:7 › Window Management › should create window with correct properties (1s)
   ...

   5 passed (12s)
   ```

5. **Container exit**:
   ```
   e2e-test-1 exited with code 0
   ```

### Subsequent Runs (With Cache)

If you haven't changed dependencies or source code:
- Much faster (~30 seconds total)
- Docker uses cached layers
- Only rebuilds what changed

## Exit Codes

- **0**: All tests passed ✅
- **1**: Tests failed or error occurred ❌

## Inspecting Results

After running tests, check the mounted directories:

```bash
# View test results
ls -la test-results/

# Open Playwright HTML report
npx playwright show-report playwright-report/
```

## Troubleshooting

### "Starting Xvfb and running tests..." hangs

**Most common cause:** Playwright browsers aren't installed or corrupted.

**Solution:** Rebuild the Docker image from scratch:
```bash
make test-e2e-docker-clean
docker-compose -f docker-compose.e2e.yml build --no-cache
make test-e2e-docker
```

### "Attaching to e2e-test-1" hangs

**Possible causes:**
1. Tests are running but output is buffered (wait a bit)
2. Build is still in progress (watch Docker build logs)
3. Container crashed (check with `docker ps -a`)

**Solutions:**
```bash
# Check container status
docker ps -a | grep slim-chat-e2e-test

# View container logs
docker logs slim-chat-e2e-test

# View real-time logs
docker logs -f slim-chat-e2e-test

# Enter the container for debugging
docker run -it --rm \
  --entrypoint /bin/bash \
  slim-chat-e2e-test
```

### Tests fail in Docker but pass locally

This usually means:
- Linux-specific issue (which is what we want to catch!)
- Missing dependency in Dockerfile
- Timing/race condition that manifests in CI

Check the test output and `test-results/` for details.

### Build is too slow

**Speed up builds:**

1. **Don't rebuild unnecessarily** - If you only changed test code, rebuild:
   ```bash
   docker-compose -f docker-compose.e2e.yml build
   ```

2. **Use BuildKit** for better caching:
   ```bash
   DOCKER_BUILDKIT=1 docker-compose -f docker-compose.e2e.yml up --build
   ```

3. **Clean Docker cache** if it's corrupted:
   ```bash
   docker builder prune
   ```

### Out of disk space

Docker images can accumulate:

```bash
# See Docker disk usage
docker system df

# Clean up everything (careful!)
docker system prune -a

# Or just clean test containers
make test-e2e-docker-clean
```

## Comparing with CI

The Docker environment closely matches GitHub Actions Ubuntu runner:
- ✅ Ubuntu 22.04
- ✅ Node.js 20.x
- ✅ Xvfb with same configuration
- ✅ Same CI environment variables
- ✅ Same Electron/Chromium dependencies

**Minor differences:**
- GitHub Actions has more CPU/memory
- Some timing differences possible
- Network configuration may differ

## Advanced Usage

### Run specific test file

Modify the CMD in the container:

```bash
docker run --rm \
  -v $(pwd)/test-results:/app/test-results \
  -v $(pwd)/playwright-report:/app/playwright-report \
  --shm-size=2gb \
  -e CI=true \
  slim-chat-e2e-test \
  xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" \
  npx playwright test e2e/app.spec.ts
```

### Debug mode

```bash
docker run --rm -it \
  -v $(pwd)/test-results:/app/test-results \
  --shm-size=2gb \
  -e CI=true \
  slim-chat-e2e-test \
  /bin/bash

# Then inside container:
xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" \
  npx playwright test --debug
```

### Rebuild from scratch

```bash
# Remove all cached layers
docker-compose -f docker-compose.e2e.yml build --no-cache

# Or rebuild just one layer
docker-compose -f docker-compose.e2e.yml build --pull
```

## Integration with CI

The Docker setup helps you:
1. **Debug CI failures locally** - Reproduce the exact environment
2. **Test before pushing** - Catch Linux-specific issues early
3. **Verify fixes** - Ensure your fix works in CI environment
4. **Develop confidently** - No more "works on my machine" issues
