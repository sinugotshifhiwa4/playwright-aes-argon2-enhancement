import { TestExpectation } from '../../config/types/errors/error-handler.types';
import logger from '../../utils/logging/loggerManager';
import { CustomError } from '../../utils/errors/customError';
import { ErrorCategory } from '../../config/types/enums/error-category.enum';

export default class ApiTestExpectation {
  private static expectations = new Map<string, TestExpectation>();

  /**
   * Register expectation for a specific request context
   * @param contextKey Unique identifier for the request context
   * @param expectedStatusCodes Array of HTTP status codes that are expected
   * @param isNegativeTest Whether this is a negative test case
   */
  public static registerExpectation(
    contextKey: string,
    expectedStatusCodes: number[],
    isNegativeTest: boolean = false,
  ): void {
    this.expectations.set(contextKey, {
      expectedStatusCodes,
      isNegativeTest,
    });
  }

  /**
   * Check if a status code is expected for a specific context
   * @param contextKey The context identifier
   * @param statusCode The HTTP status code to check
   * @returns True if status code is expected for this context
   */
  public static isExpectedStatus(contextKey: string, statusCode: number): boolean {
    const expectation = this.expectations.get(contextKey);
    return expectation?.expectedStatusCodes.includes(statusCode) || false;
  }

  /**
   * Check if context is a negative test
   * @param contextKey The context identifier
   * @returns True if this context is registered as a negative test
   */
  public static isNegativeTest(contextKey: string): boolean {
    return this.expectations.get(contextKey)?.isNegativeTest || false;
  }

  /**
   * Validate context for positive test operations and log error if negative test
   * @param contextKey The context identifier
   * @param operationType The type of operation being performed (for logging)
   * @throws AppError if context is registered as negative test
   */
  public static validatePositiveTestContext(
    contextKey: string,
    operationType: string = 'operation',
  ): void {
    if (this.isNegativeTest(contextKey)) {
      const errorMessage = `Context '${contextKey}' is registered as negative test but ${operationType} expects positive test context`;
      logger.error(errorMessage, {
        contextKey,
        operationType,
        expectation: this.expectations.get(contextKey),
      });

      throw new CustomError(
        ErrorCategory.CONSTRAINT,
        { contextKey, operationType, isNegativeTest: true },
        errorMessage,
      );
    }
  }

  /**
   * Validate context for negative test operations and log error if positive test
   * @param contextKey The context identifier
   * @param operationType The type of operation being performed (for logging)
   * @throws AppError if context is not registered as negative test
   */
  public static validateNegativeTestContext(
    contextKey: string,
    operationType: string = 'operation',
  ): void {
    if (!this.isNegativeTest(contextKey)) {
      const errorMessage = `Context '${contextKey}' is not registered as negative test but ${operationType} expects negative test context`;
      logger.error(errorMessage, {
        contextKey,
        operationType,
        expectation: this.expectations.get(contextKey),
      });

      throw new CustomError(
        ErrorCategory.CONSTRAINT,
        { contextKey, operationType, isNegativeTest: false },
        errorMessage,
      );
    }
  }

  /**
   * Check and log warning if context test type doesn't match expected type
   * @param contextKey The context identifier
   * @param expectedNegative Whether we expect this to be a negative test
   * @param operationType The type of operation being performed (for logging)
   * @returns True if context matches expected type
   */
  public static checkTestTypeMatch(
    contextKey: string,
    expectedNegative: boolean,
    operationType: string = 'operation',
  ): boolean {
    const isNegative = this.isNegativeTest(contextKey);

    if (isNegative !== expectedNegative) {
      const warningMessage =
        `Test type mismatch for context '${contextKey}': ` +
        `registered as ${isNegative ? 'negative' : 'positive'} test but ` +
        `${operationType} expects ${expectedNegative ? 'negative' : 'positive'} test`;

      logger.warn(warningMessage, {
        contextKey,
        registeredAsNegative: isNegative,
        expectedNegative,
        operationType,
        expectation: this.expectations.get(contextKey),
      });

      return false;
    }

    return true;
  }

  /**
   * Clear expectations after test completion
   */
  public static clearExpectations(): void {
    this.expectations.clear();
  }

  /**
   * Get all registered expectations (useful for debugging)
   */
  public static getExpectations(): Map<string, TestExpectation> {
    return new Map(this.expectations);
  }

  /**
   * Remove a specific expectation
   * @param contextKey The context identifier to remove
   */
  public static removeExpectation(contextKey: string): void {
    this.expectations.delete(contextKey);
  }

  /**
   * Check if a context exists in expectations
   * @param contextKey The context identifier
   * @returns True if context is registered
   */
  public static hasExpectation(contextKey: string): boolean {
    return this.expectations.has(contextKey);
  }

  /**
   * Get expectation details for a context
   * @param contextKey The context identifier
   * @returns The expectation object or null if not found
   */
  public static getExpectation(contextKey: string): TestExpectation | null {
    return this.expectations.get(contextKey) || null;
  }
}
