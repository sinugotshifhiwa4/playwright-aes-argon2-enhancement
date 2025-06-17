import { KeyRotationManager } from '../manager/keyRotationManager';
import { EnvironmentSecretFileManager } from '../manager/environmentSecretFileManager';
import { KeyMetadataRepository } from '../key/keyMetadataRepository';
import { EnvironmentFileParser } from '../../cryptography/manager/environmentFileParser';
import { CryptoService } from '../../cryptography/service/cryptoService';
import { SECURITY_CONSTANTS } from '../constants/security.constant';
import {
  KeyRotationConfig,
  KeyMetadata,
  RotationEvent,
  MultiRotationResult,
  SingleRotationResult,
} from '../types/keyMetadata.types';
import { EnvironmentConstants } from '../../config/environment/dotenv/constants';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

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

  public async rotateKeyWithAudit(
    keyFilePath: string,
    keyName: string,
    newKeyValue: string,
    environmentVariables: string[],
    reason: RotationEvent['reason'],
    customMaxAge?: number,
    shouldRotateKey: boolean = false,
  ): Promise<MultiRotationResult> {
    const startTime = new Date();
    let rotationResult: MultiRotationResult = {
      success: false,
      reEncryptedCount: 0,
      affectedFiles: [],
    };
    let decryptedDataMap = new Map<string, Record<string, string>>();

    try {
      logger.info(
        `Starting key rotation for: ${keyName}, reason: ${reason}, shouldRotateKey: ${shouldRotateKey}`,
      );

      // Step 1: Validate the key exists and get comprehensive info
      const keyInfo = await this.keyRotationManager.getComprehensiveKeyInfo(keyName);
      if (!keyInfo.exists || !keyInfo.metadata) {
        throw new Error(`Key '${keyName}' not found in metadata`);
      }

      // Step 2: Validate rotation config before proceeding
      try {
        this.keyRotationManager.validateRotationConfig(keyInfo.metadata.rotationConfig);
      } catch (error) {
        const errorAsError = error as Error;
        logger.warn(
          `Invalid rotation config for key "${keyName}", will repair: ${errorAsError.message}`,
        );

        // Repair the config and continue
        await this.keyRotationManager.validateAndRepairAllMetadata();
      }

      // Step 3: Record audit event for rotation start
      await this.keyRotationManager.recordAuditEvent(
        keyName,
        'rotated',
        'info',
        'rotateKeyWithAudit',
        `Starting key rotation (reason: ${reason})`,
        {
          reason,
          customMaxAge,
          shouldRotateKey,
          environmentVariablesCount: environmentVariables.length,
        },
      );

      // Step 4: Get the old key value before rotation
      const oldKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
      if (!oldKeyValue) {
        throw new Error(`Key '${keyName}' not found in ${keyFilePath}`);
      }

      // Step 5: Decrypt environment variables with OLD key
      logger.info(`Decrypting environment variables with current key: ${keyName}`);
      decryptedDataMap = await this.decryptEnvironmentEncryptedKeys(
        keyName,
        environmentVariables,
        shouldRotateKey,
      );

      // Step 6: Update the key with the new value
      logger.info(`Updating key '${keyName}' with new value`);
      await this.environmentSecretFileManager.updateKeyValue(keyFilePath, keyName, newKeyValue);

      // Step 7: Verify the key was updated
      const updatedKeyValue = await this.environmentSecretFileManager.getKeyValue(
        keyFilePath,
        keyName,
      );
      if (updatedKeyValue !== newKeyValue) {
        throw new Error(`Failed to update key '${keyName}' - key value unchanged`);
      }

      // Step 8: Re-encrypt data with the new key
      logger.info(`Re-encrypting environment variables with new key: ${keyName}`);
      const reEncryptedCount = await this.reEncryptEnvironmentVariables(decryptedDataMap, keyName);

      rotationResult = {
        success: true,
        reEncryptedCount,
        affectedFiles: Array.from(decryptedDataMap.keys()),
      };

      // Step 9: Update metadata with comprehensive tracking
      const existingMetadata = keyInfo.metadata;

      // Create validated rotation config
      const rotationConfig: KeyRotationConfig = {
        maxAgeInDays: customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays,
        warningThresholdInDays: this.keyRotationManager.keyRotationConfig.warningThresholdInDays,
        enableAutoRotation: this.keyRotationManager.keyRotationConfig.enableAutoRotation,
      };

      // Validate the new config
      const validatedConfig = this.keyRotationManager.validateRotationConfig(rotationConfig);

      // Update usage tracking from the processed data
      const updatedUsageTracking = this.keyRotationManager.updateUsageTracking(
        decryptedDataMap,
        existingMetadata.usageTracking,
      );

      const updatedMetadata: KeyMetadata = {
        keyName,
        createdAt: existingMetadata.createdAt,
        lastRotatedAt: new Date(),
        rotationCount: existingMetadata.rotationCount + 1,
        rotationConfig: validatedConfig,
        auditTrail: existingMetadata.auditTrail,
        usageTracking: updatedUsageTracking,
        statusTracking: {
          ...existingMetadata.statusTracking,
          currentStatus: 'healthy', // Reset to healthy after successful rotation
          lastStatusChange: new Date(),
        },
      };

      await this.metadataRepo.updateSingleKeyMetadata(keyName, updatedMetadata);

      // Step 10: Record key access for usage tracking
      await this.keyRotationManager.recordKeyAccess(keyName, 'rotation-service');

      // Step 11: Add health check entry for successful rotation
      await this.keyRotationManager.addHealthCheckEntry(
        keyName,
        updatedMetadata,
        true,
        reason,
        rotationResult,
      );

      // Step 12: Update comprehensive audit trail
      await this.keyRotationManager.updateAuditTrail(
        keyName,
        keyFilePath,
        reason,
        startTime,
        newKeyValue,
        rotationResult,
        shouldRotateKey,
        true,
      );

      // Step 13: Record successful audit event
      await this.keyRotationManager.recordAuditEvent(
        keyName,
        'rotated',
        'info',
        'rotateKeyWithAudit',
        `Key rotation completed successfully`,
        {
          reason,
          rotationCount: updatedMetadata.rotationCount,
          reEncryptedCount: rotationResult.reEncryptedCount,
          affectedFilesCount: rotationResult.affectedFiles.length,
          durationMs: new Date().getTime() - startTime.getTime(),
          newMaxAge: validatedConfig.maxAgeInDays,
        },
      );

      logger.info(
        `Key "${keyName}" rotated successfully. Re-encrypted ${reEncryptedCount} variables across ${rotationResult.affectedFiles.length} files. Rotation count: ${updatedMetadata.rotationCount}. Override mode: ${shouldRotateKey}`,
      );

      // Step 14: Perform post-rotation health check
      const postRotationHealth = await this.keyRotationManager.checkKeyRotationStatus(
        keyName,
        'manual',
      );
      logger.info(
        `Post-rotation health check for "${keyName}": Age ${postRotationHealth.ageInDays} days, Status: ${postRotationHealth.needsRotation ? 'Critical' : postRotationHealth.needsWarning ? 'Warning' : 'Healthy'}`,
      );

      return {
        success: true,
        reEncryptedCount: rotationResult.reEncryptedCount,
        affectedFiles: rotationResult.affectedFiles,
      };
    } catch (error) {
      const errorAsError = error instanceof Error ? error : new Error('Unknown error');

      // Mark rotation as failed
      rotationResult.success = false;

      // Get current metadata for health check (if available)
      let currentMetadata: KeyMetadata | undefined;
      try {
        const keyInfo = await this.keyRotationManager.getKeyInfo(keyName);
        currentMetadata = keyInfo.metadata;
      } catch (metadataError) {
        logger.warn(
          `Could not retrieve metadata for failed rotation health check: ${metadataError}`,
        );
      }

      // Add health check entry for failed rotation
      if (currentMetadata) {
        await this.keyRotationManager.addHealthCheckEntry(
          keyName,
          currentMetadata,
          false,
          reason,
          rotationResult,
        );
      }

      // Record failure audit event
      await this.keyRotationManager.recordAuditEvent(
        keyName,
        'rotated',
        'critical',
        'rotateKeyWithAudit',
        `Key rotation failed: ${errorAsError.message}`,
        {
          reason,
          error: errorAsError.message,
          reEncryptedCount: rotationResult.reEncryptedCount,
          affectedFilesCount: rotationResult.affectedFiles.length,
          durationMs: new Date().getTime() - startTime.getTime(),
        },
      );

      // Update audit trail with failure
      await this.keyRotationManager.updateAuditTrail(
        keyName,
        keyFilePath,
        reason,
        startTime,
        newKeyValue,
        rotationResult,
        shouldRotateKey,
        false,
        errorAsError,
      );

      logger.error(`Key rotation failed for "${keyName}": ${errorAsError.message}`);
      throw error;
    } finally {
      // Step 15: Cleanup and final logging
      try {
        // Clear cache
        this.decryptedDataCache.clear();

        // Log final status
        const endTime = new Date();
        const durationMs = endTime.getTime() - startTime.getTime();

        logger.info(
          `Key rotation process completed for "${keyName}" in ${durationMs}ms. ` +
            `Success: ${rotationResult.success}, ` +
            `Re-encrypted: ${rotationResult.reEncryptedCount} variables, ` +
            `Affected files: ${rotationResult.affectedFiles.length}`,
        );

        // Optionally trigger system-wide health check if this was a critical rotation
        if (reason === 'expired' || reason === 'compromised') {
          logger.info('Triggering system-wide audit due to critical rotation');
          try {
            const auditResult = await this.keyRotationManager.performComprehensiveAudit();
            logger.info(
              `System audit complete: ${auditResult.systemHealth} health, ` +
                `${auditResult.keysNeedingRotation.length} keys need rotation, ` +
                `${auditResult.keysNeedingWarning.length} keys need attention`,
            );
          } catch (auditError) {
            logger.warn(`Post-rotation system audit failed: ${auditError}`);
          }
        }
      } catch (cleanupError) {
        logger.warn(`Cleanup operations failed: ${cleanupError}`);
      }
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
  ): Promise<SingleRotationResult> {
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
        affectedFile: result.affectedFiles[0] || environmentFilePath,
      };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'rotateKeyForSingleEnvironment',
        `Failed to rotate key "${keyName}" for environment: ${environmentFilePath}`,
      );
      return { success: false, reEncryptedCount: 0, affectedFile: environmentFilePath };
    }
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
      const resolvedBaseEnvFile =
        this.environmentSecretFileManager.resolveEnvironmentFilePath(baseEnvFile);

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

        const allEnvVariables =
          this.environmentFileParser.extractEnvironmentVariables(envFileLines);
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
        logger.warn(
          `No data was decrypted for key ${keyName}. This might indicate no encrypted variables found or decryption failures.`,
        );
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
          const resolvedEnvFilePath =
            this.environmentSecretFileManager.resolveEnvironmentFilePath(envFilePath);
          await this.environmentFileParser.writeEnvironmentFileLines(
            resolvedEnvFilePath,
            envFileLines,
          );
          logger.info(
            `Updated ${Object.keys(decryptedVariables).length} variables in ${resolvedEnvFilePath}`,
          );
        }
      }

      logger.info(
        `Successfully re-encrypted ${totalReEncrypted} variables across ${decryptedDataMap.size} files`,
      );
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
