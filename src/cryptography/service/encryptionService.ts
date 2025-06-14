import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import SecureKeyGenerator from '../keyGenerator/secureKeyGenerator';
import { SECURITY_CONFIG } from '../../config/types/config/security.types';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import { ENCRYPTION_CONSTANTS } from '../utils/encryption.constant';
import { EncryptionResult } from '../../config/types/config/security.types';
import ErrorHandler from '../../utils/errors/errorHandler';

export default class EncryptionService {
  /**
   * Encrypts a given string value using the AES-GCM algorithm.
   * Returns the encrypted value in the format: ENC:salt:iv:cipherText
   *
   * @param value - The string value to encrypt.
   * @param secretKey - The secret key to use for derivation.
   * @returns A promise that resolves to the encrypted string in the format: ENC:salt:iv:cipherText
   * @throws {Error} If an error occurs during the derivation or encryption operations.
   */
  public static async encrypt(value: string, secretKey: string): Promise<string> {
    this.validateInputs(value, secretKey, 'encrypt');

    try {
      // Generate cryptographically secure random salt and IV
      const salt = SecureKeyGenerator.generateBase64Salt();
      const webCryptoIv = SecureKeyGenerator.generateWebCryptoIV();

      // Derive a key using Argon2
      const key = await this.deriveKeyWithArgon2(secretKey, salt);

      // Encrypt the value using AES-GCM
      const encryptedBuffer = await this.encryptBuffer(webCryptoIv, key, value);

      // Convert to base64 and format
      const iv = Buffer.from(webCryptoIv).toString(FileEncoding.BASE64);
      const cipherText = Buffer.from(encryptedBuffer).toString(FileEncoding.BASE64);

      return this.formatEncryptedString(salt, iv, cipherText);
    } catch (error) {
      ErrorHandler.captureError(error, 'encrypt', 'Failed to encrypt with AES-GCM.');
      throw error;
    }
  }

  /**
   * Decrypts a given encrypted string in format: ENC:salt:iv:cipherText
   *
   * @param encryptedData - The encrypted string to decrypt.
   * @param secretKey - The secret key to use for decryption.
   * @returns A promise that resolves to the decrypted string.
   * @throws Will throw an error if the decryption fails.
   */
  public static async decrypt(encryptedData: string, secretKey: string): Promise<string> {
    this.validateInputs(encryptedData, secretKey, 'decrypt');

    try {
      if (!this.isEncrypted(encryptedData)) {
        throw new Error('Invalid encrypted format. Expected format: ENC:salt:iv:cipherText');
      }

      const { salt, iv, cipherText } = this.parseEncryptedString(encryptedData);

      // Derive the key using Argon2
      const key = await this.deriveKeyWithArgon2(secretKey, salt);

      // Convert base64 back to buffers
      const ivBuffer = Buffer.from(iv, FileEncoding.BASE64);
      const cipherBuffer = Buffer.from(cipherText, FileEncoding.BASE64);

      // Decrypt using AES-GCM
      const decryptedBuffer = await this.decryptBuffer(ivBuffer, key, cipherBuffer);

      return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
      ErrorHandler.captureError(error, 'decrypt', 'Failed to decrypt with AES-GCM.');
      throw error;
    }
  }

