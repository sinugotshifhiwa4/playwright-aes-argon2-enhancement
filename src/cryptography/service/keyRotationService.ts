// //import { KeyRotationConfigDefaults } from '../../cryptography/config/keyRotationConfig.constants';
// import { KeyRotationManager } from '../../utils/environment/keyRotationManager';
// import { EnvironmentSecretFileManager } from '../../utils/environment/environmentSecretFileManager';
// import { KeyMetadataRepository } from '../../utils/environment/keyMetadataRepository';
// import { EnvironmentFileParser } from '../../cryptography/manager/environmentFileParser';
// import { CryptoService } from '../../cryptography/service/cryptoService';
// import {
//   KeyRotationConfig,
//   KeyMetadata,
//   UsageTracking,
//   AuditTrail,
//   StatusTracking,
// } from '../../cryptography/config/keyMetadata.types.ts';
// import { SECURITY_CONSTANTS } from '../../cryptography/config/security.constant';
// import { EnvironmentConstants } from '../../config/environment/dotenv/constants';
// import ErrorHandler from '../../utils/errors/errorHandler';
// import logger from '../../utils/logging/loggerManager';

// export class KeyRotationService {
//   private environmentSecretFileManager: EnvironmentSecretFileManager;
//   private metadataRepo: KeyMetadataRepository;
//   private environmentFileParser: EnvironmentFileParser;
//   private keyRotationManager: KeyRotationManager;

//   private readonly DIRECTORY = EnvironmentConstants.ENV_DIR;
//   private readonly BASE_ENV_FILE = EnvironmentConstants.BASE_ENV_FILE;

//   // 🔧 Class-level map to store decrypted data
//   private decryptedDataCache: Map<string, Record<string, string>> = new Map();

//   constructor(
//     environmentSecretFileManager: EnvironmentSecretFileManager,
//     metadataRepo: KeyMetadataRepository,
//     environmentFileParser: EnvironmentFileParser,
//     keyRotationManager: KeyRotationManager
//   ) {

//     this.environmentSecretFileManager = environmentSecretFileManager;
//     this.metadataRepo = metadataRepo;
//     this.environmentFileParser = environmentFileParser;
//     this.keyRotationManager = keyRotationManager;
//   }

//   /**
//  * Enhanced method to decrypt environment variables with selective processing
//  */
// private async decryptEnvironmentEncryptedKeys(
//   keyName: string,
//   environmentFiles: string[],
//   shouldRotateKey: boolean = false,
// ): Promise<Map<string, Record<string, string>>> {
//   // Clear the cache and use class-level map
//   this.decryptedDataCache.clear();

//   try {
//     logger.debug(
//       `Starting decryption process for key: ${keyName}, shouldRotateKey: ${shouldRotateKey}`,
//     );

//     const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
//     const resolvedBaseEnvFile = this.environmentSecretFileManager.resolveEnvironmentFilePath(baseEnvFile);

//     logger.debug(`Processing ${environmentFiles.length} environment files`);
//     logger.debug(`Using base env file: ${resolvedBaseEnvFile}`);

//     // CRITICAL FIX: Get the actual key value from the base env file
//     const keyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
//     if (!keyValue) {
//       throw new Error(`Key '${keyName}' not found in ${resolvedBaseEnvFile}`);
//     }
//     logger.debug(`Successfully retrieved key value for: ${keyName}`);

//     for (const envFilePath of environmentFiles) {
//       logger.debug(`Processing environment file: ${envFilePath}`);

//       // Read the environment file
//       const envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
//         this.DIRECTORY,
//         envFilePath,
//       );

//       const allEnvVariables =
//         this.environmentFileParser.extractEnvironmentVariables(envFileLines);
//       const decryptedVariables: Record<string, string> = {};

//       logger.debug(`Found ${Object.keys(allEnvVariables).length} variables in ${envFilePath}`);

//       // Process each variable in the file
//       for (const [key, value] of Object.entries(allEnvVariables)) {
//         // Determine if we should process this variable
//         const isEncrypted = this.isEncryptedValue(value);
//         const shouldProcess = isEncrypted || (shouldRotateKey && value);

//         logger.debug(
//           `Variable ${key}: encrypted=${isEncrypted}, shouldProcess=${shouldProcess}, value=${value}`,
//         );

//         if (shouldProcess) {
//           try {
//             if (isEncrypted) {
//               // FIXED: Use the keyName (not keyValue) for decryption
//               // The CryptoService.decrypt expects the key identifier, not the actual key value
//               const decryptedValue = await CryptoService.decrypt(value, keyName);
//               decryptedVariables[key] = decryptedValue;
//               logger.debug(`Successfully decrypted variable: ${key}`);
//             } else if (shouldRotateKey && value) {
//               // If shouldRotateKey is true, include plain text values for encryption
//               decryptedVariables[key] = value;
//               logger.debug(`Including plain text variable for encryption: ${key}`);
//             }
//           } catch (decryptError) {
//             ErrorHandler.captureError(
//               decryptError,
//               'decryptEnvironmentEncryptedKeys',
//               `Failed to decrypt variable '${key}' in file '${envFilePath}': ${decryptError}`,
//             );
//             // Continue with other variables, don't fail the entire process
//             logger.warn(`Skipping variable ${key} due to decryption error`);
//           }
//         }
//       }

//       // Store the decrypted data for this file in class-level cache
//       if (Object.keys(decryptedVariables).length > 0) {
//         this.decryptedDataCache.set(envFilePath, decryptedVariables);
//         logger.info(
//           `Cached ${Object.keys(decryptedVariables).length} variables from ${envFilePath} (shouldRotateKey: ${shouldRotateKey})`,
//         );
//       } else {
//         logger.warn(`No variables to process in ${envFilePath}`);
//       }
//     }

//     logger.debug(`Decryption complete. Cache size: ${this.decryptedDataCache.size}`);

//     // Debug the final cache contents
//     for (const [filePath, variables] of this.decryptedDataCache.entries()) {
//       logger.debug(
//         `Cache entry - File: ${filePath}, Variables: ${Object.keys(variables).length}`,
//       );
//     }

//     return new Map(this.decryptedDataCache);
//   } catch (error) {
//     ErrorHandler.captureError(
//       error,
//       'decryptEnvironmentEncryptedKeys',
//       'Failed to decrypt environment encrypted keys',
//     );
//     throw error;
//   }
// }

//   private async rotateKey(
//     keyFilePath: string,
//     keyName: string,
//     newKeyValue: string,
//     environmentVariables: string[],
//     customMaxAge?: number,
//     shouldRotateKey: boolean = false,
//   ): Promise<{ reEncryptedCount: number; affectedFiles: string[] }> {
//     try {
//       logger.info(`Starting key rotation for: ${keyName}`);

//       // Step 1: Get the old key value before rotation
//       const oldKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
//       if (!oldKeyValue) {
//         throw new Error(`Key '${keyName}' not found in ${keyFilePath}`);
//       }

//       // Step 2: Decrypt environment variables with OLD key
//       logger.info(
//         `Decrypting environment variables encrypted with key: ${keyName} (shouldRotateKey: ${shouldRotateKey})`,
//       );
//       const decryptedDataMap = await this.decryptEnvironmentEncryptedKeys(
//         keyName, // Use keyName to read the OLD key value for decryption
//         environmentVariables,
//         shouldRotateKey,
//       );

//       // 🔍 Critical debugging - check what we got back
//       logger.info(`Decryption returned map with ${decryptedDataMap.size} entries`);

//       if (decryptedDataMap.size === 0) {
//         logger.warn(`No data was decrypted for key ${keyName}. This might indicate:`);
//         logger.warn('1. No encrypted variables found using this key');
//         logger.warn('2. shouldRotateKey=false and no encrypted values present');
//         logger.warn('3. Decryption failed for all variables');
//       }

//       // Step 3: Update the key with the new value (with debugging)
//       logger.info(`Updating key '${keyName}' with new value ${newKeyValue}`);

//       // 🔍 DEBUG: Check old key value before update
//       const oldKeyValueBeforeUpdate = await this.environmentSecretFileManager.getKeyValue(
//         keyFilePath,
//         keyName,
//       );
//       logger.debug(`OLD key value before update: ${oldKeyValueBeforeUpdate}`);

//       // Update the key
//       await this.environmentSecretFileManager.updateKeyValue(keyFilePath, keyName, newKeyValue);

//       // 🔍 DEBUG: Verify new key value after update
//       const newKeyValueAfterUpdate = await this.environmentSecretFileManager.getKeyValue(
//         keyFilePath,
//         keyName,
//       );
//       logger.debug(`NEW key value after update: ${newKeyValueAfterUpdate}`);

//       // 🔍 DEBUG: Check if the key actually changed
//       const keyChanged = oldKeyValueBeforeUpdate !== newKeyValueAfterUpdate;
//       logger.debug(`Key value changed: ${keyChanged}`);

//       if (!keyChanged) {
//         logger.error(`CRITICAL: Key '${keyName}' was not updated in file '${keyFilePath}'`);
//         throw new Error(`Failed to update key '${keyName}' - key value unchanged`);
//       }

//     const resolvedBaseEnvFile = this.environmentSecretFileManager.resolveEnvironmentFilePath(keyFilePath);

//       // 🔍 DEBUG: Also verify by reading the raw file content
//       try {
//         const rawFileContent =
//           await this.environmentSecretFileManager.getOrCreateBaseEnvFileContent(resolvedBaseEnvFile);
//         const keyLineMatch = rawFileContent.match(new RegExp(`^${keyName}=(.*)$`, 'm'));
//         if (keyLineMatch) {
//           const fileKeyValue = keyLineMatch[1];
//           logger.debug(`Key '${keyName}' in file shows: ${fileKeyValue ? '[PRESENT]' : '[EMPTY]'}`);

//           // Check if it matches our new key
//           const matchesNewKey = fileKeyValue === newKeyValue;
//           logger.debug(`File key matches new key: ${matchesNewKey}`);

//           if (!matchesNewKey) {
//             logger.error(`MISMATCH: File contains different key than expected`);
//             logger.error(`Expected new key: ${newKeyValue ? '[PRESENT]' : '[EMPTY]'}`);
//             logger.error(`File contains: ${fileKeyValue ? '[PRESENT]' : '[EMPTY]'}`);
//           }
//         } else {
//           logger.error(`Key '${keyName}' not found in file content`);
//         }
//       } catch (fileReadError) {
//         logger.error(`Failed to verify key in file: ${fileReadError}`);
//       }

//       // Step 4: Re-encrypt data with the new key
//       logger.info(`Re-encrypting environment variables with new key: ${keyName}`);
//       // 🔧 FIX: Pass keyName (which now contains the new key value) for re-encryption
//       const reEncryptedCount = await this.reEncryptEnvironmentvariables(
//         decryptedDataMap,
//         keyName, // This will now read the NEW key value from the file
//       );

//       // Step 5: Update metadata
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       const existingMetadata = metadata[keyName];

//       // Create the rotation config object
//           const rotationConfig: KeyRotationConfig = {
//             maxAgeInDays: customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays,
//             warningThresholdInDays: this.keyRotationManager.keyRotationConfig.warningThresholdInDays,
//             enableAutoRotation: this.keyRotationManager.keyRotationConfig.enableAutoRotation,
//           };

//       metadata[keyName] = {
//         keyName,
//         createdAt: existingMetadata?.createdAt || new Date(),
//         lastRotatedAt: new Date(),
//         rotationCount: (existingMetadata?.rotationCount || 0) + 1,
//         rotationConfig,
//         auditTrail: existingMetadata?.auditTrail || this.createEmptyAuditTrail(),
//         usageTracking: existingMetadata?.usageTracking || this.createDefaultUsageTracking(),
//         statusTracking:
//           existingMetadata?.statusTracking ||
//           this.createDefaultStatusTracking(this.keyRotationManager.keyRotationConfig.enableAutoRotation),
//       };

