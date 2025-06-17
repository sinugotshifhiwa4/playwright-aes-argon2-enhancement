// import { CryptoService } from '../service/cryptoService';
// import AsyncFileManager from '../../utils/fileSystem/asyncFileManager';
// import { SECURITY_CONSTANTS } from '../config/security.constant';
// import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
// import ErrorHandler from '../../utils/errors/errorHandler';
// import logger from '../../utils/logging/loggerManager';

// export class EncryptionManager {
//   /**
//    * Encrypts specified environment variables in a file and updates the file with encrypted values.
//    *
//    * @param directory - Directory containing the environment file
//    * @param environmentFilePath - Path to the environment file
//    * @param secretKeyVariable - Variable name containing the encryption key
//    * @param envVariables - Optional array of specific variables to encrypt. If not provided, all variables are encrypted
//    * @param forceReEncryption - If true, allows re-encryption of already encrypted values (useful for key rotation)
//    * @throws Error if encryption process fails
//    */
//   public async encryptAndUpdateEnvironmentVariables(
//     directory: string,
//     environmentFilePath: string,
//     secretKeyVariable: string,
//     envVariables?: string[],
//     forceReEncryption: boolean = false,
//   ): Promise<void> {
//     try {
//       logger.info(
//         `Starting encryption process for ${environmentFilePath}${forceReEncryption ? ' (force re-encryption enabled)' : ''}`,
//       );

//       const envFileLines = await this.readEnvironmentFileAsLines(directory, environmentFilePath);
//       const allEnvVariables = this.extractEnvironmentVariables(envFileLines);

//       if (Object.keys(allEnvVariables).length === 0) {
//         logger.warn(`No environment variables found in ${environmentFilePath}`);
//         return;
//       }

//       const variablesToEncrypt = this.resolveVariablesToEncrypt(allEnvVariables, envVariables);

//       if (Object.keys(variablesToEncrypt).length === 0) {
//         logger.info('No variables selected for encryption');
//         return;
//       }

//       const { updatedLines, encryptedCount } = await this.encryptVariableValuesInFileLines(
//         envFileLines,
//         variablesToEncrypt,
//         secretKeyVariable,
//         forceReEncryption,
//       );

//       if (encryptedCount > 0) {
//         const resolvedEnvironmentFilePath = await this.resolveFilePath(
//           directory,
//           environmentFilePath,
//         );
//         await this.writeEnvironmentFileLines(resolvedEnvironmentFilePath, updatedLines);
//       }

//       this.logEncryptionSummary(
//         directory,
//         environmentFilePath,
//         Object.keys(variablesToEncrypt).length,
//         encryptedCount,
//         forceReEncryption,
//       );
//     } catch (error) {
//       const errorMessage = `Failed to encrypt environment variables in ${environmentFilePath}`;
//       ErrorHandler.captureError(error, 'encryptAndUpdateEnvironmentVariables', errorMessage);
//       throw new Error(
//         `${errorMessage}: ${error instanceof Error ? error.message : 'Unknown error'}`,
//       );
//     }
//   }

//   /**
//    * Determines which environment variables should be encrypted based on the provided filter.
//    */
//   private resolveVariablesToEncrypt(
//     allEnvVariables: Record<string, string>,
//     envVariables?: string[],
//   ): Record<string, string> {
//     if (!envVariables?.length) {
//       return { ...allEnvVariables };
//     }

//     const variablesToEncrypt: Record<string, string> = {};
//     const notFoundVariables: string[] = [];

//     for (const lookupValue of envVariables) {
//       const foundVariable = this.findEnvironmentVariableByKey(allEnvVariables, lookupValue);

//       if (Object.keys(foundVariable).length === 0) {
//         notFoundVariables.push(lookupValue);
//       } else {
//         Object.assign(variablesToEncrypt, foundVariable);
//       }
//     }

//     if (notFoundVariables.length > 0) {
//       logger.warn(`Environment variables not found: ${notFoundVariables.join(', ')}`);
//     }

//     return variablesToEncrypt;
//   }

//   /**
//    * Finds an environment variable by key or value.
//    */
//   private findEnvironmentVariableByKey(
//     allEnvVariables: Record<string, string>,
//     lookupValue: string,
//   ): Record<string, string> {
//     const result: Record<string, string> = {};

//     // First, check if it's a direct key match
//     if (Object.prototype.hasOwnProperty.call(allEnvVariables, lookupValue)) {
//       result[lookupValue] = allEnvVariables[lookupValue];
//       return result;
//     }

//     // Then, check if it matches any value
//     for (const [key, value] of Object.entries(allEnvVariables)) {
//       if (value === lookupValue) {
//         result[key] = value;
//         return result;
//       }
//     }

//     return result;
//   }

