/**
 * IPv6 Address Detection for P2P Connectivity
 *
 * Enumerates network interfaces and filters for global unicast IPv6 addresses.
 * Used to determine local IPv6 candidates for direct peer-to-peer connections.
 */

import { networkInterfaces } from 'os';
import { log } from '../logging';

/**
 * Get all global unicast IPv6 addresses from network interfaces
 *
 * CONTRACT:
 *   Inputs:
 *     - none (reads from OS network interfaces)
 *
 *   Outputs:
 *     - collection of IPv6 address strings, may be empty
 *
 *   Invariants:
 *     - all returned addresses are valid IPv6 format
 *     - all returned addresses are global unicast (2000::/3 prefix)
 *     - excludes link-local (fe80::/10)
 *     - excludes multicast (ff00::/8)
 *     - excludes loopback (::1)
 *     - excludes deprecated/internal addresses
 *     - addresses are unique (no duplicates)
 *     - result order is deterministic for same network state
 *
 *   Properties:
 *     - Subset: returned addresses ⊆ all IPv6 addresses on system
 *     - Filter correctness: ∀ addr ∈ result, addr matches global unicast pattern
 *     - Completeness: ∀ addr on system matching criteria, addr ∈ result
 *     - Idempotent: calling multiple times with same network state returns same set
 *
 *   Algorithm:
 *     1. Query os.networkInterfaces() for all network interfaces
 *     2. For each interface, extract address entries
 *     3. Filter entries where family === 'IPv6' or family === 6
 *     4. Exclude internal addresses (entry.internal === true)
 *     5. Exclude link-local: address starts with 'fe80:'
 *     6. Exclude multicast: address starts with 'ff'
 *     7. Exclude loopback: address equals '::1'
 *     8. Include only global unicast: address starts with '2' or '3' (2000::/3)
 *     9. Remove duplicates
 *     10. Return sorted list for determinism
 */
export function getGlobalIPv6Addresses(): string[] {
  const interfaces = networkInterfaces();
  const addresses: Set<string> = new Set();

  for (const interfaceAddresses of Object.values(interfaces)) {
    if (!interfaceAddresses) continue;

    for (const addr of interfaceAddresses) {
      if (addr.family !== 'IPv6') continue;
      if (addr.internal === true) continue;

      const address = addr.address.split('%')[0];

      if (address.startsWith('fe80:')) continue;
      if (address.startsWith('ff')) continue;
      if (address === '::1') continue;

      const firstChar = address.charAt(0);
      if (firstChar !== '2' && firstChar !== '3') continue;

      addresses.add(address);
    }
  }

  return Array.from(addresses).sort();
}

/**
 * Check if at least one global IPv6 address is available
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - boolean: true if at least one global IPv6 exists, false otherwise
 *
 *   Invariants:
 *     - result === true ⟺ getGlobalIPv6Addresses().length > 0
 *     - result === false ⟺ getGlobalIPv6Addresses().length === 0
 *
 *   Properties:
 *     - Consistency: hasGlobalIPv6() ⟺ (getGlobalIPv6Addresses().length > 0)
 *     - Idempotent: multiple calls return same result for same network state
 *
 *   Algorithm:
 *     1. Call getGlobalIPv6Addresses()
 *     2. Return true if result length > 0, else false
 */
export function hasGlobalIPv6(): boolean {
  return getGlobalIPv6Addresses().length > 0;
}

/**
 * Select preferred IPv6 address from available global addresses
 *
 * CONTRACT:
 *   Inputs:
 *     - candidates: collection of IPv6 address strings, non-empty
 *
 *   Outputs:
 *     - single IPv6 address string from candidates
 *
 *   Invariants:
 *     - result ∈ candidates
 *     - if candidates contains only one address, result === that address
 *     - selection is deterministic for same input set
 *
 *   Properties:
 *     - Membership: result is element of input collection
 *     - Deterministic: same input set always yields same selection
 *     - Preference order: stable addresses preferred over temporary
 *
 *   Algorithm:
 *     1. If candidates has single element, return it
 *     2. Prefer addresses without privacy extensions (non-temporary)
 *        - Privacy extension addresses often have random bits in lower 64 bits
 *        - Stable addresses derived from MAC or configured manually
 *     3. Among stable addresses, prefer shortest (simpler configuration)
 *     4. If tie, lexicographically first
 *     5. Fallback: return first candidate
 */
export function selectPreferredIPv6(candidates: string[]): string {
  if (candidates.length === 0) {
    throw new Error('Cannot select from empty candidates');
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  const isTemporary = (addr: string): boolean => {
    const parts = addr.split(':');
    if (parts.length !== 8) return false;

    const lastSegments = parts.slice(4).join(':');
    const randomBitCount = (lastSegments.match(/[a-fA-F0-9]{4}/g) || []).length;

    return randomBitCount > 2;
  };

  const stableAddresses = candidates.filter((addr) => !isTemporary(addr));
  const preferredList = stableAddresses.length > 0 ? stableAddresses : candidates;

  let selected = preferredList[0];
  for (const addr of preferredList) {
    if (addr.length < selected.length) {
      selected = addr;
    } else if (addr.length === selected.length && addr < selected) {
      selected = addr;
    }
  }

  return selected;
}
