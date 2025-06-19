import { ErrorCategory } from '../../config/types/enums/error-category.enum';
import axios, { AxiosError } from 'axios';
import { CustomError } from './customError';
import { AppErrorLike } from '../../config/types/errors/error-handler.types';
import ApiTestExpectation from '../../api/context/apiTestExpectation';
import ErrorHandler from './errorHandler';
import logger from '../logging/loggerManager';

/**
 * Class responsible for converting various error types into standardized API responses
 */
export default class ApiErrorHandler {
  /**
   * Enhanced API error capture with better error extraction
   */
  public static captureApiError(
    error: unknown,
    source: string,
    context?: string,
  ): {
    success: false;
    error: string;
    code: string;
    statusCode: number;
    details?: Record<string, unknown>;
  } {
    const shouldLog = !this.isExpectedNegativeTestError(error, source);

    if (shouldLog) {
      ErrorHandler.captureError(error, source, context);
    } else {
      this.logExpectedApiError(error, source);
    }

    const errorInfo = this.extractErrorInfo(error);
    const statusCode = this.mapCategoryToStatusCode(errorInfo.category, errorInfo.statusCode);

    return {
      success: false,
      error: errorInfo.message,
      code: errorInfo.category,
      statusCode,
      ...(errorInfo.details && Object.keys(errorInfo.details).length > 0
        ? { details: errorInfo.details }
        : {}),
    };
  }

  /**
   * Log expected API errors
   */
  private static logExpectedApiError(error: unknown, source: string): void {
    const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;
    logger.info(
      `Expected API error in negative test at [${source}]: Status Code ${statusCode || 'Unknown'} — Test validation passed.`,
    );
  }

  /**
   * Enhanced error information extraction
   */
  private static extractErrorInfo(error: unknown): {
    message: string;
    category: ErrorCategory;
    statusCode: number;
    details?: Record<string, unknown>;
  } {
    // Initialize with defaults
    const result = {
      message: 'An unexpected error occurred',
      category: ErrorCategory.UNKNOWN,
      statusCode: 0,
      details: undefined as Record<string, unknown> | undefined,
    };

    // Extract from AppError or AppErrorLike first (highest priority)
    const appErrorLike = this.getAppErrorLike(error);
    if (appErrorLike) {
      result.message = appErrorLike.message || result.message;
      result.category = appErrorLike.category;
      result.details = appErrorLike.details;
    }

    // Handle Axios errors (can override some fields)
    if (axios.isAxiosError(error)) {
      result.statusCode = error.response?.status ?? result.statusCode;

      // Try to get a better message from response
      const responseMessage = this.extractAxiosMessage(error);
      if (responseMessage) {
        result.message = responseMessage;
      }

      // Add request context to details
      const requestInfo = this.extractRequestInfo(error);
      result.details = {
        ...result.details,
        ...requestInfo,
      };

      // Determine category from status code if not already set by AppError
      if (result.category === ErrorCategory.UNKNOWN) {
        result.category = this.categorizeAxiosError(error);
      }
    }

    // Fallback message extraction if still using default
    if (result.message === 'An unexpected error occurred') {
      result.message = ErrorHandler.getErrorMessage(error);
    }

    return result;
  }