//   /**
//    * Encrypts the values of specified environment variables in the file lines.
//    */
//   private async encryptVariableValuesInFileLines(
//     envFileLines: string[],
//     variablesToEncrypt: Record<string, string>,
//     secretKeyVariable: string,
//     forceReEncryption: boolean = false,
//   ): Promise<{ updatedLines: string[]; encryptedCount: number }> {
//     try {
//       let updatedLines = [...envFileLines];
//       let encryptedCount = 0;
//       let reEncryptedCount = 0;
//       const skippedVariables: string[] = [];

//       for (const [key, value] of Object.entries(variablesToEncrypt)) {
//         if (!value) {
//           logger.warn(`Skipping variable '${key}' with empty value`);
//           continue;
//         }

//         const trimmedValue = value.trim();
//         const isCurrentlyEncrypted = this.isAlreadyEncrypted(trimmedValue);

//         // Skip if already encrypted and not forcing re-encryption
//         if (isCurrentlyEncrypted && !forceReEncryption) {
//           skippedVariables.push(key);
//           continue;
//         }

//         try {
//           let valueToEncrypt = trimmedValue;

//           // If force re-encryption is enabled and value is encrypted, decrypt it first
//           if (forceReEncryption && isCurrentlyEncrypted) {
//             try {
//               logger.debug(`Decrypting variable '${key}' for re-encryption`);
//               valueToEncrypt = await CryptoService.decrypt(trimmedValue, secretKeyVariable);
//               logger.debug(`Successfully decrypted variable '${key}' for re-encryption`);
//             } catch (decryptError) {
//               logger.error(
//                 `Failed to decrypt variable '${key}' for re-encryption: ${decryptError}`,
//               );
//               throw new Error(
//                 `Cannot re-encrypt '${key}': decryption with current key failed. This may indicate the variable was encrypted with a different key.`,
//               );
//             }
//           }

//           const encryptedValue = await CryptoService.encrypt(valueToEncrypt, secretKeyVariable);
//           updatedLines = this.updateEnvironmentFileLines(updatedLines, key, encryptedValue);

//           if (isCurrentlyEncrypted) {
//             reEncryptedCount++;
//             logger.debug(`Successfully re-encrypted variable: ${key}`);
//           } else {
//             encryptedCount++;
//             logger.debug(`Successfully encrypted variable: ${key}`);
//           }
//         } catch (encryptionError) {
//           logger.error(`Failed to encrypt variable '${key}': ${encryptionError}`);
//           throw encryptionError;
//         }
//       }

//       if (skippedVariables.length > 0) {
//         logger.info(`Skipped already encrypted variables: ${skippedVariables.join(', ')}`);
//       }

//       if (reEncryptedCount > 0) {
//         logger.info(`Re-encrypted ${reEncryptedCount} variables with new key`);
//       }

//       return { updatedLines, encryptedCount: encryptedCount + reEncryptedCount };
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'encryptVariableValuesInFileLines',
//         'Failed to encrypt variable values',
//       );
//       throw error;
//     }
//   }

//   /**
//    * Checks if a value is already encrypted by looking for the encryption prefix.
//    */
//   public isAlreadyEncrypted(value: string): boolean {
//     if (!value) {
//       return false;
//     }
//     return value.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX);
//   }

//   /**
//    * Extracts the encrypted data without the prefix.
//    * Returns null if the value is not encrypted.
//    */
//   public static extractEncryptedValue(value: string): string | null {
//     if (!value?.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX)) {
//       return null;
//     }
//     return value.substring(SECURITY_CONSTANTS.FORMAT.PREFIX.length);
//   }

//   /**
//    * Parses an encrypted value in the format: salt:iv:cipherText
//    * @throws Error if the format is invalid
//    */
//   public static parseEncryptedValue(encryptedValue: string): {
//     salt: string;
//     iv: string;
//     cipherText: string;
//   } {
//     if (!encryptedValue) {
//       throw new Error('Encrypted value cannot be empty');
//     }

//     const parts = encryptedValue.split(':');
//     if (parts.length !== SECURITY_CONSTANTS.FORMAT.EXPECTED_PARTS) {
//       throw new Error(
//         `Invalid encrypted value format. Expected: salt:iv:cipherText, got ${parts.length} parts`,
//       );
//     }

//     const [salt, iv, cipherText] = parts;

//     if (!salt || !iv || !cipherText) {
//       throw new Error(
//         'Invalid encrypted value: all parts (salt, iv, cipherText) must be non-empty',
//       );
//     }

//     return { salt, iv, cipherText };
//   }

//   /**
//    * Extracts all environment variables from the file lines.
//    */
//   public extractEnvironmentVariables(lines: string[]): Record<string, string> {
//     const variables: Record<string, string> = {};
//     let lineNumber = 0;

//     for (const line of lines) {
//       lineNumber++;
//       const parsedVariable = this.parseEnvironmentLine(line, lineNumber);

//       if (parsedVariable) {
//         const [key, value] = parsedVariable;

//         if (Object.prototype.hasOwnProperty.call(variables, key)) {
//           logger.warn(`Duplicate environment variable '${key}' found at line ${lineNumber}`);
//         }

//         variables[key] = value;
//       }
//     }

