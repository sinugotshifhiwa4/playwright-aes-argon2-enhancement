import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { EnvironmentSecretFileManager } from '../../utils/environment/environmentSecretFileManager';
import { SECURITY_CONFIG } from '../config/security.constant';
import { COMMON_WEAK_KEYS } from '../config/commonWeakKeys';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import { SECURITY_CONSTANTS } from '../config/security.constant';
import ErrorHandler from '../../utils/errors/errorHandler';

export class CryptoManager {

  public static isEncrypted(value: string): boolean {
    if (!value || typeof value !== 'string') return false;

    if (!value.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX)) return false;

    const encryptedPart = value.substring(SECURITY_CONSTANTS.FORMAT.PREFIX.length);
    const parts = encryptedPart.split(SECURITY_CONSTANTS.FORMAT.SEPARATOR);

    return (
      parts.length === SECURITY_CONSTANTS.FORMAT.EXPECTED_PARTS &&
      parts.every((part) => part && this.isValidBase64(part))
    );
  }

  public static async getSecretKeyFromEnvironment(secretKeyVariable: string): Promise<string> {
    try {
      // Create instance of SecretKeyManager
      const environmentSecretFileManager = new EnvironmentSecretFileManager();
      const baseEnvFilePath = await environmentSecretFileManager.getBaseEnvironmentFilePath();
      const secretKeyValue = await environmentSecretFileManager.getKeyValue(baseEnvFilePath, secretKeyVariable);

      if (!secretKeyValue) {
        ErrorHandler.logAndThrow(
          `Secret key variable '${secretKeyVariable}' not found in environment file`,
          'CryptoManager.getSecretKeyFromEnvironment',
        );
      }

      return secretKeyValue;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'getSecretKeyFromEnvironment',
        `Failed to load secret key variable '${secretKeyVariable}`,
      );
      throw error;
    }
  }

  public static validateSecretKey(secretKey: string): void {
    if (!secretKey || typeof secretKey !== 'string') {
      ErrorHandler.logAndThrow(
        'Secret key must be a non-empty string',
        'CryptoManager.validateSecretKey',
      );
    }

    if (secretKey.length < 16) {
      ErrorHandler.logAndThrow(
        `Secret key must be at least 16 characters long`,
        'CryptoManager.validateSecretKey',
      );
    }

    if (COMMON_WEAK_KEYS.some((weak) => secretKey.toLowerCase() === weak.toLowerCase())) {
      ErrorHandler.logAndThrow(
        'Secret key appears to be a common weak key',
        'CryptoManager.validateSecretKey',
      );
    }
  }

  public static validateInputs(value: string, secretKey: string, operation: string): void {
    if (!value || typeof value !== 'string') {
      ErrorHandler.logAndThrow(
        `${operation}: Value must be a non-empty string`,
        'CryptoManager.validateInputs',
      );
    }
    if (!secretKey || typeof secretKey !== 'string') {
      ErrorHandler.logAndThrow(
        `${operation}: Secret key must be a non-empty string`,
        'CryptoManager.validateSecretKey',
      );
    }
  }

  public static async computeHMAC(key: CryptoKey, data: Buffer): Promise<string> {
    const signature = await crypto.subtle.sign('HMAC', key, data);
    return Buffer.from(signature).toString(FileEncoding.BASE64);
  }

  public static constantTimeCompare(firstValue: string, secondValue: string): boolean {
    if (firstValue.length !== secondValue.length) return false;

    let comparisonResult = 0;
    for (let i = 0; i < firstValue.length; i++) {
      comparisonResult |= firstValue.charCodeAt(i) ^ secondValue.charCodeAt(i);
    }
    return comparisonResult === 0;
  }

  public static async encryptBuffer(
    webCryptoIv: Uint8Array,
    key: CryptoKey,
    value: string,
  ): Promise<ArrayBuffer> {
    try {
      const textEncoder = new TextEncoder();
      return await crypto.subtle.encrypt(
        {
          name: SECURITY_CONSTANTS.CRYPTO.ALGORITHM,
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

  public static async decryptBuffer(
    ivBuffer: Uint8Array,
    key: CryptoKey,
    cipherBuffer: Uint8Array,
  ): Promise<ArrayBuffer> {
    try {
      return await crypto.subtle.decrypt(
        {
          name: SECURITY_CONSTANTS.CRYPTO.ALGORITHM,
          iv: ivBuffer,
        },
        key,
        cipherBuffer,
      );
    } catch (error) {
      const errorAsError = error as Error;
      ErrorHandler.captureError(
        error,
        'decryptBuffer',
        `Failed to decrypt with AES-GCM, message: ${errorAsError.message}`,
      );
      throw error;
    }
  }

  public static async deriveKeysWithArgon2(
    secretKey: string,
    salt: string,
  ): Promise<{ encryptionKey: CryptoKey; hmacKey: CryptoKey }> {
    try {
      this.validateBase64String(salt, 'salt');

      const saltBuffer = Buffer.from(salt, FileEncoding.BASE64);

      const options: argon2.Options = {
        type: argon2.argon2id,
        hashLength:
          SECURITY_CONFIG.BYTE_LENGTHS.SECRET_KEY + SECURITY_CONFIG.BYTE_LENGTHS.HMAC_KEY_LENGTH,
        salt: saltBuffer,
        memoryCost: SECURITY_CONFIG.ARGON2_PARAMETERS.MEMORY_COST,
        timeCost: SECURITY_CONFIG.ARGON2_PARAMETERS.TIME_COST,
        parallelism: SECURITY_CONFIG.ARGON2_PARAMETERS.PARALLELISM,
      };

      const derivedKeyBuffer = await this.argon2Hashing(secretKey, options);

      const encryptionKeyBuffer = derivedKeyBuffer.subarray(
        0,
        SECURITY_CONFIG.BYTE_LENGTHS.SECRET_KEY,
      );
      const hmacKeyBuffer = derivedKeyBuffer.subarray(SECURITY_CONFIG.BYTE_LENGTHS.SECRET_KEY);

      const encryptionKey = await this.importKeyForCrypto(Buffer.from(encryptionKeyBuffer));
      const hmacKey = await this.importKeyForHMAC(Buffer.from(hmacKeyBuffer));

      return { encryptionKey, hmacKey };
    } catch (error) {
      ErrorHandler.captureError(error, 'deriveKeysWithArgon2', 'Failed to derive keys.');
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
        { name: SECURITY_CONSTANTS.CRYPTO.ALGORITHM },
        false,
        SECURITY_CONSTANTS.CRYPTO.KEY_USAGE,
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

  private static async importKeyForHMAC(keyBuffer: Buffer): Promise<CryptoKey> {
    try {
      return await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      );
    } catch (error) {
      ErrorHandler.captureError(error, 'importKeyForHMAC', 'Failed to import key for HMAC.');
      throw error;
    }
  }

  private static validateBase64String(value: string, fieldName: string): void {
    if (!value || typeof value !== 'string') {
      ErrorHandler.logAndThrow(
        `${fieldName} must be a non-empty string`,
        'CryptoManager.validateBase64String',
      );
    }

    if (!this.isValidBase64(value)) {
      ErrorHandler.logAndThrow(
        `${fieldName} is not a valid base64 string`,
        'CryptoManager.validateBase64String',
      );
    }
  }

  public static isValidBase64(value: string): boolean {
    if (!value || typeof value !== 'string') {
      return false;
    }

    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(value)) {
      return false;
    }

    if (value.length % 4 !== 0) {
      return false;
    }

    try {
      Buffer.from(value, FileEncoding.BASE64);
      return true;
    } catch (error) {
      ErrorHandler.captureError(error, 'isValidBase64', 'Failed to validate base64 string');
      return false;
    }
  }
}