//       await this.metadataRepo.writeKeyMetadata(metadata);

//       const affectedFiles = Array.from(decryptedDataMap.keys());

//       // 🔧 Clear the cache after successful rotation
//       this.decryptedDataCache.clear();

//       logger.info(
//         `Key "${keyName}" rotated successfully. Re-encrypted ${reEncryptedCount} variables across ${affectedFiles.length} files. Rotation count: ${metadata[keyName].rotationCount}. Override mode: ${shouldRotateKey}`,
//       );

//       return { reEncryptedCount, affectedFiles };
//     } catch (error) {
//       // 🔧 Clear cache on error too
//       this.decryptedDataCache.clear();
//       ErrorHandler.captureError(error, 'rotateKey', `Failed to rotate key "${keyName}"`);
//       throw error;
//     }
//   }

//  private async reEncryptEnvironmentvariables(
//   decryptedDataMap: Map<string, Record<string, string>>,
//   keyName: string, // This should be the key name, not the key value
// ): Promise<number> {
//   let totalReEncrypted = 0;

//   try {
//     logger.debug(`Starting re-encryption process. Map size: ${decryptedDataMap.size}`);

//     if (decryptedDataMap.size === 0) {
//       logger.warn('No decrypted data found in map - nothing to re-encrypt');
//       return 0;
//     }

//     // CRITICAL FIX: Get the NEW key value using the keyName
//     const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
//     const newKeyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
//     if (!newKeyValue) {
//       throw new Error(`Key '${keyName}' not found in ${baseEnvFile} for re-encryption`);
//     }
//     logger.debug(`Retrieved NEW key value for re-encryption: ${keyName}`);

//     // Add detailed logging for each file
//     for (const [envFilePath, decryptedVariables] of decryptedDataMap.entries()) {
//       logger.debug(`Decrypted values for file: ${envFilePath}`);
//       logger.debug(
//         `Number of variables to re-encrypt: ${Object.keys(decryptedVariables).length}`,
//       );

//       for (const [key, value] of Object.entries(decryptedVariables)) {
//         logger.debug(`  ${key} = ${value}`);
//       }
//     }

//     // Process each environment file
//     for (const [envFilePath, decryptedVariables] of decryptedDataMap.entries()) {
//       // Read current file lines
//       let envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
//         this.DIRECTORY,
//         envFilePath,
//       );

//       let fileModified = false;

//       // Re-encrypt each variable and update the file lines
//       for (const [key, decryptedValue] of Object.entries(decryptedVariables)) {
//         try {
//           logger.debug(`Re-encrypting variable: ${key} in file: ${envFilePath}`);

//           // CRITICAL FIX: Use the NEW key value (not keyName) for encryption
//           const newEncryptedValue = await CryptoService.encrypt(decryptedValue, keyName);

//           // Update the file lines with the new encrypted value
//           envFileLines = this.environmentFileParser.updateEnvironmentFileLines(
//             envFileLines,
//             key,
//             newEncryptedValue,
//           );

//           fileModified = true;
//           totalReEncrypted++;
//           logger.debug(`Successfully re-encrypted variable: ${key}`);
//         } catch (encryptError) {
//           ErrorHandler.captureError(
//             encryptError,
//             'reEncryptEnvironmentvariables',
//             `Failed to re-encrypt variable '${key}' in file '${envFilePath}': ${encryptError}`,
//           );
//           throw encryptError; // Fail fast on encryption errors
//         }
//       }

//       // Write the updated file back only if it was modified
//       if (fileModified) {
//         const resolvedEnvFilePath = this.environmentSecretFileManager.resolveEnvironmentFilePath(envFilePath);
//         await this.environmentFileParser.writeEnvironmentFileLines(resolvedEnvFilePath, envFileLines);
//         logger.info(
//           `Updated ${Object.keys(decryptedVariables).length} variables in ${resolvedEnvFilePath}`,
//         );
//       }
//     }

//     logger.info(
//       `Successfully re-encrypted ${totalReEncrypted} variables across ${decryptedDataMap.size} files`,
//     );
//     return totalReEncrypted;
//   } catch (error) {
//     ErrorHandler.captureError(
//       error,
//       'reEncryptEnvironmentvariables',
//       'Failed to re-encrypt environment variables',
//     );
//     throw error;
//   }
// }

//   /**
//    * Helper method to check if a value is encrypted (has encryption prefix)
//    */
//   private isEncryptedValue(value: string): boolean {
//     return Boolean(value && value.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX));
//   }

//   /**
//    * Updated rotateKeyWithAudit method with shouldRotateKey parameter
//    */
//  public async rotateKeyWithAudit(
//   keyFilePath: string,
//   keyName: string,
//   newKeyValue: string,
//   environmentVariables: string[],
//   reason: 'scheduled' | 'manual' | 'expired' | 'security_breach',
//   customMaxAge?: number,
//   shouldRotateKey: boolean = false,
// ): Promise<{ success: boolean; reEncryptedCount: number; affectedFiles: string[] }> {
//   const startTime = new Date();
//   let rotationResult = { reEncryptedCount: 0, affectedFiles: [] as string[] };

//   try {
//     logger.info(
//       `Starting audit rotation for key: ${keyName}, reason: ${reason}, shouldRotateKey: ${shouldRotateKey}`,
//     );

//     // Get old key hash for audit
//     const oldKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
//     const oldKeyHash = oldKeyValue ? this.hashKey(oldKeyValue) : undefined;
//     const newKeyHash = this.hashKey(newKeyValue);

//     // Perform the rotation with shouldRotateKey flag
//     rotationResult = await this.rotateKey(
//       keyFilePath,
//       keyName,
//       newKeyValue,
//       environmentVariables,
//       customMaxAge,
//       shouldRotateKey,
//     );

//     // Update audit trail with success
//     const metadata = await this.metadataRepo.readKeyMetadata();

//     if (!metadata[keyName].auditTrail) {
//       metadata[keyName].auditTrail = this.createEmptyAuditTrail();
//     }

//     if (!metadata[keyName].auditTrail.rotationHistory) {
//       metadata[keyName].auditTrail.rotationHistory = [];
//     }

//     metadata[keyName].auditTrail.rotationHistory.push({
//       timestamp: startTime,
//       reason,
//       oldKeyHash,
//       newKeyHash,
//       affectedEnvironments: rotationResult.affectedFiles,
//       affectedVariables: [],
//       success: true,
//       overrideMode: shouldRotateKey,
//     });

//     await this.metadataRepo.writeKeyMetadata(metadata);

//     await this.recordAuditEvent(
//       keyName,
//       'rotated',
//       'info',
//       'rotateKeyWithAudit',
//       `Key rotated successfully. Reason: ${reason}. Re-encrypted ${rotationResult.reEncryptedCount} variables. Override mode: ${shouldRotateKey}`,
//       {
//         reason,
//         affectedEnvironments: rotationResult.affectedFiles,
//         reEncryptedCount: rotationResult.reEncryptedCount,
//         rotationCount: metadata[keyName].rotationCount,
//         overrideMode: shouldRotateKey,
//       },
//     );

//     return {
//       success: true,
//       reEncryptedCount: rotationResult.reEncryptedCount,
//       affectedFiles: rotationResult.affectedFiles,
//     };
//   } catch (error) {
//     // Record failure in audit trail
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();

//       if (metadata[keyName]) {
//         if (!metadata[keyName].auditTrail) {
//           metadata[keyName].auditTrail = this.createEmptyAuditTrail();
//         }

//         if (!metadata[keyName].auditTrail.rotationHistory) {
//           metadata[keyName].auditTrail.rotationHistory = [];
//         }

//         metadata[keyName].auditTrail.rotationHistory.push({
//           timestamp: startTime,
//           reason,
//           affectedEnvironments: environmentVariables,
//           affectedVariables: [],
//           success: false,
//           errorDetails: error instanceof Error ? error.message : 'Unknown error', // Changed from errorMessage to errorDetails
//           overrideMode: shouldRotateKey,
//         });

//         await this.metadataRepo.writeKeyMetadata(metadata);
//       }
//     } catch (auditError) {
//       logger.error(`Failed to record rotation failure in audit: ${auditError}`);
//     }

//     throw error;
//   }
// }

//   /**
//    * Utility method to rotate a key for a single environment file
//    */
//   public async rotateKeyForSingleEnvironment(
//     keyFilePath: string,
//     keyName: string,
//     newKeyValue: string,
//     environmentFilePath: string,
//     reason: 'scheduled' | 'manual' | 'expired' | 'security_breach' = 'manual',
//     customMaxAge?: number,
//     shouldRotateKey: boolean = false,
//   ): Promise<{ success: boolean; reEncryptedCount: number }> {
//     try {
//       logger.info(`Rotating key for single environment: ${environmentFilePath}`);

//       const result = await this.rotateKeyWithAudit(
//         keyFilePath,
//         keyName,
//         newKeyValue,
//         [environmentFilePath],
//         reason,
//         customMaxAge,
//         shouldRotateKey,
//       );

//       return {
//         success: result.success,
//         reEncryptedCount: result.reEncryptedCount,
//       };
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'rotateKeyForSingleEnvironment',
//         `Failed to rotate key "${keyName}" for environment: ${environmentFilePath}`,
//       );
//       return { success: false, reEncryptedCount: 0 };
//     }
//   }

//   /**
//    * Checks all keys for rotation requirements
//    */
//   public async checkAllKeysForRotation(): Promise<{
//     keysNeedingRotation: string[];
//     keysNeedingWarning: string[];
//   }> {
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       const keysNeedingRotation: string[] = [];
//       const keysNeedingWarning: string[] = [];

//       for (const keyName of Object.keys(metadata)) {
//         const status = await this.checkKeyRotationStatus(keyName);

//         if (status.needsRotation) {
//           keysNeedingRotation.push(keyName);
//           logger.error(
//             `SECURITY ALERT: Key "${keyName}" is ${status.ageInDays} days old and MUST be rotated immediately!`,
//           );

//           if (this.keyRotationManager.keyRotationConfig.enableAutoRotation) {
//             logger.info(`Auto-rotation is enabled. Scheduling rotation for key "${keyName}"`);
//           }
//         } else if (status.needsWarning) {
//           keysNeedingWarning.push(keyName);
//           logger.warn(
//             `Key "${keyName}" will expire in ${status.daysUntilRotation} days (current age: ${status.ageInDays} days). Consider rotating soon.`,
//           );
//         }
//       }

//       return { keysNeedingRotation, keysNeedingWarning };
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'checkAllKeysForRotation',
//         'Failed to check keys for rotation',
//       );
//       throw error;
//     }
//   }

//   /**
//    * Gets detailed information about a key including rotation status
//    */
//   public async getKeyInfo(keyName: string): Promise<{
//     exists: boolean;
//     metadata?: KeyMetadata;
//     rotationStatus?: {
//       needsRotation: boolean;
//       needsWarning: boolean;
//       ageInDays: number;
//       daysUntilRotation: number;
//     };
//   }> {
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       const keyMetadata = metadata[keyName];

//       if (!keyMetadata) {
//         return { exists: false };
//       }

//       const rotationStatus = await this.checkKeyRotationStatus(keyName);

//       return {
//         exists: true,
//         metadata: keyMetadata,
//         rotationStatus,
//       };
//     } catch (error) {
//       ErrorHandler.captureError(error, 'getKeyInfo', `Failed to get info for key "${keyName}"`);
//       throw error;
//     }
//   }

