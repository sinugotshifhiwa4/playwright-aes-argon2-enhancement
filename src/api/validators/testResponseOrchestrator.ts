import { AxiosResponse, AxiosError } from 'axios';
import { CustomError } from '../../utils/errors/customError';
import { ErrorCategory } from '../../config/types/enums/error-category.enum';
import ApiTestExpectation from '../context/apiTestExpectation';
import ApiResponseProcessor from './apiResponseProcessor';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export default class TestResponseValidator {
  /**
   * General method to validate any response with proper context checking
   * @param response - The API response
   * @param expectedStatusCode - The expected status code
   * @param context - The operation context
   * @param forceTestType - Optional: force a specific test type validation
   * @param allowEmptyResponse - Optional: allow empty response data (default: false)
   */
  public static validateResponse(
    response: AxiosResponse | null,
    expectedStatusCode: number,
    context: string,
    forceTestType?: 'positive' | 'negative',
    allowEmptyResponse: boolean = false,
  ): void {
    const isNegativeTest = ApiTestExpectation.isNegativeTest(context);
    const actualTestType = isNegativeTest ? 'negative' : 'positive';

    this.logTestTypeDiscrepancy(forceTestType, actualTestType, context);

    // Route to appropriate validation method
    if (isNegativeTest) {
      this.validateNegativeTestResponse(response, expectedStatusCode, context);
    } else {
      this.validatePositiveTestResponse(response, expectedStatusCode, context, allowEmptyResponse);
    }
  }

  /**
   * Validates API responses for positive test flows with comprehensive error handling.
   */
  private static validatePositiveTestResponse(
    response: AxiosResponse | null,
    expectedStatusCode: number,
    context: string,
    allowEmptyResponse: boolean = false,
  ): void {
    try {
      const validatedResponse = ApiResponseProcessor.assertResponseNotNull(response, context);
      this.validateStatusCode(validatedResponse.status, expectedStatusCode, context);
      ApiResponseProcessor.validateResponseData(validatedResponse, context, allowEmptyResponse);
      ApiResponseProcessor.validateHttpStatus(validatedResponse);
    } catch (error) {
      if (this.isExpectedNegativeTestFailure(error, context)) {
        return;
      }

      ErrorHandler.captureError(
        error,
        'validatePositiveTestResponse',
        'Failed to validate API response',
      );
      throw error;
    }
  }

  // Extracted smaller components for negative test validation

  /**
   * Handles null response validation for negative tests
   */
  private static handleNullResponseForNegativeTest(context: string): void {
    logger.info(`Null response received as expected for negative test [${context}]`);

    const expectation = ApiTestExpectation.getExpectation(context);
    const expectedCodes = expectation?.expectedStatusCodes || [];

    if (expectedCodes.length > 0) {
      logger.warn(
        `Negative test [${context}] expected status codes [${expectedCodes.join(', ')}] but received null response`,
      );
    }

    logger.info(`Null response treated as expected for negative test [${context}]`);
  }

  /**
   * Validates status code specifically for negative tests
   */
  private static validateNegativeTestStatus(response: AxiosResponse, context: string): boolean {
    if (this.isValidNegativeTestStatus(response.status, context)) {
      logger.info(`Negative test [${context}] passed as expected with status: ${response.status}`);
      return true;
    }

    this.handleNegativeTestResponse(response.status, context);
    return false;
  }

  /**
   * Simplified negative test response validation
   */
  private static validateNegativeTestResponse(
    response: AxiosResponse | null,
    expectedStatusCode: number,
    context: string,
  ): void {
    const isNegativeTest = ApiTestExpectation.isNegativeTest(context);

    this.logNegativeTestContextInfo(isNegativeTest, context, expectedStatusCode);

    // Early return for null response in negative tests
    if (!response && isNegativeTest) {
      this.handleNullResponseForNegativeTest(context);
      return;
    }

    try {
      const validatedResponse = ApiResponseProcessor.assertResponseNotNull(response, context);

      if (isNegativeTest) {
        this.validateNegativeTestStatus(validatedResponse, context);
        return;
      }

      // Fallback for positive tests (defensive programming)
      this.validateStatusCode(validatedResponse.status, expectedStatusCode, context);
    } catch (error) {
      if (isNegativeTest && this.handleNegativeTestError(error, context)) {
        return;
      }

      logger.error(
        `Response Validation Failed in [${context}]: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Simplified status code validation with clear separation of concerns
   */
  private static validateStatusCode(actual: number, expected: number, context: string): void {
    const isNegativeTest = ApiTestExpectation.isNegativeTest(context);

    if (isNegativeTest) {
      this.validateNegativeStatusCode(actual, context);
      return;
    }

    this.validatePositiveStatusCode(actual, expected, context);
  }

  /**
   * Focused validation for negative test status codes
   */
  private static validateNegativeStatusCode(actual: number, context: string): void {
    if (this.isValidNegativeTestStatus(actual, context)) {
      logger.info(`Negative test [${context}] status validation passed with code: ${actual}`);
      return;
    }

    const expectation = ApiTestExpectation.getExpectation(context);
    const registeredExpectedCodes = expectation?.expectedStatusCodes || [];

    const errorMessage = `Negative test [${context}] status validation failed - Expected: [${registeredExpectedCodes.join(' or ')}], Received: ${actual}`;
    logger.error(errorMessage);

    throw new CustomError(
      ErrorCategory.CONSTRAINT,
      {
        context,
        expectedStatusCodes: registeredExpectedCodes,
        actualStatusCode: actual,
        isNegativeTest: true,
      },
      errorMessage,
    );
  }

  /**
   * Focused validation for positive test status codes
   */
  private static validatePositiveStatusCode(
    actual: number,
    expected: number,
    context: string,
  ): void {
    const expectation = ApiTestExpectation.getExpectation(context);
    const registeredExpectedCodes = expectation?.expectedStatusCodes || [];

    if (registeredExpectedCodes.length > 0) {
      this.validateAgainstRegisteredExpectations(
        actual,
        expected,
        context,
        registeredExpectedCodes,
      );
      return;
    }

    this.validateAgainstPassedParameter(actual, expected, context);
  }

  private static handleAxiosErrorInNegativeTest(error: AxiosError, context: string): boolean {
    const actualStatus = error.response!.status;
    const expectation = ApiTestExpectation.getExpectation(context);
    const registeredExpectedCodes = expectation?.expectedStatusCodes || [];

    logger.info(`Handling AxiosError in negative test [${context}] with status: ${actualStatus}`);

    if (registeredExpectedCodes.length === 0) {
      return this.handleAxiosErrorWithoutExpectedCodes(actualStatus, context);
    }

    return this.handleAxiosErrorWithExpectedCodes(actualStatus, registeredExpectedCodes, context);
  }

  /**
   * Handles AxiosError when no expected codes are registered
   */
  private static handleAxiosErrorWithoutExpectedCodes(
    actualStatus: number,
    context: string,
  ): boolean {
    logger.warn(
      `Negative test [${context}] has no registered expected status codes, treating status ${actualStatus} as valid`,
    );

    if (actualStatus >= 400) {
      logger.info(
        `AxiosError with error status ${actualStatus} treated as expected for negative test [${context}]`,
      );
      return true;
    }

    ErrorHandler.logAndThrow(
      `Negative test [${context}] has no registered expected status codes for validation`,
      'handleNegativeTestError',
    );
    return false;
  }

  /**
   * Handles AxiosError when expected codes are registered
   */
  private static handleAxiosErrorWithExpectedCodes(
    actualStatus: number,
    registeredExpectedCodes: number[],
    context: string,
  ): boolean {
    if (registeredExpectedCodes.includes(actualStatus)) {
      logger.info(
        `Negative test [${context}] PASSED - AxiosError status ${actualStatus} matches registered expectations [${registeredExpectedCodes.join(', ')}]`,
      );
      return true;
    }

    logger.error(
      `Negative test [${context}] failed: Expected status [${registeredExpectedCodes.join(' or ')}], but received ${actualStatus} via AxiosError`,
    );
    ErrorHandler.logAndThrow(
      `Negative test [${context}] failed: Expected status [${registeredExpectedCodes.join(' or ')}], but received ${actualStatus}`,
      'handleNegativeTestError',
    );
  }

  /**
   * Validates status code against registered expectations
   */
  private static validateAgainstRegisteredExpectations(
    actual: number,
    expected: number,
    context: string,
    registeredExpectedCodes: number[],
  ): void {
    if (registeredExpectedCodes.includes(actual)) {
      logger.info(
        `Status validation PASSED [${context}]: ${actual} matches registered expectation [${registeredExpectedCodes.join(', ')}]`,
      );
      return;
    }

    const errorMessage = `Status validation FAILED [${context}] - Registered expectation: [${registeredExpectedCodes.join(' or ')}], Actual: ${actual}`;
    logger.error(errorMessage, {
      context,
      registeredExpectedCodes,
      actualStatusCode: actual,
      passedExpectedCode: expected,
      isNegativeTest: ApiTestExpectation.isNegativeTest(context),
      validationSource: 'registered_expectations',
    });

    throw new CustomError(
      ErrorCategory.CONSTRAINT,
      {
        context,
        registeredExpectedCodes,
        actualStatusCode: actual,
        passedExpectedCode: expected,
      },
      errorMessage,
    );
  }

  /**
   * Validates status code against passed parameter (fallback)
   */
  private static validateAgainstPassedParameter(
    actual: number,
    expected: number,
    context: string,
  ): void {
    logger.warn(
      `No registered expectations found for [${context}], falling back to passed parameter: ${expected}`,
    );

    if (actual === expected) {
      logger.info(`Status validation PASSED [${context}]: ${actual} (fallback validation)`);
      return;
    }

    // Check negative test alternative logic - but this should be handled earlier
    if (
      ApiTestExpectation.isNegativeTest(context) &&
      this.isValidNegativeTestStatus(actual, context)
    ) {
      logger.info(`Negative test [${context}] validation passed with fallback logic: ${actual}`);
      return;
    }

    this.throwStatusCodeMismatchError(actual, expected, context);
  }

  /**
   * Handles status validation for negative test responses
   * This should only be called when status is NOT valid
   */
  private static handleNegativeTestResponse(status: number, context: string): void {
    const expectation = ApiTestExpectation.getExpectation(context);
    const expectedCodes = expectation?.expectedStatusCodes || [];
    const errorMessage = `Negative test [${context}] status code mismatch - Expected: [${expectedCodes.join(' or ')}], Received: ${status}`;

    logger.error(errorMessage, {
      context,
      expectedStatusCodes: expectedCodes,
      actualStatusCode: status,
      isNegativeTest: true,
    });

    throw new CustomError(
      ErrorCategory.CONSTRAINT,
      {
        context,
        expectedStatusCodes: expectedCodes,
        actualStatusCode: status,
        isNegativeTest: true,
      },
      errorMessage,
    );
  }

  /**
   * Checks if a status code is valid for a negative test
   * Enhanced with consistent logging
   */
  private static isValidNegativeTestStatus(actual: number, context: string): boolean {
    // First check if it's an expected status using the registry
    if (ApiTestExpectation.isExpectedStatus(context, actual)) {
      logger.info(`Received expected status code ${actual} for negative test: ${context}`);
      return true;
    }

    const expectation = ApiTestExpectation.getExpectation(context);
    const expectedCodes = expectation?.expectedStatusCodes || [];

    // If no expected codes are registered, be more lenient for negative tests
    if (expectedCodes.length === 0) {
      logger.warn(
        `No expected status codes registered for negative test [${context}], received: ${actual}`,
      );
      // For negative tests, common error status codes could still be valid
      if (actual >= 400) {
        logger.info(
          `Status code ${actual} treated as valid for negative test [${context}] (no specific expectations registered)`,
        );
        return true;
      }
    }

    // Log the mismatch but don't throw here - let caller handle
    logger.debug(
      `Status code validation check for negative test [${context}] - Expected: [${expectedCodes.join(' or ')}], Received: ${actual}`,
      {
        context,
        expectedStatusCodes: expectedCodes,
        actualStatusCode: actual,
        isNegativeTest: true,
      },
    );

    return false;
  }

  /**
   * Handles error responses in negative test context
   * Enhanced with better logging and flow control
   */
  private static handleNegativeTestError(error: unknown, context: string): boolean {
    // Log the error we're handling
    logger.debug(
      `Handling error in negative test [${context}]: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Expected failure for negative test
    if (this.isExpectedNegativeTestFailure(error, context)) {
      logger.info(`Expected failure handled in negative test [${context}]`);
      return true;
    }

    // Constraint violation - must fail, but log first
    if (error instanceof CustomError && error.category === ErrorCategory.CONSTRAINT) {
      logger.error(`Constraint violation in negative test [${context}]: ${error.message}`);
      ErrorHandler.logAndThrow(
        `Negative test validation failed [${context}]: ${error.message}`,
        'handleNegativeTestError',
      );
    }

    // Handle AxiosError with response
    if (error instanceof AxiosError && error.response) {
      return this.handleAxiosErrorInNegativeTest(error, context);
    }

    // Handle non-HTTP errors
    return this.handleNonHttpErrorInNegativeTest(error, context);
  }

  /**
   * Handles non-HTTP errors in negative test context
   */
  private static handleNonHttpErrorInNegativeTest(error: unknown, context: string): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.info(`Non-HTTP error in negative test [${context}]: ${errorMessage}`, {
      context,
      errorType: 'NON_HTTP_ERROR',
      error: errorMessage,
    });

    logger.info(`Non-HTTP error treated as expected behavior in negative test [${context}]`);
    return true;
  }

  /**
   * Logs test type discrepancy information
   */
  private static logTestTypeDiscrepancy(
    forceTestType: 'positive' | 'negative' | undefined,
    actualTestType: string,
    context: string,
  ): void {
    if (forceTestType && forceTestType !== actualTestType) {
      const expectation = ApiTestExpectation.getExpectation(context);
      logger.info(`Test type information for context '${context}'`, {
        context,
        registeredType: actualTestType,
        forcedType: forceTestType,
        testExpectation: {
          expectedStatusCodes: expectation?.expectedStatusCodes || [],
          isNegativeTest: expectation?.isNegativeTest || false,
        },
        message: `Context is registered as ${actualTestType} test but validation requested as ${forceTestType}`,
      });
    }
  }

  /**
   * Logs negative test context information and validates test type configuration
   * @param isNegativeTest - Whether the current context is a negative test
   * @param context - The operation context
   * @param expectedStatusCode - The expected status code parameter
   * @returns true if test type is correctly configured, false if there's a mismatch
   */
  private static logNegativeTestContextInfo(
    isNegativeTest: boolean,
    context: string,
    expectedStatusCode: number,
  ): boolean {
    const expectation = ApiTestExpectation.getExpectation(context);

    if (!isNegativeTest) {
      // Context is registered as positive but we're in negative test validation
      // This indicates a potential configuration issue
      logger.warn(`Test type mismatch detected for context '${context}'`, {
        context,
        method: 'validateNegativeTestResponse',
        expectedStatusCode,
        actualTestType: 'positive',
        expectedTestType: 'negative',
        testExpectation: {
          expectedStatusCodes: expectation?.expectedStatusCodes || [],
          isNegativeTest: expectation?.isNegativeTest || false,
        },
        message: 'Context is registered as positive test but being validated as negative test',
      });
      return false;
    }

    // Properly configured negative test - only log at debug level for normal operation
    // logger.debug(`Processing negative test [${context}]`, {
    //   context,
    //   method: 'validateNegativeTestResponse',
    //   expectedStatusCode,
    //   isNegativeTest: true,
    //   testExpectation: {
    //     expectedStatusCodes: expectation?.expectedStatusCodes || [],
    //     isNegativeTest: expectation?.isNegativeTest || false,
    //   },
    //   message: 'Context is properly configured as negative test',
    // });

    return true;
  }

  /**
   * Check if an error is an expected failure in a negative test
   */
  private static isExpectedNegativeTestFailure(error: unknown, context: string): boolean {
    if (error instanceof CustomError && error.category === ErrorCategory.EXPECTED_FAILURE) {
      logger.info(`Expected failure in negative test [${context}]: ${error.message}`);
      return true;
    }
    return false;
  }

  /**
   * Throws an error for status code mismatch
   */
  private static throwStatusCodeMismatchError(
    actual: number,
    expected: number,
    context: string,
  ): void {
    const errorMessage = `Status code mismatch [${context}] - Expected: ${expected}, Received: ${actual}.`;
    logger.error(errorMessage);
    throw new CustomError(ErrorCategory.CONSTRAINT, { context }, errorMessage);
  }
}
