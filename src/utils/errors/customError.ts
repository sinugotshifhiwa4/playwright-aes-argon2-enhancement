import { ErrorCategory } from '../../config/types/enums/error-category.enum';

export class CustomError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    public readonly details?: Record<string, unknown>,
    message?: string,
  ) {
    super(message || CustomError.getDefaultMessage(category));
    this.name = 'Custom Error';

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, CustomError.prototype);
  }

  /**
   * Get a default message based on error category
   */
  private static getDefaultMessage(category: ErrorCategory): string {
    const messages: Partial<Record<ErrorCategory, string>> = {
      [ErrorCategory.DATABASE]: 'Database operation failed',
      [ErrorCategory.NETWORK]: 'Network request failed',
      [ErrorCategory.AUTHENTICATION]: 'Authentication failed',
      [ErrorCategory.AUTHORIZATION]: 'Access denied',
      [ErrorCategory.NOT_FOUND]: 'Resource not found',
      [ErrorCategory.VALIDATION]: 'Validation failed',
      [ErrorCategory.TIMEOUT]: 'Operation timed out',
      [ErrorCategory.CONFIGURATION]: 'Configuration error',
    };

    return messages[category] || 'An error occurred';
  }
}
