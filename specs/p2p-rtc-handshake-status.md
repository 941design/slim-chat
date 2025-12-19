# Feature Request: Direct P2P Channel Status With Contacts (IPv6-only, Serverless)

## Summary

Add a direct peer-to-peer (P2P) connectivity feature that attempts to establish a **direct WebRTC DataChannel** between two contacts using **Nostr gift-wrapped messages** as the signaling plane. The initial goal is to **visually indicate** for each contact:

* **Connected** (mutual direct channel established)
* **Connecting** (attempt in progress)
* **Failed** (attempt unsuccessful / timed out)
* **Unavailable** (missing prerequisites, e.g., no global IPv6)

No TURN/STUN/relay services are used. No router/firewall configuration is required (best-effort).

---

## Goals

* Establish a **direct** channel attempt per contact using only:

  * Nostr gift-wrap for metadata exchange
  * direct IPv6 networking between peers for actual connectivity
* Surface a clear **per-contact status** in the UI.
* Provide a deterministic “who offers” rule (avoid glare).
* Keep exchanged metadata minimal and self-contained.
* Try to connect (send metadata offer) when:
  * you go online
  * send a message (tbd. for future, once dms are migrated to NIP-17)
* Respond when:
  * you receive an offer

## Non-goals (for this milestone)

* Routing chat messages over P2P (later)
* NAT traversal / TURN fallback (explicitly out of scope)
* Guaranteed connectivity across restrictive firewalls (not possible without servers or policy changes)

---

## Requirements & constraints

* Both peers already have asymmetric keys (Nostr identities).
* Peers **do not know their own best IPv6** a priori; they must derive it locally and share it via Nostr.
* Signaling can be **high latency**.
* Direct connectivity must not rely on any third-party infrastructure.

---

## High-level approach

Use WebRTC DataChannels for a direct encrypted link, but treat Nostr as the signaling transport.

* **Signaling plane:** gift-wrapped messages exchanged via Nostr relays (encrypted/authenticated).
* **Data plane:** direct IPv6 UDP path for ICE/DTLS/SCTP (WebRTC).
* **Connection success signal:** DataChannel reaches `open`, and both sides exchange a small “hello/ack” ping.

---

## Protocol outline

### Deterministic roles (avoid glare)

Pick roles deterministically based on pubkey ordering:

* `offerer = min(pubkeyA, pubkeyB)` (lexicographic compare)
* `answerer = max(pubkeyA, pubkeyB)`

Only the offerer creates and sends the SDP offer unless a retry window is active.

### Address/port model

We have three workable options:

**Option A: fixed port**

* Use a single UDP port (e.g., `41414`) for all contacts.
* Pros: simplest
* Cons: higher chance of conflict with local policy; can’t run multiple instances without coordination

**Option B: deterministic per-contact port**

* Derive port from `(my_pubkey, their_pubkey)` hash (e.g., map into `49152–65535`).
* Pros: spreads ports, avoids conflicts, no extra bytes on wire
* Cons: debugging slightly harder; still blocked by policies sometimes

**Option C: include port in signaling**

* Sender includes `udp_port` explicitly.
* Pros: most flexible
* Cons: slightly larger metadata, but simplest operationally (recommended if you expect troubleshooting)

Implementation hint: start with **Option C**, but allow fallback to deterministic if omitted.

---

## Signaling message formats (inside gift-wrap)

All messages are JSON. Wrap them in a custom “gift-wrapped” DM (whatever your current encryption wrapper is).

### 1) P2P capability announcement (optional but helpful)

Sent whenever a contact view is opened or periodically on network change.

```json
{
  "type": "p2p_cap",
  "v": 1,
  "ts": 1734470400,
  "nonce": "32-hex-char-random-string",
  "ipv6": ["2a02:....:...."],
  "udp_port": 56801,
  "features": ["webrtc-dc"],
  "session_hint": "random-8-16-bytes-base64"
}
```

* `ipv6` may contain multiple global addresses (prefer stable/global, filter out `fe80::/10` and ULA unless you explicitly support those).
* `udp_port` may be fixed/deterministic/explicit.

### 2) WebRTC offer

```json
{
  "type": "p2p_offer",
  "v": 1,
  "ts": 1734470400,
  "nonce": "32-hex-char-random-string",
  "session_id": "base64(16 bytes)",
  "from_ipv6": "2a02:....",
  "from_port": 56801,
  "sdp": "v=0\r\n...",
  "tie_break": "hex(pubkey_offer) or session_id"
}
```

### 3) WebRTC answer

```json
{
  "type": "p2p_answer",
  "v": 1,
  "ts": 1734470400,
  "nonce": "32-hex-char-random-string",
  "session_id": "same as offer",
  "from_ipv6": "2a02:....",
  "from_port": 56802,
  "sdp": "v=0\r\n..."
}
```

### 4) Trickle ICE candidate (optional)

Serverless + IPv6-only often works with non-trickle too, but trickle improves UX.

```json
{
  "type": "p2p_ice",
  "v": 1,
  "ts": 1734470400,
  "nonce": "32-hex-char-random-string",
  "session_id": "...",
  "candidate": "candidate:..."
}
```