  /**
   * Extract message from Axios error response
   */
  private static extractAxiosMessage(error: AxiosError): string | null {
    const data = error.response?.data;

    if (!data || typeof data !== 'object') {
      return null;
    }

    // Try common message properties
    const messageProps = ['message', 'error', 'detail', 'description'];

    for (const prop of messageProps) {
      const value = (data as Record<string, unknown>)[prop];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  /**
   * Extract request information from Axios error
   */
  private static extractRequestInfo(error: AxiosError): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    if (error.config?.url) {
      info.endpoint = error.config.url;
    }

    if (error.config?.method) {
      info.method = error.config.method.toUpperCase();
    }

    if (error.response?.status) {
      info.statusCode = error.response.status;
      info.statusText = error.response.statusText;
    }

    return Object.keys(info).length > 0 ? { requestInfo: info } : {};
  }

  /**
   * Enhanced category mapping with better defaults - API-focused categories only
   */
  private static mapCategoryToStatusCode(
    category: ErrorCategory,
    defaultStatusCode: number,
  ): number {
    // If we have a valid HTTP status code, prefer it for HTTP-related categories
    if (defaultStatusCode >= 100 && defaultStatusCode < 600) {
      const httpCategories = [
        ErrorCategory.HTTP_CLIENT,
        ErrorCategory.HTTP_SERVER,
        ErrorCategory.AUTHENTICATION,
        ErrorCategory.AUTHORIZATION,
        ErrorCategory.NOT_FOUND,
        ErrorCategory.RATE_LIMIT,
      ];

      if (httpCategories.includes(category)) {
        return defaultStatusCode;
      }
    }

    // Category-specific mapping - only API-relevant categories
    const categoryMap: Partial<Record<ErrorCategory, number>> = {
      // 4xx Client Errors
      [ErrorCategory.VALIDATION]: 400,
      [ErrorCategory.CONSTRAINT]: 400,
      [ErrorCategory.HTTP_CLIENT]: 400,
      [ErrorCategory.PARSING]: 400,
      [ErrorCategory.SERIALIZATION]: 400,
      [ErrorCategory.AUTHENTICATION]: 401,
      [ErrorCategory.AUTHORIZATION]: 403,
      [ErrorCategory.PERMISSION]: 403,
      [ErrorCategory.ACCESS_DENIED]: 403,
      [ErrorCategory.NOT_FOUND]: 404,
      [ErrorCategory.FILE_NOT_FOUND]: 404,
      [ErrorCategory.TIMEOUT]: 408,
      [ErrorCategory.CONFLICT]: 409,
      [ErrorCategory.FILE_EXISTS]: 409,
      [ErrorCategory.RATE_LIMIT]: 429,

      // 5xx Server Errors
      [ErrorCategory.DATABASE]: 500,
      [ErrorCategory.QUERY]: 500,
      [ErrorCategory.TRANSACTION]: 500,
      [ErrorCategory.CONFIGURATION]: 500,
      [ErrorCategory.ENVIRONMENT]: 500,
      [ErrorCategory.DEPENDENCY]: 500,
      [ErrorCategory.MEMORY]: 500,
      [ErrorCategory.PERFORMANCE]: 500,
      [ErrorCategory.IO]: 500,
      [ErrorCategory.NOT_IMPLEMENTED]: 501,
      [ErrorCategory.NETWORK]: 502,
      [ErrorCategory.CONNECTION]: 502,
      [ErrorCategory.SERVICE]: 503,
      [ErrorCategory.HTTP_SERVER]: 503,
      [ErrorCategory.RESOURCE_LIMIT]: 503,
      [ErrorCategory.NO_SPACE]: 507,

      // Default fallbacks
      [ErrorCategory.UNKNOWN]: 500,
    };

    // Return mapped status code or fallback to defaultStatusCode or 500
    return categoryMap[category] || defaultStatusCode || 500;
  }

  /**
   * Categorize Axios errors more precisely
   */
  private static categorizeAxiosError(error: AxiosError): ErrorCategory {
    // No response = network issue
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return ErrorCategory.TIMEOUT;
      }
      return ErrorCategory.NETWORK;
    }

    const status = error.response.status;

    // Precise status code mapping
    const statusMap: Record<number, ErrorCategory> = {
      400: ErrorCategory.VALIDATION,
      401: ErrorCategory.AUTHENTICATION,
      403: ErrorCategory.AUTHORIZATION,
      404: ErrorCategory.NOT_FOUND,
      408: ErrorCategory.TIMEOUT,
      409: ErrorCategory.CONFLICT,
      422: ErrorCategory.VALIDATION,
      429: ErrorCategory.RATE_LIMIT,
      500: ErrorCategory.HTTP_SERVER,
      502: ErrorCategory.NETWORK,
      503: ErrorCategory.SERVICE,
      504: ErrorCategory.TIMEOUT,
    };

    return (
      statusMap[status] || (status >= 500 ? ErrorCategory.HTTP_SERVER : ErrorCategory.HTTP_CLIENT)
    );
  }

  /**
   * Handle errors in negative test scenarios
   */
  public static handleNegativeTestError(error: unknown, methodName: string): void {
    if (this.isExpectedNegativeTestError(error, methodName)) {
      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;
      logger.info(
        `Expected failure handled correctly in negative test [${methodName}] — Status: ${statusCode}`,
      );
    } else {
      this.captureApiError(
        error,
        methodName,
        `Unexpected error occurred in negative test for ${methodName}`,
      );
      throw error;
    }
  }

  /**
   * Get AppError-like properties from an error object
   */
  private static getAppErrorLike(error: unknown): AppErrorLike | null {
    if (error instanceof CustomError) {
      return error;
    } else if (error instanceof Error && this.isAppErrorLike(error)) {
      return {
        message: error.message,
        category: error.category,
        details: error.details,
      };
    }
    return null;
  }

  /**
   * Determines if the given error is an expected result in a negative test scenario.
   * An error is considered expected if:
   * - The test context is marked as a negative test.
   * - The error is an Axios error with a valid HTTP status.
   * - The status code is explicitly registered as expected for this context.
   */
  private static isExpectedNegativeTestError(error: unknown, context: string): boolean {
    if (!context || !axios.isAxiosError(error) || !error.response?.status) {
      return false;
    }

    const status = error.response.status;

    return (
      ApiTestExpectation.isNegativeTest(context) &&
      ApiTestExpectation.isExpectedStatus(context, status)
    );
  }

  /**
   * Determine if an error-like object is an AppError or has a similar shape.
   * @param err - The object to check.
   * @returns True if the object is either an AppError or has a category property
   * that is a string, and optionally a details property that is an object or
   * undefined.
   */
  private static isAppErrorLike(err: unknown): err is {
    category: ErrorCategory;
    details?: Record<string, unknown>;
  } {
    return (
      err !== null &&
      typeof err === 'object' &&
      'category' in err &&
      typeof (err as Record<string, unknown>).category === 'string' &&
      (!('details' in err) ||
        (err as Record<string, unknown>).details === undefined ||
        typeof (err as Record<string, unknown>).details === 'object')
    );
  }
}