  /**
   * Decrypts multiple encrypted data strings using a secret key.
   * Uses Promise.all for concurrent processing.
   */
  public static async decryptMultiple(
    encryptedDataArray: string[],
    secretKey: string,
  ): Promise<string[]> {
    if (!Array.isArray(encryptedDataArray)) {
      throw new Error('encryptedDataArray must be an array');
    }

    if (encryptedDataArray.length === 0) {
      return [];
    }

    try {
      return await Promise.all(encryptedDataArray.map((data) => this.decrypt(data, secretKey)));
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'decryptMultiple',
        'Failed to decrypt multiple values with AES-GCM.',
      );
      throw error;
    }
  }

  /**
   * Checks if a value is encrypted (has ENC: prefix)
   */
  public static isEncrypted(value: string): boolean {
    return (
      typeof value === 'string' &&
      value.length > ENCRYPTION_CONSTANTS.FORMAT.PREFIX_LENGTH &&
      value.startsWith(ENCRYPTION_CONSTANTS.FORMAT.PREFIX)
    );
  }

  /**
   * Legacy method - kept for backward compatibility but deprecated
   * @deprecated Use encrypt() instead which returns the proper format
   */
  public static async encryptToObject(value: string, secretKey: string): Promise<EncryptionResult> {
    try {
      const encryptedString = await this.encrypt(value, secretKey);
      const { salt, iv, cipherText } = this.parseEncryptedString(encryptedString);

      return { salt, iv, cipherText };
    } catch (error) {
      ErrorHandler.captureError(error, 'encryptToObject', 'Failed to encrypt to object format.');
      throw error;
    }
  }

  // Private utility methods
  private static validateInputs(value: string, secretKey: string, operation: string): void {
    if (!value || typeof value !== 'string') {
      throw new Error(`${operation}: Value must be a non-empty string`);
    }
    if (!secretKey || typeof secretKey !== 'string') {
      throw new Error(`${operation}: Secret key must be a non-empty string`);
    }
  }

  private static formatEncryptedString(salt: string, iv: string, cipherText: string): string {
    return `${ENCRYPTION_CONSTANTS.FORMAT.PREFIX}${salt}${ENCRYPTION_CONSTANTS.FORMAT.SEPARATOR}${iv}${ENCRYPTION_CONSTANTS.FORMAT.SEPARATOR}${cipherText}`;
  }

  private static parseEncryptedString(encryptedString: string): {
    salt: string;
    iv: string;
    cipherText: string;
  } {
    if (!this.isEncrypted(encryptedString)) {
      throw new Error('Invalid encrypted format. Expected format: ENC:salt:iv:cipherText');
    }

    const encryptedPart = encryptedString.substring(ENCRYPTION_CONSTANTS.FORMAT.PREFIX_LENGTH);
    const parts = encryptedPart.split(ENCRYPTION_CONSTANTS.FORMAT.SEPARATOR);

    if (parts.length !== ENCRYPTION_CONSTANTS.FORMAT.EXPECTED_PARTS) {
      throw new Error(
        `Invalid encrypted format. Expected: ENC:salt:iv:cipherText, got ${parts.length} parts`,
      );
    }

    const [salt, iv, cipherText] = parts;

    // Validate that all parts are non-empty
    if (!salt || !iv || !cipherText) {
      throw new Error('Invalid encrypted format: empty components detected');
    }

    // Validate base64 format for all components
    this.validateBase64String(salt, 'salt');
    this.validateBase64String(iv, 'iv');
    this.validateBase64String(cipherText, 'cipherText');

    return { salt, iv, cipherText };
  }

  private static async encryptBuffer(
    webCryptoIv: Uint8Array,
    key: CryptoKey,
    value: string,
  ): Promise<ArrayBuffer> {
    try {
      const textEncoder = new TextEncoder();
      return await crypto.subtle.encrypt(
        {
          name: ENCRYPTION_CONSTANTS.CRYPTO.ALGORITHM,
          iv: webCryptoIv,
        },
        key,
        textEncoder.encode(value),
      );
    } catch (error) {
      ErrorHandler.captureError(error, 'encryptBuffer', 'Failed to encrypt with AES-GCM.');
      throw error;
    }
  }

  private static async decryptBuffer(
    ivBuffer: Uint8Array,
    key: CryptoKey,
    cipherBuffer: Uint8Array,
  ): Promise<ArrayBuffer> {
    try {
      return await crypto.subtle.decrypt(
        {
          name: ENCRYPTION_CONSTANTS.CRYPTO.ALGORITHM,
          iv: ivBuffer,
        },
        key,
        cipherBuffer,
      );
    } catch (error) {
      ErrorHandler.captureError(error, 'decryptBuffer', 'Failed to decrypt with AES-GCM.');
      throw error;
    }
  }

  // Key derivation methods
  private static async deriveKeyWithArgon2(secretKey: string, salt: string): Promise<CryptoKey> {
    try {
      // Validate salt format before processing
      this.validateBase64String(salt, 'salt');

      const options: argon2.Options = {
        type: argon2.argon2id,
        hashLength: SECURITY_CONFIG.BYTE_LENGTHS.SECRET_KEY,
        salt: Buffer.from(salt, FileEncoding.BASE64),
        memoryCost: SECURITY_CONFIG.ARGON2_PARAMETERS.MEMORY_COST,
        timeCost: SECURITY_CONFIG.ARGON2_PARAMETERS.TIME_COST,
        parallelism: SECURITY_CONFIG.ARGON2_PARAMETERS.PARALLELISM,
      };

      const keyBuffer = await this.argon2Hashing(secretKey, options);
      return await this.importKeyForCrypto(keyBuffer);
    } catch (error) {
      ErrorHandler.captureError(error, 'deriveKeyWithArgon2', 'Failed to derive key.');
      throw error;
    }
  }

  private static async argon2Hashing(secretKey: string, options: argon2.Options): Promise<Buffer> {
    try {
      return await argon2.hash(secretKey, {
        ...options,
        raw: true,
      });
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'argon2Hashing',
        'Failed to derive key using Argon2 hashing.',
      );
      throw error;
    }
  }

  private static async importKeyForCrypto(keyBuffer: Buffer): Promise<CryptoKey> {
    try {
      return await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: ENCRYPTION_CONSTANTS.CRYPTO.ALGORITHM },
        false,
        ENCRYPTION_CONSTANTS.CRYPTO.KEY_USAGE,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'importKeyForCrypto',
        'Failed to import key for Web Crypto API.',
      );
      throw error;
    }
  }

  // Validation methods
  private static validateBase64String(value: string, fieldName: string): void {
    if (!value || typeof value !== 'string') {
      throw new Error(`${fieldName} must be a non-empty string`);
    }

    // Basic base64 format validation
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(value)) {
      throw new Error(`${fieldName} is not a valid base64 string`);
    }
  }
}
