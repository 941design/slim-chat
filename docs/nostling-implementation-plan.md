# Nostling MVP Implementation Plan

This document lists the exact tasks required to start implementing the Nostr client MVP described in `specs/nostling.md`. Tasks are ordered top-to-bottom to match the expected execution flow. Status values will be updated as work progresses.

## Task Legend
- **Not Started** – work has not begun.
- **In Progress** – actively being implemented.
- **Blocked** – paused pending a dependency or decision.
- **Done** – task completed and verified.

## Execution Plan

1. **Review existing application architecture and constraints**
   - Confirm Electron/React separation, IPC patterns, database migration workflow, and Chakra UI conventions to avoid architecture changes.
   - Identify existing logging, persistence, and configuration hooks that nostling features should reuse.
   - **Status:** Done

2. **Define shared nostling domain types**
   - Add shared TypeScript interfaces/enums for identities, contacts, messages, relay settings, and whitelist state in `src/shared/types.ts` (or a new shared module if needed).
   - Ensure types cover data model fields from the spec (npub, secret refs, pending/connected states, message statuses, timestamps).
   - **Status:** Done

3. **Design persistence schema and migrations**
   - Extend the SQLite migration stack under `src/main/database/migrations` to create tables for identities, contacts, messages, and relay settings.
   - Include indexes needed for common lookups (by identity/contact, timestamps, message status queueing).
   - Keep migration structure consistent with existing generated/recorded format.
   - **Status:** Done

4. **Implement secret-store abstraction**
   - Create a pluggable secret-store interface in the main process for managing private keys (local encrypted storage default; hook points for external stores later).
   - Store only references in config/db while keeping keys out of app config when external store is active.
   - **Status:** Done

5. **Main-process nostling services**
   - Build a nostr service in the main process responsible for:
     - Managing identities and contacts (create/import, remove, pending/connected transitions).
     - Handling the handshake flow (welcome message send/receive, mutual connection detection).
     - Managing a message queue with offline support and relay publish/subscribe filters (kind 4 only).
     - Enforcing whitelist filtering and discarding unknown senders with logging hooks.
   - Integrate with existing logging and persistence layers.
   - **Status:** In Progress

6. **IPC and preload contracts for nostling**
   - Define IPC channels for nostling operations (identities, contacts, messages, relay config) following the existing domain-prefixed handler style.
   - Expose strongly typed APIs through the preload bridge without altering existing update/config APIs.
   - **Status:** Not Started

7. **Renderer state and data-fetching layer**
   - Add client-side state hooks/services to load and mutate nostling data via the preload APIs.
   - Ensure offline/queue status is visible and error surfaces go through the existing footer/logging patterns.
   - **Status:** Not Started

8. **Renderer UI: sidebar and identity/contact workflows**
   - Replace placeholder sidebar with identity list and contact list (pending/connected indicators) as described in the spec.
   - Implement create/import identity modal and add-contact (scan/paste npub) modal flows using Chakra UI conventions.
   - **Status:** Not Started

9. **Renderer UI: messaging pane**
   - Build threaded conversation view with incoming/outgoing grouping, timestamps, and status badges (queued/sending/sent/error).
   - Add message composer with offline queue awareness and controls wired to the nostling message API.
   - **Status:** Not Started

10. **Relay configuration UI**
    - Add a renderer surface (likely under existing Electron menu or a small settings section) to view/edit relay list per spec while reusing config patterns.
    - **Status:** Not Started

11. **Error handling and logging pass**
    - Ensure nostling flows log via the existing main-process logger and surface non-blocking footer messages in the renderer.
    - Verify unknown sender handling, relay errors, and decryption failures follow spec (silent discard + log).
    - **Status:** Not Started

12. **Testing and validation**
    - Add unit tests for new services (secret store, nostr service, database migrations) and renderer components where feasible.
    - Include basic integration/IPC tests to confirm handshake/queue logic and whitelist enforcement.
    - **Status:** Not Started
