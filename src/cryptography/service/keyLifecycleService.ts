import { KeyLifecycleManager } from '../manager/keyLifecycleManager';
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
} from '../types/keyManagement.types';
import { EnvironmentConstants } from '../../config/environment/dotenv/constants';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export class KeyLifecycleService {
  private environmentSecretFileManager: EnvironmentSecretFileManager;
  private keyMetadataRepository: KeyMetadataRepository;
  private environmentFileParser: EnvironmentFileParser;
  private keyLifecycleManager: KeyLifecycleManager;

  private readonly DIRECTORY = EnvironmentConstants.ENV_DIR;
  private decryptedDataCache: Map<string, Record<string, string>> = new Map();

  constructor(
    environmentSecretFileManager: EnvironmentSecretFileManager,
    keyMetadataRepository: KeyMetadataRepository,
    environmentFileParser: EnvironmentFileParser,
    keyLifecycleManager: KeyLifecycleManager,
  ) {
    this.environmentSecretFileManager = environmentSecretFileManager;
    this.keyMetadataRepository = keyMetadataRepository;
    this.environmentFileParser = environmentFileParser;
    this.keyLifecycleManager = keyLifecycleManager;
  }

  public async rotateKeyWithAudit(
    keyFilePath: string,
    keyName: string,
    newKeyValue: string,
    environmentFile: string,
    reason: RotationEvent['reason'],
    customMaxAge?: number,
    shouldRotateKey: boolean = false,
  ): Promise<RotationResult> {
    const startTime = new Date();
    let rotationResult: RotationResult = {
      success: false,
      reEncryptedCount: 0,
      affectedFiles: [environmentFile],
    };
    let decryptedData: Record<string, string> = {};
    let processedVariableNames: string[] = [];

    try {
      logger.info(
        `Starting key rotation for: ${keyName}, environment: ${environmentFile}, reason: ${reason}, shouldRotateKey: ${shouldRotateKey}`,
      );

      // Step 1-2: Validate key and rotation config
      const keyInfo = await this.validateAndGetKeyInfo(keyName);
      this.validateRotationConfigWithRepair(keyName, keyInfo.metadata.rotationConfig);

      // Step 3: Record audit event for rotation start
      await this.recordRotationStartAudit(
        keyName,
        environmentFile,
        reason,
        customMaxAge,
        shouldRotateKey,
      );

      // Step 4: Get and validate old key value
      await this.getAndValidateOldKey(keyFilePath, keyName);

      // Step 5: Decrypt environment variables with OLD key
      logger.info(
        `Decrypting environment variables in ${environmentFile} with current key: ${keyName}`,
      );
      decryptedData = await this.decryptEnvironmentVariables(
        keyName,
        environmentFile,
        shouldRotateKey,
      );
      processedVariableNames = Object.keys(decryptedData).filter(
        (key) => decryptedData[key] !== undefined && decryptedData[key] !== null,
      );

      // Step 6-7: Update and verify key
      await this.updateAndVerifyKey(keyFilePath, keyName, newKeyValue);

      // Step 8: Re-encrypt data with new key
      logger.info(
        `Re-encrypting environment variables in ${environmentFile} with new key: ${keyName}`,
      );
      const reEncryptedCount = await this.reEncryptEnvironmentVariables(
        environmentFile,
        decryptedData,
        keyName,
      );

      rotationResult = {
        success: true,
        reEncryptedCount,
        affectedFiles: [environmentFile],
      };

      // Step 9: Update metadata with comprehensive tracking
      const validatedConfig = this.createValidatedRotationConfig(customMaxAge);
      const updatedMetadata = await this.updateKeyMetadataAfterRotation(
        keyName,
        keyInfo.metadata,
        environmentFile,
        decryptedData,
        validatedConfig,
      );

      // Step 10-11: Record post-rotation activities
      await this.recordPostRotationActivities(
        keyName,
        updatedMetadata,
        reason,
        rotationResult,
        environmentFile,
      );

      // Step 12-13: Record comprehensive success audit
      await this.recordSuccessAudit(
        keyName,
        keyFilePath,
        reason,
        startTime,
        newKeyValue,
        rotationResult,
        environmentFile,
        shouldRotateKey,
        processedVariableNames,
        updatedMetadata,
        validatedConfig,
      );

      // Step 14: Perform post-rotation health check and logging
      await this.performPostRotationHealthCheck(
        keyName,
        environmentFile,
        rotationResult,
        processedVariableNames,
        updatedMetadata,
        shouldRotateKey,
      );

      return rotationResult;
    } catch (error) {
      await this.handleRotationFailure(
        error,
        keyName,
        reason,
        rotationResult,
        environmentFile,
        keyFilePath,
        startTime,
        newKeyValue,
        shouldRotateKey,
        processedVariableNames,
      );
      throw error;
    } finally {
      // Step 15: Cleanup and final logging
      await this.performCleanupAndFinalAudit(
        keyName,
        environmentFile,
        rotationResult,
        processedVariableNames,
        startTime,
        reason,
      );
    }
  }

  /**
   * Validates key existence and gets comprehensive info
   */
  private async validateAndGetKeyInfo(keyName: string): Promise<{
    exists: boolean;
    metadata: KeyMetadata;
  }> {
    const keyInfo = await this.keyLifecycleManager.getComprehensiveKeyInfo(keyName);
    if (!keyInfo.exists || !keyInfo.metadata) {
      throw new Error(`Key '${keyName}' not found in metadata`);
    }
    return {
      exists: keyInfo.exists,
      metadata: keyInfo.metadata,
    };
  }

  /**
   * Validates rotation config and repairs if needed
   */
  private validateRotationConfigWithRepair(
    keyName: string,
    rotationConfig: KeyRotationConfig,
  ): void {
    try {
      this.keyLifecycleManager.validateRotationConfig(rotationConfig);
    } catch (error) {
      const errorAsError = error as Error;
      logger.warn(
        `Invalid rotation config for key "${keyName}", will repair: ${errorAsError.message}`,
      );
    }
  }

  /**
   * Records audit event for rotation start
   */
  private async recordRotationStartAudit(
    keyName: string,
    environmentFile: string,
    reason: RotationEvent['reason'],
    customMaxAge?: number,
    shouldRotateKey?: boolean,
  ): Promise<void> {
    await this.keyLifecycleManager.recordAuditEvent(
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
  }

  /**
   * Gets and validates old key value
   */
  private async getAndValidateOldKey(keyFilePath: string, keyName: string): Promise<string> {
    const oldKeyValue = await this.environmentSecretFileManager.getKeyValue(keyFilePath, keyName);
    if (!oldKeyValue) {
      throw new Error(`Key '${keyName}' not found in ${keyFilePath}`);
    }
    return oldKeyValue;
  }

  /**
   * Performs key update and verification
   */
  private async updateAndVerifyKey(
    keyFilePath: string,
    keyName: string,
    newKeyValue: string,
  ): Promise<void> {
    logger.info(`Updating key '${keyName}' with new value`);
    await this.environmentSecretFileManager.updateKeyValue(keyFilePath, keyName, newKeyValue);

    const updatedKeyValue = await this.environmentSecretFileManager.getKeyValue(
      keyFilePath,
      keyName,
    );
    if (updatedKeyValue !== newKeyValue) {
      throw new Error(`Failed to update key '${keyName}' - key value unchanged`);
    }
  }

  /**
   * Creates validated rotation config
   */
  private createValidatedRotationConfig(customMaxAge?: number): KeyRotationConfig {
    const rotationConfig: KeyRotationConfig = {
      maxAgeInDays: customMaxAge || this.keyLifecycleManager.keyRotationConfig.maxAgeInDays,
      warningThresholdInDays: this.keyLifecycleManager.keyRotationConfig.warningThresholdInDays,
    };

    return this.keyLifecycleManager.validateRotationConfig(rotationConfig);
  }

  /**
   * Updates key metadata after successful rotation
   */
  private async updateKeyMetadataAfterRotation(
    keyName: string,
    existingMetadata: KeyMetadata,
    environmentFile: string,
    decryptedData: Record<string, string>,
    validatedConfig: KeyRotationConfig,
  ): Promise<KeyMetadata> {
    const singleFileMap = new Map<string, Record<string, string>>();
    if (Object.keys(decryptedData).length > 0) {
      singleFileMap.set(environmentFile, decryptedData);
    }

    const updatedUsageTracking = this.keyLifecycleManager.updateUsageTracking(
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

    await this.keyMetadataRepository.updateSingleKeyMetadata(keyName, updatedMetadata);
    return updatedMetadata;
  }

  /**
   * Records post-rotation activities (access, health check, audit)
   */
  private async recordPostRotationActivities(
    keyName: string,
    updatedMetadata: KeyMetadata,
    reason: RotationEvent['reason'],
    rotationResult: RotationResult,
    environmentFile: string,
  ): Promise<void> {
    await this.keyLifecycleManager.recordKeyAccess(keyName, 'rotation-service');

    await this.keyLifecycleManager.addHealthCheckEntry(keyName, updatedMetadata, true, reason, {
      success: true,
      reEncryptedCount: rotationResult.reEncryptedCount,
      affectedFiles: [environmentFile],
    });
  }

  /**
   * Records comprehensive success audit
   */
  private async recordSuccessAudit(
    keyName: string,
    keyFilePath: string,
    reason: RotationEvent['reason'],
    startTime: Date,
    newKeyValue: string,
    rotationResult: RotationResult,
    environmentFile: string,
    shouldRotateKey: boolean,
    processedVariableNames: string[],
    updatedMetadata: KeyMetadata,
    validatedConfig: KeyRotationConfig,
  ): Promise<void> {
    await this.keyLifecycleManager.updateAuditTrail(
      keyName,
      keyFilePath,
      reason,
      startTime,
      newKeyValue,
      {
        success: true,
        reEncryptedCount: rotationResult.reEncryptedCount,
        affectedFiles: [environmentFile],
      },
      shouldRotateKey,
      true,
      undefined,
      processedVariableNames,
    );

    await this.keyLifecycleManager.recordAuditEvent(
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
        processedVariables: processedVariableNames,
      },
    );
  }

  /**
   * Performs post-rotation health check and logging
   */
  private async performPostRotationHealthCheck(
    keyName: string,
    environmentFile: string,
    rotationResult: RotationResult,
    processedVariableNames: string[],
    updatedMetadata: KeyMetadata,
    shouldRotateKey: boolean,
  ): Promise<void> {
    logger.info(
      `Key "${keyName}" rotated successfully for environment ${environmentFile}. Re-encrypted ${rotationResult.reEncryptedCount} variables: ${processedVariableNames.join(', ')}. Rotation count: ${updatedMetadata.rotationCount}. Override mode: ${shouldRotateKey}`,
    );

    const postRotationHealth = await this.keyLifecycleManager.checkKeyRotationStatus(
      keyName,
      'manual',
    );
    logger.info(
      `Post-rotation health check for "${keyName}": Age ${postRotationHealth.ageInDays} days, Status: ${postRotationHealth.needsRotation ? 'Critical' : postRotationHealth.needsWarning ? 'Warning' : 'Healthy'}`,
    );
  }

  /**
   * Handles rotation failure with comprehensive error recording
   */
  private async handleRotationFailure(
    error: unknown,
    keyName: string,
    reason: RotationEvent['reason'],
    rotationResult: RotationResult,
    environmentFile: string,
    keyFilePath: string,
    startTime: Date,
    newKeyValue: string,
    shouldRotateKey: boolean,
    processedVariableNames: string[],
  ): Promise<void> {
    const errorAsError = error instanceof Error ? error : new Error('Unknown error');
    rotationResult.success = false;

    let currentMetadata: KeyMetadata | undefined;
    try {
      const keyInfo = await this.keyLifecycleManager.getKeyInfo(keyName);
      currentMetadata = keyInfo.metadata;
    } catch (metadataError) {
      logger.warn(`Could not retrieve metadata for failed rotation health check: ${metadataError}`);
    }

    if (currentMetadata) {
      await this.keyLifecycleManager.addHealthCheckEntry(keyName, currentMetadata, false, reason, {
        success: false,
        reEncryptedCount: rotationResult.reEncryptedCount,
        affectedFiles: [environmentFile],
      });
    }

    await this.keyLifecycleManager.recordAuditEvent(
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
        processedVariables: processedVariableNames,
      },
    );

    await this.keyLifecycleManager.updateAuditTrail(
      keyName,
      keyFilePath,
      reason,
      startTime,
      newKeyValue,
      {
        success: false,
        reEncryptedCount: rotationResult.reEncryptedCount,
        affectedFiles: [environmentFile],
      },
      shouldRotateKey,
      false,
      errorAsError,
      processedVariableNames,
    );

    logger.error(
      `Key rotation failed for "${keyName}" in environment ${environmentFile}: ${errorAsError.message}`,
    );
  }

  /**
   * Performs cleanup and final system audit if needed
   */
  private async performCleanupAndFinalAudit(
    keyName: string,
    environmentFile: string,
    rotationResult: RotationResult,
    processedVariableNames: string[],
    startTime: Date,
    reason: RotationEvent['reason'],
  ): Promise<void> {
    try {
      this.decryptedDataCache.clear();

      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();

      logger.info(
        `Key rotation process completed for "${keyName}" in environment ${environmentFile} in ${durationMs}ms. ` +
          `Success: ${rotationResult.success}, ` +
          `Re-encrypted: ${rotationResult.reEncryptedCount} variables (${processedVariableNames.join(', ')})`,
      );

      if (reason === 'expired' || reason === 'compromised') {
        logger.info('Triggering system-wide audit due to critical rotation');
        try {
          const auditResult = await this.keyLifecycleManager.performComprehensiveAudit();
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

  // Main method - now focused on orchestration
  private async decryptEnvironmentVariables(
    keyName: string,
    environmentFile: string,
    shouldRotateKey: boolean = false,
  ): Promise<Record<string, string>> {
    try {
      logger.info(
        `Starting decryption for key: ${keyName} in file: ${environmentFile}, shouldRotateKey: ${shouldRotateKey}`,
      );

      const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
      await this.validateDecryptionKey(keyName, baseEnvFile);

      const envFileLines = await this.loadEnvironmentFile(environmentFile, this.DIRECTORY);
      const allEnvVariables = this.extractEnvironmentVariables(envFileLines);
      const decryptedVariables = await this.processVariablesForDecryption(
        allEnvVariables,
        keyName,
        shouldRotateKey,
        environmentFile,
      );

      const filteredVariables = this.filterValidDecryptedVariables(decryptedVariables);
      this.validateDecryptionResults(filteredVariables, keyName, environmentFile);

      return filteredVariables;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'decryptEnvironmentVariables',
        'Failed to decrypt environment variables',
      );
      throw error;
    }
  }

  // Reusable key validation for decryption
  private async validateDecryptionKey(keyName: string, baseEnvFile: string): Promise<void> {
    const keyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);
    if (!keyValue) {
      ErrorHandler.logAndThrow(
        `Key '${keyName}' not found in ${baseEnvFile} for decryption`,
        'validateDecryptionKey',
      );
    }
  }

  // Reusable environment variables extraction
  private extractEnvironmentVariables(envFileLines: string[]): Record<string, string> {
    return this.environmentFileParser.extractEnvironmentVariables(envFileLines);
  }

  // Reusable variables processing for decryption
  private async processVariablesForDecryption(
    allEnvVariables: Record<string, string>,
    keyName: string,
    shouldRotateKey: boolean,
    environmentFile: string,
  ): Promise<Record<string, string | undefined>> {
    const decryptedVariables: Record<string, string | undefined> = {};

    for (const [key, value] of Object.entries(allEnvVariables)) {
      const processedValue = await this.processVariableForDecryption(
        key,
        value,
        keyName,
        shouldRotateKey,
        environmentFile,
      );

      if (processedValue !== undefined) {
        decryptedVariables[key] = processedValue;
      }
    }

    return decryptedVariables;
  }

  // Reusable single variable processing
  private async processVariableForDecryption(
    key: string,
    value: string,
    keyName: string,
    shouldRotateKey: boolean,
    environmentFile: string,
  ): Promise<string | undefined> {
    const isEncrypted = this.isEncryptedValue(value);
    const shouldProcess = isEncrypted || (shouldRotateKey && value);

    if (!shouldProcess) return undefined;

    try {
      if (isEncrypted) {
        return await CryptoService.decrypt(value, keyName);
      } else if (shouldRotateKey) {
        return value;
      }
    } catch (decryptError) {
      ErrorHandler.captureError(
        decryptError,
        'processVariableForDecryption',
        `Failed to decrypt variable '${key}' in file '${environmentFile}'`,
      );
      logger.warn(`Skipping variable '${key}' due to decryption error.`);
    }

    return undefined;
  }

  // Reusable filtering of valid decrypted variables
  private filterValidDecryptedVariables(
    decryptedVariables: Record<string, string | undefined>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(decryptedVariables).filter((entry): entry is [string, string] => {
        const [_, value] = entry;
        return typeof value === 'string' && value.trim() !== '';
      }),
    );
  }

  // Reusable validation of decryption results
  private validateDecryptionResults(
    filteredVariables: Record<string, string>,
    keyName: string,
    environmentFile: string,
  ): void {
    if (Object.keys(filteredVariables).length === 0) {
      logger.warn(
        `No decrypted values found for key '${keyName}' in file '${environmentFile}'. Possibly no encrypted variables or all failed decryption.`,
      );
    }
  }

  private async reEncryptEnvironmentVariables(
    environmentFile: string,
    decryptedVariables: Record<string, string>,
    keyName: string,
  ): Promise<number> {
    try {
      if (!this.validateReEncryptionInput(environmentFile, decryptedVariables)) {
        return 0;
      }

      const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;
      await this.validateEncryptionKey(keyName, baseEnvFile);
      const envFileLines = await this.loadEnvironmentFile(environmentFile, this.DIRECTORY);
      const updatedLines = await this.reEncryptVariables(envFileLines, decryptedVariables, keyName);

      await this.saveUpdatedEnvironmentFile(environmentFile, updatedLines);

      const totalReEncrypted = Object.keys(decryptedVariables).length;
      logger.info(`Successfully re-encrypted ${totalReEncrypted} variables in ${environmentFile}`);
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

  private validateReEncryptionInput(
    environmentFile: string,
    decryptedVariables: Record<string, string>,
  ): boolean {
    if (Object.keys(decryptedVariables).length === 0) {
      logger.warn(`No decrypted data found for file ${environmentFile} - nothing to re-encrypt`);
      return false;
    }
    return true;
  }

  // Reusable key validation component - baseEnvFile as parameter
  private async validateEncryptionKey(keyName: string, baseEnvFile: string): Promise<void> {
    const keyValue = await this.environmentSecretFileManager.getKeyValue(baseEnvFile, keyName);

    if (!keyValue) {
      ErrorHandler.logAndThrow(
        `Key '${keyName}' not found in ${baseEnvFile} for re-encryption`,
        'validateEncryptionKey',
      );
    }
  }

  // Reusable file loading component - directory as parameter
  private async loadEnvironmentFile(environmentFile: string, directory: string): Promise<string[]> {
    return await this.environmentFileParser.readEnvironmentFileAsLines(directory, environmentFile);
  }

  // Reusable encryption component - no hardcoded values
  private async reEncryptVariables(
    envFileLines: string[],
    decryptedVariables: Record<string, string>,
    keyName: string,
  ): Promise<string[]> {
    let updatedLines = [...envFileLines];

    for (const [key, decryptedValue] of Object.entries(decryptedVariables)) {
      updatedLines = await this.reEncryptSingleVariable(updatedLines, key, decryptedValue, keyName);
    }

    return updatedLines;
  }

  // Reusable single variable encryption component - no hardcoded values
  private async reEncryptSingleVariable(
    envFileLines: string[],
    variableKey: string,
    decryptedValue: string,
    keyName: string,
  ): Promise<string[]> {
    try {
      const newEncryptedValue = await CryptoService.encrypt(decryptedValue, keyName);
      return this.environmentFileParser.updateEnvironmentFileLines(
        envFileLines,
        variableKey,
        newEncryptedValue,
      );
    } catch (encryptError) {
      ErrorHandler.captureError(
        encryptError,
        'reEncryptSingleVariable',
        `Failed to re-encrypt variable '${variableKey}': ${encryptError}`,
      );
      throw encryptError;
    }
  }

  // Reusable file saving component - no hardcoded path resolution
  private async saveUpdatedEnvironmentFile(
    environmentFile: string,
    envFileLines: string[],
  ): Promise<void> {
    const resolvedEnvFilePath =
      this.environmentSecretFileManager.resolveEnvironmentFilePath(environmentFile);
    await this.environmentFileParser.writeEnvironmentFileLines(resolvedEnvFilePath, envFileLines);
    logger.info(`Updated environment file: ${resolvedEnvFilePath}`);
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
