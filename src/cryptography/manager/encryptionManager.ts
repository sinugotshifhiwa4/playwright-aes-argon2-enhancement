import { CryptoService } from '../service/cryptoService';
import { SECURITY_CONSTANTS } from '../constants/security.constant';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';
import { EnvironmentFileParser } from './environmentFileParser';

/**
 * Handles encryption operations for environment variables.
 * Focuses solely on encryption logic and orchestration.
 */
export class EncryptionManager {
  private environmentFileParser: EnvironmentFileParser;

  constructor(environmentFileParser: EnvironmentFileParser) {
    this.environmentFileParser = environmentFileParser;
  }

  /**
   * Encrypts specified environment variables in a file and updates the file with encrypted values.
   *
   * @param directory - Directory containing the environment file
   * @param environmentFilePath - Path to the environment file
   * @param secretKeyVariable - Variable name containing the encryption key
   * @param envVariables - Optional array of specific variables to encrypt. If not provided, all variables are encrypted
   * @param forceReEncryption - If true, allows re-encryption of already encrypted values (useful for key rotation)
   * @throws Error if encryption process fails
   */
  public async encryptAndUpdateEnvironmentVariables(
    directory: string,
    environmentFilePath: string,
    secretKeyVariable: string,
    envVariables?: string[],
    forceReEncryption: boolean = false,
  ): Promise<void> {
    try {
      const envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
        directory,
        environmentFilePath,
      );
      const allEnvVariables = this.environmentFileParser.extractEnvironmentVariables(envFileLines);

      if (Object.keys(allEnvVariables).length === 0) {
        logger.warn(`No environment variables found in ${environmentFilePath}`);
        return;
      }

      const variablesToEncrypt = this.resolveVariablesToEncrypt(allEnvVariables, envVariables);

      if (Object.keys(variablesToEncrypt).length === 0) {
        logger.info('No variables selected for encryption');
        return;
      }

      const { updatedLines, encryptedCount } = await this.encryptVariableValuesInFileLines(
        envFileLines,
        variablesToEncrypt,
        secretKeyVariable,
        forceReEncryption,
      );

      if (encryptedCount > 0) {
        const resolvedEnvironmentFilePath = await this.environmentFileParser.resolveFilePath(
          directory,
          environmentFilePath,
        );
        await this.environmentFileParser.writeEnvironmentFileLines(
          resolvedEnvironmentFilePath,
          updatedLines,
        );
      }

      await this.logEncryptionSummary(
        directory,
        environmentFilePath,
        Object.keys(variablesToEncrypt).length,
        encryptedCount,
        forceReEncryption,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'encryptAndUpdateEnvironmentVariables',
        `Failed to encrypt environment variables in ${environmentFilePath}`,
      );
      throw error;
    }
  }

  /**
   * Determines which environment variables should be encrypted based on the provided filter.
   */
  private resolveVariablesToEncrypt(
    allEnvVariables: Record<string, string>,
    envVariables?: string[],
  ): Record<string, string> {
    if (!envVariables?.length) {
      return { ...allEnvVariables };
    }

    const variablesToEncrypt: Record<string, string> = {};
    const notFoundVariables: string[] = [];

    for (const lookupValue of envVariables) {
      const foundVariable = this.environmentFileParser.findEnvironmentVariableByKey(
        allEnvVariables,
        lookupValue,
      );

      if (Object.keys(foundVariable).length === 0) {
        notFoundVariables.push(lookupValue);
      } else {
        Object.assign(variablesToEncrypt, foundVariable);
      }
    }

    if (notFoundVariables.length > 0) {
      logger.warn(`Environment variables not found: ${notFoundVariables.join(', ')}`);
    }

    return variablesToEncrypt;
  }

  /**
   * Encrypts the values of specified environment variables in the file lines.
   */
  private async encryptVariableValuesInFileLines(
    envFileLines: string[],
    variablesToEncrypt: Record<string, string>,
    secretKeyVariable: string,
    forceReEncryption: boolean = false,
  ): Promise<{ updatedLines: string[]; encryptedCount: number }> {
    try {
      let updatedLines = [...envFileLines];
      let encryptedCount = 0;
      let reEncryptedCount = 0;
      const skippedVariables: string[] = [];

      for (const [key, value] of Object.entries(variablesToEncrypt)) {
        if (!value) {
          logger.warn(`Skipping variable '${key}' with empty value`);
          continue;
        }

        const trimmedValue = value.trim();
        const isCurrentlyEncrypted = this.isAlreadyEncrypted(trimmedValue);

        // Skip if already encrypted and not forcing re-encryption
        if (isCurrentlyEncrypted && !forceReEncryption) {
          skippedVariables.push(key);
          continue;
        }

        try {
          let valueToEncrypt = trimmedValue;

          // If force re-encryption is enabled and value is encrypted, decrypt it first
          if (forceReEncryption && isCurrentlyEncrypted) {
            try {
              logger.debug(`Decrypting variable '${key}' for re-encryption`);
              valueToEncrypt = await CryptoService.decrypt(trimmedValue, secretKeyVariable);
              logger.debug(`Successfully decrypted variable '${key}' for re-encryption`);
            } catch (decryptError) {
              logger.error(
                `Failed to decrypt variable '${key}' for re-encryption: ${decryptError}`,
              );
              throw new Error(
                `Cannot re-encrypt '${key}': decryption with current key failed. This may indicate the variable was encrypted with a different key.`,
              );
            }
          }

          const encryptedValue = await CryptoService.encrypt(valueToEncrypt, secretKeyVariable);
          updatedLines = this.environmentFileParser.updateEnvironmentFileLines(
            updatedLines,
            key,
            encryptedValue,
          );

          if (isCurrentlyEncrypted) {
            reEncryptedCount++;
            logger.debug(`Successfully re-encrypted variable: ${key}`);
          } else {
            encryptedCount++;
            logger.debug(`Successfully encrypted variable: ${key}`);
          }
        } catch (encryptionError) {
          logger.error(`Failed to encrypt variable '${key}': ${encryptionError}`);
          throw encryptionError;
        }
      }

      if (skippedVariables.length > 0) {
        logger.info(`Skipped already encrypted variables: ${skippedVariables.join(', ')}`);
      }

      if (reEncryptedCount > 0) {
        logger.info(`Re-encrypted ${reEncryptedCount} variables with new key`);
      }

      return { updatedLines, encryptedCount: encryptedCount + reEncryptedCount };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'encryptVariableValuesInFileLines',
        'Failed to encrypt variable values',
      );
      throw error;
    }
  }

  /**
   * Checks if a value is already encrypted by looking for the encryption prefix.
   */
  public isAlreadyEncrypted(value: string): boolean {
    if (!value) {
      return false;
    }
    return value.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX);
  }

  /**
   * Extracts the encrypted data without the prefix.
   * Returns null if the value is not encrypted.
   */
  public static extractEncryptedValue(value: string): string | null {
    if (!value?.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX)) {
      return null;
    }
    return value.substring(SECURITY_CONSTANTS.FORMAT.PREFIX.length);
  }

  /**
   * Parses an encrypted value in the format: salt:iv:cipherText
   * @throws Error if the format is invalid
   */
  public static parseEncryptedValue(encryptedValue: string): {
    salt: string;
    iv: string;
    cipherText: string;
  } {
    if (!encryptedValue) {
      throw new Error('Encrypted value cannot be empty');
    }

    const parts = encryptedValue.split(':');
    if (parts.length !== SECURITY_CONSTANTS.FORMAT.EXPECTED_PARTS) {
      throw new Error(
        `Invalid encrypted value format. Expected: salt:iv:cipherText, got ${parts.length} parts`,
      );
    }

    const [salt, iv, cipherText] = parts;

    if (!salt || !iv || !cipherText) {
      throw new Error(
        'Invalid encrypted value: all parts (salt, iv, cipherText) must be non-empty',
      );
    }

    return { salt, iv, cipherText };
  }

  /**
   * Logs the encryption operation summary.
   */
  private async logEncryptionSummary(
    directory: string,
    environmentFilePath: string,
    totalVariables: number,
    encryptedCount: number,
    forceReEncryption: boolean = false,
  ): Promise<void> {
    try {
      const filePath = await this.environmentFileParser.resolveFilePath(
        directory,
        environmentFilePath,
      );
      const skippedCount = totalVariables - encryptedCount;

      if (encryptedCount === 0) {
        logger.info(`No variables needed encryption in ${filePath}`);
      } else {
        const operation = forceReEncryption ? 'encryption/re-encryption' : 'encryption';
        const summary = `${operation.charAt(0).toUpperCase() + operation.slice(1)} completed. ${encryptedCount} variables processed for ${filePath}`;
        const details = skippedCount > 0 ? `, ${skippedCount} skipped` : '';
        logger.info(`${summary}${details}`);
      }
    } catch (error) {
      // Don't throw here, just log the logging error
      logger.error(`Failed to log encryption summary: ${error}`);
    }
  }

  public async resolveFilePath(directoryName: string, fileName: string): Promise<string> {
    const resolvedFilePath = await this.environmentFileParser.resolveFilePath(
      directoryName,
      fileName,
    );
    return resolvedFilePath;
  }
}
