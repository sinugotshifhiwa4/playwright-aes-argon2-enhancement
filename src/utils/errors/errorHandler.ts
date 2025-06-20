import axios from 'axios';
import ApiTestExpectation from '../../api/context/apiTestExpectation';
import { ErrorCategory } from '../../config/types/enums/error-category.enum';
import { ErrorDetails } from '../../config/types/errors/error-handler.types';
import logger from '../logging/loggerManager';
import ErrorProcessor from './errorProcessor';

export default class ErrorHandler {
  // Cache with timestamps to enable time-based expiration
  private static loggedErrors = new Map<string, number>();

  // Configuration constants
  private static readonly MAX_CACHE_SIZE = 1000;
  private static readonly CACHE_TTL = 1000 * 60 * 20; // 20 minutes in milliseconds

  /**
   * Enhanced error capture with better context handling
   */
  public static captureError(error: unknown, source: string, context?: string): void {
    try {
      // Skip error logging if this is an expected error in a negative test
      if (this.shouldSkipErrorLogging(error, context)) {
        this.logExpectedTestError(error, context);
        return;
      }

      // Generate error details
      const details = ErrorProcessor.createErrorDetails(error, source, context);

      // Create a cache key to avoid duplicate logging
      const cacheKey = ErrorProcessor.createCacheKey(details);

      // Skip if already logged recently
      if (this.isRecentlyLogged(cacheKey)) {
        return;
      }

      // Add to cache and maintain cache size
      this.manageCacheSize(cacheKey);

      // Log the primary error
      this.logStructuredError(details);

      // Log additional details if available
      this.logAdditionalDetails(error, source);
    } catch (loggingError) {
      this.handleLoggingFailure(loggingError, source);
    }
  }

  /**
   * Log expected test errors as info
   */
  private static logExpectedTestError(error: unknown, context?: string): void {
    if (axios.isAxiosError(error) && error.response?.status) {
      logger.info(
        `Expected error in negative test [${context}]: Status ${error.response.status} - ${error.response.statusText || 'Unknown'}`,
      );
    } else {
      logger.info(
        `Expected error in negative test [${context}]: ${ErrorProcessor.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Log structured error details with proper typing
   */
  private static logStructuredError(details: ErrorDetails): void {
    const sanitizedDetails = ErrorProcessor.sanitizeObject(
      details as unknown as Record<string, unknown>,
    );

    // Add severity level based on category
    const logLevel = this.getLogLevel(details.category);
    const logMessage = JSON.stringify(sanitizedDetails, null, 2);

    if (logLevel === 'warn') {
      logger.warn(logMessage);
    } else {
      logger.error(logMessage);
    }
  }

  /**
   * Log additional error details
   */
  private static logAdditionalDetails(error: unknown, source: string): void {
    const extraDetails = ErrorProcessor.extractExtraDetails(error);

    if (Object.keys(extraDetails).length > 0) {
      logger.debug(
        JSON.stringify(
          {
            source,
            type: 'Additional Details',
            details: extraDetails,
          },
          null,
          2,
        ),
      );
    }
  }

  /**
   * Handle failures in the error logging process
   */
  private static handleLoggingFailure(loggingError: unknown, source: string): void {
    logger.error(
      JSON.stringify(
        {
          source,
          context: 'Error Handler Failure',
          message: ErrorProcessor.getErrorMessage(loggingError),
          category: ErrorCategory.UNKNOWN,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  /**
   * Determine appropriate log level based on error category
   */
  private static getLogLevel(category: ErrorCategory): 'error' | 'warn' {
    const warnCategories = [
      ErrorCategory.VALIDATION,
      ErrorCategory.NOT_FOUND,
      ErrorCategory.HTTP_CLIENT,
      ErrorCategory.RATE_LIMIT,
    ];

    return warnCategories.includes(category) ? 'warn' : 'error';
  }

  /**
   * Enhanced cache management with better performance
   */
  private static manageCacheSize(cacheKey: string): void {
    const now = Date.now();

    // Clean expired entries less frequently for better performance
    if (this.loggedErrors.size % 50 === 0) {
      this.cleanExpiredEntries(now);
    }

    // Add new entry
    this.loggedErrors.set(cacheKey, now);

    // Only remove oldest if we're significantly over the limit
    if (this.loggedErrors.size > this.MAX_CACHE_SIZE * 1.1) {
      this.removeOldestEntries();
    }
  }

  public static logAndThrow(message: string): never;
  public static logAndThrow(message: string, source: string): never;
  public static logAndThrow(message: string, source: string = 'Source not specified'): never {
    this.captureError(new Error(message), source);
    throw new Error(message);
  }

  /**
   * Log error but continue execution
   */
  public static logAndContinue(error: unknown, source: string, context?: string): void {
    this.captureError(error, source, context ? `${context} (non-fatal)` : 'Non-fatal error');
  }

  /**
   * Reset the logged errors cache (useful for testing)
   */
  public static resetCache(): void {
    this.loggedErrors.clear();
  }

  /**
   * Check if error was recently logged (still in cache and not expired)
   */
  private static isRecentlyLogged(cacheKey: string): boolean {
    const timestamp = this.loggedErrors.get(cacheKey);
    if (!timestamp) return false;

    const now = Date.now();
    if (now - timestamp > this.CACHE_TTL) {
      // Entry exists but expired - remove it
      this.loggedErrors.delete(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Check if error should be skipped based on request context
   */
  private static shouldSkipErrorLogging(error: unknown, context?: string): boolean {
    if (!context) return false;

    if (axios.isAxiosError(error) && error.response?.status) {
      return (
        ApiTestExpectation.isExpectedStatus(context, error.response.status) &&
        ApiTestExpectation.isNegativeTest(context)
      );
    }

    return false;
  }

  /**
   * Remove entries that have exceeded the TTL
   */
  private static cleanExpiredEntries(now: number): void {
    this.loggedErrors.forEach((timestamp, key) => {
      if (now - timestamp > this.CACHE_TTL) {
        this.loggedErrors.delete(key);
      }
    });
  }

  /**
   * Remove the oldest logged error entries to maintain cache size within limit.
   */
  private static removeOldestEntries(): void {
    // Convert loggedErrors map to an array of [errorHash, timestamp] pairs
    const errorEntryList = Array.from(this.loggedErrors.entries());

    // Sort error entries by timestamp in ascending order (oldest first)
    errorEntryList.sort(([, timestampA], [, timestampB]) => timestampA - timestampB);

    // Determine how many entries need to be removed to stay within MAX_CACHE_SIZE
    const excessEntryCount = this.loggedErrors.size - this.MAX_CACHE_SIZE;

    // Remove the oldest entries based on the calculated excess
    for (let index = 0; index < excessEntryCount; index++) {
      const [oldestErrorHash] = errorEntryList[index];
      this.loggedErrors.delete(oldestErrorHash);
    }
  }

  /**
   * Public accessor for getErrorMessage to maintain API compatibility
   */
  public static getErrorMessage(error: unknown): string {
    return ErrorProcessor.getErrorMessage(error);
  }
}
