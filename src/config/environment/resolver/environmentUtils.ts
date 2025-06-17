import EnvironmentDetector from '../detector/detector';
import { CryptoService } from '../../../cryptography/service/cryptoService';
import SanitizationConfig from '../../../utils/sanitization/sanitizationConfig';
import { Credentials } from '../../types/auth/credentials.types';
import { EnvironmentSecretKeys } from '../dotenv/constants';
import { EnvironmentStage } from '../dotenv/types';
import ErrorHandler from '../../../utils/errors/errorHandler';

export class EnvironmentUtils {
  /**
   * Generic method to fetch environment variables based on environment
   * @param ciMethod - Method to call in CI environment
   * @param localMethod - Method to call in local environment
   * @param methodName - Name of the calling method for error tracking
   * @param errorMessage - Error message for failures
   */
  public static async getEnvironmentValue<T>(
    ciMethod: () => Promise<T>,
    localMethod: () => Promise<T>,
    methodName: string,
    errorMessage: string,
  ): Promise<T> {
    try {
      return await (EnvironmentDetector.isCI() ? ciMethod() : localMethod());
    } catch (error) {
      ErrorHandler.captureError(error, methodName, errorMessage);
      throw error;
    }
  }

  public static async getEnvironmentVariable<T>(
    getValue: () => T,
    variableName: string,
    methodName: string,
    errorMessage: string,
  ): Promise<T> {
    try {
      const value = getValue();
      this.validateEnvironmentVariable(String(value), variableName); // Validate string form

      const shouldSanitize = EnvironmentDetector.isCI();

      if (typeof value === 'string') {
        return shouldSanitize ? (SanitizationConfig.sanitizeString(value) as T) : value;
      }

      return value;
    } catch (error) {
      ErrorHandler.captureError(error, methodName, errorMessage);
      throw error;
    }
  }

  /**
   * Decrypts credentials using the provided secret key
   */
  public static async decryptCredentials(
    username: string,
    password: string,
    secretKey: string,
  ): Promise<Credentials> {
    try {
      return {
        username: await CryptoService.decrypt(username, secretKey),
        password: await CryptoService.decrypt(password, secretKey),
      };
    } catch (error) {
      ErrorHandler.captureError(error, 'decryptCredentials', 'Failed to decrypt credentials');
      throw error;
    }
  }

  /**
   * Verifies that the provided credentials contain both a username and password
   */
  public static verifyCredentials(credentials: Credentials): void {
    if (!credentials.username || !credentials.password) {
      ErrorHandler.logAndThrow(
        'Invalid credentials: Missing username or password.',
        'FetchLocalEnvironmentVariables',
      );
    }
  }

  /**
   * Validates that an environment variable is not empty
   */
  public static validateEnvironmentVariable(value: string, variableName: string): void {
    if (!value || value.trim() === '') {
      ErrorHandler.logAndThrow(
        `Environment variable ${variableName} is not set or is empty`,
        'FetchLocalEnvironmentVariables',
      );
    }
  }

  /**
   * Get the appropriate secret key for the given environment
   */
  public static getSecretKeyForEnvironment(environment: EnvironmentStage): string {
    switch (environment) {
      case 'dev':
        return EnvironmentSecretKeys.DEV;
      case 'uat':
        return EnvironmentSecretKeys.UAT;
      case 'prod':
        return EnvironmentSecretKeys.PROD;
      default:
        ErrorHandler.logAndThrow(
          `Failed to select secret key. Invalid environment: ${environment}. Must be 'dev', 'uat', or 'prod'`,
          'getSecretKeyForEnvironment',
        );
    }
  }
}