//   /**
//    * Stores a key with rotation tracking
//    */
// public async storeBaseEnvironmentKey(
//   filePath: string,
//   keyName: string,
//   keyValue: string,
//   customMaxAge?: number,
//   shouldRotateKey: boolean = false,
// ): Promise<void> {
//   try {
//     let fileContent =
//       await this.environmentSecretFileManager.getOrCreateBaseEnvFileContent(filePath);
//     const keyRegex = new RegExp(`^${keyName}=.*`, 'm');
//     const keyExists = keyRegex.test(fileContent);
//     if (keyExists && !shouldRotateKey) {
//       logger.info(
//         `The environment variable "${keyName}" already exists. Delete it or set shouldRotateKey=true to regenerate.`,
//       );
//       return;
//     }
//     const effectiveMaxAge = customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays;
//     const rotationInfo = customMaxAge
//       ? `with custom rotation (${effectiveMaxAge} days)`
//       : `with default rotation (${effectiveMaxAge} days)`;
//     if (keyExists && shouldRotateKey) {
//       fileContent = fileContent.replace(keyRegex, `${keyName}=${keyValue}`);
//       logger.info(`Environment variable "${keyName}" has been rotated (overwritten).`);
//     } else {
//       if (fileContent && !fileContent.endsWith('\n')) {
//         fileContent += '\n';
//       }
//       fileContent += `${keyName}=${keyValue}`;
//       logger.info(`Secret key "${keyName}" generated and stored ${rotationInfo}`);
//     }
//     await this.environmentSecretFileManager.writeSecretKeyVariableToBaseEnvFile(
//       filePath,
//       fileContent,
//       keyName,
//     );
//     const metadata = await this.metadataRepo.readKeyMetadata();

//     // Create the rotation config object
//     const rotationConfig: KeyRotationConfig = {
//       maxAgeInDays: customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays,
//       warningThresholdInDays: this.keyRotationManager.keyRotationConfig.warningThresholdInDays,
//       enableAutoRotation: this.keyRotationManager.keyRotationConfig.enableAutoRotation,
//     };

//     metadata[keyName] = {
//       keyName,
//       createdAt: new Date(),
//       rotationCount:
//         keyExists && shouldRotateKey ? (metadata[keyName]?.rotationCount ?? 0) + 1 : 0,
//       lastRotatedAt: shouldRotateKey ? new Date() : undefined,
//       rotationConfig, // Use the rotationConfig object instead of maxAge
//       auditTrail: this.createEmptyAuditTrail(),
//       usageTracking: this.createDefaultUsageTracking(),
//       statusTracking: this.createDefaultStatusTracking(this.keyRotationManager.keyRotationConfig.enableAutoRotation),
//     };
//     await this.metadataRepo.writeKeyMetadata(metadata);
//     logger.info(
//       `Environment variable "${keyName}" ${
//         shouldRotateKey ? 'rotated' : 'created'
//       } successfully with rotation tracking.`,
//     );
//   } catch (error) {
//     ErrorHandler.captureError(
//       error,
//       'storeBaseEnvKey',
//       `Failed to store key "${keyName}" in environment file.`,
//     );
//     throw error;
//   }
// }

//   /**
//    * Enhanced check method with audit trail
//    */
//   public async checkKeyRotationStatusWithAudit(
//     keyName: string,
//     checkSource: 'startup' | 'scheduled' | 'manual' | 'api' = 'manual',
//   ): Promise<{
//     needsRotation: boolean;
//     needsWarning: boolean;
//     ageInDays: number;
//     daysUntilRotation: number;
//   }> {
//     const status = await this.checkKeyRotationStatus(keyName);

//     let healthStatus: 'healthy' | 'warning' | 'critical';
//     const recommendations: string[] = [];

//     if (status.needsRotation) {
//       healthStatus = 'critical';
//       recommendations.push('Immediate rotation required');
//     } else if (status.needsWarning) {
//       healthStatus = 'warning';
//       recommendations.push(`Consider rotating within ${status.daysUntilRotation} days`);
//     } else {
//       healthStatus = 'healthy';
//     }

//     await this.recordHealthCheck(
//       keyName,
//       status.ageInDays,
//       status.daysUntilRotation,
//       healthStatus,
//       checkSource,
//       recommendations,
//     );

//     if (status.needsRotation) {
//       await this.recordAuditEvent(
//         keyName,
//         'expired',
//         'critical',
//         'checkKeyRotationStatusWithAudit',
//         `Key has expired and requires immediate rotation (${status.ageInDays} days old)`,
//       );
//     } else if (status.needsWarning) {
//       await this.recordAuditEvent(
//         keyName,
//         'warning_issued',
//         'warning',
//         'checkKeyRotationStatusWithAudit',
//         `Key will expire in ${status.daysUntilRotation} days`,
//       );
//     }

//     return status;
//   }

//   /**
//    * Calculates the age of a key in days
//    */
//   private calculateKeyAge(metadata: KeyMetadata): number {
//     const referenceDate = metadata.lastRotatedAt || metadata.createdAt;
//     const now = new Date();
//     const diffTime = Math.abs(now.getTime() - referenceDate.getTime());
//     return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
//   }

//   /**
//    * Checks if a key needs rotation
//    */
//   private async checkKeyRotationStatus(keyName: string): Promise<{
//     needsRotation: boolean;
//     needsWarning: boolean;
//     ageInDays: number;
//     daysUntilRotation: number;
//   }> {
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       const keyMetadata = metadata[keyName];

//       if (!keyMetadata) {
//         return {
//           needsRotation: false,
//           needsWarning: false,
//           ageInDays: 0,
//           daysUntilRotation: this.keyRotationManager.keyRotationConfig.maxAgeInDays,
//         };
//       }

//       const ageInDays = this.calculateKeyAge(keyMetadata);
//       const maxAge = keyMetadata.rotationConfig.maxAgeInDays || this.keyRotationManager.keyRotationConfig.maxAgeInDays;
//       const daysUntilRotation = maxAge - ageInDays;

//       const needsRotation = ageInDays >= maxAge;
//       const needsWarning =
//         daysUntilRotation <= this.keyRotationManager.keyRotationConfig.warningThresholdInDays && !needsRotation;

//       return {
//         needsRotation,
//         needsWarning,
//         ageInDays,
//         daysUntilRotation: Math.max(0, daysUntilRotation),
//       };
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'checkKeyRotationStatus',
//         `Failed to check rotation status for key "${keyName}"`,
//       );
//       throw error;
//     }
//   }

//   /**
//    * Records a scheduled check event
//    */
//   private async recordScheduledCheck(
//     keyName: string,
//     checkType: 'startup' | 'scheduled' | 'manual',
//     result: 'passed' | 'warning' | 'failed',
//     action: 'none' | 'rotated' | 'notification_sent',
//     daysUntilExpiry: number,
//     details?: string,
//   ): Promise<void> {
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       if (!metadata[keyName]) return;

//       if (!metadata[keyName].auditTrail) {
//         metadata[keyName].auditTrail = this.createEmptyAuditTrail();
//       }

//       if (!metadata[keyName].auditTrail.scheduledRotationHistory) {
//         metadata[keyName].auditTrail.scheduledRotationHistory = [];
//       }

//       metadata[keyName].auditTrail.scheduledRotationHistory.push({
//         timestamp: new Date(),
//         checkType,
//         result,
//         action,
//         daysUntilExpiry,
//         details,
//       });

//       metadata[keyName].auditTrail.lastScheduledCheck = new Date();
//       await this.metadataRepo.writeKeyMetadata(metadata);
//     } catch (error) {
//       logger.error('Failed to record scheduled check', error);
//     }
//   }

//   /**
//    * Records an audit event
//    */
//   private async recordAuditEvent(
//     keyName: string,
//     eventType: 'created' | 'rotated' | 'accessed' | 'warning_issued' | 'expired' | 'health_check',
//     severity: 'info' | 'warning' | 'error' | 'critical',
//     source: string,
//     details: string,
//     additionalMetadata?: Record<string, unknown>,
//   ): Promise<void> {
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       if (!metadata[keyName]) return;

//       if (!metadata[keyName].auditTrail) {
//         metadata[keyName].auditTrail = this.createEmptyAuditTrail();
//       }

//       if (!metadata[keyName].auditTrail.auditTrail) {
//         metadata[keyName].auditTrail.auditTrail = [];
//       }

//       metadata[keyName].auditTrail.auditTrail.push({
//         timestamp: new Date(),
//         eventType,
//         severity,
//         source,
//         details,
//         metadata: additionalMetadata,
//       });

//       if (metadata[keyName].auditTrail.auditTrail.length > 100) {
//         metadata[keyName].auditTrail.auditTrail =
//           metadata[keyName].auditTrail.auditTrail.slice(-100);
//       }

//       await this.metadataRepo.writeKeyMetadata(metadata);
//     } catch (error) {
//       logger.error('Failed to record audit event', error);
//     }
//   }

//   /**
//    * Records a health check event
//    */
//   private async recordHealthCheck(
//     keyName: string,
//     ageInDays: number,
//     daysUntilExpiry: number,
//     status: 'healthy' | 'warning' | 'critical',
//     checkSource: 'startup' | 'scheduled' | 'manual' | 'api',
//     recommendations?: string[],
//   ): Promise<void> {
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       if (!metadata[keyName]) return;

//       if (!metadata[keyName].auditTrail) {
//         metadata[keyName].auditTrail = this.createEmptyAuditTrail();
//       }

//       if (!metadata[keyName].auditTrail.healthCheckHistory) {
//         metadata[keyName].auditTrail.healthCheckHistory = [];
//       }

//       metadata[keyName].auditTrail.healthCheckHistory.push({
//         timestamp: new Date(),
//         ageInDays,
//         daysUntilExpiry,
//         status,
//         checkSource,
//         recommendations,
//       });

//       metadata[keyName].auditTrail.lastHealthCheck = new Date();

//       if (!metadata[keyName].statusTracking) {
//         metadata[keyName].statusTracking = this.createDefaultStatusTracking(
//           this.keyRotationManager.keyRotationConfig.enableAutoRotation,
//         );
//       } else if (metadata[keyName].statusTracking.currentStatus !== status) {
//         metadata[keyName].statusTracking.currentStatus = status;
//         metadata[keyName].statusTracking.lastStatusChange = new Date();
//       }

//       if (metadata[keyName].auditTrail.healthCheckHistory.length > 50) {
//         metadata[keyName].auditTrail.healthCheckHistory =
//           metadata[keyName].auditTrail.healthCheckHistory.slice(-50);
//       }

//       await this.metadataRepo.writeKeyMetadata(metadata);
//     } catch (error) {
//       logger.error('Failed to record health check', error);
//     }
//   }

//   /**
//    * Performs system-wide audit with detailed reporting
//    */
//   public async performComprehensiveAudit(): Promise<{
//     systemHealth: 'healthy' | 'warning' | 'critical';
//     keysNeedingRotation: string[];
//     keysNeedingWarning: string[];
//     auditSummary: {
//       totalKeys: number;
//       healthyKeys: number;
//       warningKeys: number;
//       criticalKeys: number;
//       averageKeyAge: number;
//       oldestKeyAge: number;
//       newestKeyAge: number;
//     };
//     recommendations: string[];
//   }> {
//     const { keysNeedingRotation, keysNeedingWarning } = await this.checkAllKeysForRotation();
//     const metadata = await this.metadataRepo.readKeyMetadata();

//     const allKeys = Object.keys(metadata).filter((key) => key !== 'SYSTEM');
//     const totalKeys = allKeys.length;
//     const criticalKeys = keysNeedingRotation.length;
//     const warningKeys = keysNeedingWarning.length;
//     const healthyKeys = totalKeys - criticalKeys - warningKeys;

