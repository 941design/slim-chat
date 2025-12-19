# Exploration Context: P2P RTC Handshake Status

> **For integration-architect**: This captures preliminary codebase exploration.
> Trust findings for what's listed. Investigate items in "Gaps" section.

## Exploration Scope

**Feature**: Direct P2P WebRTC DataChannel connectivity with visual status indicators per contact
**Approach**: Examined NIP-59 gift-wrap infrastructure, contact management, IPC patterns, renderer state management, and UI components for status display
**Coverage assessment**: Focused scan of files directly referenced by spec requirements and similar messaging patterns (NIP-59 profile sharing)

## Findings

### Similar Features
| Feature | Location | Relevance |
|---------|----------|-----------|
| NIP-59 Profile Sharing | `/src/main/nostling/profile-sender.ts`, `/src/main/nostling/profile-receiver.ts` | Direct template for P2P signaling transport - uses same gift-wrap pattern, state tracking per contact, idempotent sends |
| Contact State Management | `/src/main/nostling/service.ts` (NostlingContact interface) | Shows how to extend contact state model with new connection statuses |
| Relay Pool Status Tracking | `/src/main/nostling/relay-pool.ts` | Pattern for connection state management, callbacks for status changes |

### Key Patterns Observed
| Pattern | Where | Notes |
|---------|-------|-------|
| **NIP-59 Gift Wrap Sending** | `profile-sender.ts:83-209` | Wraps event with `wrapEvent()`, publishes to relay pool, tracks send state in `nostr_profile_send_state` table with idempotency via content hash |
| **NIP-59 Unwrapping** | `profile-receiver.ts:73-174` | Uses `unwrapEvent()`, validates inner event kind, stores in database with UPSERT pattern |
| **IPC Domain Organization** | `ipc/handlers.ts:109-404` | Nested API structure: `nostling:domain:action` (e.g., `nostling:contacts:add`), error handling with structured responses |
| **Renderer State Management** | `renderer/nostling/state.ts` | React hook pattern with callbacks for data refresh, separate loading states per scope, IPC event subscriptions |
| **Contact Display State** | `NostlingContact` interface in `shared/types.ts:149-162` | Already has `state: 'pending' | 'connected'` field, includes profile fields populated from DB |
| **Profile Update Callbacks** | `ipc/handlers.ts:355-359`, `state.ts:538-549` | Pattern for broadcasting updates: main process event → IPC send → renderer subscription → state refresh |

### Key Files
| File | Purpose |
|------|---------|
| `/src/main/nostling/profile-sender.ts` | NIP-59 sending with state tracking - template for P2P signaling sender |
| `/src/main/nostling/profile-receiver.ts` | NIP-59 unwrapping - template for P2P signaling receiver |
| `/src/main/ipc/handlers.ts` | IPC handler registration with domain prefixes, error response patterns |
| `/src/shared/types.ts` | Shared type definitions for API contracts, contact/message/identity types |
| `/src/renderer/nostling/state.ts` | React state management hook with refresh callbacks and IPC subscriptions |
| `/src/main/nostling/service.ts` | Central orchestration layer (not yet read - 1400+ lines) |
| `/src/preload/index.ts` | Contextbridge API exposure (not yet read) |
| `/src/renderer/components/ContactsPanel/ContactsPanel.tsx` | Contact UI display (not yet read) |
| `/src/renderer/components/SidebarUserItem.tsx` | Contact list item (not yet read) |

### Potential Integration Points
| Integration Point | Existing Code | Notes |
|-------------------|---------------|-------|
| **Signaling Message Sending** | `profile-sender.ts:sendProfileToContact()` | Reuse exact pattern: wrap with NIP-59, publish via RelayPool, track state in new `p2p_connection_state` table |
| **Signaling Message Receiving** | `profile-receiver.ts:handleReceivedWrappedEvent()` + routing in `service.ts` | Extend gift-wrap processing to detect P2P message types (by inner event kind or content field), route to P2P handler |
| **Contact Data Model** | `NostlingContact` interface (`types.ts:149-162`) | Add optional fields: `p2pStatus?: 'unavailable' \| 'connecting' \| 'connected' \| 'failed'`, `p2pSessionId?: string`, `p2pLastAttempt?: string` |
| **IPC API Extension** | `ipc/handlers.ts` domain handlers | Add new domain `nostling:p2p:send-signal`, `nostling:p2p:get-status`, register in `registerHandlers()` |
| **Renderer State Hook** | `state.ts:useNostlingState()` | Add `p2pStatus` state map, `refreshP2pStatus()` callback, IPC event subscription for P2P status changes |
| **UI Status Display** | ContactsPanel, SidebarUserItem components | Add P2P status badge/dot indicator (similar to existing profile lock icon pattern) |

## Gaps & Uncertainties

**Could not determine:**
- [ ] **Process boundary for WebRTC**: Spec requires WebRTC in renderer (Chromium APIs), but unclear if Electron sandbox mode restricts UDP port binding or IPv6 enumeration - needs early prototype validation
- [ ] **IPC message flow design**: Need to design bidirectional protocol for signaling (main wraps/unwraps, renderer creates offers/answers) - race condition risks if both processes update P2P state simultaneously
- [ ] **Database schema location**: Should P2P session state persist in main process DB or stay in renderer memory? Hybrid approach likely (summary status in DB, ephemeral session state in renderer)
- [ ] **Connection initiation triggers**: Spec says "when you go online, send a message" - implementation mapping unclear (app startup? network change event? relay connection established?)
- [ ] **State propagation timing**: How does renderer know when to refresh contact list for P2P status changes? Need callback pattern similar to profile updates

**Areas not examined:**
- IPv6 address enumeration strategy (Node.js `os.networkInterfaces()` in main vs WebRTC ICE gathering in renderer)
- Retry/backoff logic for failed P2P attempts (no existing pattern in renderer, relay-pool has backoff in main)
- UI layout specifics for P2P status indicator placement (ContactsPanel structure unknown)
- Multi-instance E2E testing patterns (no existing pattern for testing WebRTC with real network)
- Error handling for WebRTC failures (connection timeout, ICE failure, etc.)

## Recommendations for Architect

Before finalizing architecture:
1. **Prototype WebRTC in renderer**: Validate that `RTCPeerConnection` works in Electron production build, especially UDP binding and IPv6 candidate gathering
2. **Design IPC signaling protocol**: Define message format for bidirectional signaling flow, avoiding race conditions
3. **Decide state persistence strategy**: Clarify DB vs memory for session state, considering restart/refresh behavior
4. **Map connection triggers**: Define exact events that initiate P2P attempts (relay connection? app online? message send?)
5. **IPv6 enumeration approach**: Choose between main process (Node.js APIs) or renderer (WebRTC APIs) for detecting global IPv6 addresses
6. **Define UI integration points**: Determine where P2P status indicator appears in ContactsPanel/SidebarUserItem layouts

---
**Explored by**: /feature router
**For use by**: integration-architect
