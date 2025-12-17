/**
 * A Set with a maximum size that evicts oldest entries (LRU) when full.
 * Uses Map insertion order for O(1) eviction of oldest entry.
 */
export class BoundedSet<T> {
  private map = new Map<T, true>();

  constructor(private maxSize: number) {
    if (maxSize < 1) {
      throw new Error('BoundedSet maxSize must be at least 1');
    }
  }

  has(key: T): boolean {
    return this.map.has(key);
  }

  add(key: T): this {
    if (this.map.has(key)) {
      // Move to end (most recently used)
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest (first entry in insertion order)
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
    this.map.set(key, true);
    return this;
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