//     // Calculate age statistics
//     const keyAges = allKeys.map((keyName) => this.calculateKeyAge(metadata[keyName]));
//     const averageKeyAge =
//       keyAges.length > 0 ? keyAges.reduce((a, b) => a + b, 0) / keyAges.length : 0;
//     const oldestKeyAge = keyAges.length > 0 ? Math.max(...keyAges) : 0;
//     const newestKeyAge = keyAges.length > 0 ? Math.min(...keyAges) : 0;

//     // Determine system health
//     let systemHealth: 'healthy' | 'warning' | 'critical';
//     if (criticalKeys > 0) {
//       systemHealth = 'critical';
//     } else if (warningKeys > 0) {
//       systemHealth = 'warning';
//     } else {
//       systemHealth = 'healthy';
//     }

//     // Generate recommendations
//     const recommendations: string[] = [];
//     if (criticalKeys > 0) {
//       recommendations.push(`${criticalKeys} key(s) require immediate rotation`);
//     }
//     if (warningKeys > 0) {
//       recommendations.push(`${warningKeys} key(s) should be rotated soon`);
//     }
//     if (averageKeyAge > this.keyRotationManager.keyRotationConfig.maxAgeInDays * 0.8) {
//       recommendations.push('Consider reducing key rotation intervals');
//     }

//     // Update system metadata
//     //await this.updateSystemMetadata(systemHealth, totalKeys);

//     return {
//       systemHealth,
//       keysNeedingRotation,
//       keysNeedingWarning,
//       auditSummary: {
//         totalKeys,
//         healthyKeys,
//         warningKeys,
//         criticalKeys,
//         averageKeyAge: Math.round(averageKeyAge * 100) / 100,
//         oldestKeyAge,
//         newestKeyAge,
//       },
//       recommendations,
//     };
//   }

//   /**
//    * Enhanced store method with audit trail
//    */
//   public async storeBaseEnvironmentKeyWithAudit(
//     filePath: string,
//     keyName: string,
//     keyValue: string,
//     customMaxAge?: number,
//     environmentsUsedIn: string[] = [],
//     dependentVariables: string[] = [],
//   ): Promise<void> {
//     await this.storeBaseEnvironmentKey(filePath, keyName, keyValue, customMaxAge);

//     // Enhanced metadata with audit info
//     const metadata = await this.metadataRepo.readKeyMetadata();
//     if (metadata[keyName]) {
//       // Initialize status tracking
//       metadata[keyName].statusTracking = {
//         currentStatus: 'healthy',
//         lastStatusChange: new Date(),
//         autoRotationEnabled: this.keyRotationManager.keyRotationConfig.enableAutoRotation,
//       };

//       // Initialize usage tracking
//       metadata[keyName].usageTracking = {
//         environmentsUsedIn,
//         dependentVariables,
//       };

//       // Initialize audit trail
//       metadata[keyName].auditTrail = {
//         scheduledRotationHistory: [],
//         auditTrail: [],
//         rotationHistory: [],
//         healthCheckHistory: [],
//       };

//       await this.metadataRepo.writeKeyMetadata(metadata);

//       // Record creation audit event
//       await this.recordAuditEvent(
//         keyName,
//         'created',
//         'info',
//         'storeBaseEnvironmentKeyWithAudit',
//         `Secret key created with ${customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays}-day rotation period`,
//         {
//           initialMaxAge: customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays,
//           autoRotationEnabled: this.keyRotationManager.keyRotationConfig.enableAutoRotation,
//           environmentsUsedIn,
//           dependentVariables,
//         },
//       );
//     }
//   }

//   /**
//    * Records key access for usage tracking
//    */
//   public async recordKeyAccess(keyName: string, accessSource: string): Promise<void> {
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       if (!metadata[keyName]) return;

//       // Update last accessed time
//       if (!metadata[keyName].usageTracking) {
//         metadata[keyName].usageTracking = {
//           environmentsUsedIn: [],
//           dependentVariables: [],
//         };
//       }

//       metadata[keyName].usageTracking.lastAccessedAt = new Date();
//       await this.metadataRepo.writeKeyMetadata(metadata);

//       // Record audit event
//       await this.recordAuditEvent(
//         keyName,
//         'accessed',
//         'info',
//         accessSource,
//         `Key accessed from ${accessSource}`,
//       );
//     } catch (error) {
//       logger.error('Failed to record key access', error);
//     }
//   }

//   /**
//    * Gets comprehensive key information including all audit data
//    */
//   public async getComprehensiveKeyInfo(keyName: string): Promise<{
//     exists: boolean;
//     metadata?: KeyMetadata; // Changed from SecretKeyMetadata to KeyMetadata
//     rotationStatus?: {
//       needsRotation: boolean;
//       needsWarning: boolean;
//       ageInDays: number;
//       daysUntilRotation: number;
//     };
//     auditSummary?: {
//       totalRotations: number;
//       lastRotation?: Date;
//       lastHealthCheck?: Date;
//       lastAccess?: Date;
//       currentStatus: string;
//       totalAuditEvents: number;
//     };
//   }> {
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       const keyMetadata = metadata[keyName];

//       if (!keyMetadata) {
//         return { exists: false };
//       }

//       const rotationStatus = await this.checkKeyRotationStatus(keyName);

//       // Build audit summary
//       const auditSummary = {
//         totalRotations: keyMetadata.rotationCount,
//         lastRotation: keyMetadata.lastRotatedAt,
//         lastHealthCheck: keyMetadata.auditTrail?.lastHealthCheck,
//         lastAccess: keyMetadata.usageTracking?.lastAccessedAt,
//         currentStatus: keyMetadata.statusTracking?.currentStatus || 'unknown',
//         totalAuditEvents: keyMetadata.auditTrail?.auditTrail?.length || 0,
//       };

//       return {
//         exists: true,
//         metadata: keyMetadata,
//         rotationStatus,
//         auditSummary,
//       };
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'getComprehensiveKeyInfo',
//         `Failed to get comprehensive info for key "${keyName}"`,
//       );
//       throw error;
//     }
//   }

//   private createEmptyAuditTrail(): AuditTrail {
//     return {
//       scheduledRotationHistory: [],
//       auditTrail: [],
//       rotationHistory: [],
//       healthCheckHistory: [],
//     };
//   }

//   // Helper function to create default usage tracking
//   public createDefaultUsageTracking(): UsageTracking {
//     return {
//       environmentsUsedIn: [],
//       dependentVariables: [],
//     };
//   }

//   public createDefaultStatusTracking(autoRotationEnabled: boolean): StatusTracking {
//     return {
//       currentStatus: 'healthy',
//       lastStatusChange: new Date(),
//       autoRotationEnabled,
//     };
//   }

//   /**
//    * Simple key hashing for audit purposes (not for security)
//    */
//   private hashKey(key: string): string {
//     // Simple hash for audit trail - not cryptographically secure
//     let hash = 0;
//     for (let i = 0; i < key.length; i++) {
//       const char = key.charCodeAt(i);
//       hash = (hash << 5) - hash + char;
//       hash = hash & hash; // Convert to 32-bit integer
//     }
//     return Math.abs(hash).toString(16);
//   }

//   /**
//    * Method to manually clear the decrypted data cache
//    */
//   public clearDecryptedCache(): void {
//     logger.debug(`Clearing decrypted data cache. Current size: ${this.decryptedDataCache.size}`);
//     this.decryptedDataCache.clear();
//   }

//   /**
//    * Method to get cache status for debugging
//    */
//   public getCacheStatus(): { size: number; files: string[] } {
//     return {
//       size: this.decryptedDataCache.size,
//       files: Array.from(this.decryptedDataCache.keys()),
//     };
//   }
// }














// import { KeyRotationManager } from '../../utils/environment/keyRotationManager';
// import { EnvironmentSecretFileManager } from '../../utils/environment/environmentSecretFileManager';
// import { KeyMetadataRepository } from '../../utils/environment/keyMetadataRepository';
// import { EnvironmentFileParser } from '../../cryptography/manager/environmentFileParser';
// import { CryptoService } from '../../cryptography/service/cryptoService';
// import { KeyRotationConfig } from '../../cryptography/config/keyMetadata.types.ts';
// import { SECURITY_CONSTANTS } from '../../cryptography/config/security.constant';
// import { EnvironmentConstants } from '../../config/environment/dotenv/constants';
// import ErrorHandler from '../../utils/errors/errorHandler';
// import logger from '../../utils/logging/loggerManager';

// export class KeyRotationService {
//   private environmentSecretFileManager: EnvironmentSecretFileManager;
//   private metadataRepo: KeyMetadataRepository;
//   private environmentFileParser: EnvironmentFileParser;
//   private keyRotationManager: KeyRotationManager;

//   private readonly DIRECTORY = EnvironmentConstants.ENV_DIR;

//   // 🔧 Class-level map to store decrypted data
//   private decryptedDataCache: Map<string, Record<string, string>> = new Map();

//   constructor(
//     environmentSecretFileManager: EnvironmentSecretFileManager,
//     metadataRepo: KeyMetadataRepository,
//     environmentFileParser: EnvironmentFileParser,
//     keyRotationManager: KeyRotationManager,
//   ) {
//     this.environmentSecretFileManager = environmentSecretFileManager;
//     this.metadataRepo = metadataRepo;
//     this.environmentFileParser = environmentFileParser;
//     this.keyRotationManager = keyRotationManager;
//   }

//   /**
//    * Enhanced method to decrypt environment variables with selective processing
//    */
//   private async decryptEnvironmentEncryptedKeys(
//     keyName: string,
//     environmentFiles: string[],
//     shouldRotateKey: boolean = false,
//   ): Promise<Map<string, Record<string, string>>> {
//     // Clear the cache and use class-level map
//     this.decryptedDataCache.clear();

//     try {
//       logger.debug(
//         `Starting decryption process for key: ${keyName}, shouldRotateKey: ${shouldRotateKey}`,
//       );

//       const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
//       const resolvedBaseEnvFile =
//         this.environmentSecretFileManager.resolveEnvironmentFilePath(baseEnvFile);

//       logger.debug(`Processing ${environmentFiles.length} environment files`);
//       logger.debug(`Using base env file: ${resolvedBaseEnvFile}`);

//       // CRITICAL FIX: Get the actual key value from the base env file
//       const keyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
//       if (!keyValue) {
//         throw new Error(`Key '${keyName}' not found in ${resolvedBaseEnvFile}`);
//       }
//       logger.debug(`Successfully retrieved key value for: ${keyName}`);

//       for (const envFilePath of environmentFiles) {
//         logger.debug(`Processing environment file: ${envFilePath}`);

//         // Read the environment file
//         const envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
//           this.DIRECTORY,
//           envFilePath,
//         );

//         const allEnvVariables =
//           this.environmentFileParser.extractEnvironmentVariables(envFileLines);
//         const decryptedVariables: Record<string, string> = {};

//         logger.debug(`Found ${Object.keys(allEnvVariables).length} variables in ${envFilePath}`);

//         // Process each variable in the file
//         for (const [key, value] of Object.entries(allEnvVariables)) {
//           // Determine if we should process this variable
//           const isEncrypted = this.isEncryptedValue(value);
//           const shouldProcess = isEncrypted || (shouldRotateKey && value);

//           logger.debug(
//             `Variable ${key}: encrypted=${isEncrypted}, shouldProcess=${shouldProcess}, value=${value}`,
//           );

