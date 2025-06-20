import { EncryptionManager } from '../manager/encryptionManager';
import { KeyLifecycleManager } from './../manager/keyLifecycleManager';
import { KeyLifecycleService } from './keyLifecycleService';
import {
  ComprehensiveKeyInfo,
  AuditSummary,
  StartupSecurityCheckResult,
  KeyRotationStatus,
  SystemAuditResult,
  SystemHealth,
} from '../types/keyManagement.types';
import { KeyRotationConfigDefaults } from '../constants/keyRotationConfig.constants';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export class CryptoOrchestrator {
  private encryptionManager: EncryptionManager;
  private keyLifecycleManager: KeyLifecycleManager;
  private keyLifecycleService: KeyLifecycleService;

  constructor(
    keyLifecycleManager: KeyLifecycleManager,
    encryptionManager: EncryptionManager,
    keyLifecycleService: KeyLifecycleService,
  ) {
    this.keyLifecycleManager = keyLifecycleManager;
    this.encryptionManager = encryptionManager;
    this.keyLifecycleService = keyLifecycleService;
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

      await this.keyLifecycleManager.storeBaseEnvironmentKey(
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
      await this.keyLifecycleService.rotateKeyWithAudit(
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
        const comprehensiveInfo = await this.keyLifecycleManager.getComprehensiveKeyInfo(keyName);

        // Determine if this single key is expired
        const isExpired = comprehensiveInfo.rotationStatus?.needsRotation || false;

        const auditSummary: AuditSummary = {
          totalKeys: 1, // Single key info
          healthyKeys: comprehensiveInfo.rotationStatus?.needsRotation ? 0 : 1,
          warningKeys: comprehensiveInfo.rotationStatus?.needsWarning ? 1 : 0,
          criticalKeys: comprehensiveInfo.rotationStatus?.needsRotation ? 1 : 0,
          expiredKeys: isExpired ? 1 : 0,
          averageKeyAge: comprehensiveInfo.rotationStatus?.ageInDays || 0,
          oldestKeyAge: comprehensiveInfo.rotationStatus?.ageInDays || 0,
          newestKeyAge: comprehensiveInfo.rotationStatus?.ageInDays || 0,
          totalAuditEvents: comprehensiveInfo.auditSummary?.totalAuditEvents || 0,
          totalRotations: comprehensiveInfo.auditSummary?.totalRotations || 0,
          lastRotation: comprehensiveInfo.auditSummary?.lastRotation,
          lastHealthCheck: comprehensiveInfo.auditSummary?.lastHealthCheck,
          lastAccess: comprehensiveInfo.auditSummary?.lastAccess,
          currentStatus: comprehensiveInfo.auditSummary?.currentStatus as SystemHealth,
        };

        return {
          exists: comprehensiveInfo.exists,
          metadata: comprehensiveInfo.metadata,
          rotationStatus: comprehensiveInfo.rotationStatus,
          auditSummary,
        };
      } else {
        const keyInfo = await this.keyLifecycleManager.getKeyInfo(keyName);

        return {
          exists: keyInfo.exists,
          metadata: keyInfo.metadata,
          rotationStatus: keyInfo.rotationStatus,
          // auditSummary intentionally omitted when includeAudit is false
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
      const auditResult = await this.keyLifecycleManager.performComprehensiveAudit();

      const auditSummary: AuditSummary = {
        totalKeys: auditResult.auditSummary.totalKeys,
        healthyKeys: auditResult.auditSummary.healthyKeys,
        warningKeys: auditResult.auditSummary.warningKeys,
        criticalKeys: auditResult.auditSummary.criticalKeys,
        expiredKeys: auditResult.auditSummary.expiredKeys,
        averageKeyAge: auditResult.auditSummary.averageKeyAge,
        oldestKeyAge: auditResult.auditSummary.oldestKeyAge,
        newestKeyAge: auditResult.auditSummary.newestKeyAge,
        totalAuditEvents: auditResult.auditSummary.totalAuditEvents,
        totalRotations: auditResult.auditSummary.totalRotations,
        lastRotation: auditResult.auditSummary.lastRotation,
        lastHealthCheck: auditResult.auditSummary.lastHealthCheck,
        lastAccess: auditResult.auditSummary.lastAccess,
        currentStatus: auditResult.systemHealth,
      };

      return {
        systemHealth: auditResult.systemHealth,
        keysNeedingRotation: auditResult.keysNeedingRotation,
        keysNeedingWarning: auditResult.keysNeedingWarning,
        auditSummary,
        expiredKeys: auditResult.expiredKeys,
        recommendations: auditResult.recommendations,
      };
    } catch (error) {
      ErrorHandler.captureError(error, 'performSystemAudit', 'Failed to perform system audit');
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
        expiredKeys: auditResult.expiredKeys,
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
      return await this.keyLifecycleManager.checkKeyRotationStatus(keyName, 'api');
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
