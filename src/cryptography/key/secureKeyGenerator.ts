import * as crypto from 'crypto';
import { SECURITY_CONFIG } from '../constants/security.constant';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import ErrorHandler from '../../utils/errors/errorHandler';

export default class SecureKeyGenerator {
  // Set base64 as buffer encoding
  private static readonly BASE_64: BufferEncoding = FileEncoding.BASE64;

  // Parameters from configuration file for easier access
  private static readonly IV_LENGTH = SECURITY_CONFIG.BYTE_LENGTHS.IV;
  private static readonly WEB_CRYPTO_IV_LENGTH = SECURITY_CONFIG.BYTE_LENGTHS.WEB_CRYPTO_IV;
  private static readonly SALT_LENGTH = SECURITY_CONFIG.BYTE_LENGTHS.SALT;
  private static readonly SECRET_KEY_LENGTH = SECURITY_CONFIG.BYTE_LENGTHS.SECRET_KEY;

  // Constants for validation
  private static readonly MAX_REASONABLE_LENGTH = 1024; // 1KB max for sanity check
  private static readonly MIN_SECURE_LENGTH = 8; // Minimum for basic security

  /**
   * Generates a cryptographically secure initialization vector (IV) as a base64-encoded string.
   * @param length The IV length in bytes. Defaults to the configured IV length.
   * @returns A base64-encoded string containing the IV.
   * @throws {Error} If the length is invalid or IV generation fails.
   */
  public static generateBase64IV(length: number = this.IV_LENGTH): string {
    this.validateLength(length, 'generateBase64IV');

    try {
      return crypto.randomBytes(length).toString(this.BASE_64);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateBase64IV',
        `Failed to generate IV of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Generates a cryptographically secure initialization vector (IV) as a Buffer.
   * @param length The IV length in bytes. Defaults to the configured IV length.
   * @returns A Buffer containing the IV.
   * @throws {Error} If the length is invalid or IV generation fails.
   */
  public static generateBufferIV(length: number = this.IV_LENGTH): Buffer {
    this.validateLength(length, 'generateBufferIV');

    try {
      return crypto.randomBytes(length);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateBufferIV',
        `Failed to generate IV of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Checks if Web Crypto API is available in the current environment.
   * @returns {boolean} True if Web Crypto API is available, false otherwise.
   */
  private static isWebCryptoAvailable(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.crypto !== 'undefined' &&
      typeof globalThis.crypto.subtle !== 'undefined' &&
      typeof globalThis.crypto.getRandomValues === 'function'
    );
  }

  /**
   * Generates a cryptographically secure Uint8Array using Web Crypto API or Node.js crypto.
   * @param length The length in bytes for the Uint8Array.
   * @returns A Uint8Array containing cryptographically secure random values.
   * @throws {Error} If the length is invalid or generation fails.
   */
  private static generateSecureUint8Array(length: number): Uint8Array {
    this.validateLength(length, 'generateSecureUint8Array');

    try {
      if (this.isWebCryptoAvailable()) {
        const array = new Uint8Array(length);
        globalThis.crypto.getRandomValues(array);
        return array;
      } else {
        return new Uint8Array(crypto.randomBytes(length));
      }
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateSecureUint8Array',
        `Failed to generate secure Uint8Array of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Generates a cryptographically secure IV using the Web Crypto API or Node.js crypto.
   * @param length The IV length in bytes. Defaults to the configured Web Crypto IV length.
   * @returns A Buffer containing the secure IV.
   * @throws {Error} If the length is invalid or IV generation fails.
   */
  public static generateWebCryptoIV(length: number = this.WEB_CRYPTO_IV_LENGTH): Buffer {
    this.validateLength(length, 'generateWebCryptoIV');

    try {
      const secureUint8Array = this.generateSecureUint8Array(length);
      return Buffer.from(secureUint8Array);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateWebCryptoIV',
        `Failed to generate Web Crypto IV of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Generates a cryptographically secure random salt as a base64 string.
   * @param length The salt length in bytes. Defaults to the configured salt length.
   * @returns A base64-encoded string containing the salt.
   * @throws {Error} If the length is invalid or salt generation fails.
   */
  public static generateBase64Salt(length: number = this.SALT_LENGTH): string {
    this.validateLength(length, 'generateBase64Salt');

    try {
      return crypto.randomBytes(length).toString(this.BASE_64);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateBase64Salt',
        `Failed to generate salt of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Generates a cryptographically secure random salt as a Buffer.
   * @param length The salt length in bytes. Defaults to the configured salt length.
   * @returns A Buffer containing the salt.
   * @throws {Error} If the length is invalid or salt generation fails.
   */
  public static generateBufferSalt(length: number = this.SALT_LENGTH): Buffer {
    this.validateLength(length, 'generateBufferSalt');

    try {
      return crypto.randomBytes(length);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateBufferSalt',
        `Failed to generate salt buffer of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Generates a cryptographically secure random secret key as a base64 string.
   * @param length The length of the secret key in bytes. Defaults to the configured secret key length.
   * @returns A base64-encoded string containing the secret key.
   * @throws {Error} If the length is invalid or key generation fails.
   */
  public static generateBase64SecretKey(length: number = this.SECRET_KEY_LENGTH): string {
    this.validateLength(length, 'generateBase64SecretKey');

    try {
      return crypto.randomBytes(length).toString(this.BASE_64);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateBase64SecretKey',
        `Failed to generate base64 secret key of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Generates a cryptographically secure random secret key as a Buffer.
   * @param length The length of the secret key in bytes. Defaults to the configured secret key length.
   * @returns A Buffer containing the secret key.
   * @throws {Error} If the length is invalid or key generation fails.
   */
  public static generateBufferSecretKey(length: number = this.SECRET_KEY_LENGTH): Buffer {
    this.validateLength(length, 'generateBufferSecretKey');

    try {
      return crypto.randomBytes(length);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateBufferSecretKey',
        `Failed to generate buffer secret key of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Generates a hex-encoded cryptographically secure random value.
   * @param length The length in bytes. Defaults to 32 bytes.
   * @returns A hex-encoded string.
   * @throws {Error} If the length is invalid or generation fails.
   */
  public static generateHexString(length: number = 32): string {
    this.validateLength(length, 'generateHexString');

    try {
      return crypto.randomBytes(length).toString(FileEncoding.HEX);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateHexString',
        `Failed to generate hex string of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Validates that generated values meet minimum entropy requirements.
   * This is a basic check - for production, consider more sophisticated entropy analysis.
   * @param buffer The buffer to validate
   * @returns True if the buffer appears to have sufficient entropy
   */
  private static hasMinimumEntropy(buffer: Buffer): boolean {
    if (buffer.length === 0) return false;

    // Simple entropy check: ensure not all bytes are the same
    const firstByte = buffer[0];
    return !buffer.every((byte) => byte === firstByte);
  }

  public static secureWipe(buffer: Buffer): void {
    if (buffer && buffer.length > 0) {
      crypto.randomFillSync(buffer);
      buffer.fill(0);
    }
  }

  /**
   * Validates that a length parameter is within secure bounds
   * @param length The length to validate
   * @param methodName The calling method name for error context
   * @throws {Error} If the length is invalid
   */
  private static validateLength(length: number, methodName: string): void {
    if (!Number.isInteger(length)) {
      ErrorHandler.logAndThrow(`Length must be an integer, got ${length}`, methodName);
    }

    if (length < this.MIN_SECURE_LENGTH) {
      ErrorHandler.logAndThrow(
        `Length must be at least ${this.MIN_SECURE_LENGTH} bytes for security, got ${length}`,
        methodName,
      );
    }

    if (length > this.MAX_REASONABLE_LENGTH) {
      ErrorHandler.logAndThrow(
        `Length ${length} exceeds maximum reasonable length of ${this.MAX_REASONABLE_LENGTH} bytes`,
        methodName,
      );
    }
  }
}
