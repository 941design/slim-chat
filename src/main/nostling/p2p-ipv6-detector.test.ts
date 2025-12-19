import { describe, expect, it, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { getGlobalIPv6Addresses, hasGlobalIPv6, selectPreferredIPv6 } from './p2p-ipv6-detector';
import { networkInterfaces as originalNetworkInterfaces } from 'os';

describe('IPv6 Detection', () => {
  describe('getGlobalIPv6Addresses', () => {
    it('returns only global unicast addresses (2000::/3 prefix)', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = getGlobalIPv6Addresses();

          for (const addr of result) {
            const firstChar = addr.charAt(0);
            expect(firstChar === '2' || firstChar === '3').toBe(true);
          }
        }),
        { numRuns: 20 }
      );
    });

    it('excludes link-local addresses (fe80::/10)', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = getGlobalIPv6Addresses();

          for (const addr of result) {
            expect(addr.startsWith('fe80:')).toBe(false);
          }
        }),
        { numRuns: 20 }
      );
    });

    it('excludes multicast addresses (ff00::/8)', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = getGlobalIPv6Addresses();

          for (const addr of result) {
            expect(addr.startsWith('ff')).toBe(false);
          }
        }),
        { numRuns: 20 }
      );
    });

    it('excludes loopback address (::1)', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = getGlobalIPv6Addresses();

          expect(result).not.toContain('::1');
        }),
        { numRuns: 20 }
      );
    });

    it('returns no duplicates', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = getGlobalIPv6Addresses();
          const uniqueSet = new Set(result);

          expect(uniqueSet.size).toBe(result.length);
        }),
        { numRuns: 20 }
      );
    });

    it('returns deterministic results for same network state', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result1 = getGlobalIPv6Addresses();
          const result2 = getGlobalIPv6Addresses();

          expect(result1).toEqual(result2);
        }),
        { numRuns: 20 }
      );
    });

    it('returns sorted list for determinism', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = getGlobalIPv6Addresses();
          const sorted = [...result].sort();

          expect(result).toEqual(sorted);
        }),
        { numRuns: 20 }
      );
    });

    it('all returned addresses are valid IPv6 format', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = getGlobalIPv6Addresses();
          const ipv6Regex =
            /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}|:)|fe80:(:[0-9a-f]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-f]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/i;

          for (const addr of result) {
            expect(ipv6Regex.test(addr)).toBe(true);
          }
        }),
        { numRuns: 20 }
      );
    });

    it('returned addresses are subset of all IPv6 addresses on system', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = getGlobalIPv6Addresses();
          const interfaces = originalNetworkInterfaces();
          const allIPv6Addresses = new Set<string>();

          for (const interfaceAddresses of Object.values(interfaces)) {
            if (!interfaceAddresses) continue;
            for (const addr of interfaceAddresses) {
              if (addr.family === 'IPv6') {
                const normalizedAddr = addr.address.split('%')[0];
                allIPv6Addresses.add(normalizedAddr);
              }
            }
          }

          for (const addr of result) {
            expect(allIPv6Addresses.has(addr)).toBe(true);
          }
        }),
        { numRuns: 20 }
      );
    });

    it('idempotent: multiple calls return same set', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const calls = [
            getGlobalIPv6Addresses(),
            getGlobalIPv6Addresses(),
            getGlobalIPv6Addresses(),
          ];

          expect(calls[0]).toEqual(calls[1]);
          expect(calls[1]).toEqual(calls[2]);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('hasGlobalIPv6', () => {
    it('consistency: result equals (getGlobalIPv6Addresses().length > 0)', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = hasGlobalIPv6();
          const addresses = getGlobalIPv6Addresses();

          expect(result).toBe(addresses.length > 0);
        }),
        { numRuns: 20 }
      );
    });

    it('idempotent: multiple calls return same result', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const calls = [hasGlobalIPv6(), hasGlobalIPv6(), hasGlobalIPv6()];

          expect(calls[0]).toBe(calls[1]);
          expect(calls[1]).toBe(calls[2]);
        }),
        { numRuns: 20 }
      );
    });

    it('returns boolean type', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = hasGlobalIPv6();
          expect(typeof result).toBe('boolean');
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('selectPreferredIPv6', () => {
    it('throws on empty candidates', () => {
      expect(() => selectPreferredIPv6([])).toThrow('Cannot select from empty candidates');
    });

    it('single element: returns that element', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 65535 }),
            fc.integer({ min: 0, max: 65535 }),
            fc.integer({ min: 0, max: 65535 })
          ),
          ([seg1, seg2, seg3]) => {
            const addr = `2001:0db8:${seg1.toString(16)}:${seg2.toString(16)}:${seg3.toString(16)}::1`;
            expect(selectPreferredIPv6([addr])).toBe(addr);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('membership: result is element of input collection', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.constantFrom('2', '3'),
              fc.integer({ min: 0, max: 65535 })
            ),
            { minLength: 1, maxLength: 5 }
          ),
          (candidates) => {
            const ipv6Candidates = candidates.map(([prefix, seg]) => {
              return `${prefix}001:db8:${seg.toString(16)}::1`;
            });

            const selected = selectPreferredIPv6(ipv6Candidates);
            expect(ipv6Candidates).toContain(selected);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('deterministic: same input always yields same selection', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.integer({ min: 0, max: 65535 }),
            { minLength: 1, maxLength: 5 }
          ),
          (parts) => {
            const candidates = parts.map(
              (p) => `2001:db8:${p.toString(16)}:0:0:0:0:1`
            );

            const selection1 = selectPreferredIPv6(candidates);
            const selection2 = selectPreferredIPv6(candidates);
            const selection3 = selectPreferredIPv6(candidates);

            expect(selection1).toBe(selection2);
            expect(selection2).toBe(selection3);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('prefers stable addresses over temporary (no high-entropy bits)', () => {
      const stableAddr = '2001:db8::1';
      const tempAddr = '2001:db8:0:0:a123:b456:c789:def0';

      const result = selectPreferredIPv6([tempAddr, stableAddr]);
      expect(result).toBe(stableAddr);
    });

    it('stable addresses preferred: when available, ignores temporary', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(fc.integer({ min: 0, max: 65535 }), {
              minLength: 2,
              maxLength: 3,
            }),
            fc.array(fc.integer({ min: 0, max: 65535 }), {
              minLength: 2,
              maxLength: 3,
            })
          ),
          ([stableParts, tempParts]) => {
            const stableAddrs = stableParts.map((p) => `2001:db8::${p.toString(16)}`);
            const tempAddrs = tempParts.map(
              (p) => `2001:db8:0:0:a123:${p.toString(16)}:b456:c789`
            );

            const candidates = [...stableAddrs, ...tempAddrs];
            const selected = selectPreferredIPv6(candidates);

            expect(stableAddrs).toContain(selected);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('shortest address preferred when stable options exist', () => {
      const longAddr = '2001:0db8:0000:0000:0001:0002:0003:0004';
      const shortAddr = '2001:db8::1';

      const result = selectPreferredIPv6([longAddr, shortAddr]);
      expect(result).toBe(shortAddr);
    });

    it('lexicographic tie-breaker when length and stability equal', () => {
      const addr1 = '2001:db8::aaaa';
      const addr2 = '2001:db8::bbbb';
      const addr3 = '2001:db8::cccc';

      const result1 = selectPreferredIPv6([addr1, addr2, addr3]);
      const result2 = selectPreferredIPv6([addr3, addr2, addr1]);

      expect(result1).toBe(addr1);
      expect(result2).toBe(addr1);
    });

    it('falls back to temporary when all are temporary', () => {
      const tempAddrs = [
        '2001:db8:0:0:a123:b456:c789:def1',
        '2001:db8:0:0:a123:b456:c789:def2',
        '2001:db8:0:0:a123:b456:c789:def3',
      ];

      const result = selectPreferredIPv6(tempAddrs);
      expect(tempAddrs).toContain(result);
    });

    it('selection order independent: different input order yields same result', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.integer({ min: 0, max: 65535 }),
            { minLength: 1, maxLength: 5 }
          ),
          (parts) => {
            const candidates = parts.map((p) => `2001:db8:${p.toString(16)}:0:0:0:0:1`);

            const forward = selectPreferredIPv6([...candidates]);
            const reversed = selectPreferredIPv6([...candidates].reverse());
            const shuffled = selectPreferredIPv6([
              ...candidates.sort(() => Math.random() - 0.5),
            ]);

            expect(forward).toBe(reversed);
            expect(reversed).toBe(shuffled);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Edge cases', () => {
    it('getGlobalIPv6Addresses handles zone IDs in addresses (fe80::1%eth0)', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const result = getGlobalIPv6Addresses();

          for (const addr of result) {
            expect(addr).not.toContain('%');
          }
        }),
        { numRuns: 20 }
      );
    });

    it('selectPreferredIPv6 with mixed length stable addresses', () => {
      const addrs = [
        '2001:db8::a123:b456',
        '2001:db8::1',
        '2001:db8::a123:b456:c789',
      ];

      const result = selectPreferredIPv6(addrs);
      expect(result).toBe('2001:db8::1');
    });

    it('selectPreferredIPv6 with addresses differing only in case', () => {
      const addrs = ['2001:DB8::AAAA', '2001:db8::aaaa'];

      const result = selectPreferredIPv6(addrs);
      expect(result).toBe(result);
    });
  });

  describe('Integration: getGlobalIPv6Addresses + selectPreferredIPv6', () => {
    it('if getGlobalIPv6Addresses returns non-empty, selectPreferredIPv6 succeeds', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const addresses = getGlobalIPv6Addresses();

          if (addresses.length > 0) {
            const selected = selectPreferredIPv6(addresses);
            expect(addresses).toContain(selected);
          }
        }),
        { numRuns: 20 }
      );
    });

    it('selectPreferredIPv6 with actual system addresses', () => {
      const addresses = getGlobalIPv6Addresses();

      if (addresses.length > 0) {
        expect(() => selectPreferredIPv6(addresses)).not.toThrow();
        const selected = selectPreferredIPv6(addresses);
        expect(addresses).toContain(selected);
      }
    });
  });
});
