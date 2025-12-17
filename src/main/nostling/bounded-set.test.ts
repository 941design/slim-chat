import { describe, it, expect } from '@jest/globals';
import { BoundedSet } from './bounded-set';

describe('BoundedSet', () => {
  it('should add and check items', () => {
    const set = new BoundedSet<string>(10);
    set.add('a');
    set.add('b');
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(false);
  });

  it('should track size correctly', () => {
    const set = new BoundedSet<string>(10);
    expect(set.size).toBe(0);
    set.add('a');
    expect(set.size).toBe(1);
    set.add('b');
    expect(set.size).toBe(2);
  });

  it('should not exceed maxSize', () => {
    const set = new BoundedSet<string>(3);
    set.add('a');
    set.add('b');
    set.add('c');
    set.add('d'); // Should evict 'a'
    expect(set.size).toBe(3);
    expect(set.has('a')).toBe(false);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(true);
    expect(set.has('d')).toBe(true);
  });

  it('should evict oldest entry when full', () => {
    const set = new BoundedSet<string>(2);
    set.add('first');
    set.add('second');
    set.add('third'); // Evicts 'first'
    expect(set.has('first')).toBe(false);
    expect(set.has('second')).toBe(true);
    expect(set.has('third')).toBe(true);
  });

  it('should move re-added items to end (LRU behavior)', () => {
    const set = new BoundedSet<string>(2);
    set.add('a');
    set.add('b');
    set.add('a'); // Move 'a' to end, 'b' is now oldest
    set.add('c'); // Should evict 'b', not 'a'
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(false);
    expect(set.has('c')).toBe(true);
  });

  it('should not increase size when adding duplicate', () => {
    const set = new BoundedSet<string>(10);
    set.add('a');
    set.add('a');
    set.add('a');
    expect(set.size).toBe(1);
  });

  it('should clear all items', () => {
    const set = new BoundedSet<string>(10);
    set.add('a');
    set.add('b');
    set.clear();
    expect(set.size).toBe(0);
    expect(set.has('a')).toBe(false);
    expect(set.has('b')).toBe(false);
  });

  it('should throw on invalid maxSize', () => {
    expect(() => new BoundedSet(0)).toThrow('maxSize must be at least 1');
    expect(() => new BoundedSet(-1)).toThrow('maxSize must be at least 1');
  });

  it('should return this from add for chaining', () => {
    const set = new BoundedSet<string>(10);
    const result = set.add('a').add('b').add('c');
    expect(result).toBe(set);
    expect(set.size).toBe(3);
  });
});
