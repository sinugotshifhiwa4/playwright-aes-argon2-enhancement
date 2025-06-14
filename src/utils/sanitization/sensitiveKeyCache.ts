export class SensitiveKeyCache {
  private static cache = new Map<string, boolean>();
  private static cacheSize = 1000; // Limit cache size

  static isSensitive(key: string, sensitiveKeys: string[]): boolean {
    const cacheKey = `${key.toLowerCase()}_${sensitiveKeys.length}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const result = sensitiveKeys.some((sensitiveKey) =>
      key.toLowerCase().includes(sensitiveKey.toLowerCase()),
    );

    // Manage cache size
    if (this.cache.size >= this.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  static clearCache(): void {
    this.cache.clear();
  }
}
