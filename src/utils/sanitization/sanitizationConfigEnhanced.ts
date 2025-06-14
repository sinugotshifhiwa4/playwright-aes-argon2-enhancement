import {
  SanitizationReport,
  EnhancedSanitizationParams,
} from '../../config/types/config/sanitization.types';
import { SensitiveKeyCache } from './sensitiveKeyCache';
import { DefaultSensitiveKeys, MaskValue, neverTruncateDefaultKeys } from './sanitizationDefaults';
import ErrorHandler from '../errors/errorHandler';
import logger from '../logging/loggerManager';

export default class SanitizationConfigEnhanced {
  private static defaultSanitizationParams: EnhancedSanitizationParams = {
    sensitiveKeys: DefaultSensitiveKeys,
    maskValue: MaskValue,
    truncateUrls: false,
    maxStringLength: 1000,
    neverTruncateKeys: neverTruncateDefaultKeys,
    enablePatternDetection: true,
    customPatterns: [],
    reportingEnabled: false,
    maxDepth: 10,
    chunkSize: 1000,
  };

  // Default sensitive patterns
  private static defaultSensitivePatterns: RegExp[] = [
    // Credit card patterns (basic)
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
    // SSN pattern
    /\b\d{3}-\d{2}-\d{4}\b/,
    // Email pattern (if you want to detect/mask emails)
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    // JWT pattern
    /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,
    // Base64 encoded strings (potential secrets)
    /^[A-Za-z0-9+/]{20,}={0,2}$/,
    // AWS Access Key pattern
    /AKIA[0-9A-Z]{16}/,
    // GitHub token pattern
    /ghp_[0-9a-zA-Z]{36}/,
    // API key patterns
    /sk_[a-zA-Z0-9]{32,}/,
    /pk_[a-zA-Z0-9]{32,}/,
  ];