//           if (shouldProcess) {
//             try {
//               if (isEncrypted) {
//                 // FIXED: Use the keyName (not keyValue) for decryption
//                 // The CryptoService.decrypt expects the key identifier, not the actual key value
//                 const decryptedValue = await CryptoService.decrypt(value, keyName);
//                 decryptedVariables[key] = decryptedValue;
//                 logger.debug(`Successfully decrypted variable: ${key}`);
//               } else if (shouldRotateKey && value) {
//                 // If shouldRotateKey is true, include plain text values for encryption
//                 decryptedVariables[key] = value;
//                 logger.debug(`Including plain text variable for encryption: ${key}`);
//               }
//             } catch (decryptError) {
//               ErrorHandler.captureError(
//                 decryptError,
//                 'decryptEnvironmentEncryptedKeys',
//                 `Failed to decrypt variable '${key}' in file '${envFilePath}': ${decryptError}`,
//               );
//               // Continue with other variables, don't fail the entire process
//               logger.warn(`Skipping variable ${key} due to decryption error`);
//             }
//           }
//         }

//         // Store the decrypted data for this file in class-level cache
//         if (Object.keys(decryptedVariables).length > 0) {
//           this.decryptedDataCache.set(envFilePath, decryptedVariables);
//           logger.info(
//             `Cached ${Object.keys(decryptedVariables).length} variables from ${envFilePath} (shouldRotateKey: ${shouldRotateKey})`,
//           );
//         } else {
//           logger.warn(`No variables to process in ${envFilePath}`);
//         }
//       }

//       logger.debug(`Decryption complete. Cache size: ${this.decryptedDataCache.size}`);

//       // Debug the final cache contents
//       for (const [filePath, variables] of this.decryptedDataCache.entries()) {
//         logger.debug(
//           `Cache entry - File: ${filePath}, Variables: ${Object.keys(variables).length}`,
//         );
//       }

//       return new Map(this.decryptedDataCache);
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'decryptEnvironmentEncryptedKeys',
//         'Failed to decrypt environment encrypted keys',
//       );
//       throw error;
//     }
//   }

//   private async rotateKey(
//     keyFilePath: string,
//     keyName: string,
//     newKeyValue: string,
//     environmentVariables: string[],
//     customMaxAge?: number,
//     shouldRotateKey: boolean = false,
//   ): Promise<{ reEncryptedCount: number; affectedFiles: string[] }> {
//     try {
//       logger.info(`Starting key rotation for: ${keyName}`);

//       // Step 1: Get the old key value before rotation
//       const oldKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
//       if (!oldKeyValue) {
//         throw new Error(`Key '${keyName}' not found in ${keyFilePath}`);
//       }

//       // Step 2: Decrypt environment variables with OLD key
//       logger.info(
//         `Decrypting environment variables encrypted with key: ${keyName} (shouldRotateKey: ${shouldRotateKey})`,
//       );
//       const decryptedDataMap = await this.decryptEnvironmentEncryptedKeys(
//         keyName, // Use keyName to read the OLD key value for decryption
//         environmentVariables,
//         shouldRotateKey,
//       );

//       // 🔍 Critical debugging - check what we got back
//       logger.info(`Decryption returned map with ${decryptedDataMap.size} entries`);

//       if (decryptedDataMap.size === 0) {
//         logger.warn(`No data was decrypted for key ${keyName}. This might indicate:`);
//         logger.warn('1. No encrypted variables found using this key');
//         logger.warn('2. shouldRotateKey=false and no encrypted values present');
//         logger.warn('3. Decryption failed for all variables');
//       }

//       // Step 3: Update the key with the new value (with debugging)
//       logger.info(`Updating key '${keyName}' with new value ${newKeyValue}`);

//       // 🔍 DEBUG: Check old key value before update
//       const oldKeyValueBeforeUpdate = await this.environmentSecretFileManager.getKeyValue(
//         keyFilePath,
//         keyName,
//       );
//       logger.debug(`OLD key value before update: ${oldKeyValueBeforeUpdate}`);

//       // Update the key
//       await this.environmentSecretFileManager.updateKeyValue(keyFilePath, keyName, newKeyValue);

//       // 🔍 DEBUG: Verify new key value after update
//       const newKeyValueAfterUpdate = await this.environmentSecretFileManager.getKeyValue(
//         keyFilePath,
//         keyName,
//       );
//       logger.debug(`NEW key value after update: ${newKeyValueAfterUpdate}`);

//       // 🔍 DEBUG: Check if the key actually changed
//       const keyChanged = oldKeyValueBeforeUpdate !== newKeyValueAfterUpdate;
//       logger.debug(`Key value changed: ${keyChanged}`);

//       if (!keyChanged) {
//         logger.error(`CRITICAL: Key '${keyName}' was not updated in file '${keyFilePath}'`);
//         throw new Error(`Failed to update key '${keyName}' - key value unchanged`);
//       }

//       const resolvedBaseEnvFile =
//         this.environmentSecretFileManager.resolveEnvironmentFilePath(keyFilePath);

//       // 🔍 DEBUG: Also verify by reading the raw file content
//       try {
//         const rawFileContent =
//           await this.environmentSecretFileManager.getOrCreateBaseEnvFileContent(
//             resolvedBaseEnvFile,
//           );
//         const keyLineMatch = rawFileContent.match(new RegExp(`^${keyName}=(.*)$`, 'm'));
//         if (keyLineMatch) {
//           const fileKeyValue = keyLineMatch[1];
//           logger.debug(`Key '${keyName}' in file shows: ${fileKeyValue ? '[PRESENT]' : '[EMPTY]'}`);

//           // Check if it matches our new key
//           const matchesNewKey = fileKeyValue === newKeyValue;
//           logger.debug(`File key matches new key: ${matchesNewKey}`);

//           if (!matchesNewKey) {
//             logger.error(`MISMATCH: File contains different key than expected`);
//             logger.error(`Expected new key: ${newKeyValue ? '[PRESENT]' : '[EMPTY]'}`);
//             logger.error(`File contains: ${fileKeyValue ? '[PRESENT]' : '[EMPTY]'}`);
//           }
//         } else {
//           logger.error(`Key '${keyName}' not found in file content`);
//         }
//       } catch (fileReadError) {
//         logger.error(`Failed to verify key in file: ${fileReadError}`);
//       }

//       // Step 4: Re-encrypt data with the new key
//       logger.info(`Re-encrypting environment variables with new key: ${keyName}`);
//       // 🔧 FIX: Pass keyName (which now contains the new key value) for re-encryption
//       const reEncryptedCount = await this.reEncryptEnvironmentvariables(
//         decryptedDataMap,
//         keyName, // This will now read the NEW key value from the file
//       );

//       // Step 5: Update metadata
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       const existingMetadata = metadata[keyName];

//       // Create the rotation config object
//       const rotationConfig: KeyRotationConfig = {
//         maxAgeInDays: customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays,
//         warningThresholdInDays: this.keyRotationManager.keyRotationConfig.warningThresholdInDays,
//         enableAutoRotation: this.keyRotationManager.keyRotationConfig.enableAutoRotation,
//       };

//       metadata[keyName] = {
//         keyName,
//         createdAt: existingMetadata?.createdAt || new Date(),
//         lastRotatedAt: new Date(),
//         rotationCount: (existingMetadata?.rotationCount || 0) + 1,
//         rotationConfig,
//         auditTrail: existingMetadata?.auditTrail || this.keyRotationManager.createEmptyAuditTrail(),
//         usageTracking:
//           existingMetadata?.usageTracking || this.keyRotationManager.createDefaultUsageTracking(),
//         statusTracking:
//           existingMetadata?.statusTracking ||
//           this.keyRotationManager.createDefaultStatusTracking(
//             this.keyRotationManager.keyRotationConfig.enableAutoRotation,
//           ),
//       };

//       await this.metadataRepo.writeKeyMetadata(metadata);

//       const affectedFiles = Array.from(decryptedDataMap.keys());

//       // 🔧 Clear the cache after successful rotation
//       this.decryptedDataCache.clear();

//       logger.info(
//         `Key "${keyName}" rotated successfully. Re-encrypted ${reEncryptedCount} variables across ${affectedFiles.length} files. Rotation count: ${metadata[keyName].rotationCount}. Override mode: ${shouldRotateKey}`,
//       );

//       return { reEncryptedCount, affectedFiles };
//     } catch (error) {
//       // 🔧 Clear cache on error too
//       this.decryptedDataCache.clear();
//       ErrorHandler.captureError(error, 'rotateKey', `Failed to rotate key "${keyName}"`);
//       throw error;
//     }
//   }

//   private async reEncryptEnvironmentvariables(
//     decryptedDataMap: Map<string, Record<string, string>>,
//     keyName: string, // This should be the key name, not the key value
//   ): Promise<number> {
//     let totalReEncrypted = 0;

//     try {
//       logger.debug(`Starting re-encryption process. Map size: ${decryptedDataMap.size}`);

//       if (decryptedDataMap.size === 0) {
//         logger.warn('No decrypted data found in map - nothing to re-encrypt');
//         return 0;
//       }

//       // CRITICAL FIX: Get the NEW key value using the keyName
//       const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
//       const newKeyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
//       if (!newKeyValue) {
//         throw new Error(`Key '${keyName}' not found in ${baseEnvFile} for re-encryption`);
//       }
//       logger.debug(`Retrieved NEW key value for re-encryption: ${keyName}`);

//       // Add detailed logging for each file
//       for (const [envFilePath, decryptedVariables] of decryptedDataMap.entries()) {
//         logger.debug(`Decrypted values for file: ${envFilePath}`);
//         logger.debug(
//           `Number of variables to re-encrypt: ${Object.keys(decryptedVariables).length}`,
//         );

//         for (const [key, value] of Object.entries(decryptedVariables)) {
//           logger.debug(`  ${key} = ${value}`);
//         }
//       }

//       // Process each environment file
//       for (const [envFilePath, decryptedVariables] of decryptedDataMap.entries()) {
//         // Read current file lines
//         let envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
//           this.DIRECTORY,
//           envFilePath,
//         );

//         let fileModified = false;

//         // Re-encrypt each variable and update the file lines
//         for (const [key, decryptedValue] of Object.entries(decryptedVariables)) {
//           try {
//             logger.debug(`Re-encrypting variable: ${key} in file: ${envFilePath}`);

//             // CRITICAL FIX: Use the NEW key value (not keyName) for encryption
//             const newEncryptedValue = await CryptoService.encrypt(decryptedValue, keyName);

//             // Update the file lines with the new encrypted value
//             envFileLines = this.environmentFileParser.updateEnvironmentFileLines(
//               envFileLines,
//               key,
//               newEncryptedValue,
//             );

//             fileModified = true;
//             totalReEncrypted++;
//             logger.debug(`Successfully re-encrypted variable: ${key}`);
//           } catch (encryptError) {
//             ErrorHandler.captureError(
//               encryptError,
//               'reEncryptEnvironmentvariables',
//               `Failed to re-encrypt variable '${key}' in file '${envFilePath}': ${encryptError}`,
//             );
//             throw encryptError; // Fail fast on encryption errors
//           }
//         }

//         // Write the updated file back only if it was modified
//         if (fileModified) {
//           const resolvedEnvFilePath =
//             this.environmentSecretFileManager.resolveEnvironmentFilePath(envFilePath);
//           await this.environmentFileParser.writeEnvironmentFileLines(
//             resolvedEnvFilePath,
//             envFileLines,
//           );
//           logger.info(
//             `Updated ${Object.keys(decryptedVariables).length} variables in ${resolvedEnvFilePath}`,
//           );
//         }
//       }

//       logger.info(
//         `Successfully re-encrypted ${totalReEncrypted} variables across ${decryptedDataMap.size} files`,
//       );
//       return totalReEncrypted;
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'reEncryptEnvironmentvariables',
//         'Failed to re-encrypt environment variables',
//       );
//       throw error;
//     }
//   }

//   /**
//    * Helper method to check if a value is encrypted (has encryption prefix)
//    */
//   private isEncryptedValue(value: string): boolean {
//     return Boolean(value && value.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX));
//   }

