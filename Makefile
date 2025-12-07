.PHONY: help clean install dev build test lint package release sign-manifest test-e2e test-e2e-ui test-e2e-headed test-e2e-debug test-e2e-docker test-e2e-docker-clean test-all dev-update-release dev-update-prerelease dev-update-local local-release local-release-clean test-version-upgrade

.DEFAULT_GOAL := help

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

clean: ## Remove build artifacts and dependencies
	npm run clean

install: ## Install dependencies
	npm install

dev: ## Start development mode with hot reload
	npm run dev

dev-main: ## Start main process development mode only
	npm run dev:main

dev-preload: ## Start preload script development mode only
	npm run dev:preload

dev-renderer: ## Start renderer process development mode only
	npm run dev:renderer

# Dev Mode Update Testing
dev-update-release: ## Test updates against a specific GitHub release (set DEV_UPDATE_SOURCE)
	@if [ -z "$$DEV_UPDATE_SOURCE" ]; then \
		echo "Usage: DEV_UPDATE_SOURCE=https://github.com/941design/slim-chat/releases/download/v1.0.1 make dev-update-release"; \
		exit 1; \
	fi
	npm run dev

dev-update-prerelease: ## Test pre-release updates (beta, alpha, rc versions)
	ALLOW_PRERELEASE=true npm run dev

dev-update-local: ## Test updates from local file system (FR2 file:// protocol support)
	@if [ -z "$$DEV_UPDATE_SOURCE" ]; then \
		echo "Usage: DEV_UPDATE_SOURCE=file:///path/to/local/manifest make dev-update-local"; \
		echo "Example: DEV_UPDATE_SOURCE=file:///tmp/test-updates make dev-update-local"; \
		exit 1; \
	fi
	npm run dev

build: ## Build the application for production
	npm run build

build-main: ## Build main process only
	npm run build:main

build-preload: ## Build preload script only
	npm run build:preload

build-renderer: ## Build renderer process only
	npm run build:renderer

lint: ## Run type checking
	npm run lint

test: ## Run unit tests
	npm test

test-watch: ## Run unit tests in watch mode
	npm run test:watch

test-e2e: ## Run end-to-end tests with Playwright
	npm run test:e2e

test-e2e-ui: ## Run E2E tests in interactive UI mode
	npm run test:e2e:ui

test-e2e-headed: ## Run E2E tests in headed mode (visible browser)
	npm run test:e2e:headed

test-e2e-debug: ## Debug E2E tests with Playwright Inspector
	npm run test:e2e:debug

test-e2e-docker: ## Run E2E tests in Docker (simulates Ubuntu CI environment)
	npm run test:e2e:docker

test-e2e-docker-clean: ## Clean up Docker resources and test artifacts
	npm run test:e2e:docker:clean

test-all: test test-e2e ## Run all tests (unit + E2E)
	@echo "All tests completed!"

package: ## Build and package the application
	npm run package

sign-manifest: ## Generate and sign update manifest
	npm run sign:manifest

release: clean install build package sign-manifest ## Full release build (clean, install, build, package, sign)
	@echo "Release build completed successfully!"
	@echo "Artifacts available in the release/ directory"

verify: lint test-all ## Run all verification steps (lint + unit tests + E2E tests)
	@echo "All checks passed!"

ci: install verify build ## CI pipeline (install, verify, build)
	@echo "CI pipeline completed successfully!"

dist-clean: clean ## Deep clean including node_modules
	rm -rf node_modules package-lock.json
	@echo "Deep clean completed. Run 'make install' to reinstall dependencies."

# Local Release for Version Upgrade Testing
LOCAL_RELEASE_DIR ?= $(PWD)/local-release

local-release: ## Package HEAD into local directory for version upgrade testing
	@echo "Building and packaging current HEAD..."
	@echo "Output directory: $(LOCAL_RELEASE_DIR)"
	@if [ -z "$$SLIM_CHAT_RSA_PRIVATE_KEY" ]; then \
		echo ""; \
		echo "ERROR: SLIM_CHAT_RSA_PRIVATE_KEY is required to sign the manifest"; \
		echo ""; \
		echo "Usage:"; \
		echo "  export SLIM_CHAT_RSA_PRIVATE_KEY=\$$(gopass show slimchat/slimchat-release.key)"; \
		echo "  make local-release"; \
		echo ""; \
		exit 1; \
	fi
	npm run build
	npm run package
	npm run sign:manifest
	@mkdir -p $(LOCAL_RELEASE_DIR)
	@echo "Copying artifacts to $(LOCAL_RELEASE_DIR)..."
	@cp dist/manifest.json $(LOCAL_RELEASE_DIR)/ 2>/dev/null || true
	@cp dist/*.dmg $(LOCAL_RELEASE_DIR)/ 2>/dev/null || true
	@cp dist/*.zip $(LOCAL_RELEASE_DIR)/ 2>/dev/null || true
	@cp dist/*.AppImage $(LOCAL_RELEASE_DIR)/ 2>/dev/null || true
	@echo ""
	@echo "Local release created at: $(LOCAL_RELEASE_DIR)"
	@echo ""
	@echo "Contents:"
	@ls -lh $(LOCAL_RELEASE_DIR)/
	@echo ""
	@echo "Version in manifest:"
	@grep '"version"' $(LOCAL_RELEASE_DIR)/manifest.json | head -1
	@echo ""
	@echo "To test version upgrade:"
	@echo "  1. git stash (if needed)"
	@echo "  2. git checkout <older-version-tag>"
	@echo "  3. npm install"
	@echo "  4. DEV_UPDATE_SOURCE=file://$(LOCAL_RELEASE_DIR) make dev-update-local"
	@echo "  5. Click 'Check for Updates' in the app"
	@echo ""

local-release-clean: ## Remove local release directory
	rm -rf $(LOCAL_RELEASE_DIR)
	@echo "Local release directory removed."

test-version-upgrade: ## Interactive guide for testing version upgrades
	@echo ""
	@echo "=== Version Upgrade Testing Workflow ==="
	@echo ""
	@echo "This workflow tests upgrading from an older version to HEAD."
	@echo ""
	@echo "Prerequisites:"
	@echo "  - SLIM_CHAT_RSA_PRIVATE_KEY environment variable set"
	@echo "  - Clean working directory (commit or stash changes)"
	@echo ""
	@echo "Step 1: Package current HEAD as local release"
	@echo "  make local-release"
	@echo ""
	@echo "Step 2: Checkout older version"
	@echo "  git checkout v1.0.0  # or any older tag"
	@echo ""
	@echo "Step 3: Install dependencies for older version"
	@echo "  npm install"
	@echo ""
	@echo "Step 4: Run older version with local release source"
	@echo "  DEV_UPDATE_SOURCE=file://$(LOCAL_RELEASE_DIR) make dev-update-local"
	@echo ""
	@echo "Step 5: Test the update flow"
	@echo "  - Click 'Check for Updates'"
	@echo "  - Verify update is discovered"
	@echo "  - Test download and verification"
	@echo ""
	@echo "Step 6: Return to HEAD"
	@echo "  git checkout -"
	@echo "  npm install"
	@echo "  make local-release-clean  # optional cleanup"
	@echo ""
	@echo "Available tags:"
	@git tag --sort=-creatordate | head -10 || echo "  (no tags found)"
	@echo ""