//     logger.debug(`Extracted ${Object.keys(variables).length} environment variables`);
//     return variables;
//   }

//   /**
//    * Parses a single environment file line to extract key-value pairs.
//    */
//   private parseEnvironmentLine(line: string, lineNumber?: number): [string, string] | null {
//     const trimmedLine = line.trim();

//     // Skip empty lines, comments, and lines without equals
//     if (!trimmedLine || trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
//       return null;
//     }

//     const equalIndex = trimmedLine.indexOf('=');
//     const key = trimmedLine.substring(0, equalIndex).trim();
//     const value = trimmedLine.substring(equalIndex + 1);

//     // Validate key format
//     if (!key || !SECURITY_CONSTANTS.VALIDATION.ENV_VAR_KEY_PATTERN.test(key)) {
//       const lineInfo = lineNumber ? ` at line ${lineNumber}` : '';
//       logger.warn(`Invalid environment variable key format: '${key}'${lineInfo}`);
//       return null;
//     }

//     return [key, value];
//   }

//   /**
//    * Updates the environment file lines with a new value for the specified variable.
//    */
//   private updateEnvironmentFileLines(
//     existingLines: string[],
//     envVariable: string,
//     value: string,
//   ): string[] {
//     let wasUpdated = false;

//     const updatedLines = existingLines.map((line) => {
//       const trimmedLine = line.trim();

//       // Look for the exact variable assignment
//       if (trimmedLine.startsWith(`${envVariable}=`)) {
//         wasUpdated = true;
//         return `${envVariable}=${value}`;
//       }

//       return line;
//     });

//     // If the variable wasn't found, append it to the end
//     if (!wasUpdated) {
//       updatedLines.push(`${envVariable}=${value}`);
//       logger.debug(`Added new environment variable: ${envVariable}`);
//     }

//     return updatedLines;
//   }

//   /**
//    * Reads the environment file and returns its content as an array of lines.
//    */
//   public async readEnvironmentFileAsLines(
//     directory: string,
//     environmentFilePath: string,
//   ): Promise<string[]> {
//     try {
//       const resolvedPath = await this.resolveFilePath(directory, environmentFilePath);

//       const exists = await AsyncFileManager.doesFileExist(resolvedPath);
//       if (!exists) {
//         throw new Error(`Environment file not found: ${resolvedPath}`);
//       }

//       const content = await AsyncFileManager.readFile(resolvedPath, FileEncoding.UTF8);

//       if (!content) {
//         logger.warn(`Environment file is empty: ${resolvedPath}`);
//         return [];
//       }

//       // Handle both Windows (\r\n) and Unix (\n) line endings
//       return content.split(/\r?\n/);
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'readEnvironmentFileAsLines',
//         'Failed to read environment file',
//       );
//       throw error;
//     }
//   }

//   /**
//    * Writes the updated lines back to the environment file.
//    */
//   public async writeEnvironmentFileLines(
//     environmentFilePath: string,
//     lines: string[],
//   ): Promise<void> {
//     try {
//       const content = lines.join('\n');
//       await AsyncFileManager.writeFile(environmentFilePath, content, FileEncoding.UTF8);
//       logger.debug(`Successfully wrote ${lines.length} lines to ${environmentFilePath}`);
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'writeEnvironmentFileLines',
//         'Failed to write environment file',
//       );
//       throw error;
//     }
//   }

//   /**
//    * Logs the encryption operation summary.
//    */
//   private async logEncryptionSummary(
//     directory: string,
//     environmentFilePath: string,
//     totalVariables: number,
//     encryptedCount: number,
//     forceReEncryption: boolean = false,
//   ): Promise<void> {
//     try {
//       const filePath = await this.resolveFilePath(directory, environmentFilePath);
//       const skippedCount = totalVariables - encryptedCount;

//       if (encryptedCount === 0) {
//         logger.info(`No variables needed encryption in ${filePath}`);
//       } else {
//         const operation = forceReEncryption ? 'encryption/re-encryption' : 'encryption';
//         const summary = `${operation.charAt(0).toUpperCase() + operation.slice(1)} completed. ${encryptedCount} variables processed for ${filePath}`;
//         const details = skippedCount > 0 ? `, ${skippedCount} skipped` : '';
//         logger.info(`${summary}${details}`);
//       }
//     } catch (error) {
//       // Don't throw here, just log the logging error
//       logger.error(`Failed to log encryption summary: ${error}`);
//     }
//   }

//   /**
//    * Resolves the full file path by ensuring the directory exists and combining paths.
//    */
//   public async resolveFilePath(directoryName: string, fileName: string): Promise<string> {
//     try {
//       await AsyncFileManager.ensureDirectoryExists(directoryName);
//       return AsyncFileManager.getFilePath(directoryName, fileName);
//     } catch (error) {
//       ErrorHandler.captureError(error, 'resolveFilePath', 'Failed to resolve file path');
//       throw new Error(
//         `Cannot resolve file path for ${directoryName}/${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
//       );
//     }
//   }
// }

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
