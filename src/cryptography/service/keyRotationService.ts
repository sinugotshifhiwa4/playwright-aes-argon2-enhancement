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
  RotationResult,
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

  // Update the method signature
  public async rotateKeyWithAudit(
    keyFilePath: string,
    keyName: string,
    newKeyValue: string,
    environmentFile: string, // Changed from environmentVariables: string[] to single file
    reason: RotationEvent['reason'],
    customMaxAge?: number,
    shouldRotateKey: boolean = false,
  ): Promise<RotationResult> {
    // Changed return type from MultiRotationResult to SingleRotationResult
    const startTime = new Date();
    let rotationResult: RotationResult = {
      success: false,
      reEncryptedCount: 0,
      affectedFile: environmentFile,
    };
    let decryptedData: Record<string, string> = {};
    let processedVariableNames: string[] = []; // Add this variable to track processed variables

    try {
      logger.info(
        `Starting key rotation for: ${keyName}, environment: ${environmentFile}, reason: ${reason}, shouldRotateKey: ${shouldRotateKey}`,
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
      }

      // Step 3: Record audit event for rotation start
      await this.keyRotationManager.recordAuditEvent(
        keyName,
        'rotated',
        'info',
        'rotateKeyWithAudit',
        `Starting key rotation for environment ${environmentFile} (reason: ${reason})`,
        {
          reason,
          customMaxAge,
          shouldRotateKey,
          environmentFile,
        },
      );

      // Step 4: Get the old key value before rotation
      const oldKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
      if (!oldKeyValue) {
        throw new Error(`Key '${keyName}' not found in ${keyFilePath}`);
      }

      // Step 5: Decrypt environment variables with OLD key for single file
      logger.info(
        `Decrypting environment variables in ${environmentFile} with current key: ${keyName}`,
      );
      decryptedData = await this.decryptSingleEnvironmentFile(
        keyName,
        environmentFile,
        shouldRotateKey,
      );

      // Extract the actual variable names that were processed
      processedVariableNames = Object.keys(decryptedData).filter(
        (key) => decryptedData[key] !== undefined && decryptedData[key] !== null,
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

      // Step 8: Re-encrypt data with the new key for single file
      logger.info(
        `Re-encrypting environment variables in ${environmentFile} with new key: ${keyName}`,
      );
      const reEncryptedCount = await this.reEncryptSingleEnvironmentFile(
        environmentFile,
        decryptedData,
        keyName,
      );

      rotationResult = {
        success: true,
        reEncryptedCount,
        affectedFile: environmentFile,
      };

      // Step 9: Update metadata with comprehensive tracking
      const existingMetadata = keyInfo.metadata;

      // Create validated rotation config
      const rotationConfig: KeyRotationConfig = {
        maxAgeInDays: customMaxAge || this.keyRotationManager.keyRotationConfig.maxAgeInDays,
        warningThresholdInDays: this.keyRotationManager.keyRotationConfig.warningThresholdInDays,
      };

      // Validate the new config
      const validatedConfig = this.keyRotationManager.validateRotationConfig(rotationConfig);

      // Update usage tracking from the processed data (convert single file data to map format)
      const singleFileMap = new Map<string, Record<string, string>>();
      if (Object.keys(decryptedData).length > 0) {
        singleFileMap.set(environmentFile, decryptedData);
      }
      const updatedUsageTracking = this.keyRotationManager.updateUsageTracking(
        singleFileMap,
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
          currentStatus: 'healthy',
          lastStatusChange: new Date(),
        },
      };

      await this.metadataRepo.updateSingleKeyMetadata(keyName, updatedMetadata);

      // Step 10: Record key access for usage tracking
      await this.keyRotationManager.recordKeyAccess(keyName, 'rotation-service');

      // Step 11: Add health check entry for successful rotation
      await this.keyRotationManager.addHealthCheckEntry(keyName, updatedMetadata, true, reason, {
        success: true,
        reEncryptedCount: rotationResult.reEncryptedCount,
        affectedFile: environmentFile,
      });

      // Step 12: Update comprehensive audit trail with actual processed variable names
      await this.keyRotationManager.updateAuditTrail(
        keyName,
        keyFilePath,
        reason,
        startTime,
        newKeyValue,
        {
          success: true,
          reEncryptedCount: rotationResult.reEncryptedCount,
          affectedFile: environmentFile,
        },
        shouldRotateKey,
        true,
        undefined, // No error for successful rotation
        processedVariableNames, // Pass the actual variable names here
      );

      // Step 13: Record successful audit event
      await this.keyRotationManager.recordAuditEvent(
        keyName,
        'rotated',
        'info',
        'rotateKeyWithAudit',
        `Key rotation completed successfully for environment ${environmentFile}`,
        {
          reason,
          rotationCount: updatedMetadata.rotationCount,
          reEncryptedCount: rotationResult.reEncryptedCount,
          environmentFile,
          durationMs: new Date().getTime() - startTime.getTime(),
          newMaxAge: validatedConfig.maxAgeInDays,
          processedVariables: processedVariableNames, // Include in audit metadata
        },
      );

      logger.info(
        `Key "${keyName}" rotated successfully for environment ${environmentFile}. Re-encrypted ${reEncryptedCount} variables: ${processedVariableNames.join(', ')}. Rotation count: ${updatedMetadata.rotationCount}. Override mode: ${shouldRotateKey}`,
      );

      // Step 14: Perform post-rotation health check
      const postRotationHealth = await this.keyRotationManager.checkKeyRotationStatus(
        keyName,
        'manual',
      );
      logger.info(
        `Post-rotation health check for "${keyName}": Age ${postRotationHealth.ageInDays} days, Status: ${postRotationHealth.needsRotation ? 'Critical' : postRotationHealth.needsWarning ? 'Warning' : 'Healthy'}`,
      );

      return rotationResult;
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
        await this.keyRotationManager.addHealthCheckEntry(keyName, currentMetadata, false, reason, {
          success: false,
          reEncryptedCount: rotationResult.reEncryptedCount,
          affectedFile: environmentFile,
        });
      }

      // Record failure audit event
      await this.keyRotationManager.recordAuditEvent(
        keyName,
        'rotated',
        'critical',
        'rotateKeyWithAudit',
        `Key rotation failed for environment ${environmentFile}: ${errorAsError.message}`,
        {
          reason,
          error: errorAsError.message,
          reEncryptedCount: rotationResult.reEncryptedCount,
          environmentFile,
          durationMs: new Date().getTime() - startTime.getTime(),
          processedVariables: processedVariableNames, // Include in failure audit too
        },
      );

      // Update audit trail with failure - include processed variables even on failure
      await this.keyRotationManager.updateAuditTrail(
        keyName,
        keyFilePath,
        reason,
        startTime,
        newKeyValue,
        {
          success: false,
          reEncryptedCount: rotationResult.reEncryptedCount,
          affectedFile: environmentFile,
        },
        shouldRotateKey,
        false,
        errorAsError,
        processedVariableNames, // Pass the actual variable names even on failure
      );

      logger.error(
        `Key rotation failed for "${keyName}" in environment ${environmentFile}: ${errorAsError.message}`,
      );
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
          `Key rotation process completed for "${keyName}" in environment ${environmentFile} in ${durationMs}ms. ` +
            `Success: ${rotationResult.success}, ` +
            `Re-encrypted: ${rotationResult.reEncryptedCount} variables (${processedVariableNames.join(', ')})`,
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

  private async decryptSingleEnvironmentFile(
    keyName: string,
    environmentFile: string,
    shouldRotateKey: boolean = false,
  ): Promise<Record<string, string>> {
    try {
      logger.info(
        `Starting decryption for key: ${keyName} in file: ${environmentFile}, shouldRotateKey: ${shouldRotateKey}`,
      );

      const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;

      const keyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
      if (!keyValue) {
        throw new Error(`Key '${keyName}' not found in ${baseEnvFile}`);
      }

      const envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
        this.DIRECTORY,
        environmentFile,
      );
      const allEnvVariables = this.environmentFileParser.extractEnvironmentVariables(envFileLines);
      const decryptedVariables: Record<string, string | undefined> = {};

      for (const [key, value] of Object.entries(allEnvVariables)) {
        const isEncrypted = this.isEncryptedValue(value);
        const shouldProcess = isEncrypted || (shouldRotateKey && value);

        if (!shouldProcess) continue;

        try {
          if (isEncrypted) {
            const decryptedValue = await CryptoService.decrypt(value, keyName);
            decryptedVariables[key] = decryptedValue;
          } else if (shouldRotateKey) {
            decryptedVariables[key] = value;
          }
        } catch (decryptError) {
          ErrorHandler.captureError(
            decryptError,
            'decryptSingleEnvironmentFile',
            `Failed to decrypt variable '${key}' in file '${environmentFile}'`,
          );
          logger.warn(`Skipping variable '${key}' due to decryption error.`);
        }
      }

      const filteredVariables = Object.fromEntries(
        Object.entries(decryptedVariables).filter((entry): entry is [string, string] => {
          const [_, value] = entry;
          return typeof value === 'string' && value.trim() !== '';
        }),
      );

      if (Object.keys(filteredVariables).length === 0) {
        logger.warn(
          `No decrypted values found for key '${keyName}' in file '${environmentFile}'. Possibly no encrypted variables or all failed decryption.`,
        );
      }

      return filteredVariables;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'decryptSingleEnvironmentFile',
        'Failed to decrypt environment file',
      );
      throw error;
    }
  }

  // New helper method to re-encrypt a single environment file
  private async reEncryptSingleEnvironmentFile(
    environmentFile: string,
    decryptedVariables: Record<string, string>,
    keyName: string,
  ): Promise<number> {
    let totalReEncrypted = 0;

    try {
      if (Object.keys(decryptedVariables).length === 0) {
        logger.warn(`No decrypted data found for file ${environmentFile} - nothing to re-encrypt`);
        return 0;
      }

      // Get the NEW key value using the keyName
      const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
      const newKeyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
      if (!newKeyValue) {
        throw new Error(`Key '${keyName}' not found in ${baseEnvFile} for re-encryption`);
      }

      let envFileLines = await this.environmentFileParser.readEnvironmentFileAsLines(
        this.DIRECTORY,
        environmentFile,
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
            'reEncryptSingleEnvironmentFile',
            `Failed to re-encrypt variable '${key}' in file '${environmentFile}': ${encryptError}`,
          );
          throw encryptError;
        }
      }

      // Write the updated file back only if it was modified
      if (fileModified) {
        const resolvedEnvFilePath =
          this.environmentSecretFileManager.resolveEnvironmentFilePath(environmentFile);
        await this.environmentFileParser.writeEnvironmentFileLines(
          resolvedEnvFilePath,
          envFileLines,
        );
        logger.info(
          `Updated ${Object.keys(decryptedVariables).length} variables in ${resolvedEnvFilePath}`,
        );
      }

      logger.info(`Successfully re-encrypted ${totalReEncrypted} variables in ${environmentFile}`);
      return totalReEncrypted;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'reEncryptSingleEnvironmentFile',
        'Failed to re-encrypt single environment file',
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