  /**
   * Updates the default sanitization parameters
   * @param params Partial sanitization parameters to update
   */
  public static updateDefaultParams(params: Partial<EnhancedSanitizationParams>): void {
    try {
      if (!params || typeof params !== 'object') {
        logger.warn('Invalid sanitization parameters provided, skipping update');
        return;
      }

      this.defaultSanitizationParams = {
        ...this.defaultSanitizationParams,
        ...params,
      };

      logger.debug('Sanitization parameters updated successfully');
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'updateDefaultParams',
        'Failed to update default parameters',
      );
      throw error;
    }
  }

  /**
   * Get current default sanitization parameters
   * @returns Current default sanitization parameters
   */
  public static getDefaultParams(): EnhancedSanitizationParams {
    try {
      return { ...this.defaultSanitizationParams };
    } catch (error) {
      ErrorHandler.captureError(error, 'getDefaultParams', 'Failed to get default parameters');
      return {
        sensitiveKeys: DefaultSensitiveKeys,
        maskValue: MaskValue,
        truncateUrls: false,
        maxStringLength: 1000,
        neverTruncateKeys: neverTruncateDefaultKeys,
        enablePatternDetection: true,
        customPatterns: [],
        reportingEnabled: false,
        maxDepth: 10,
        chunkSize: 1000,
      };
    }
  }

  /**
   * Sanitizes sensitive data from an object or error with enhanced pattern detection
   * @param data - The data to sanitize
   * @param config - Sanitization configuration
   * @returns Sanitized data
   */
  public static sanitizeData<T>(
    data: T,
    config: EnhancedSanitizationParams = this.defaultSanitizationParams,
  ): T {
    try {
      const report: SanitizationReport = {
        keysProcessed: 0,
        keysSanitized: 0,
        sanitizedKeys: [],
        patternsFound: [],
        circularReferences: 0,
      };

      const result = this.sanitizeDataWithContext(data, config, report);

      if (config.reportingEnabled) {
        logger.debug('Sanitization report', report);
      }

      return result;
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeData', 'Failed to sanitize data');
      return data;
    }
  }

  /**
   * Sanitizes data with reporting and circular reference handling
   */
  private static sanitizeDataWithContext<T>(
    data: T,
    config: EnhancedSanitizationParams,
    report: SanitizationReport,
    depth: number = 0,
    seen: WeakSet<object> = new WeakSet(),
    path: string = '',
  ): T {
    try {
      // Prevent infinite recursion
      if (depth > (config.maxDepth || 10)) {
        logger.warn(`Maximum depth reached at path: ${path}`);
        return data;
      }

      // Handle null, undefined, or primitive types
      if (data === null || data === undefined || typeof data !== 'object') {
        return this.handlePrimitiveValue(data, config, report, path);
      }

      // Handle circular references
      if (seen.has(data as object)) {
        report.circularReferences++;
        return '[Circular Reference]' as unknown as T;
      }

      seen.add(data as object);

      // Handle arrays
      if (Array.isArray(data)) {
        return this.sanitizeArray(data, config, report, depth, seen, path) as unknown as T;
      }

      // Handle objects
      return this.sanitizeObject(data, config, report, depth, seen, path);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'sanitizeDataWithContext',
        'Failed to sanitize data with context',
      );
      return data;
    }
  }

  /**
   * Memory-efficient sanitization for large objects
   * Processes data in chunks to avoid memory issues
   */
  public static sanitizeLargeData<T>(
    data: T,
    config: EnhancedSanitizationParams = this.defaultSanitizationParams,
  ): Promise<T> {
    return new Promise((resolve) => {
      try {
        if (!Array.isArray(data)) {
          resolve(this.sanitizeData(data, config));
          return;
        }

        const result: unknown[] = [];
        const chunkSize = config.chunkSize || 1000;
        let processedChunks = 0;
        const totalChunks = Math.ceil(data.length / chunkSize);

        const processChunk = (startIndex: number) => {
          const chunk = data.slice(startIndex, startIndex + chunkSize);
          const sanitizedChunk = chunk.map((item) => this.sanitizeData(item, config) as unknown);
          result.push(...sanitizedChunk);

          processedChunks++;

          // Log progress for large datasets
          if (totalChunks > 10 && processedChunks % 10 === 0) {
            logger.debug(`Processed ${processedChunks}/${totalChunks} chunks`);
          }

          if (startIndex + chunkSize < data.length) {
            // Process next chunk asynchronously
            setTimeout(() => processChunk(startIndex + chunkSize), 0);
          } else {
            logger.debug(`Completed processing ${processedChunks} chunks`);
            resolve(result as unknown as T);
          }
        };

        processChunk(0);
      } catch (error) {
        ErrorHandler.captureError(error, 'sanitizeLargeData', 'Failed to sanitize large data');
        resolve(data);
      }
    });
  }

  /**
   * Creates a sanitization report showing what was sanitized
   */
  public static sanitizeWithReport<T>(
    data: T,
    config: EnhancedSanitizationParams = this.defaultSanitizationParams,
  ): { sanitized: T; report: SanitizationReport } {
    const report: SanitizationReport = {
      keysProcessed: 0,
      keysSanitized: 0,
      sanitizedKeys: [],
      patternsFound: [],
      circularReferences: 0,
    };

    try {
      const enhancedConfig = { ...config, reportingEnabled: true };
      const sanitized = this.sanitizeDataWithContext(data, enhancedConfig, report);
      return { sanitized, report };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'sanitizeWithReport',
        'Failed to generate sanitization report',
      );
      return { sanitized: data, report };
    }
  }

  /**
   * Validates if a string contains potentially sensitive patterns
   */
  private static containsSensitivePatterns(
    value: string,
    config: EnhancedSanitizationParams,
    report?: SanitizationReport,
  ): { hasSensitive: boolean; patterns: string[] } {
    if (typeof value !== 'string' || !config.enablePatternDetection) {
      return { hasSensitive: false, patterns: [] };
    }

    const patterns = [...this.defaultSensitivePatterns, ...(config.customPatterns || [])];

    const foundPatterns: string[] = [];

    for (const pattern of patterns) {
      if (pattern.test(value)) {
        foundPatterns.push(pattern.source);
        if (report) {
          report.patternsFound.push(pattern.source);
        }
      }
    }

    return { hasSensitive: foundPatterns.length > 0, patterns: foundPatterns };
  }

  /**
   * Enhanced primitive value handling with pattern detection
   */
  private static handlePrimitiveValue<T>(
    data: T,
    config: EnhancedSanitizationParams,
    report: SanitizationReport,
    path: string,
  ): T {
    try {
      report.keysProcessed++;

      // Handle string values with pattern detection
      if (typeof data === 'string') {
        const { hasSensitive, patterns } = this.containsSensitivePatterns(data, config, report);

        if (hasSensitive) {
          report.keysSanitized++;
          report.sanitizedKeys.push(`${path} (pattern: ${patterns.join(', ')})`);
          return (config.maskValue || MaskValue) as unknown as T;
        }

        // Handle string truncation for primitive string values
        if (config.maxStringLength) {
          return this.truncateString(data, config.maxStringLength) as unknown as T;
        }
      }

      return data;
    } catch (error) {
      ErrorHandler.captureError(error, 'handlePrimitiveValue', 'Failed to handle primitive value');
      return data;
    }
  }

  /**
   * Enhanced array sanitization
   */
  private static sanitizeArray<T>(
    data: T[],
    config: EnhancedSanitizationParams,
    report: SanitizationReport,
    depth: number,
    seen: WeakSet<object>,
    path: string,
  ): T[] {
    try {
      return data.map((item, index) => {
        try {
          const itemPath = `${path}[${index}]`;
          return this.sanitizeDataWithContext(item, config, report, depth + 1, seen, itemPath);
        } catch (error) {
          logger.error(`Failed to sanitize array item at index ${index}`, {
            error: error instanceof Error ? error.message : String(error),
            index,
            path,
          });
          return item;
        }
      });
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeArrayEnhanced', 'Failed to sanitize array');
      return data;
    }
  }

  /**
   * Enhanced object sanitization with improved performance
   */
  private static sanitizeObject<T>(
    data: T,
    config: EnhancedSanitizationParams,
    report: SanitizationReport,
    depth: number,
    seen: WeakSet<object>,
    path: string,
  ): T {
    try {
      const sanitizedObject = { ...(data as object) } as Record<string, unknown>;

      // Handle skip properties first
      this.processSkipProperties(sanitizedObject, config);

      this.processObjectProperties(sanitizedObject, config, report, depth, seen, path);

      return sanitizedObject as T;
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeObjectEnhanced', 'Failed to sanitize object');
      return data;
    }
  }

  /**
   * Enhanced object property processing with improved performance
   * @param obj - The object to sanitize
   * @param config - Sanitization configuration
   * @param report - Sanitization report
   * @param depth - Current recursion depth
   * @param seen - Set of seen objects to prevent circular references
   * @param path - Current property path
   * @returns Nothing, but mutates the input object
   */
  private static processObjectProperties(
    obj: Record<string, unknown>,
    config: EnhancedSanitizationParams,
    report: SanitizationReport,
    depth: number,
    seen: WeakSet<object>,
    path: string,
  ): void {
    try {
      // Create a Set for O(1) lookups of sensitive keys
      const sensitiveKeysSet = new Set(config.sensitiveKeys.map((key) => key.toLowerCase()));

      Object.keys(obj).forEach((key) => {
        try {
          const value = obj[key];
          const keyPath = path ? `${path}.${key}` : key;
          report.keysProcessed++;

          // Use the Set for faster lookup instead of SensitiveKeyCache for simple cases
          const keyLower = key.toLowerCase();
          const isSensitiveKey =
            sensitiveKeysSet.has(keyLower) ||
            // Fall back to cache for more complex matching (contains logic)
            SensitiveKeyCache.isSensitive(key, config.sensitiveKeys);

          if (isSensitiveKey) {
            obj[key] = config.maskValue;
            report.keysSanitized++;
            report.sanitizedKeys.push(keyPath);
          } else if (typeof value === 'string') {
            // Enhanced string processing with pattern detection
            const processedValue = this.processStringValue(value, key, config, report, keyPath);
            obj[key] = processedValue;
          } else if (typeof value === 'object' && value !== null) {
            // Recursively sanitize nested objects
            obj[key] = this.sanitizeDataWithContext(
              value,
              config,
              report,
              depth + 1,
              seen,
              keyPath,
            );
          }
        } catch (error) {
          logger.error(`Failed to process property: ${key}`, {
            error: error instanceof Error ? error.message : String(error),
            key,
            path,
          });
        }
      });
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'processObjectPropertiesEnhanced',
        'Failed to process object properties',
      );
      throw error;
    }
  }

  /**
   * Enhanced string processing with pattern detection
   */
  private static processStringValue(
    value: string,
    key: string,
    config: EnhancedSanitizationParams,
    report: SanitizationReport,
    path: string,
  ): string {
    try {
      // Check for sensitive patterns first
      if (config.enablePatternDetection) {
        const { hasSensitive, patterns } = this.containsSensitivePatterns(value, config, report);
        if (hasSensitive) {
          report.keysSanitized++;
          report.sanitizedKeys.push(`${path} (pattern: ${patterns.join(', ')})`);
          return config.maskValue || MaskValue;
        }
      }

      // If key should never be truncated, return as is
      if (this.shouldNeverTruncate(key, config.neverTruncateKeys)) {
        return value;
      }

      let processedValue = value;

      // Sanitize URLs if enabled
      if (config.truncateUrls && processedValue.includes('http')) {
        processedValue = this.sanitizeUrl(processedValue, config.maxStringLength);
      }

      // Truncate long strings if maximum length is specified
      if (config.maxStringLength) {
        processedValue = this.truncateString(processedValue, config.maxStringLength);
      }

      return processedValue;
    } catch (error) {
      ErrorHandler.captureError(error, 'processStringValue', 'Failed to process string value');
      return value;
    }
  }

  /**
   * Clear performance caches
   */
  public static clearCaches(): void {
    try {
      SensitiveKeyCache.clearCache();
      logger.debug('Sanitization caches cleared');
    } catch (error) {
      ErrorHandler.captureError(error, 'clearCaches', 'Failed to clear caches');
    }
  }

  // =================== EXISTING METHODS (keeping original functionality) ===================

  /**
   * Sanitizes data by specific paths (e.g., "user.credentials.password")
   * @param data - The data to sanitize
   * @param paths - Array of dot-notation paths to sensitive data
   * @param maskValue - Value to replace sensitive data with
   * @returns Sanitized data
   */
  public static sanitizeByPaths<T extends Record<string, unknown>>(
    data: T,
    paths: string[],
    maskValue: string = this.defaultSanitizationParams.maskValue || MaskValue,
  ): T {
    try {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return data;
      }

      if (!Array.isArray(paths) || paths.length === 0) {
        logger.warn('No valid paths provided for sanitization');
        return data;
      }

      // Create a deep copy to avoid mutations
      const result = this.safeDeepCopy(data);
      if (!result) return data;

      paths.forEach((path) => {
        if (typeof path === 'string' && path.trim()) {
          this.processSinglePath(result, path.trim(), maskValue);
        }
      });

      return result;
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeByPaths', 'Failed to sanitize by paths');
      return data;
    }
  }

  /**
   * Sanitizes data by specific key-value pairs, including nested objects
   * @param data - The data to sanitize
   * @param keysOrKeyValuePairs - Array of keys or an object of key-value pairs to sensitive data
   * @param maskValue - Value to replace sensitive data with
   * @returns Sanitized data
   */
  public static sanitizeByKeyValuePairs<T extends Record<string, unknown>>(
    data: T,
    keysOrKeyValuePairs: string[] | Record<string, string | number>,
    maskValue: string = this.defaultSanitizationParams.maskValue || MaskValue,
  ): T {
    try {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return data;
      }

      if (!keysOrKeyValuePairs) {
        logger.warn('No key-value pairs provided for sanitization');
        return data;
      }

      // Convert input to key-value pairs if it's an array of keys
      const keyValuePairs: Record<string, string | number> = Array.isArray(keysOrKeyValuePairs)
        ? this.extractKeyValuePairs(data, keysOrKeyValuePairs)
        : keysOrKeyValuePairs;

      if (Object.keys(keyValuePairs).length === 0) {
        return data;
      }

      // Create a deep copy to avoid mutations
      const result = this.safeDeepCopy(data);
      if (!result) return data;

      // Process the object recursively
      this.applyKeyValueMaskingRecursive(result, keyValuePairs, maskValue);

      return result;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'sanitizeByKeyValuePairs',
        'Failed to sanitize by key-value pairs',
      );
      return data;
    }
  }

  /**
   * Sanitizes headers to remove sensitive information
   * Uses default SanitizationConfig parameters
   */
  public static sanitizeHeaders(headers: unknown): Record<string, unknown> {
    try {
      if (!headers || typeof headers !== 'object') {
        return {};
      }

      // Use default sanitization parameters which already include header sensitive keys
      return SanitizationConfigEnhanced.sanitizeData(headers as Record<string, unknown>);
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeHeaders', 'Failed to sanitize headers');
      return {};
    }
  }

  /**
   * Sanitizes string values by removing potentially dangerous characters.
   * Can be used for credentials, URLs, or any string that needs sanitization.
   *
   * @param value The string value to sanitize
   * @returns A sanitized string with potentially dangerous characters removed
   */
  public static sanitizeString(value: string): string {
    try {
      if (!value || typeof value !== 'string') return '';

      // Remove quotes, backslashes, angle brackets, and trim whitespace
      return value.replace(/["'\\<>]/g, '').trim();
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeString', 'Failed to sanitize string');
      return '';
    }
  }

  /**
   * Creates a sanitization function that can be used with Winston logger
   * @returns A function that sanitizes objects for logging
   */
  public static createLogSanitizer(): (info: Record<string, unknown>) => Record<string, unknown> {
    return (info: Record<string, unknown>) => {
      try {
        return this.sanitizeData(info);
      } catch (error) {
        ErrorHandler.captureError(error, 'createLogSanitizer', 'Failed to create log sanitizer');
        return info;
      }
    };
  }

  /**
   * Safe deep copy with error handling
   */
  private static safeDeepCopy<T>(data: T): T | null {
    try {
      return JSON.parse(JSON.stringify(data)) as T;
    } catch (error) {
      ErrorHandler.captureError(error, 'safeDeepCopy', 'Failed to create deep copy of data');
      return null;
    }
  }

  /**
   * Apply masking to key-value pairs recursively through an object
   */
  private static applyKeyValueMaskingRecursive(
    obj: Record<string, unknown>,
    keyValuePairs: Record<string, string | number>,
    maskValue: string,
  ): void {
    try {
      // First handle the current level
      for (const [key, valueToMask] of Object.entries(keyValuePairs)) {
        if (key in obj && obj[key] === valueToMask) {
          obj[key] = maskValue;
        }
      }

      // Then recursively process nested objects
      for (const [_key, value] of Object.entries(obj)) {
        if (value !== null && typeof value === 'object') {
          if (Array.isArray(value)) {
            // Handle arrays
            value.forEach((item) => {
              if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                this.applyKeyValueMaskingRecursive(
                  item as Record<string, unknown>,
                  keyValuePairs,
                  maskValue,
                );
              }
            });
          } else {
            // Handle nested objects
            this.applyKeyValueMaskingRecursive(
              value as Record<string, unknown>,
              keyValuePairs,
              maskValue,
            );
          }
        }
      }
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'applyKeyValueMaskingRecursive',
        'Failed to apply key-value masking',
      );
      throw error;
    }
  }

  /**
   * Removes properties that should be skipped based on configuration
   */
  private static processSkipProperties(
    obj: Record<string, unknown>,
    config: EnhancedSanitizationParams,
  ): void {
    try {
      if (!config.skipProperties || config.skipProperties.length === 0) return;

      for (const key of Object.keys(obj)) {
        if (config.skipProperties.some((prop) => key.toLowerCase().includes(prop.toLowerCase()))) {
          delete obj[key];
        }
      }
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'processSkipProperties',
        'Failed to process skip properties',
      );
      throw error;
    }
  }

  /**
   * Checks if a key should never be truncated
   */
  private static shouldNeverTruncate(key: string, neverTruncateKeys?: string[]): boolean {
    try {
      if (!neverTruncateKeys) return false;

      return neverTruncateKeys.some((neverKey) => neverKey.toLowerCase() === key.toLowerCase());
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'shouldNeverTruncate',
        'Failed to check never truncate keys',
      );
      return false;
    }
  }

  /**
   * Process a single path for path-based sanitization
   */
  private static processSinglePath(
    obj: Record<string, unknown>,
    path: string,
    maskValue: string,
  ): void {
    try {
      const parts = path.split('.');
      let current: Record<string, unknown> = obj;

      // Navigate to the parent object
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (
          current[part] === undefined ||
          current[part] === null ||
          typeof current[part] !== 'object'
        ) {
          return; // Path doesn't exist or is invalid
        }
        current = current[part] as Record<string, unknown>;
      }

      // Set the value if we can reach it
      const lastPart = parts[parts.length - 1];
      if (lastPart in current) {
        current[lastPart] = maskValue;
      }
    } catch (error) {
      ErrorHandler.captureError(error, 'processSinglePath', `Failed to process path: ${path}`);
      throw error;
    }
  }

  /**
   * Truncates a string to the specified maximum length, preserving any URLs
   * @param value - String to truncate
   * @param maxLength - Maximum length (from config)
   * @returns Truncated string with ellipsis if necessary, with URLs preserved
   */
  private static truncateString(value: string, maxLength?: number): string {
    try {
      const limit = maxLength ?? this.defaultSanitizationParams.maxStringLength ?? 1000;

      // If string is under the limit or no limit specified, return as is
      if (!limit || value.length <= limit) return value;

      // Check if the string contains a URL
      if (value.includes('http')) {
        return this.truncateStringWithUrl(value, limit);
      }

      // Standard truncation for non-URL strings
      return value.substring(0, limit) + '...';
    } catch (error) {
      ErrorHandler.captureError(error, 'truncateString', `Failed to truncate string: ${value}`);
      return value;
    }
  }

  /**
   * Helper to truncate strings that contain URLs
   */
  private static truncateStringWithUrl(value: string, limit: number): string {
    try {
      // URL detection regex
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = value.match(urlRegex) || [];

      // If we have URLs, preserve them in the truncated string
      if (urls.length > 0) {
        // If the string starts with a URL, keep the URL intact
        for (const url of urls) {
          if (value.startsWith(url)) {
            return this.truncateStartingWithUrl(value, url, limit);
          }
        }

        // Otherwise, truncate normally but mention URLs are present
        return value.substring(0, limit) + '... [URLs omitted]';
      }

      // Fallback to standard truncation
      return value.substring(0, limit) + '...';
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'truncateStringWithUrl',
        `Failed to truncate string with URL: ${value}`,
      );
      return value.substring(0, limit) + '...';
    }
  }

  /**
   * Helper for truncating strings that start with a URL
   */
  private static truncateStartingWithUrl(value: string, url: string, limit: number): string {
    try {
      const remainingLength = limit - url.length - 3; // -3 for ellipsis
      if (remainingLength > 0) {
        const nonUrlPart = value.substring(url.length);
        return url + nonUrlPart.substring(0, remainingLength) + '...';
      }
      return url; // If URL is already at or over limit, just return the URL
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'truncateStartingWithUrl',
        `Failed to truncate starting with URL: ${value}`,
      );
      return url;
    }
  }

  /**
   * Sanitizes URLs by preserving the essential parts (protocol, domain) and truncating the path if needed
   * @param value - String potentially containing URLs
   * @param maxUrlLength - Maximum length for URLs (defaults to overall maxStringLength)
   * @returns String with URLs properly truncated
   */
  private static sanitizeUrl(value: string, maxUrlLength?: number): string {
    try {
      if (!value.includes('http')) return value;

      const limit = maxUrlLength ?? this.defaultSanitizationParams.maxStringLength ?? 1000;

      // Find all URLs in the string
      const urlRegex = /(https?:\/\/[^\s]+)/g;

      return value.replace(urlRegex, (url) => {
        if (url.length <= limit) return url;

        return this.truncateUrl(url);
      });
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeUrl', `Failed to sanitize URL: ${value}`);
      return value;
    }
  }

  /**
   * Helper to truncate a single URL
   */
  private static truncateUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin; // Contains protocol + domain

      // Keep the domain and truncate the path
      const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
      if (pathAndQuery.length > 20) {
        // If the path is long, show the beginning and end
        const pathStart = parsedUrl.pathname.substring(0, 10);
        return `${origin}${pathStart}...[truncated]`;
      }

      return origin + pathAndQuery;
    } catch (error) {
      ErrorHandler.captureError(error, 'truncateUrl', `Failed to truncate URL: ${url}`);
      return url.substring(0, 30) + '...[truncated]';
    }
  }

  /**
   * Extracts key-value pairs from the provided data object based on the given sensitive keys.
   * Only keys with string or number values are included in the result.
   *
   * @template T - Type of the data object
   * @param data - The data object to extract key-value pairs from
   * @param sensitiveKeys - An array of keys to extract values for
   * @returns An object containing the extracted key-value pairs with keys as strings
   */
  private static extractKeyValuePairs<T extends Record<string, unknown>>(
    data: T,
    sensitiveKeys: Array<keyof T>,
  ): Record<string, string | number> {
    try {
      return sensitiveKeys.reduce(
        (acc, key) => {
          try {
            const value = data[key];
            if (typeof value === 'string' || typeof value === 'number') {
              acc[key as string] = value;
            }
          } catch (error) {
            logger.error(`Failed to extract key-value pair for key: ${String(key)}`, {
              error: error instanceof Error ? error.message : String(error),
              key: String(key),
            });
          }
          return acc;
        },
        {} as Record<string, string | number>,
      );
    } catch (error) {
      ErrorHandler.captureError(error, 'extractKeyValuePairs', 'Failed to extract key-value pairs');
      return {};
    }
  }
}
