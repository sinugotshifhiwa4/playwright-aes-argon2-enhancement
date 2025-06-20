import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import SecureKeyGenerator from '../key/secureKeyGenerator';
import { EnvironmentSecretFileManager } from './environmentSecretFileManager';
import { SECURITY_CONFIG } from '../constants/security.constant';
import { COMMON_WEAK_KEYS } from '../key/commonWeakKeys';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import { SECURITY_CONSTANTS } from '../constants/security.constant';
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
      const secretKeyValue = await environmentSecretFileManager.getKeyValue(
        baseEnvFilePath,
        secretKeyVariable,
      );

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

  // Encrypt

  /**
   * Helper to validate encryption prerequisites
   */
  public static async validateEncryptionPrerequisites(
    value: string,
    secretKeyVariable: string,
  ): Promise<string> {
    const actualSecretKey = await CryptoManager.getSecretKeyFromEnvironment(secretKeyVariable);
    CryptoManager.validateSecretKey(actualSecretKey);
    CryptoManager.validateInputs(value, actualSecretKey, 'encrypt');
    return actualSecretKey;
  }

  /**
   * Helper to generate encryption components (salt, IV, and derived keys)
   */
  public static async generateEncryptionComponents(secretKey: string): Promise<{
    salt: string;
    webCryptoIv: Uint8Array;
    encryptionKey: CryptoKey;
    hmacKey: CryptoKey;
  }> {
    const salt = SecureKeyGenerator.generateBase64Salt();
    const webCryptoIv = SecureKeyGenerator.generateWebCryptoIV();

    const { encryptionKey, hmacKey } = await CryptoManager.deriveKeysWithArgon2(secretKey, salt);

    return {
      salt,
      webCryptoIv,
      encryptionKey,
      hmacKey,
    };
  }

  private static formatEncryptedPayload(salt: string, iv: string, cipherText: string, hmacBase64: string): string {
    return `${SECURITY_CONSTANTS.FORMAT.PREFIX}${salt}:${iv}:${cipherText}:${hmacBase64}`;
  }

  /**
   * Helper to create the encrypted payload with HMAC
   */
  public static async createEncryptedPayload(
    value: string,
    salt: string,
    webCryptoIv: Uint8Array,
    encryptionKey: CryptoKey,
    hmacKey: CryptoKey,
  ): Promise<string> {
    // Encrypt the value
    const encryptedBuffer = await CryptoManager.encryptBuffer(webCryptoIv, encryptionKey, value);
    const cipherText = Buffer.from(encryptedBuffer).toString(FileEncoding.BASE64);
    const iv = Buffer.from(webCryptoIv).toString(FileEncoding.BASE64);

    // Compute HMAC (salt + iv + cipherText)
    const dataToHmac = Buffer.concat([
      Buffer.from(salt, FileEncoding.BASE64),
      Buffer.from(iv, FileEncoding.BASE64),
      Buffer.from(cipherText, FileEncoding.BASE64),
    ]);
    const hmacBase64 = await CryptoManager.computeHMAC(hmacKey, dataToHmac);

    return CryptoManager.formatEncryptedPayload(salt, iv, cipherText, hmacBase64);
  }


  // Decrypt

  // Helper method 1: Parse and validate encrypted data format
  public static parseEncryptedData(encryptedData: string): {
    salt: string;
    iv: string;
    cipherText: string;
    receivedHmac: string;
  } {
    CryptoManager.validateEncryptedFormat(encryptedData);

    const encryptedPart = encryptedData.substring(SECURITY_CONSTANTS.FORMAT.PREFIX.length);
    const parts = encryptedPart.split(SECURITY_CONSTANTS.FORMAT.SEPARATOR);

    CryptoManager.validatePartCount(parts);

    const [salt, iv, cipherText, receivedHmac] = parts;

    CryptoManager.validateRequiredParts(salt, iv, cipherText, receivedHmac);
    CryptoManager.validateBase64Components(salt, iv, cipherText, receivedHmac);

    return { salt, iv, cipherText, receivedHmac };
  }

  // Helper method 2: Validate encrypted data format
  private static validateEncryptedFormat(encryptedData: string): void {
    if (!encryptedData.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX)) {
      ErrorHandler.logAndThrow('Invalid encrypted format: Missing prefix');
    }
  }

  // Validate part count
  public static validatePartCount(parts: string[]): void {
    if (parts.length !== SECURITY_CONSTANTS.FORMAT.EXPECTED_PARTS) {
      ErrorHandler.logAndThrow(
        `Invalid format. Expected ${SECURITY_CONSTANTS.FORMAT.EXPECTED_PARTS} parts, got ${parts.length}`,
      );
    }
  }

  // Validate required parts are present
  public static validateRequiredParts(
    salt: string,
    iv: string,
    cipherText: string,
    receivedHmac: string,
  ): void {
    const missingParts = [];
    if (!salt) missingParts.push('salt');
    if (!iv) missingParts.push('iv');
    if (!cipherText) missingParts.push('cipherText');
    if (!receivedHmac) missingParts.push('hmac');

    if (missingParts.length > 0) {
      ErrorHandler.logAndThrow(
        `Authentication failed: Missing components - ${missingParts.join(', ')}`,
      );
    }
  }

  // Validate base64 encoding of components
  public static validateBase64Components(
    salt: string,
    iv: string,
    cipherText: string,
    receivedHmac: string,
  ): void {
    if (!CryptoManager.isValidBase64(salt)) {
      ErrorHandler.logAndThrow('Invalid salt format');
    }
    if (!CryptoManager.isValidBase64(iv)) {
      ErrorHandler.logAndThrow('Invalid IV format');
    }
    if (!CryptoManager.isValidBase64(cipherText)) {
      ErrorHandler.logAndThrow('Invalid cipherText format');
    }
    if (!CryptoManager.isValidBase64(receivedHmac)) {
      ErrorHandler.logAndThrow('Invalid HMAC format');
    }
  }

  // Verify HMAC integrity
  public static async verifyHMAC(
    salt: string,
    iv: string,
    cipherText: string,
    receivedHmac: string,
    hmacKey: CryptoKey,
  ): Promise<void> {
    const dataToHmac = CryptoManager.prepareHMACData(salt, iv, cipherText);
    const computedHmac = await CryptoManager.computeHMAC(hmacKey, dataToHmac);

    if (!CryptoManager.constantTimeCompare(computedHmac, receivedHmac)) {
      ErrorHandler.logAndThrow(
        'Authentication failed: HMAC mismatch - Invalid key or tampered data',
      );
    }
  }

  // Prepare data for HMAC computation
  public static prepareHMACData(salt: string, iv: string, cipherText: string): Buffer {
    return Buffer.concat([
      Buffer.from(salt, FileEncoding.BASE64),
      Buffer.from(iv, FileEncoding.BASE64),
      Buffer.from(cipherText, FileEncoding.BASE64),
    ]);
  }

  public static async performDecryption(
    iv: string,
    encryptionKey: CryptoKey,
    cipherText: string,
  ): Promise<ArrayBuffer> {
    const ivBuffer = Buffer.from(iv, FileEncoding.BASE64);
    const cipherBuffer = Buffer.from(cipherText, FileEncoding.BASE64);

    return await CryptoManager.decryptBuffer(ivBuffer, encryptionKey, cipherBuffer);
  }
}