### 5) Close / abort

```json
{
  "type": "p2p_close",
  "v": 1,
  "ts": 1734470400,
  "nonce": "32-hex-char-random-string",
  "session_id": "...",
  "reason": "timeout|user|superseded"
}
```

---

## WebRTC configuration (Electron renderer)

Implementation lives in the **renderer** (Chromium WebRTC API).

Suggested `RTCPeerConnection` config:

* `iceServers: []` (no STUN/TURN)
* `iceTransportPolicy: "all"` (default; we still want host candidates)
* Create one DataChannel:

  * label: `"nostr-p2p"`
  * ordered: true (default)
  * negotiated: false (simplest)

Connection success criteria:

* `pc.connectionState === "connected"` OR `dc.readyState === "open"`
* then exchange app-level `HELLO/ACK` over DataChannel to confirm mutual reachability.

Failure criteria:

* `pc.connectionState === "failed"` OR
* timeout (e.g., 12s, configurable) without reaching connected/open

**UI states map to WebRTC events:**

* Connecting: after starting attempt
* Connected: on `dc.onopen` + HELLO/ACK
* Failed: `connectionState=failed` or timeout
* Unavailable: no global IPv6 detected, or user disabled feature

---

## “No SDP in your protocol” vs reality

Even if your *protocol* only wants to exchange IPv6 + keys, the **browser WebRTC API requires SDP** as the input/output container. The practical compromise is:

* treat SDP as an opaque payload in gift-wrap
* keep it minimal (DataChannel only, no candidates in SDP if you trickle)

---

## IPv6 selection rules (local)

On each network change (and at app start), enumerate interfaces and collect candidate IPv6 addresses:

* include global unicast (typically `2000::/3`)
* exclude:

  * link-local `fe80::/10`
  * multicast `ff00::/8`
  * loopback `::1`
* prefer “stable” addresses if available (avoid rapidly rotating temporary privacy addresses if you can distinguish them; otherwise just send multiple)

If multiple addresses exist, send them all and allow the peer to try in order.

---

## Connection attempt algorithm

For a contact `(me, them)`:

1. Determine roles via pubkey order.
2. Ensure you have at least one global IPv6; otherwise status = Unavailable.
3. If you are offerer:

   * create PC + DC
   * createOffer → setLocalDescription
   * send `p2p_offer` with local IPv6 + port + SDP
   * (optional) trickle candidates as `p2p_ice`
4. If you are answerer:

   * on `p2p_offer`, create PC
   * setRemoteDescription(offer)
   * createAnswer → setLocalDescription
   * send `p2p_answer` plus trickle `p2p_ice` as they arrive
5. Both sides:

   * addIceCandidate on incoming `p2p_ice`
   * watch `connectionState`, `iceConnectionState`, and DataChannel state
   * on success: mark Connected, stop timers
   * on failure: mark Failed, optionally backoff-retry

---

## UX / UI

Per contact:

* badge or dot:

  * gray = Unavailable
  * yellow = Connecting
  * green = Connected
  * red = Failed
* tooltip text (for debugging): last failure reason (timeout, failed, missing ipv6, remote missing ipv6, glare resolution, etc.)

---

## Security considerations

* Gift-wrap already authenticates sender; still validate:

  * `session_id` matches current attempt
  * message freshness (`ts` within window, e.g., ±10 minutes)
  * **`nonce` uniqueness** - track processed (session_id, nonce) pairs to prevent replay attacks
  * **SDP format validation** - validate SDP starts with `v=0\r\n`, reasonable length (< 10KB), no malicious attributes
  * **ICE candidate validation** - validate RFC 5245 format (`candidate:...` prefix), length limits (< 2KB)

* **Input validation requirements** (all messages from Nostr relays are untrusted):
  * Validate all SDP strings before passing to `setRemoteDescription()`
  * Validate all ICE candidate strings before passing to `addIceCandidate()`
  * Reject oversized or malformed payloads with warning logs
  * Do NOT forward unsanitized WebRTC payloads across IPC boundaries

* **Rate limiting**:
  * Maximum 5 concurrent P2P connection attempts (prevents renderer resource exhaustion)
  * Batch connection attempts when coming online (avoid event loop blocking)
  * Delay between batches to maintain UI responsiveness

* Because WebRTC DTLS certs are ephemeral and browser-controlled, bind the attempt to the contact by:

  * trusting Nostr-authenticated signaling (practical)
  * (optional) store and display DTLS fingerprint for debugging, not as identity

---

## Expected limitations (must be documented)

* Direct connectivity will fail on many enterprise/hotel/mobile networks that block unsolicited inbound or outbound UDP.
* Even with IPv6, many routers/firewalls are stateful and restrictive.
* This feature is “best effort direct”.

---

## Implementation hints (Electron)

* Keep WebRTC code in renderer; expose status to main via IPC if needed.
* Persist per-contact attempt state in memory keyed by `(contact_pubkey, session_id)`.
* Add a “Reset P2P” action (clears session state, restarts attempt) for debugging.

---