//   /**
//    * Updated rotateKeyWithAudit method with shouldRotateKey parameter
//    */
//   public async rotateKeyWithAudit(
//     keyFilePath: string,
//     keyName: string,
//     newKeyValue: string,
//     environmentVariables: string[],
//     reason: 'scheduled' | 'manual' | 'expired' | 'security_breach',
//     customMaxAge?: number,
//     shouldRotateKey: boolean = false,
//   ): Promise<{ success: boolean; reEncryptedCount: number; affectedFiles: string[] }> {
//     const startTime = new Date();
//     let rotationResult = { reEncryptedCount: 0, affectedFiles: [] as string[] };

//     try {
//       logger.info(
//         `Starting audit rotation for key: ${keyName}, reason: ${reason}, shouldRotateKey: ${shouldRotateKey}`,
//       );

//       // Get old key hash for audit
//       const oldKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
//       const oldKeyHash = oldKeyValue ? this.keyRotationManager.hashKey(oldKeyValue) : undefined;
//       const newKeyHash = this.keyRotationManager.hashKey(newKeyValue);

//       // Perform the rotation with shouldRotateKey flag
//       rotationResult = await this.rotateKey(
//         keyFilePath,
//         keyName,
//         newKeyValue,
//         environmentVariables,
//         customMaxAge,
//         shouldRotateKey,
//       );

//       // Update audit trail with success
//       const metadata = await this.metadataRepo.readKeyMetadata();

//       if (!metadata[keyName].auditTrail) {
//         metadata[keyName].auditTrail = this.keyRotationManager.createEmptyAuditTrail();
//       }

//       if (!metadata[keyName].auditTrail.rotationHistory) {
//         metadata[keyName].auditTrail.rotationHistory = [];
//       }

//       metadata[keyName].auditTrail.rotationHistory.push({
//         timestamp: startTime,
//         reason,
//         oldKeyHash,
//         newKeyHash,
//         affectedEnvironments: rotationResult.affectedFiles,
//         affectedVariables: [],
//         success: true,
//         overrideMode: shouldRotateKey,
//       });

//       await this.metadataRepo.writeKeyMetadata(metadata);

//       await this.keyRotationManager.recordAuditEvent(
//         keyName,
//         'rotated',
//         'info',
//         'rotateKeyWithAudit',
//         `Key rotated successfully. Reason: ${reason}. Re-encrypted ${rotationResult.reEncryptedCount} variables. Override mode: ${shouldRotateKey}`,
//         {
//           reason,
//           affectedEnvironments: rotationResult.affectedFiles,
//           reEncryptedCount: rotationResult.reEncryptedCount,
//           rotationCount: metadata[keyName].rotationCount,
//           overrideMode: shouldRotateKey,
//         },
//       );

//       return {
//         success: true,
//         reEncryptedCount: rotationResult.reEncryptedCount,
//         affectedFiles: rotationResult.affectedFiles,
//       };
//     } catch (error) {
//       // Record failure in audit trail
//       try {
//         const metadata = await this.metadataRepo.readKeyMetadata();

//         if (metadata[keyName]) {
//           if (!metadata[keyName].auditTrail) {
//             metadata[keyName].auditTrail = this.keyRotationManager.createEmptyAuditTrail();
//           }

//           if (!metadata[keyName].auditTrail.rotationHistory) {
//             metadata[keyName].auditTrail.rotationHistory = [];
//           }

//           metadata[keyName].auditTrail.rotationHistory.push({
//             timestamp: startTime,
//             reason,
//             affectedEnvironments: environmentVariables,
//             affectedVariables: [],
//             success: false,
//             errorDetails: error instanceof Error ? error.message : 'Unknown error', // Changed from errorMessage to errorDetails
//             overrideMode: shouldRotateKey,
//           });

//           await this.metadataRepo.writeKeyMetadata(metadata);
//         }
//       } catch (auditError) {
//         logger.error(`Failed to record rotation failure in audit: ${auditError}`);
//       }

//       throw error;
//     }
//   }

//   /**
//    * Utility method to rotate a key for a single environment file
//    */
//   public async rotateKeyForSingleEnvironment(
//     keyFilePath: string,
//     keyName: string,
//     newKeyValue: string,
//     environmentFilePath: string,
//     reason: 'scheduled' | 'manual' | 'expired' | 'security_breach' = 'manual',
//     customMaxAge?: number,
//     shouldRotateKey: boolean = false,
//   ): Promise<{ success: boolean; reEncryptedCount: number }> {
//     try {
//       logger.info(`Rotating key for single environment: ${environmentFilePath}`);

//       const result = await this.rotateKeyWithAudit(
//         keyFilePath,
//         keyName,
//         newKeyValue,
//         [environmentFilePath],
//         reason,
//         customMaxAge,
//         shouldRotateKey,
//       );

//       return {
//         success: result.success,
//         reEncryptedCount: result.reEncryptedCount,
//       };
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'rotateKeyForSingleEnvironment',
//         `Failed to rotate key "${keyName}" for environment: ${environmentFilePath}`,
//       );
//       return { success: false, reEncryptedCount: 0 };
//     }
//   }

//   /**
//    * Method to manually clear the decrypted data cache
//    */
//   public clearDecryptedCache(): void {
//     logger.debug(`Clearing decrypted data cache. Current size: ${this.decryptedDataCache.size}`);
//     this.decryptedDataCache.clear();
//   }

//   /**
//    * Method to get cache status for debugging
//    */
//   public getCacheStatus(): { size: number; files: string[] } {
//     return {
//       size: this.decryptedDataCache.size,
//       files: Array.from(this.decryptedDataCache.keys()),
//     };
//   }
// }


// import { KeyRotationManager } from '../../utils/environment/keyRotationManager';
// import { EnvironmentSecretFileManager } from '../../utils/environment/environmentSecretFileManager';
// import { KeyMetadataRepository } from '../../utils/environment/keyMetadataRepository';
// import { EnvironmentFileParser } from '../../cryptography/manager/environmentFileParser';
// import { CryptoService } from '../../cryptography/service/cryptoService';
// import { KeyRotationConfig } from '../../cryptography/config/keyMetadata.types.ts';
// import { SECURITY_CONSTANTS } from '../../cryptography/config/security.constant';
// import { EnvironmentConstants } from '../../config/environment/dotenv/constants';
// import ErrorHandler from '../../utils/errors/errorHandler';
// import logger from '../../utils/logging/loggerManager';
// export class KeyRotationService {
//   private environmentSecretFileManager: EnvironmentSecretFileManager;
//   private metadataRepo: KeyMetadataRepository;
//   private environmentFileParser: EnvironmentFileParser;
//   private keyRotationManager: KeyRotationManager;

//   private readonly DIRECTORY = EnvironmentConstants.ENV_DIR;
//   private decryptedDataCache: Map<string, Record<string, string>> = new Map();

//   constructor(
//     environmentSecretFileManager: EnvironmentSecretFileManager,
//     metadataRepo: KeyMetadataRepository,
//     environmentFileParser: EnvironmentFileParser,
//     keyRotationManager: KeyRotationManager,
//   ) {
//     this.environmentSecretFileManager = environmentSecretFileManager;
//     this.metadataRepo = metadataRepo;
//     this.environmentFileParser = environmentFileParser;
//     this.keyRotationManager = keyRotationManager;
//   }

//   /**
//    * Decrypt environment variables with selective processing
//    */
//   private async decryptEnvironmentEncryptedKeys(
//     keyName: string,
//     environmentFiles: string[],
//     shouldRotateKey: boolean = false,
//   ): Promise<Map<string, Record<string, string>>> {
//     this.decryptedDataCache.clear();

//     try {
//       logger.info(`Starting decryption for key: ${keyName}, shouldRotateKey: ${shouldRotateKey}`);

//       const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
//       const resolvedBaseEnvFile = this.environmentSecretFileManager.resolveEnvironmentFilePath(baseEnvFile);

//       // Get the actual key value from the base env file
//       const keyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
//       if (!keyValue) {
//         throw new Error(`Key '${keyName}' not found in ${resolvedBaseEnvFile}`);
//       }

//       for (const envFilePath of environmentFiles) {
//         const envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
//           this.DIRECTORY,
//           envFilePath,
//         );

//         const allEnvVariables = this.environmentFileParser.extractEnvironmentVariables(envFileLines);
//         const decryptedVariables: Record<string, string> = {};

//         // Process each variable in the file
//         for (const [key, value] of Object.entries(allEnvVariables)) {
//           const isEncrypted = this.isEncryptedValue(value);
//           const shouldProcess = isEncrypted || (shouldRotateKey && value);

//           if (shouldProcess) {
//             try {
//               if (isEncrypted) {
//                 const decryptedValue = await CryptoService.decrypt(value, keyName);
//                 decryptedVariables[key] = decryptedValue;
//               } else if (shouldRotateKey && value) {
//                 decryptedVariables[key] = value;
//               }
//             } catch (decryptError) {
//               ErrorHandler.captureError(
//                 decryptError,
//                 'decryptEnvironmentEncryptedKeys',
//                 `Failed to decrypt variable '${key}' in file '${envFilePath}': ${decryptError}`,
//               );
//               logger.warn(`Skipping variable ${key} due to decryption error`);
//             }
//           }
//         }

//         if (Object.keys(decryptedVariables).length > 0) {
//           this.decryptedDataCache.set(envFilePath, decryptedVariables);
//         }
//       }

//       if (this.decryptedDataCache.size === 0) {
//         logger.warn(`No data was decrypted for key ${keyName}. This might indicate no encrypted variables found or decryption failures.`);
//       }

//       return new Map(this.decryptedDataCache);
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'decryptEnvironmentEncryptedKeys',
//         'Failed to decrypt environment encrypted keys',
//       );
//       throw error;
//     }
//   }

//   /**
//    * Re-encrypt environment variables with new key
//    */
//   private async reEncryptEnvironmentVariables(
//     decryptedDataMap: Map<string, Record<string, string>>,
//     keyName: string,
//   ): Promise<number> {
//     let totalReEncrypted = 0;

//     try {
//       if (decryptedDataMap.size === 0) {
//         logger.warn('No decrypted data found in map - nothing to re-encrypt');
//         return 0;
//       }

//       // Get the NEW key value using the keyName
//       const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
//       const newKeyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
//       if (!newKeyValue) {
//         throw new Error(`Key '${keyName}' not found in ${baseEnvFile} for re-encryption`);
//       }

//       // Process each environment file
//       for (const [envFilePath, decryptedVariables] of decryptedDataMap.entries()) {
//         let envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
//           this.DIRECTORY,
//           envFilePath,
//         );

//         let fileModified = false;

//         // Re-encrypt each variable and update the file lines
//         for (const [key, decryptedValue] of Object.entries(decryptedVariables)) {
//           try {
//             const newEncryptedValue = await CryptoService.encrypt(decryptedValue, keyName);

//             envFileLines = this.environmentFileParser.updateEnvironmentFileLines(
//               envFileLines,
//               key,
//               newEncryptedValue,
//             );

//             fileModified = true;
//             totalReEncrypted++;
//           } catch (encryptError) {
//             ErrorHandler.captureError(
//               encryptError,
//               'reEncryptEnvironmentVariables',
//               `Failed to re-encrypt variable '${key}' in file '${envFilePath}': ${encryptError}`,
//             );
//             throw encryptError;
//           }
//         }

//         // Write the updated file back only if it was modified
//         if (fileModified) {
//           const resolvedEnvFilePath = this.environmentSecretFileManager.resolveEnvironmentFilePath(envFilePath);
//           await this.environmentFileParser.writeEnvironmentFileLines(resolvedEnvFilePath, envFileLines);
//           logger.info(`Updated ${Object.keys(decryptedVariables).length} variables in ${resolvedEnvFilePath}`);
//         }
//       }

