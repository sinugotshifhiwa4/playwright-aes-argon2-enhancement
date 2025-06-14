import { expect } from '@playwright/test';
import { AxiosResponse } from 'axios';
import ApiTestExpectation from '../context/apiTestExpectation';
import { CustomError } from '../../utils/errors/customError';
import { ErrorCategory } from '../../config/types/enums/error-category.enum';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export default class ApiResponseProcessor {
  /**
   * Validates that the response contains an object (not array or primitive)
   * @param response - The Axios response to validate
   * @param context - Context for error reporting
   * @returns The validated response data as type T
   * @throws Error if response data is not an object
   */
  public static validateObjectResponse<T>(response: AxiosResponse, context: string): T {
    if (!response?.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      const type = Array.isArray(response?.data) ? 'array' : typeof response?.data;
      ErrorHandler.logAndThrow(`Invalid response: expected object, received ${type}`, context);
    }
    return response.data as T;
  }

  /**
   * Validates that the response contains an array
   * @param response - The Axios response to validate
   * @param context - Context for error reporting
   * @returns The validated response data as array of type T
   * @throws Error if response data is not an array
   */
  public static validateArrayResponse<T>(response: AxiosResponse, context: string): T[] {
    if (!Array.isArray(response?.data)) {
      const type = response?.data === null ? 'null' : typeof response?.data;
      ErrorHandler.logAndThrow(`Invalid response: expected array, received ${type}`, context);
    }
    return response.data as T[];
  }

  /**
   * Extracts a nested property from the response using dot notation
   * @param response - The Axios response containing the data
   * @param propertyPath - Dot-separated path to the property (e.g., 'user.profile.name')
   * @param context - Context for error reporting
   * @returns The extracted property value
   * @throws Error if property is not found or response is invalid
   */
  public static extractPropertyFromResponse<T>(
    response: AxiosResponse,
    propertyPath: string,
    context: string,
  ): T {
    try {
      // Validate response structure
      const responseData = this.validateObjectResponse<Record<string, unknown>>(response, context);

      // Extract property using dot notation support
      const extractedValue = this.getNestedProperty(responseData, propertyPath);

      // Validate extracted value
      this.validateExtractedValue(extractedValue, propertyPath, context);

      return extractedValue as T;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        context,
        `Failed to extract '${propertyPath}' from response`,
      );
      throw error;
    }
  }

  /**
   * Safely extracts a nested property from an object using dot notation
   * @param obj - The object to extract from
   * @param path - Dot-separated path to the property
   * @returns The value at the specified path, or undefined if not found
   */
  private static getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current === null || current === undefined) {
        return undefined;
      }
      return (current as Record<string, unknown>)?.[key];
    }, obj);
  }

  /**
   * Validates that an extracted value is neither undefined nor null
   * @param value - The value to validate
   * @param propertyPath - The path that was used to extract the value
   * @param context - Context for error reporting
   * @throws Error if value is undefined or null
   */
  private static validateExtractedValue(
    value: unknown,
    propertyPath: string,
    context: string,
  ): void {
    if (value === undefined) {
      ErrorHandler.logAndThrow(`Property '${propertyPath}' not found in response`, context);
    }
    if (value === null) {
      ErrorHandler.logAndThrow(`Property '${propertyPath}' is null in response`, context);
    }
  }

  /**
   * Ensures the API response is not null, throwing an error if it is.
   * Handles both positive and negative test scenarios appropriately.
   * @param response - The response to validate (may be null)
   * @param context - Context for error reporting and test expectation checking
   * @returns The validated non-null response
   * @throws CustomError with appropriate category based on test expectation
   */
  public static assertResponseNotNull(
    response: AxiosResponse | null,
    context: string,
  ): AxiosResponse {
    if (!response) {
      const errorMessage = `Received null response from [${context}].`;
      const isNegativeTest = ApiTestExpectation.isNegativeTest(context);

      if (isNegativeTest) {
        logger.info(`Received null response as expected for negative test: ${context}`);
        throw new CustomError(ErrorCategory.EXPECTED_FAILURE, { context }, errorMessage);
      }

      throw new CustomError(ErrorCategory.CONSTRAINT, { context }, errorMessage);
    }

    return response;
  }

  /**
   * Validates response data existence and handles empty responses based on configuration
   * @param response - The Axios response to validate
   * @param allowEmptyResponse - Whether to allow empty/null response data
   * @throws Error if response data is empty and not allowed
   */
  public static validateResponseData(
    response: AxiosResponse,
    context: string,
    allowEmptyResponse: boolean = false,
  ): void {
    const hasNoData = !response.data || response.data === '';

    if (hasNoData) {
      if (allowEmptyResponse) {
        logger.info('Empty response allowed/received - treating as valid response');
        return;
      }

      const noDataError = new Error('No response data available');
      logger.error(noDataError.message);
      throw noDataError;
    }
  }

  /**
   * Asserts that the response data is empty (empty string)
   * @param response - The Axios response to validate
   * @param context - Context for error reporting (optional)
   * @throws Error if response data is not empty
   */
  public static assertEmptyResponse(
    response: AxiosResponse,
    context: string = 'assertEmptyResponse',
  ): void {
    try {
      expect(response.data).toBe('');
      logger.info(`Empty response assertion passed for context: ${context}`);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        context,
        'Failed to assert response data matches expected empty response',
      );
      throw error;
    }
  }

  /**
   * Validates HTTP status codes and throws detailed errors for client/server errors (>= 400)
   * @param response - The Axios response to validate
   * @throws Error with detailed information if status code indicates an error
   */
  public static validateHttpStatus(response: AxiosResponse): void {
    if (response.status >= 400) {
      const errorData = response.data || {};
      const {
        code = 'UNKNOWN_CODE',
        type = 'UNKNOWN_TYPE',
        message: errorMessage = 'Unspecified error occurred',
      } = errorData;

      // Create a detailed error with comprehensive information
      const detailedError = new Error(errorMessage);
      Object.assign(detailedError, {
        status: response.status,
        statusText: response.statusText,
        code,
        type,
        responseData: response.data,
        headers: response.headers,
      });

      // Log detailed error information
      logger.error(`HTTP Error: ${response.status} ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        code,
        type,
        message: errorMessage,
        endpoint: response.config?.url,
        method: response.config?.method?.toUpperCase(),
        fullResponse: response.data,
      });

      throw detailedError;
    }
  }

  /**
   * Comprehensive response validation that combines multiple validation checks
   * @param response - The Axios response to validate
   * @param context - Context for error reporting
   * @param options - Validation options
   * @returns The validated response
   */
  public static validateResponse(
    response: AxiosResponse | null,
    context: string,
    options: {
      allowEmptyResponse?: boolean;
      validateStatus?: boolean;
    } = {},
  ): AxiosResponse {
    const { allowEmptyResponse = false, validateStatus = true } = options;

    // Ensure response is not null
    const validResponse = this.assertResponseNotNull(response, context);

    // Validate HTTP status if requested
    if (validateStatus) {
      this.validateHttpStatus(validResponse);
    }

    // Validate response data
    this.validateResponseData(validResponse, context, allowEmptyResponse);

    return validResponse;
  }

  /**
   * Type guard to check if response data is an object (not array or primitive)
   * @param data - The data to check
   * @returns True if data is a non-array object
   */
  public static isObjectResponse(data: unknown): data is Record<string, unknown> {
    return data !== null && typeof data === 'object' && !Array.isArray(data);
  }

  /**
   * Type guard to check if response data is an array
   * @param data - The data to check
   * @returns True if data is an array
   */
  public static isArrayResponse(data: unknown): data is unknown[] {
    return Array.isArray(data);
  }
}
