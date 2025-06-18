import { EncryptionManager } from '../manager/encryptionManager';
import { KeyRotationManager } from '../manager/keyRotationManager';
import { KeyRotationService } from './keyRotationService';
import {
  ComprehensiveKeyInfo,
  AuditSummary,
  StartupSecurityCheckResult,
  KeyRotationStatus,
  SystemAuditResult,
} from '../types/keyMetadata.types';
import { KeyRotationConfigDefaults } from '../constants/keyRotationConfig.constants';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export class CryptoOrchestrator {
  private encryptionManager: EncryptionManager;
  private keyRotationManager: KeyRotationManager;
  private keyRotationService: KeyRotationService;

  constructor(
    keyRotationManager: KeyRotationManager,
    encryptionManager: EncryptionManager,
    keyRotationService: KeyRotationService,
  ) {
    this.keyRotationManager = keyRotationManager;
    this.encryptionManager = encryptionManager;
    this.keyRotationService = keyRotationService;
  }

  /**
   * Generates a rotatable secret key with optional rotation settings
   */
  public async generateRotatableSecretKey(
    directory: string,
    environmentBaseFilePath: string,
    keyName: string,
    secretKey: string,
    maxAgeInDays?: number,
    shouldRotateKey: boolean = false,
  ): Promise<void> {
    const effectiveMaxAge = maxAgeInDays ?? KeyRotationConfigDefaults.maxAgeInDays;

    if (!secretKey) {
      ErrorHandler.logAndThrow(
        'Failed to generate secret key: Secret key cannot be null or undefined',
        'generateRotatableSecretKey',
      );
    }

    try {
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
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateRotatableSecretKey',
        `Failed to generate rotatable secret key "${keyName}"`,
      );
      throw error;
    }
  }

  /**
   * Encrypts specified environment variables using the provided secret key
   */
  public async encryptEnvironmentVariables(
    directory: string,
    envFilePath: string,
    secretKeyVariable: string,
    envVariables?: string[],
  ): Promise<void> {
    try {
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

  /**
   * Rotates a key and re-encrypts associated environment variables with audit trail
   */
  public async rotateKeyAndReEncryptEnvironmentVariables(
    keyFilePath: string,
    keyName: string,
    newKeyValue: string,
    environmentFile: string,
    reason: 'scheduled' | 'manual' | 'expired' | 'security_breach',
    customMaxAge?: number,
    shouldRotateKey: boolean = false,
  ): Promise<void> {
    try {
      await this.keyRotationService.rotateKeyWithAudit(
        keyFilePath,
        keyName,
        newKeyValue,
        environmentFile,
        reason,
        customMaxAge,
        shouldRotateKey,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'rotateKeyAndReEncryptEnvironmentVariables',
        `Failed to rotate key "${keyName}" and re-encrypt data`,
      );
      throw error;
    }
  }

  /**
   * Gets comprehensive information about a key including metadata, rotation status, and audit data
   * Consolidates individual key information retrieval into a single method
   */
  public async getKeyInformation(
    keyName: string,
    includeAudit: boolean = true,
  ): Promise<ComprehensiveKeyInfo> {
    try {
      if (includeAudit) {
        // Use the actual method from KeyRotationManager
        const comprehensiveInfo = await this.keyRotationManager.getComprehensiveKeyInfo(keyName);

        // Transform the response to match our interface
        const auditSummary: AuditSummary = {
          totalKeys: 1, // Single key info
          healthyKeys: comprehensiveInfo.rotationStatus?.needsRotation ? 0 : 1,
          warningKeys: comprehensiveInfo.rotationStatus?.needsWarning ? 1 : 0,
          criticalKeys: comprehensiveInfo.rotationStatus?.needsRotation ? 1 : 0,
          averageKeyAge: comprehensiveInfo.rotationStatus?.ageInDays || 0,
          oldestKeyAge: comprehensiveInfo.rotationStatus?.ageInDays || 0,
          newestKeyAge: comprehensiveInfo.rotationStatus?.ageInDays || 0,
          totalAuditEvents: comprehensiveInfo.auditSummary?.totalAuditEvents || 0,
          lastRotation: comprehensiveInfo.auditSummary?.lastRotation,
          lastHealthCheck: comprehensiveInfo.auditSummary?.lastHealthCheck,
          lastAccess: comprehensiveInfo.auditSummary?.lastAccess,
          currentStatus: comprehensiveInfo.auditSummary?.currentStatus || 'unknown',
          totalRotations: comprehensiveInfo.auditSummary?.totalRotations || 0,
        };

        return {
          exists: comprehensiveInfo.exists,
          metadata: comprehensiveInfo.metadata,
          rotationStatus: comprehensiveInfo.rotationStatus,
          auditSummary,
        };
      } else {
        // Basic key info without full audit trail for performance
        const keyInfo = await this.keyRotationManager.getKeyInfo(keyName);

        return {
          exists: keyInfo.exists,
          metadata: keyInfo.metadata,
          rotationStatus: keyInfo.rotationStatus,
          // auditSummary is optional in ComprehensiveKeyInfo interface, so we can omit it
        };
      }
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
   * Performs a comprehensive system audit with health assessment
   */
  public async performSystemAudit(): Promise<SystemAuditResult> {
    try {
      const auditResult = await this.keyRotationManager.performComprehensiveAudit();

      // Transform the audit result to match our interface
      const auditSummary: AuditSummary = {
        totalKeys: auditResult.auditSummary.totalKeys,
        healthyKeys: auditResult.auditSummary.healthyKeys,
        warningKeys: auditResult.auditSummary.warningKeys,
        criticalKeys: auditResult.auditSummary.criticalKeys,
        averageKeyAge: auditResult.auditSummary.averageKeyAge,
        oldestKeyAge: auditResult.auditSummary.oldestKeyAge,
        newestKeyAge: auditResult.auditSummary.newestKeyAge,
        totalAuditEvents: 0, // Not provided by KeyRotationManager
        lastRotation: undefined, // Not provided by KeyRotationManager
        lastHealthCheck: undefined, // Not provided by KeyRotationManager
        lastAccess: undefined, // Not provided by KeyRotationManager
        currentStatus: auditResult.systemHealth,
        totalRotations: 0, // Not provided by KeyRotationManager
      };

      return {
        systemHealth: auditResult.systemHealth,
        keysNeedingRotation: auditResult.keysNeedingRotation,
        keysNeedingWarning: auditResult.keysNeedingWarning,
        auditSummary,
        recommendations: auditResult.recommendations,
      };
    } catch (error) {
      ErrorHandler.captureError(error, 'performSystemAudit', 'Failed to perform system audit');
      throw error;
    }
  }

  /**
   * Records key access for audit trail - tracks when and how keys are accessed
   * This is crucial for security monitoring and compliance
   */
  public async recordKeyAccess(
    keyName: string,
    accessSource: string = 'CryptoOrchestrator',
    additionalMetadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      // KeyRotationManager.recordKeyAccess only takes keyName and accessSource
      await this.keyRotationManager.recordKeyAccess(keyName, accessSource);

      // If we need to record additional metadata, we can use recordAuditEvent
      if (additionalMetadata) {
        await this.keyRotationManager.recordAuditEvent(
          keyName,
          'accessed',
          'info',
          accessSource,
          `Key accessed with additional metadata`,
          additionalMetadata,
        );
      }
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'recordKeyAccess',
        `Failed to record key access for "${keyName}"`,
      );
      throw error;
    }
  }

  /**
   * Enhanced startup security check with comprehensive audit
   * Consolidates security validation into a single comprehensive check
   */
  public async performStartupSecurityCheck(): Promise<StartupSecurityCheckResult> {
    try {
      const auditResult = await this.performSystemAudit();

      const passed = auditResult.systemHealth !== 'critical';

      if (!passed) {
        const securityCheckErrorMessage = `STARTUP SECURITY CHECK FAILED: System health is critical! Keys needing rotation: ${auditResult.keysNeedingRotation.join(', ')}`;
        logger.error(securityCheckErrorMessage);
      }

      if (auditResult.keysNeedingWarning.length > 0) {
        const warningMessage = `Some keys should be rotated soon: ${auditResult.keysNeedingWarning.join(', ')}`;
        logger.warn(warningMessage);
      }

      if (passed && auditResult.systemHealth === 'healthy') {
        logger.info('Startup security check passed - all keys are healthy');
      }

      return {
        passed,
        systemHealth: auditResult.systemHealth,
        criticalKeys: auditResult.keysNeedingRotation,
        warningKeys: auditResult.keysNeedingWarning,
        auditSummary: auditResult.auditSummary,
        recommendations: auditResult.recommendations,
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
   * Convenience method to check if a key needs rotation
   */
  public async checkKeyRotationStatus(keyName: string): Promise<KeyRotationStatus> {
    try {
      return await this.keyRotationManager.checkKeyRotationStatus(keyName, 'api');
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'checkKeyRotationStatus',
        `Failed to check rotation status for key "${keyName}"`,
      );
      throw error;
    }
  }
}