//       logger.info(`Successfully re-encrypted ${totalReEncrypted} variables across ${decryptedDataMap.size} files`);
//       return totalReEncrypted;
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'reEncryptEnvironmentVariables',
//         'Failed to re-encrypt environment variables',
//       );
//       throw error;
//     }
//   }

//   /**
//    * Helper method to check if a value is encrypted
//    */
//   private isEncryptedValue(value: string): boolean {
//     return Boolean(value && value.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX));
//   }

//   /**
//    * Update audit trail with rotation result
//    */
//   private async updateAuditTrail(
//     keyName: string,
//     keyFilePath: string,
//     reason: 'scheduled' | 'manual' | 'expired' | 'security_breach',
//     startTime: Date,
//     newKeyValue: string,
//     rotationResult: { reEncryptedCount: number; affectedFiles: string[] },
//     shouldRotateKey: boolean,
//     success: boolean,
//     error?: Error,
//   ): Promise<void> {
//     try {
//       const metadata = await this.metadataRepo.readKeyMetadata();

//       // Get old key hash for audit
//       const oldKeyValue = success 
//         ? await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName)
//         : undefined;
//       const oldKeyHash = oldKeyValue ? this.keyRotationManager.hashKey(oldKeyValue) : undefined;
//       const newKeyHash = this.keyRotationManager.hashKey(newKeyValue);

//       if (!metadata[keyName].auditTrail) {
//         metadata[keyName].auditTrail = this.keyRotationManager.createEmptyAuditTrail();
//       }

//       if (!metadata[keyName].auditTrail.rotationHistory) {
//         metadata[keyName].auditTrail.rotationHistory = [];
//       }

//       const auditEntry = {
//         timestamp: startTime,
//         reason,
//         oldKeyHash,
//         newKeyHash,
//         affectedEnvironments: success ? rotationResult.affectedFiles : [],
//         affectedVariables: [],
//         success,
//         overrideMode: shouldRotateKey,
//         ...(error && { errorDetails: error.message }),
//       };

//       metadata[keyName].auditTrail.rotationHistory.push(auditEntry);
//       await this.metadataRepo.writeKeyMetadata(metadata);

//       if (success) {
//         await this.keyRotationManager.recordAuditEvent(
//           keyName,
//           'rotated',
//           'info',
//           'rotateKeyWithAudit',
//           `Key rotated successfully. Reason: ${reason}. Re-encrypted ${rotationResult.reEncryptedCount} variables. Override mode: ${shouldRotateKey}`,
//           {
//             reason,
//             affectedEnvironments: rotationResult.affectedFiles,
//             reEncryptedCount: rotationResult.reEncryptedCount,
//             rotationCount: metadata[keyName].rotationCount,
//             overrideMode: shouldRotateKey,
//           },
//         );
//       }
//     } catch (auditError) {
//       logger.error(`Failed to update audit trail: ${auditError}`);
//     }
//   }

//   /**
//    * Rotate key with audit trail - unified method
//    */
//   public async rotateKeyWithAudit(
//     keyFilePath: string,
//     keyName: string,
//     newKeyValue: string,
//     environmentVariables: string[],
//     reason: 'scheduled' | 'manual' | 'expired' | 'security_breach',
//     customMaxAge?: number,
//     shouldRotateKey: boolean = false,
//   ): Promise<{ success: boolean; reEncryptedCount: number; affectedFiles: string[] }> {
//     const startTime = new Date();
//     let rotationResult = { reEncryptedCount: 0, affectedFiles: [] as string[] };

//     try {
//       logger.info(`Starting key rotation for: ${keyName}, reason: ${reason}, shouldRotateKey: ${shouldRotateKey}`);

//       // Step 1: Get the old key value before rotation
//       const oldKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
//       if (!oldKeyValue) {
//         throw new Error(`Key '${keyName}' not found in ${keyFilePath}`);
//       }

//       // Step 2: Decrypt environment variables with OLD key
//       const decryptedDataMap = await this.decryptEnvironmentEncryptedKeys(
//         keyName,
//         environmentVariables,
//         shouldRotateKey,
//       );

//       // Step 3: Update the key with the new value
//       logger.info(`Updating key '${keyName}' with new value`);
//       await this.environmentSecretFileManager.updateKeyValue(keyFilePath, keyName, newKeyValue);

//       // Verify the key was updated
//       const updatedKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
//       if (updatedKeyValue !== newKeyValue) {
//         throw new Error(`Failed to update key '${keyName}' - key value unchanged`);
//       }

//       // Step 4: Re-encrypt data with the new key
//       logger.info(`Re-encrypting environment variables with new key: ${keyName}`);
//       const reEncryptedCount = await this.reEncryptEnvironmentVariables(decryptedDataMap, keyName);

//       rotationResult = {
//         reEncryptedCount,
//         affectedFiles: Array.from(decryptedDataMap.keys()),
//       };

//       // Step 5: Update metadata
//       const metadata = await this.metadataRepo.readKeyMetadata();
//       const existingMetadata = metadata[keyName];

//       const rotationConfig: KeyRotationConfig = {
//         maxAgeInDays: customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays,
//         warningThresholdInDays: this.keyRotationManager.keyRotationConfig.warningThresholdInDays,
//         enableAutoRotation: this.keyRotationManager.keyRotationConfig.enableAutoRotation,
//       };

//       metadata[keyName] = {
//         keyName,
//         createdAt: existingMetadata?.createdAt || new Date(),
//         lastRotatedAt: new Date(),
//         rotationCount: (existingMetadata?.rotationCount || 0) + 1,
//         rotationConfig,
//         auditTrail: existingMetadata?.auditTrail || this.keyRotationManager.createEmptyAuditTrail(),
//         usageTracking: existingMetadata?.usageTracking || this.keyRotationManager.createDefaultUsageTracking(),
//         statusTracking: existingMetadata?.statusTracking ||
//           this.keyRotationManager.createDefaultStatusTracking(this.keyRotationManager.keyRotationConfig.enableAutoRotation),
//       };

//       await this.metadataRepo.writeKeyMetadata(metadata);

//       // Step 6: Update audit trail
//       await this.updateAuditTrail(
//         keyName,
//         keyFilePath,
//         reason,
//         startTime,
//         newKeyValue,
//         rotationResult,
//         shouldRotateKey,
//         true,
//       );

//       logger.info(
//         `Key "${keyName}" rotated successfully. Re-encrypted ${reEncryptedCount} variables across ${rotationResult.affectedFiles.length} files. Rotation count: ${metadata[keyName].rotationCount}. Override mode: ${shouldRotateKey}`,
//       );

//       return {
//         success: true,
//         reEncryptedCount: rotationResult.reEncryptedCount,
//         affectedFiles: rotationResult.affectedFiles,
//       };

//     } catch (error) {
//       // Update audit trail with failure
//       await this.updateAuditTrail(
//         keyName,
//         keyFilePath,
//         reason,
//         startTime,
//         newKeyValue,
//         rotationResult,
//         shouldRotateKey,
//         false,
//         error instanceof Error ? error : new Error('Unknown error'),
//       );

//       throw error;
//     } finally {
//       // Clear cache
//       this.decryptedDataCache.clear();
//     }
//   }

//   /**
//    * Utility method to rotate a key for a single environment file
//    */
//   public async rotateKeyForSingleEnvironment(
//     keyFilePath: string,
//     keyName: string,
//     newKeyValue: string,
//     environmentFilePath: string,
//     reason: 'scheduled' | 'manual' | 'expired' | 'security_breach' = 'manual',
//     customMaxAge?: number,
//     shouldRotateKey: boolean = false,
//   ): Promise<{ success: boolean; reEncryptedCount: number }> {
//     try {
//       logger.info(`Rotating key for single environment: ${environmentFilePath}`);

//       const result = await this.rotateKeyWithAudit(
//         keyFilePath,
//         keyName,
//         newKeyValue,
//         [environmentFilePath],
//         reason,
//         customMaxAge,
//         shouldRotateKey,
//       );

//       return {
//         success: result.success,
//         reEncryptedCount: result.reEncryptedCount,
//       };
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'rotateKeyForSingleEnvironment',
//         `Failed to rotate key "${keyName}" for environment: ${environmentFilePath}`,
//       );
//       return { success: false, reEncryptedCount: 0 };
//     }
//   }

//   /**
//    * Method to manually clear the decrypted data cache
//    */
//   public clearDecryptedCache(): void {
//     this.decryptedDataCache.clear();
//   }

//   /**
//    * Method to get cache status for debugging
//    */
//   public getCacheStatus(): { size: number; files: string[] } {
//     return {
//       size: this.decryptedDataCache.size,
//       files: Array.from(this.decryptedDataCache.keys()),
//     };
//   }
// }



import { KeyRotationManager } from '../../utils/environment/keyRotationManager';
import { EnvironmentSecretFileManager } from '../../utils/environment/environmentSecretFileManager';
import { KeyMetadataRepository } from '../../utils/environment/keyMetadataRepository';
import { EnvironmentFileParser } from '../../cryptography/manager/environmentFileParser';
import { CryptoService } from '../../cryptography/service/cryptoService';
import { KeyRotationConfig } from '../../cryptography/config/keyMetadata.types.ts';
import { SECURITY_CONSTANTS } from '../../cryptography/config/security.constant';
import { KeyMetadata, RotationEvent } from "../config/keyMetadata.types.ts";
import { EnvironmentConstants } from '../../config/environment/dotenv/constants';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

// Type for rotation results
interface RotationResult {
  reEncryptedCount: number;
  affectedFiles: string[];
}

// Type for single environment rotation result
interface SingleEnvironmentRotationResult {
  success: boolean;
  reEncryptedCount: number;
}

// Type for full rotation result
interface FullRotationResult {
  success: boolean;
  reEncryptedCount: number;
  affectedFiles: string[];
}

export class KeyRotationService {
  private environmentSecretFileManager: EnvironmentSecretFileManager;
  private metadataRepo: KeyMetadataRepository;
  private environmentFileParser: EnvironmentFileParser;
  private keyRotationManager: KeyRotationManager;

  private readonly DIRECTORY = EnvironmentConstants.ENV_DIR;
  private decryptedDataCache: Map<string, Record<string, string>> = new Map();

  constructor(
    environmentSecretFileManager: EnvironmentSecretFileManager,
    metadataRepo: KeyMetadataRepository,
    environmentFileParser: EnvironmentFileParser,
    keyRotationManager: KeyRotationManager,
  ) {
    this.environmentSecretFileManager = environmentSecretFileManager;
    this.metadataRepo = metadataRepo;
    this.environmentFileParser = environmentFileParser;
    this.keyRotationManager = keyRotationManager;
  }

