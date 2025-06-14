import { SanitizationParams } from '../../config/types/config/sanitization.types';
import { DefaultSensitiveKeys, MaskValue, neverTruncateDefaultKeys } from './sanitizationDefaults';
import ErrorHandler from '../errors/errorHandler';
import logger from '../logging/loggerManager';

export default class SanitizationConfig {
  private static defaultSanitizationParams: SanitizationParams = {
    sensitiveKeys: DefaultSensitiveKeys,
    maskValue: MaskValue,
    truncateUrls: false,
    maxStringLength: 1000,
    neverTruncateKeys: neverTruncateDefaultKeys,
  };

  /**
   * Updates the default sanitization parameters
   * @param params Partial sanitization parameters to update
   */
  public static updateDefaultParams(params: Partial<SanitizationParams>): void {
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
  public static getDefaultParams(): SanitizationParams {
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
      };
    }
  }

  /**
   * Sanitizes sensitive data from an object or error
   * @param data - The data to sanitize
   * @param config - Sanitization configuration
   * @returns Sanitized data
   */
  public static sanitizeData<T>(
    data: T,
    config: SanitizationParams = this.defaultSanitizationParams,
  ): T {
    try {
      // Handle null, undefined, or primitive types
      if (data === null || data === undefined || typeof data !== 'object') {
        return this.handlePrimitiveValue(data, config);
      }

      // Handle arrays - with proper type preservation
      if (Array.isArray(data)) {
        return this.sanitizeArray(data, config) as unknown as T;
      }

      // Handle objects
      return this.sanitizeObject(data, config);
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeData', 'Failed to sanitize data');
      return data;
    }
  }

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
   * Apply masking to key-value pairs recursively through an object
   * @param obj - Object to process
   * @param keyValuePairs - Key-value pairs to look for and mask
   * @param maskValue - Value to use for masking
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
   * Sanitizes headers to remove sensitive information
   * Uses default SanitizationConfig parameters
   */
  public static sanitizeHeaders(headers: unknown): Record<string, unknown> {
    try {
      if (!headers || typeof headers !== 'object') {
        return {};
      }

      // Use default sanitization parameters which already include header sensitive keys
      return SanitizationConfig.sanitizeData(headers as Record<string, unknown>);
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

  // =================== HELPER METHODS ===================

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
   * Handles primitive values during sanitization process
   */
  private static handlePrimitiveValue<T>(data: T, config: SanitizationParams): T {
    try {
      // Handle string truncation for primitive string values
      if (typeof data === 'string' && config.maxStringLength) {
        return this.truncateString(data, config.maxStringLength) as unknown as T;
      }
      return data;
    } catch (error) {
      ErrorHandler.captureError(error, 'handlePrimitiveValue', 'Failed to handle primitive value');
      return data;
    }
  }

  /**
   * Sanitizes an array by processing each element
   */
  private static sanitizeArray<T>(data: T[], config: SanitizationParams): T[] {
    try {
      return data.map((item, index) => {
        try {
          return typeof item === 'object' && item !== null ? this.sanitizeData(item, config) : item;
        } catch (error) {
          logger.error(`Failed to sanitize array item at index ${index}`, {
            error: error instanceof Error ? error.message : String(error),
            index,
          });
          return item;
        }
      });
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeArray', 'Failed to sanitize array');
      return data;
    }
  }

  /**
   * Sanitizes an object by processing its properties
   */
  private static sanitizeObject<T>(data: T, config: SanitizationParams): T {
    try {
      const sanitizedObject = { ...(data as object) } as Record<string, unknown>;

      // Handle skip properties first
      this.processSkipProperties(sanitizedObject, config);

      // Process remaining properties
      this.processObjectProperties(sanitizedObject, config);

      return sanitizedObject as T;
    } catch (error) {
      ErrorHandler.captureError(error, 'sanitizeObject', 'Failed to sanitize object');
      return data;
    }
  }

  /**
   * Removes properties that should be skipped based on configuration
   */
  private static processSkipProperties(
    obj: Record<string, unknown>,
    config: SanitizationParams,
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
   * Processes object properties for sanitization
   */
  private static processObjectProperties(
    obj: Record<string, unknown>,
    config: SanitizationParams,
  ): void {
    try {
      // Create a Set for O(1) lookups of sensitive keys
      const sensitiveKeysSet = new Set(config.sensitiveKeys.map((key) => key.toLowerCase()));

      Object.keys(obj).forEach((key) => {
        try {
          const value = obj[key];

          // Check if key matches sensitive keys (case-insensitive)
          if (this.isSensitiveKey(key, sensitiveKeysSet, config.sensitiveKeys)) {
            obj[key] = config.maskValue;
          } else if (typeof value === 'string') {
            obj[key] = this.processStringValue(value, key, config);
          } else if (typeof value === 'object' && value !== null) {
            // Recursively sanitize nested objects
            obj[key] = this.sanitizeData(value, config);
          }
        } catch (error) {
          logger.error(`Failed to process property: ${key}`, {
            error: error instanceof Error ? error.message : String(error),
            key,
          });
        }
      });
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'processObjectProperties',
        `Failed to process object properties`,
      );
      throw error;
    }
  }

  /**
   * Checks if a key should be considered sensitive
   */
  private static isSensitiveKey(
    key: string,
    sensitiveKeysSet: Set<string>,
    sensitiveKeys: string[],
  ): boolean {
    try {
      return (
        sensitiveKeysSet.has(key.toLowerCase()) ||
        sensitiveKeys.some((sensitiveKey) => key.toLowerCase().includes(sensitiveKey.toLowerCase()))
      );
    } catch (error) {
      ErrorHandler.captureError(error, 'isSensitiveKey', `Failed to check sensitive key`);
      return false;
    }
  }

  /**
   * Process a string value for sanitization
   */
  private static processStringValue(
    value: string,
    key: string,
    config: SanitizationParams,
  ): string {
    try {
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
      ErrorHandler.captureError(error, 'processStringValue', `Failed to process string value`);
      return value;
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
        `Failed to check never truncate keys`,
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
