import SecureKeyGenerator from '../key/secureKeyGenerator';
import { CryptoManager } from '../manager/cryptoManager';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import { SECURITY_CONSTANTS } from '../constants/security.constant';
import ErrorHandler from '../../utils/errors/errorHandler';

export class CryptoService {
  public static async encrypt(value: string, secretKeyVariable: string): Promise<string> {
    const actualSecretKey = await CryptoManager.getSecretKeyFromEnvironment(secretKeyVariable);
    CryptoManager.validateSecretKey(actualSecretKey);
    CryptoManager.validateInputs(value, actualSecretKey, 'encrypt');

    try {
      const salt = SecureKeyGenerator.generateBase64Salt();
      const webCryptoIv = SecureKeyGenerator.generateWebCryptoIV();

      // Derive keys including HMAC key
      const { encryptionKey, hmacKey } = await CryptoManager.deriveKeysWithArgon2(
        actualSecretKey,
        salt,
      );

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

      // Format: ENC2:salt:iv:cipherText:hmac
      return `${SECURITY_CONSTANTS.FORMAT.PREFIX}${salt}:${iv}:${cipherText}:${hmacBase64}`;
    } catch (error) {
      ErrorHandler.captureError(error, 'encrypt', 'Failed to encrypt with AES-GCM.');
      throw error;
    }
  }

  public static async decrypt(encryptedData: string, secretKeyVariable: string): Promise<string> {
    const actualSecretKey = await CryptoManager.getSecretKeyFromEnvironment(secretKeyVariable);
    CryptoManager.validateSecretKey(actualSecretKey);
    CryptoManager.validateInputs(encryptedData, actualSecretKey, 'decrypt');

    try {
      // Check format
      if (!encryptedData.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX)) {
        ErrorHandler.logAndThrow('Invalid encrypted format: Missing prefix');
      }

      const encryptedPart = encryptedData.substring(SECURITY_CONSTANTS.FORMAT.PREFIX.length);
      const parts = encryptedPart.split(SECURITY_CONSTANTS.FORMAT.SEPARATOR);

      if (parts.length !== SECURITY_CONSTANTS.FORMAT.EXPECTED_PARTS) {
        ErrorHandler.logAndThrow(
          `Invalid format. Expected ${SECURITY_CONSTANTS.FORMAT.EXPECTED_PARTS} parts, got ${parts.length}`,
        );
      }

      // Validate format
      const [salt, iv, cipherText, receivedHmac] = parts;

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

      // Validate base64 components
      if (!CryptoManager.isValidBase64(salt)) ErrorHandler.logAndThrow(`Invalid salt format`);
      if (!CryptoManager.isValidBase64(iv)) ErrorHandler.logAndThrow('Invalid IV format');
      if (!CryptoManager.isValidBase64(cipherText))
        ErrorHandler.logAndThrow('Invalid cipherText format');
      if (!CryptoManager.isValidBase64(receivedHmac))
        ErrorHandler.logAndThrow('Invalid HMAC format');

      // Derive keys
      const { encryptionKey, hmacKey } = await CryptoManager.deriveKeysWithArgon2(
        actualSecretKey,
        salt,
      );

      // Prepare data for HMAC validation (MUST match encryption order)
      const dataToHmac = Buffer.concat([
        Buffer.from(salt, FileEncoding.BASE64),
        Buffer.from(iv, FileEncoding.BASE64),
        Buffer.from(cipherText, FileEncoding.BASE64),
      ]);

      // Compute and verify HMAC
      const computedHmac = await CryptoManager.computeHMAC(hmacKey, dataToHmac);

      if (!CryptoManager.constantTimeCompare(computedHmac, receivedHmac)) {
        ErrorHandler.logAndThrow(
          'Authentication failed: HMAC mismatch - Invalid key or tampered data',
        );
      }

      // Decrypt after successful HMAC verification
      const ivBuffer = Buffer.from(iv, FileEncoding.BASE64);
      const cipherBuffer = Buffer.from(cipherText, FileEncoding.BASE64);

      const decryptedBuffer = await CryptoManager.decryptBuffer(
        ivBuffer,
        encryptionKey,
        cipherBuffer,
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
      ErrorHandler.captureError(error, 'decrypt', 'Failed to decrypt with AES-GCM.');
      throw error;
    }
  }

  public static async decryptMultiple(
    encryptedDataArray: string[],
    secretKeyVariable: string,
  ): Promise<string[]> {
    if (!Array.isArray(encryptedDataArray)) {
      ErrorHandler.logAndThrow(
        'encryptedDataArray must be an array',
        'CryptoService.decryptMultiple',
      );
    }

    if (encryptedDataArray.length === 0) {
      return [];
    }

    try {
      return await Promise.all(
        encryptedDataArray.map((data) => this.decrypt(data, secretKeyVariable)),
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'decryptMultiple',
        'Failed to decrypt multiple values with AES-GCM.',
      );
      throw error;
    }
  }
}