  /**
   * Decrypt environment variables with selective processing
   */
  private async decryptEnvironmentEncryptedKeys(
    keyName: string,
    environmentFiles: string[],
    shouldRotateKey: boolean = false,
  ): Promise<Map<string, Record<string, string>>> {
    this.decryptedDataCache.clear();

    try {
      logger.info(`Starting decryption for key: ${keyName}, shouldRotateKey: ${shouldRotateKey}`);

      const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
      const resolvedBaseEnvFile = this.environmentSecretFileManager.resolveEnvironmentFilePath(baseEnvFile);

      // Get the actual key value from the base env file
      const keyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
      if (!keyValue) {
        throw new Error(`Key '${keyName}' not found in ${resolvedBaseEnvFile}`);
      }

      for (const envFilePath of environmentFiles) {
        const envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
          this.DIRECTORY,
          envFilePath,
        );

        const allEnvVariables = this.environmentFileParser.extractEnvironmentVariables(envFileLines);
        const decryptedVariables: Record<string, string> = {};

        // Process each variable in the file
        for (const [key, value] of Object.entries(allEnvVariables)) {
          const isEncrypted = this.isEncryptedValue(value);
          const shouldProcess = isEncrypted || (shouldRotateKey && value);

          if (shouldProcess) {
            try {
              if (isEncrypted) {
                const decryptedValue = await CryptoService.decrypt(value, keyName);
                decryptedVariables[key] = decryptedValue;
              } else if (shouldRotateKey && value) {
                decryptedVariables[key] = value;
              }
            } catch (decryptError) {
              ErrorHandler.captureError(
                decryptError,
                'decryptEnvironmentEncryptedKeys',
                `Failed to decrypt variable '${key}' in file '${envFilePath}': ${decryptError}`,
              );
              logger.warn(`Skipping variable ${key} due to decryption error`);
            }
          }
        }

        if (Object.keys(decryptedVariables).length > 0) {
          this.decryptedDataCache.set(envFilePath, decryptedVariables);
        }
      }

      if (this.decryptedDataCache.size === 0) {
        logger.warn(`No data was decrypted for key ${keyName}. This might indicate no encrypted variables found or decryption failures.`);
      }

      return new Map(this.decryptedDataCache);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'decryptEnvironmentEncryptedKeys',
        'Failed to decrypt environment encrypted keys',
      );
      throw error;
    }
  }

  /**
   * Re-encrypt environment variables with new key
   */
  private async reEncryptEnvironmentVariables(
    decryptedDataMap: Map<string, Record<string, string>>,
    keyName: string,
  ): Promise<number> {
    let totalReEncrypted = 0;

    try {
      if (decryptedDataMap.size === 0) {
        logger.warn('No decrypted data found in map - nothing to re-encrypt');
        return 0;
      }

      // Get the NEW key value using the keyName
      const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
      const newKeyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
      if (!newKeyValue) {
        throw new Error(`Key '${keyName}' not found in ${baseEnvFile} for re-encryption`);
      }

      // Process each environment file
      for (const [envFilePath, decryptedVariables] of decryptedDataMap.entries()) {
        let envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
          this.DIRECTORY,
          envFilePath,
        );

        let fileModified = false;

        // Re-encrypt each variable and update the file lines
        for (const [key, decryptedValue] of Object.entries(decryptedVariables)) {
          try {
            const newEncryptedValue = await CryptoService.encrypt(decryptedValue, keyName);

            envFileLines = this.environmentFileParser.updateEnvironmentFileLines(
              envFileLines,
              key,
              newEncryptedValue,
            );

            fileModified = true;
            totalReEncrypted++;
          } catch (encryptError) {
            ErrorHandler.captureError(
              encryptError,
              'reEncryptEnvironmentVariables',
              `Failed to re-encrypt variable '${key}' in file '${envFilePath}': ${encryptError}`,
            );
            throw encryptError;
          }
        }

        // Write the updated file back only if it was modified
        if (fileModified) {
          const resolvedEnvFilePath = this.environmentSecretFileManager.resolveEnvironmentFilePath(envFilePath);
          await this.environmentFileParser.writeEnvironmentFileLines(resolvedEnvFilePath, envFileLines);
          logger.info(`Updated ${Object.keys(decryptedVariables).length} variables in ${resolvedEnvFilePath}`);
        }
      }

      logger.info(`Successfully re-encrypted ${totalReEncrypted} variables across ${decryptedDataMap.size} files`);
      return totalReEncrypted;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'reEncryptEnvironmentVariables',
        'Failed to re-encrypt environment variables',
      );
      throw error;
    }
  }

  /**
   * Helper method to check if a value is encrypted
   */
  private isEncryptedValue(value: string): boolean {
    return Boolean(value && value.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX));
  }

  /**
   * Update audit trail with rotation result
   */
  private async updateAuditTrail(
    keyName: string,
    keyFilePath: string,
    reason: RotationEvent['reason'],
    startTime: Date,
    newKeyValue: string,
    rotationResult: RotationResult,
    shouldRotateKey: boolean,
    success: boolean,
    error?: Error,
  ): Promise<void> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      
      // Ensure key metadata exists
      if (!metadata[keyName]) {
        logger.warn(`No metadata found for key: ${keyName} during audit trail update`);
        return;
      }

      // Get old key hash for audit (only if success, since key would be updated by now)
      let oldKeyHash: string | undefined;
      if (!success) {
        // If rotation failed, we can still get the current key value
        const currentKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
        oldKeyHash = currentKeyValue ? this.keyRotationManager.hashKey(currentKeyValue) : undefined;
      }
      const newKeyHash = this.keyRotationManager.hashKey(newKeyValue);

      // Initialize audit trail structure if needed
      if (!metadata[keyName].auditTrail) {
        metadata[keyName].auditTrail = this.keyRotationManager.createEmptyAuditTrail();
      }

      if (!metadata[keyName].auditTrail.rotationHistory) {
        metadata[keyName].auditTrail.rotationHistory = [];
      }

      // Create properly typed audit entry
      const auditEntry: RotationEvent = {
        timestamp: startTime,
        reason,
        oldKeyHash,
        newKeyHash,
        affectedEnvironments: success ? rotationResult.affectedFiles : [],
        affectedVariables: [], // This should be populated if you track variable names
        success,
        overrideMode: shouldRotateKey,
        ...(error && { errorDetails: error.message }),
      };

      metadata[keyName].auditTrail.rotationHistory.push(auditEntry);
      
      // Use the improved single key update method
      await this.metadataRepo.updateSingleKeyMetadata(keyName, metadata[keyName]);

      // Record audit event if successful
      if (success) {
        const auditEventMetadata: Record<string, unknown> = {
          reason,
          affectedEnvironments: rotationResult.affectedFiles,
          reEncryptedCount: rotationResult.reEncryptedCount,
          rotationCount: metadata[keyName].rotationCount,
          overrideMode: shouldRotateKey,
        };

        await this.keyRotationManager.recordAuditEvent(
          keyName,
          'rotated',
          'info',
          'rotateKeyWithAudit',
          `Key rotated successfully. Reason: ${reason}. Re-encrypted ${rotationResult.reEncryptedCount} variables. Override mode: ${shouldRotateKey}`,
          auditEventMetadata,
        );
      }
    } catch (auditError) {
      logger.error(`Failed to update audit trail for key ${keyName}: ${auditError}`);
      ErrorHandler.captureError(auditError, 'updateAuditTrail', `Failed to update audit trail for key: ${keyName}`);
    }
  }

  /**
   * Rotate key with audit trail - unified method
   */
  public async rotateKeyWithAudit(
    keyFilePath: string,
    keyName: string,
    newKeyValue: string,
    environmentVariables: string[],
    reason: RotationEvent['reason'],
    customMaxAge?: number,
    shouldRotateKey: boolean = false,
  ): Promise<FullRotationResult> {
    const startTime = new Date();
    let rotationResult: RotationResult = { reEncryptedCount: 0, affectedFiles: [] };

    try {
      logger.info(`Starting key rotation for: ${keyName}, reason: ${reason}, shouldRotateKey: ${shouldRotateKey}`);

      // Step 1: Get the old key value before rotation
      const oldKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
      if (!oldKeyValue) {
        throw new Error(`Key '${keyName}' not found in ${keyFilePath}`);
      }

      // Step 2: Decrypt environment variables with OLD key
      const decryptedDataMap = await this.decryptEnvironmentEncryptedKeys(
        keyName,
        environmentVariables,
        shouldRotateKey,
      );

      // Step 3: Update the key with the new value
      logger.info(`Updating key '${keyName}' with new value`);
      await this.environmentSecretFileManager.updateKeyValue(keyFilePath, keyName, newKeyValue);

      // Verify the key was updated
      const updatedKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
      if (updatedKeyValue !== newKeyValue) {
        throw new Error(`Failed to update key '${keyName}' - key value unchanged`);
      }

      // Step 4: Re-encrypt data with the new key
      logger.info(`Re-encrypting environment variables with new key: ${keyName}`);
      const reEncryptedCount = await this.reEncryptEnvironmentVariables(decryptedDataMap, keyName);

      rotationResult = {
        reEncryptedCount,
        affectedFiles: Array.from(decryptedDataMap.keys()),
      };

      // Step 5: Update metadata
      const existingMetadata = await this.metadataRepo.getKeyMetadata(keyName);

      const rotationConfig: KeyRotationConfig = {
        maxAgeInDays: customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays,
        warningThresholdInDays: this.keyRotationManager.keyRotationConfig.warningThresholdInDays,
        enableAutoRotation: this.keyRotationManager.keyRotationConfig.enableAutoRotation,
      };

      const updatedMetadata: KeyMetadata = {
        keyName,
        createdAt: existingMetadata?.createdAt || new Date(),
        lastRotatedAt: new Date(),
        rotationCount: (existingMetadata?.rotationCount || 0) + 1,
        rotationConfig,
        auditTrail: existingMetadata?.auditTrail || this.keyRotationManager.createEmptyAuditTrail(),
        usageTracking: existingMetadata?.usageTracking || this.keyRotationManager.createDefaultUsageTracking(),
        statusTracking: existingMetadata?.statusTracking ||
          this.keyRotationManager.createDefaultStatusTracking(this.keyRotationManager.keyRotationConfig.enableAutoRotation),
      };

      await this.metadataRepo.updateSingleKeyMetadata(keyName, updatedMetadata);

      // Step 6: Update audit trail
      await this.updateAuditTrail(
        keyName,
        keyFilePath,
        reason,
        startTime,
        newKeyValue,
        rotationResult,
        shouldRotateKey,
        true,
      );

      logger.info(
        `Key "${keyName}" rotated successfully. Re-encrypted ${reEncryptedCount} variables across ${rotationResult.affectedFiles.length} files. Rotation count: ${updatedMetadata.rotationCount}. Override mode: ${shouldRotateKey}`,
      );

      return {
        success: true,
        reEncryptedCount: rotationResult.reEncryptedCount,
        affectedFiles: rotationResult.affectedFiles,
      };

    } catch (error) {
      // Update audit trail with failure
      await this.updateAuditTrail(
        keyName,
        keyFilePath,
        reason,
        startTime,
        newKeyValue,
        rotationResult,
        shouldRotateKey,
        false,
        error instanceof Error ? error : new Error('Unknown error'),
      );

      throw error;
    } finally {
      // Clear cache
      this.decryptedDataCache.clear();
    }
  }

  /**
   * Utility method to rotate a key for a single environment file
   */
  public async rotateKeyForSingleEnvironment(
    keyFilePath: string,
    keyName: string,
    newKeyValue: string,
    environmentFilePath: string,
    reason: RotationEvent['reason'] = 'manual',
    customMaxAge?: number,
    shouldRotateKey: boolean = false,
  ): Promise<SingleEnvironmentRotationResult> {
    try {
      logger.info(`Rotating key for single environment: ${environmentFilePath}`);

      const result = await this.rotateKeyWithAudit(
        keyFilePath,
        keyName,
        newKeyValue,
        [environmentFilePath],
        reason,
        customMaxAge,
        shouldRotateKey,
      );

      return {
        success: result.success,
        reEncryptedCount: result.reEncryptedCount,
      };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'rotateKeyForSingleEnvironment',
        `Failed to rotate key "${keyName}" for environment: ${environmentFilePath}`,
      );
      return { success: false, reEncryptedCount: 0 };
    }
  }

  /**
   * Method to manually clear the decrypted data cache
   */
  public clearDecryptedCache(): void {
    this.decryptedDataCache.clear();
  }

  /**
   * Method to get cache status for debugging
   */
  public getCacheStatus(): { size: number; files: string[] } {
    return {
      size: this.decryptedDataCache.size,
      files: Array.from(this.decryptedDataCache.keys()),
    };
  }
}