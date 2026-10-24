/** In-memory only: nothing fetched is written to disk. */
export class TtlCache {
  private readonly entries = new Map<
    string,
    { value: unknown; expires: number }
  >();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T): T {
    this.entries.set(key, { value, expires: this.now() + this.ttlMs });
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}
