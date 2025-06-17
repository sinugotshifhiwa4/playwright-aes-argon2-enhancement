import { EncryptionManager } from '../manager/encryptionManager';
import { KeyRotationManager } from '../manager/keyRotationManager';
import { KeyRotationService } from './keyRotationService';
import { KeyRotationConfigDefaults } from '../constants/keyRotationConfig.constants';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export class EncryptionCoordinator {
  private encryptionManager: EncryptionManager;
  private keyRotationManager: KeyRotationManager;
  private keyRotationService: KeyRotationService;

  constructor(
    keyRotationmanager: KeyRotationManager,
    encryptionManager: EncryptionManager,
    keyRotationService: KeyRotationService,
  ) {
    this.keyRotationManager = keyRotationmanager;
    this.encryptionManager = encryptionManager;
    this.keyRotationService = keyRotationService;
  }

  public async generateRotatableSecretKey(
    directory: string,
    environmentBaseFilePath: string,
    keyName: string,
    secretKey: string,
    maxAgeInDays?: number,
    shouldRotateKey: boolean = false,
  ): Promise<void> {
    return this.handleKeyGeneration(
      directory,
      environmentBaseFilePath,
      keyName,
      secretKey,
      maxAgeInDays,
      shouldRotateKey,
    );
  }

  private async handleKeyGeneration(
    directory: string,
    environmentBaseFilePath: string,
    keyName: string,
    secretKey: string,
    maxAgeInDays?: number,
    shouldRotateKey: boolean = false,
  ): Promise<void> {
    // Determine the effective rotation period
    const effectiveMaxAge = maxAgeInDays ?? KeyRotationConfigDefaults.maxAgeInDays;

    if (!secretKey) {
      ErrorHandler.logAndThrow(
        'Failed to generate secret key: Secret key cannot be null or undefined',
        'handleKeyGeneration',
      );
    }

    // Resolve the target file path and store the key
    const resolvedPath = await this.encryptionManager.resolveFilePath(
      directory,
      environmentBaseFilePath,
    );

    await this.keyRotationManager.storeBaseEnvironmentKey(
      resolvedPath,
      keyName,
      secretKey,
      effectiveMaxAge,
      shouldRotateKey,
    );
  }

  public async encryptEnvironmentVariables(
    directory: string,
    envFilePath: string,
    secretKeyVariable: string,
    envVariables?: string[],
  ) {
    try {
      // Encrypt environment variables
      await this.encryptionManager.encryptAndUpdateEnvironmentVariables(
        directory,
        envFilePath,
        secretKeyVariable,
        envVariables,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'encryptEnvironmentVariables',
        'Failed to encrypt environment variables',
      );
      throw error;
    }
  }

  // Secret key rotation
  // Additional methods for EncryptionCoordinator class - add these to your existing class

  /**
   * Checks the rotation status of a specific key
   */
  // public async checkKeyRotationStatus(keyName: string): Promise<{
  //   needsRotation: boolean;
  //   needsWarning: boolean;
  //   ageInDays: number;
  //   daysUntilRotation: number;
  // }> {
  //   try {
  //     return await this.keyRotationManager.checkKeyRotationStatus(keyName);
  //   } catch (error) {
  //     ErrorHandler.captureError(
  //       error,
  //       'checkKeyRotationStatus',
  //       `Failed to check rotation status for key "${keyName}"`,
  //     );
  //     throw error;
  //   }
  // }

  /**
   * Rotates a key and re-encrypts data with selective override capability
   */
  public async rotateKeyAndReEncryptData(
    keyFilePath: string, // Path to the file containing the key
    keyName: string,
    newKeyValue: string,
    environmentVariables: string[], // Array of env variables to be encrypted on rotation
    reason: 'scheduled' | 'manual' | 'expired' | 'security_breach',
    customMaxAge?: number,
    shouldRotateKey: boolean = false, // Controls whether to override existing encrypted data
  ) {
    try {
      return await this.keyRotationService.rotateKeyWithAudit(
        keyFilePath,
        keyName,
        newKeyValue,
        environmentVariables,
        reason,
        customMaxAge,
        shouldRotateKey,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'rotateKeyAndReEncryptData',
        `Failed to rotate key "${keyName}" and re-encrypt data`,
      );
      throw error;
    }
  }

  /**
   * Rotates a key for a single environment file with selective override capability
   */
  // public async rotateKeyForSingleEnvironment(
  //   keyFilePath: string, // Path to the file containing the key
  //   keyName: string,
  //   newKeyValue: string,
  //   environmentFilePath: string,
  //   reason: 'scheduled' | 'manual' | 'expired' | 'security_breach' = 'manual',
  //   customMaxAge?: number,
  //   shouldRotateKey: boolean = false // Controls whether to override existing encrypted data
  // ) {
  //   try {
  //     return await this.keyRotationManager.rotateKeyForSingleEnvironment(
  //       keyFilePath,
  //       keyName,
  //       newKeyValue,
  //       environmentFilePath,
  //       reason,
  //       customMaxAge,
  //       shouldRotateKey
  //     );
  //   } catch (error) {
  //     ErrorHandler.captureError(
  //       error,
  //       'rotateKeyForSingleEnvironment',
  //       `Failed to rotate key "${keyName}" for environment: ${environmentFilePath}`,
  //     );
  //     throw error;
  //   }
  // }

  /**
   * Performs a comprehensive rotation audit of all keys
   */
  public async performKeyRotationAudit(): Promise<{
    keysNeedingRotation: string[];
    keysNeedingWarning: string[];
  }> {
    try {
      return await this.keyRotationManager.checkAllKeysForRotation();
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'performKeyRotationAudit',
        'Failed to perform key rotation audit',
      );
      throw error;
    }
  }

  //   public async rotateKey(
  //   directory: string,
  //   environmentBaseFilePath: string,
  //   keyRotationPairs: Array<{
  //     keyName: string;
  //     affectedEnvFiles?: string[];
  //     envVariables?: string[];
  //   }>,
  //   forceReEncryption: boolean = false,
  // ): Promise<Array<{ keyName: string; status: 'success' | 'failed'; error?: string }>> {
  //   try {
  //     return await this.encryptionManager.bulkRotateKeys(
  //       directory,
  //       environmentBaseFilePath,
  //       keyRotationPairs,
  //       forceReEncryption,
  //     );
  //   } catch (error) {
  //     ErrorHandler.captureError(
  //       error,
  //       'bulkRotateKeys',
  //       'Failed to bulk rotate keys',
  //     );
  //     throw error;
  //   }
  // }

  /**
   * Rotates a secret key and re-encrypts affected environment variables
   */
  // public async rotateSecretKey(
  //   directory: string,
  //   environmentBaseFilePath: string,
  //   keyName: string,
  //   affectedEnvFiles?: string[],
  //   envVariables?: string[],
  // ): Promise<void> {
  //   try {
  //     // you create new key you need to decrypt here, soyou can access oldkey

  //     // then you write decrypted values to file again

  //     // Generate new secret key
  //     const newSecretKey = SecureKeyGenerator.generateBase64SecretKey();

  //     if (!newSecretKey) {
  //       ErrorHandler.logAndThrow(
  //         'Failed to generate new secret key during rotation',
  //         'rotateSecretKey',
  //       );
  //     }

  //     // Resolve the base file path
  //     const resolvedBaseEnvironmentFilePath = await this.encryptionManager.resolveFilePath(
  //       directory,
  //       environmentBaseFilePath,
  //     );

  //     // Rotate the key in the base environment file
  //     await this.secretKeyManager.rotateKey(resolvedBaseEnvironmentFilePath, keyName, newSecretKey);

  //     // Re-encrypt affected environment files with the new key
  //     if (affectedEnvFiles?.length) {
  //       for (const envFile of affectedEnvFiles) {
  //         await this.orchestrateEnvironmentEncryption(directory, envFile, keyName, envVariables);
  //       }
  //     }

  //     logger.info(`Key "${keyName}" rotated successfully and environment variables re-encrypted`);
  //   } catch (error) {
  //     ErrorHandler.captureError(
  //       error,
  //       'rotateSecretKey',
  //       `Failed to rotate secret key "${keyName}"`,
  //     );
  //     throw error;
  //   }
  // }

  /**
   * Rotates multiple keys in bulk
   */
  // public async bulkRotateKeys(
  //   directory: string,
  //   environmentBaseFilePath: string,
  //   keyRotationPairs: Array<{
  //     keyName: string;
  //     affectedEnvFiles?: string[];
  //     envVariables?: string[];
  //   }>,
  // ): Promise<Array<{ keyName: string; status: 'success' | 'failed'; error?: string }>> {
  //   const results: Array<{ keyName: string; status: 'success' | 'failed'; error?: string }> = [];

  //   for (const { keyName, affectedEnvFiles, envVariables } of keyRotationPairs) {
  //     try {
  //       await this.rotateSecretKey(
  //         directory,
  //         environmentBaseFilePath,
  //         keyName,
  //         affectedEnvFiles,
  //         envVariables,
  //       );
  //       results.push({ keyName, status: 'success' });
  //     } catch (error) {
  //       const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  //       results.push({ keyName, status: 'failed', error: errorMessage });
  //     }
  //   }

  //   return results;
  // }

  /**
   * Gets detailed information about a key including rotation status
   */
  public async getKeyInformation(keyName: string): Promise<{
    exists: boolean;
    metadata?: unknown;
    rotationStatus?: {
      needsRotation: boolean;
      needsWarning: boolean;
      ageInDays: number;
      daysUntilRotation: number;
    };
  }> {
    try {
      return await this.keyRotationManager.getKeyInfo(keyName);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'getKeyInformation',
        `Failed to get information for key "${keyName}"`,
      );
      throw error;
    }
  }

  /**
   * Performs startup security check - validates key health on application startup
   */
  public async performStartupSecurityCheck(): Promise<{
    passed: boolean;
    criticalKeys: string[];
    warningKeys: string[];
  }> {
    try {
      const results = await this.performKeyRotationAudit();

      const passed = results.keysNeedingRotation.length === 0;

      if (!passed) {
        const securityCheckErrorMessage = `STARTUP SECURITY CHECK FAILED: Critical keys need rotation!: ${results.keysNeedingRotation.join(', ')}`;
        ErrorHandler.logAndThrow(
          securityCheckErrorMessage,
          'EncryptionCoordinator.performStartupSecurityCheck',
        );
      }

      if (results.keysNeedingWarning.length > 0) {
        const warningMessage = `Some keys should be rotated soon: ${results.keysNeedingWarning.join(', ')}`;
        ErrorHandler.logAndThrow(
          warningMessage,
          'EncryptionCoordinator.performStartupSecurityCheck',
        );
      }

      if (passed && results.keysNeedingWarning.length === 0) {
        logger.info('Startup security check passed - all keys are healthy');
      }

      return {
        passed,
        criticalKeys: results.keysNeedingRotation,
        warningKeys: results.keysNeedingWarning,
      };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'performStartupSecurityCheck',
        'Failed to perform startup security check',
      );
      throw error;
    }
  }

  /**
   * Schedules and performs automated key rotation checks
   */
  // public async performScheduledRotationCheck(autoRotateConfig?: {
  //   enableAutoRotation: boolean;
  //   directory: string;
  //   environmentBaseFilePath: string;
  //   keyRotationMap: Record<string, { affectedEnvFiles?: string[]; envVariables?: string[] }>;
  // }): Promise<{
  //   checkedKeys: number;
  //   rotatedKeys: string[];
  //   warningKeys: string[];
  //   failedRotations: Array<{ keyName: string; error: string }>;
  // }> {
  //   try {
  //     logger.info('🔄 Running scheduled key rotation check...');

  //     const results = await this.performKeyRotationAudit();
  //     const rotatedKeys: string[] = [];
  //     const failedRotations: Array<{ keyName: string; error: string }> = [];

  //     // Handle critical rotations
  //     if (autoRotateConfig?.enableAutoRotation && results.keysNeedingRotation.length > 0) {
  //       logger.info(`🔄 Auto-rotating ${results.keysNeedingRotation.length} critical keys`);

  //       for (const keyName of results.keysNeedingRotation) {
  //         try {
  //           const keyConfig = autoRotateConfig.keyRotationMap[keyName];

  //           await this.rotateSecretKey(
  //             autoRotateConfig.directory,
  //             autoRotateConfig.environmentBaseFilePath,
  //             keyName,
  //             keyConfig?.affectedEnvFiles,
  //             keyConfig?.envVariables,
  //           );

  //           rotatedKeys.push(keyName);
  //           logger.info(`✅ Auto-rotated key: ${keyName}`);
  //         } catch (error) {
  //           const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  //           failedRotations.push({ keyName, error: errorMessage });
  //           logger.error(`❌ Failed to auto-rotate key: ${keyName} - ${errorMessage}`);
  //         }
  //       }
  //     } else if (results.keysNeedingRotation.length > 0) {
  //       // Log critical alerts if auto-rotation is disabled
  //       for (const keyName of results.keysNeedingRotation) {
  //         logger.error(`🚨 CRITICAL: Key "${keyName}" requires immediate manual rotation!`);
  //       }
  //     }

  //     // Log warnings for keys approaching rotation
  //     for (const keyName of results.keysNeedingWarning) {
  //       logger.warn(`⚠️ WARNING: Key "${keyName}" should be rotated soon`);
  //     }

  //     const totalChecked = Object.keys(
  //       (await this.secretKeyManager.readKeyMetadata?.()) || {},
  //     ).length;

  //     logger.info(
  //       `✅ Scheduled rotation check completed. Checked: ${totalChecked}, Rotated: ${rotatedKeys.length}, Warnings: ${results.keysNeedingWarning.length}`,
  //     );

  //     return {
  //       checkedKeys: totalChecked,
  //       rotatedKeys,
  //       warningKeys: results.keysNeedingWarning,
  //       failedRotations,
  //     };
  //   } catch (error) {
  //     ErrorHandler.captureError(
  //       error,
  //       'performScheduledRotationCheck',
  //       'Failed to perform scheduled rotation check',
  //     );
  //     throw error;
  //   }
  // }

  /**
   * Enhanced key generation with custom rotation settings
   */
}
