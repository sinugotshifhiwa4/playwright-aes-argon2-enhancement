import { KeyRotationConfigDefaults } from '../constants/keyRotationConfig.constants';
import { EnvironmentSecretFileManager } from '../../cryptography/manager/environmentSecretFileManager';
import { KeyMetadataRepository } from '../../cryptography/key/keyMetadataRepository';
import {
  KeyMetadata,
  KeyRotationConfig,
  UsageTracking,
  AuditTrail,
  StatusTracking,
  HealthCheckEvent,
  MultiRotationResult,
  RotationEvent,
  AuditEvent,
} from '../types/keyMetadata.types';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export class KeyRotationManager {
  public readonly keyRotationConfig: KeyRotationConfig;
  private environmentSecretFileManager: EnvironmentSecretFileManager;
  private metadataRepo: KeyMetadataRepository;

  constructor(
    environmentSecretFileManager: EnvironmentSecretFileManager,
    metadataRepo: KeyMetadataRepository,
    rotationConfig?: Partial<KeyRotationConfig>,
  ) {
    this.keyRotationConfig = {
      maxAgeInDays: rotationConfig?.maxAgeInDays ?? KeyRotationConfigDefaults.maxAgeInDays,
      warningThresholdInDays:
        rotationConfig?.warningThresholdInDays ?? KeyRotationConfigDefaults.warningThresholdInDays,
      enableAutoRotation:
        rotationConfig?.enableAutoRotation ?? KeyRotationConfigDefaults.enableAutoRotation,
    };
    this.environmentSecretFileManager = environmentSecretFileManager;
    this.metadataRepo = metadataRepo;
  }

  /**
   * Checks all keys for rotation requirements with audit trail
   */
  public async checkAllKeysForRotation(): Promise<{
    keysNeedingRotation: string[];
    keysNeedingWarning: string[];
  }> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      const keysNeedingRotation: string[] = [];
      const keysNeedingWarning: string[] = [];

      for (const keyName of Object.keys(metadata)) {
        const status = await this.checkKeyRotationStatus(keyName, 'scheduled');

        if (status.needsRotation) {
          keysNeedingRotation.push(keyName);
          logger.error(
            `SECURITY ALERT: Key "${keyName}" is ${status.ageInDays} days old and MUST be rotated immediately!`,
          );

          if (this.keyRotationConfig.enableAutoRotation) {
            logger.info(`Auto-rotation is enabled. Scheduling rotation for key "${keyName}"`);
          }
        } else if (status.needsWarning) {
          keysNeedingWarning.push(keyName);
          logger.warn(
            `Key "${keyName}" will expire in ${status.daysUntilRotation} days (current age: ${status.ageInDays} days). Consider rotating soon.`,
          );
        }
      }

      return { keysNeedingRotation, keysNeedingWarning };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'checkAllKeysForRotation',
        'Failed to check keys for rotation',
      );
      throw error;
    }
  }

    /**
     * Update audit trail with rotation result
     */
    public async updateAuditTrail(
      keyName: string,
      keyFilePath: string,
      reason: RotationEvent['reason'],
      startTime: Date,
      newKeyValue: string,
      rotationResult: MultiRotationResult,
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
          const currentKeyValue = await this.environmentSecretFileManager.getKeyValue(
            keyFilePath,
            keyName,
          );
          oldKeyHash = currentKeyValue ? this.hashKey(currentKeyValue) : undefined;
        }
        const newKeyHash = this.hashKey(newKeyValue);
  
        // Initialize audit trail structure if needed
        if (!metadata[keyName].auditTrail) {
          metadata[keyName].auditTrail = this.createEmptyAuditTrail();
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
  
          await this.recordAuditEvent(
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
        ErrorHandler.captureError(
          auditError,
          'updateAuditTrail',
          `Failed to update audit trail for key: ${keyName}`,
        );
      }
    }

  /**
   * Gets detailed information about a key including rotation status
   */
  public async getKeyInfo(keyName: string): Promise<{
    exists: boolean;
    metadata?: KeyMetadata;
    rotationStatus?: {
      needsRotation: boolean;
      needsWarning: boolean;
      ageInDays: number;
      daysUntilRotation: number;
    };
  }> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      const keyMetadata = metadata[keyName];

      if (!keyMetadata) {
        return { exists: false };
      }

      // VALIDATE ROTATION CONFIG HERE
      try {
        this.validateRotationConfig(keyMetadata.rotationConfig);
      } catch (error) {
        const errorAsError = error as Error;
        logger.warn(`Invalid rotation config for key "${keyName}": ${errorAsError.message}`);
        // Could trigger a metadata repair here if needed
      }

      const rotationStatus = await this.checkKeyRotationStatus(keyName, 'api');

      return {
        exists: true,
        metadata: keyMetadata,
        rotationStatus,
      };
    } catch (error) {
      ErrorHandler.captureError(error, 'getKeyInfo', `Failed to get info for key "${keyName}"`);
      throw error;
    }
  }

  /**
   * Consolidated store method with audit trail (replaces both versions)
   */
  public async storeBaseEnvironmentKey(
    filePath: string,
    keyName: string,
    keyValue: string,
    customMaxAge?: number,
    shouldRotateKey: boolean = false,
    environmentsUsedIn: string[] = [],
    dependentVariables: string[] = [],
  ): Promise<void> {
    try {
      let fileContent =
        await this.environmentSecretFileManager.getOrCreateBaseEnvFileContent(filePath);
      const keyRegex = new RegExp(`^${keyName}=.*`, 'm');
      const keyExists = keyRegex.test(fileContent);

      if (keyExists && !shouldRotateKey) {
        logger.info(
          `The environment variable "${keyName}" already exists. Delete it or set shouldRotateKey=true to regenerate.`,
        );
        return;
      }

      const effectiveMaxAge = customMaxAge || this.keyRotationConfig.maxAgeInDays;
      const rotationInfo = customMaxAge
        ? `with custom rotation (${effectiveMaxAge} days)`
        : `with default rotation (${effectiveMaxAge} days)`;

      if (keyExists && shouldRotateKey) {
        fileContent = fileContent.replace(keyRegex, `${keyName}=${keyValue}`);
        logger.info(`Environment variable "${keyName}" has been rotated (overwritten).`);
      } else {
        if (fileContent && !fileContent.endsWith('\n')) {
          fileContent += '\n';
        }
        fileContent += `${keyName}=${keyValue}`;
        logger.info(`Secret key "${keyName}" generated and stored ${rotationInfo}`);
      }

      await this.environmentSecretFileManager.writeSecretKeyVariableToBaseEnvFile(
        filePath,
        fileContent,
        keyName,
      );

      const metadata = await this.metadataRepo.readKeyMetadata();

      // Create the rotation config object
      const rotationConfig: KeyRotationConfig = {
        maxAgeInDays: customMaxAge || this.keyRotationConfig.maxAgeInDays,
        warningThresholdInDays: this.keyRotationConfig.warningThresholdInDays,
        enableAutoRotation: this.keyRotationConfig.enableAutoRotation,
      };

      // VALIDATE THE CONFIG BEFORE STORING
      const validatedConfig = this.validateRotationConfig(rotationConfig);

      // Create comprehensive metadata with all tracking
      metadata[keyName] = {
        keyName,
        createdAt: new Date(),
        rotationCount:
          keyExists && shouldRotateKey ? (metadata[keyName]?.rotationCount ?? 0) + 1 : 0,
        lastRotatedAt: shouldRotateKey ? new Date() : undefined,
        rotationConfig: validatedConfig,
        auditTrail: this.createEmptyAuditTrail(),
        usageTracking: {
          environmentsUsedIn,
          dependentVariables,
        },
        statusTracking: {
          currentStatus: 'healthy',
          lastStatusChange: new Date(),
          autoRotationEnabled: this.keyRotationConfig.enableAutoRotation,
        },
      };

      await this.metadataRepo.writeKeyMetadata(metadata);

      // Record audit event
      await this.recordAuditEvent(
        keyName,
        shouldRotateKey ? 'rotated' : 'created',
        'info',
        'storeBaseEnvironmentKey',
        `Secret key ${shouldRotateKey ? 'rotated' : 'created'} with ${effectiveMaxAge}-day rotation period`,
        {
          initialMaxAge: effectiveMaxAge,
          autoRotationEnabled: this.keyRotationConfig.enableAutoRotation,
          environmentsUsedIn,
          dependentVariables,
        },
      );

      logger.info(
        `Environment variable "${keyName}" ${
          shouldRotateKey ? 'rotated' : 'created'
        } successfully with rotation tracking.`,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'storeBaseEnvironmentKey',
        `Failed to store key "${keyName}" in environment file.`,
      );
      throw error;
    }
  }

  /**
   * Consolidated check method with audit trail (replaces both versions)
   */
  public async checkKeyRotationStatus(
    keyName: string,
    checkSource: 'startup' | 'scheduled' | 'manual' | 'api' = 'manual',
  ): Promise<{
    needsRotation: boolean;
    needsWarning: boolean;
    ageInDays: number;
    daysUntilRotation: number;
  }> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      const keyMetadata = metadata[keyName];

      if (!keyMetadata) {
        return {
          needsRotation: false,
          needsWarning: false,
          ageInDays: 0,
          daysUntilRotation: this.keyRotationConfig.maxAgeInDays,
        };
      }

      const ageInDays = this.calculateKeyAge(keyMetadata);

      // VALIDATE ROTATION CONFIG HERE
      let validatedConfig: KeyRotationConfig;
      try {
        validatedConfig = this.validateRotationConfig(keyMetadata.rotationConfig);
      } catch (error) {
        const errorAsError = error as Error;
        logger.warn(
          `Invalid rotation config for key "${keyName}", using defaults: ${errorAsError.message}`,
        );
        // Fall back to default config if validation fails
        validatedConfig = this.keyRotationConfig;
      }

      const maxAge = validatedConfig.maxAgeInDays;
      const daysUntilRotation = maxAge - ageInDays;

      const needsRotation = ageInDays >= maxAge;
      const needsWarning =
        daysUntilRotation <= this.keyRotationConfig.warningThresholdInDays && !needsRotation;

      const status = {
        needsRotation,
        needsWarning,
        ageInDays,
        daysUntilRotation: Math.max(0, daysUntilRotation),
      };

      // Record audit trail
      let healthStatus: 'healthy' | 'warning' | 'critical';
      const recommendations: string[] = [];

      if (status.needsRotation) {
        healthStatus = 'critical';
        recommendations.push('Immediate rotation required');
      } else if (status.needsWarning) {
        healthStatus = 'warning';
        recommendations.push(`Consider rotating within ${status.daysUntilRotation} days`);
      } else {
        healthStatus = 'healthy';
      }

      await this.recordHealthCheck(
        keyName,
        status.ageInDays,
        status.daysUntilRotation,
        healthStatus,
        checkSource,
        recommendations,
      );

      if (status.needsRotation) {
        await this.recordAuditEvent(
          keyName,
          'expired',
          'critical',
          'checkKeyRotationStatus',
          `Key has expired and requires immediate rotation (${status.ageInDays} days old)`,
        );
      } else if (status.needsWarning) {
        await this.recordAuditEvent(
          keyName,
          'warning_issued',
          'warning',
          'checkKeyRotationStatus',
          `Key will expire in ${status.daysUntilRotation} days`,
        );
      }

      return status;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'checkKeyRotationStatus',
        `Failed to check rotation status for key "${keyName}"`,
      );
      throw error;
    }
  }

  /**
   * Gets comprehensive key information including all audit data (replaces getComprehensiveKeyInfo)
   */
  public async getComprehensiveKeyInfo(keyName: string): Promise<{
    exists: boolean;
    metadata?: KeyMetadata;
    rotationStatus?: {
      needsRotation: boolean;
      needsWarning: boolean;
      ageInDays: number;
      daysUntilRotation: number;
    };
    auditSummary?: {
      totalRotations: number;
      lastRotation?: Date;
      lastHealthCheck?: Date;
      lastAccess?: Date;
      currentStatus: string;
      totalAuditEvents: number;
    };
  }> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      const keyMetadata = metadata[keyName];

      if (!keyMetadata) {
        return { exists: false };
      }

      const rotationStatus = await this.checkKeyRotationStatus(keyName, 'api');

      // Build audit summary
      const auditSummary = {
        totalRotations: keyMetadata.rotationCount,
        lastRotation: keyMetadata.lastRotatedAt,
        lastHealthCheck: keyMetadata.auditTrail?.lastHealthCheck,
        lastAccess: keyMetadata.usageTracking?.lastAccessedAt,
        currentStatus: keyMetadata.statusTracking?.currentStatus || 'unknown',
        totalAuditEvents: keyMetadata.auditTrail?.auditTrail?.length || 0,
      };

      return {
        exists: true,
        metadata: keyMetadata,
        rotationStatus,
        auditSummary,
      };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'getComprehensiveKeyInfo',
        `Failed to get comprehensive info for key "${keyName}"`,
      );
      throw error;
    }
  }

  /**
   * Calculates the age of a key in days
   */
  private calculateKeyAge(metadata: KeyMetadata): number {
    const referenceDate = metadata.lastRotatedAt || metadata.createdAt;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - referenceDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Records a scheduled check event
   */
  private async recordScheduledCheck(
    keyName: string,
    checkType: 'startup' | 'scheduled' | 'manual',
    result: 'passed' | 'warning' | 'failed',
    action: 'none' | 'rotated' | 'notification_sent',
    daysUntilExpiry: number,
    details?: string,
  ): Promise<void> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      if (!metadata[keyName]) return;

      if (!metadata[keyName].auditTrail) {
        metadata[keyName].auditTrail = this.createEmptyAuditTrail();
      }

      if (!metadata[keyName].auditTrail.scheduledRotationHistory) {
        metadata[keyName].auditTrail.scheduledRotationHistory = [];
      }

      metadata[keyName].auditTrail.scheduledRotationHistory.push({
        timestamp: new Date(),
        checkType,
        result,
        action,
        daysUntilExpiry,
        details,
      });

      metadata[keyName].auditTrail.lastScheduledCheck = new Date();
      await this.metadataRepo.writeKeyMetadata(metadata);
    } catch (error) {
      logger.error('Failed to record scheduled check', error);
    }
  }

  /**
   * Records an audit event
   */
  public async recordAuditEvent(
    keyName: string,
    eventType: 'created' | 'rotated' | 'accessed' | 'warning_issued' | 'expired' | 'health_check',
    severity: 'info' | 'warning' | 'error' | 'critical',
    source: string,
    details: string,
    additionalMetadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      if (!metadata[keyName]) return;

      if (!metadata[keyName].auditTrail) {
        metadata[keyName].auditTrail = this.createEmptyAuditTrail();
      }

      if (!metadata[keyName].auditTrail.auditTrail) {
        metadata[keyName].auditTrail.auditTrail = [];
      }

      metadata[keyName].auditTrail.auditTrail.push({
        timestamp: new Date(),
        eventType,
        severity,
        source,
        details,
        metadata: additionalMetadata,
      });

      if (metadata[keyName].auditTrail.auditTrail.length > 100) {
        metadata[keyName].auditTrail.auditTrail =
          metadata[keyName].auditTrail.auditTrail.slice(-100);
      }

      await this.metadataRepo.writeKeyMetadata(metadata);
    } catch (error) {
      logger.error('Failed to record audit event', error);
    }
  }

  /**
   * Records a health check event
   */
  private async recordHealthCheck(
    keyName: string,
    ageInDays: number,
    daysUntilExpiry: number,
    status: 'healthy' | 'warning' | 'critical',
    checkSource: 'startup' | 'scheduled' | 'manual' | 'api',
    recommendations?: string[],
  ): Promise<void> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      if (!metadata[keyName]) return;

      if (!metadata[keyName].auditTrail) {
        metadata[keyName].auditTrail = this.createEmptyAuditTrail();
      }

      if (!metadata[keyName].auditTrail.healthCheckHistory) {
        metadata[keyName].auditTrail.healthCheckHistory = [];
      }

      metadata[keyName].auditTrail.healthCheckHistory.push({
        timestamp: new Date(),
        ageInDays,
        daysUntilExpiry,
        status,
        checkSource,
        recommendations,
      });

      metadata[keyName].auditTrail.lastHealthCheck = new Date();

      if (!metadata[keyName].statusTracking) {
        metadata[keyName].statusTracking = this.createDefaultStatusTracking(
          this.keyRotationConfig.enableAutoRotation,
        );
      } else if (metadata[keyName].statusTracking.currentStatus !== status) {
        metadata[keyName].statusTracking.currentStatus = status;
        metadata[keyName].statusTracking.lastStatusChange = new Date();
      }

      if (metadata[keyName].auditTrail.healthCheckHistory.length > 50) {
        metadata[keyName].auditTrail.healthCheckHistory =
          metadata[keyName].auditTrail.healthCheckHistory.slice(-50);
      }

      await this.metadataRepo.writeKeyMetadata(metadata);
    } catch (error) {
      logger.error('Failed to record health check', error);
    }
  }

  /**
   * Performs system-wide audit with detailed reporting
   */
  public async performComprehensiveAudit(): Promise<{
    systemHealth: 'healthy' | 'warning' | 'critical';
    keysNeedingRotation: string[];
    keysNeedingWarning: string[];
    auditSummary: {
      totalKeys: number;
      healthyKeys: number;
      warningKeys: number;
      criticalKeys: number;
      averageKeyAge: number;
      oldestKeyAge: number;
      newestKeyAge: number;
    };
    recommendations: string[];
  }> {
    const { keysNeedingRotation, keysNeedingWarning } = await this.checkAllKeysForRotation();
    const metadata = await this.metadataRepo.readKeyMetadata();

    const allKeys = Object.keys(metadata).filter((key) => key !== 'SYSTEM');
    const totalKeys = allKeys.length;
    const criticalKeys = keysNeedingRotation.length;
    const warningKeys = keysNeedingWarning.length;
    const healthyKeys = totalKeys - criticalKeys - warningKeys;

    // Calculate age statistics
    const keyAges = allKeys.map((keyName) => this.calculateKeyAge(metadata[keyName]));
    const averageKeyAge =
      keyAges.length > 0 ? keyAges.reduce((a, b) => a + b, 0) / keyAges.length : 0;
    const oldestKeyAge = keyAges.length > 0 ? Math.max(...keyAges) : 0;
    const newestKeyAge = keyAges.length > 0 ? Math.min(...keyAges) : 0;

    // Determine system health
    let systemHealth: 'healthy' | 'warning' | 'critical';
    if (criticalKeys > 0) {
      systemHealth = 'critical';
    } else if (warningKeys > 0) {
      systemHealth = 'warning';
    } else {
      systemHealth = 'healthy';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (criticalKeys > 0) {
      recommendations.push(`${criticalKeys} key(s) require immediate rotation`);
    }
    if (warningKeys > 0) {
      recommendations.push(`${warningKeys} key(s) should be rotated soon`);
    }
    if (averageKeyAge > this.keyRotationConfig.maxAgeInDays * 0.8) {
      recommendations.push('Consider reducing key rotation intervals');
    }

    return {
      systemHealth,
      keysNeedingRotation,
      keysNeedingWarning,
      auditSummary: {
        totalKeys,
        healthyKeys,
        warningKeys,
        criticalKeys,
        averageKeyAge: Math.round(averageKeyAge * 100) / 100,
        oldestKeyAge,
        newestKeyAge,
      },
      recommendations,
    };
  }

  /**
   * Records key access for usage tracking
   */
  public async recordKeyAccess(keyName: string, accessSource: string): Promise<void> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      if (!metadata[keyName]) return;

      // Update last accessed time
      if (!metadata[keyName].usageTracking) {
        metadata[keyName].usageTracking = {
          environmentsUsedIn: [],
          dependentVariables: [],
        };
      }

      metadata[keyName].usageTracking.lastAccessedAt = new Date();
      await this.metadataRepo.writeKeyMetadata(metadata);

      // Record audit event
      await this.recordAuditEvent(
        keyName,
        'accessed',
        'info',
        accessSource,
        `Key accessed from ${accessSource}`,
      );
    } catch (error) {
      logger.error('Failed to record key access', error);
    }
  }

  /**
   * Add health check entry after rotation or other key operations
   */
  /**
   * Add health check entry after rotation or other key operations
   */
  public async addHealthCheckEntry(
    keyName: string,
    keyMetadata: KeyMetadata,
    success: boolean,
    reason: string,
    MultiRotationResult?: MultiRotationResult,
  ): Promise<void> {
    try {
      // Initialize health check history if needed
      if (!keyMetadata.auditTrail.healthCheckHistory) {
        keyMetadata.auditTrail.healthCheckHistory = [];
      }

      // Determine health status based on various conditions
      const healthStatus = this.determineHealthStatus(keyMetadata, success, reason);

      // Map reason to checkSource for HealthCheckEvent
      const checkSource: 'startup' | 'scheduled' | 'manual' | 'api' =
        reason === 'manual'
          ? 'manual'
          : reason === 'scheduled'
            ? 'scheduled'
            : reason === 'health-check'
              ? 'api'
              : 'api';

      // Calculate required fields for HealthCheckEvent
      const ageInDays = this.calculateKeyAge(keyMetadata);
      const daysUntilExpiry = this.calculateDaysUntilExpiry(keyMetadata);

      // Create health check entry that matches HealthCheckEvent interface
      const healthCheckEntry: HealthCheckEvent = {
        timestamp: new Date(),
        ageInDays,
        daysUntilExpiry,
        status: healthStatus,
        checkSource,
        recommendations: this.generateRecommendations(healthStatus, reason, MultiRotationResult),
      };

      keyMetadata.auditTrail.healthCheckHistory.push(healthCheckEntry);

      // Update status tracking based on health check
      keyMetadata.statusTracking.currentStatus = healthStatus;
      keyMetadata.statusTracking.lastStatusChange = new Date();

      // Keep only last 50 health check entries to prevent unbounded growth
      if (keyMetadata.auditTrail.healthCheckHistory.length > 50) {
        keyMetadata.auditTrail.healthCheckHistory =
          keyMetadata.auditTrail.healthCheckHistory.slice(-50);
      }

      // If you need to store the additional metadata somewhere, consider adding it to an AuditEvent
      if (MultiRotationResult) {
        const auditEvent: AuditEvent = {
          timestamp: new Date(),
          eventType: 'health_check',
          severity:
            healthStatus === 'critical'
              ? 'critical'
              : healthStatus === 'warning'
                ? 'warning'
                : 'info',
          source: 'health-check-service',
          details: this.generateHealthCheckDetails(
            success,
            reason,
            healthStatus,
            MultiRotationResult,
          ),
          metadata: {
            reason,
            success,
            healthStatus,
            keyAge: ageInDays,
            daysSinceLastRotation: this.calculateDaysSinceLastRotation(keyMetadata),
            reEncryptedCount: MultiRotationResult.reEncryptedCount,
            affectedFiles: MultiRotationResult.affectedFiles,
          },
        };
        keyMetadata.auditTrail.auditTrail.push(auditEvent);
      }
    } catch (error) {
      logger.error(`Failed to add health check entry for key ${keyName}: ${error}`);
    }
  }

  // You'll also need these helper methods if they don't exist:
  private calculateDaysUntilExpiry(keyMetadata: KeyMetadata): number {
    const ageInDays = this.calculateKeyAge(keyMetadata);
    return Math.max(0, keyMetadata.rotationConfig.maxAgeInDays - ageInDays);
  }

  private generateRecommendations(
    healthStatus: 'healthy' | 'warning' | 'critical' | 'expired',
    reason: string,
    MultiRotationResult?: MultiRotationResult,
  ): string[] | undefined {
    const recommendations: string[] = [];

    if (healthStatus === 'warning') {
      recommendations.push('Consider rotating this key soon');
    } else if (healthStatus === 'critical') {
      recommendations.push('Key rotation is urgently needed');
    } else if (healthStatus === 'expired') {
      recommendations.push('Key has expired and should be rotated immediately');
    }

    if (MultiRotationResult && !MultiRotationResult.success) {
      recommendations.push('Previous rotation failed - investigate and retry');
    }

    return recommendations.length > 0 ? recommendations : undefined;
  }

  /**
   * Determine health status based on various conditions
   */
  private determineHealthStatus(
    keyMetadata: KeyMetadata,
    success: boolean,
    reason: string,
  ): 'healthy' | 'warning' | 'critical' | 'expired' {
    // If operation failed, it's critical
    if (!success) {
      return 'critical';
    }

    // If rotation was due to expiration, check if it was successful
    if (reason === 'expired') {
      return success ? 'healthy' : 'expired';
    }

    // Calculate key age and days since last rotation
    const keyAge = this.calculateKeyAge(keyMetadata);
    const daysSinceLastRotation = this.calculateDaysSinceLastRotation(keyMetadata);
    const maxAge = keyMetadata.rotationConfig.maxAgeInDays;
    const warningThreshold = keyMetadata.rotationConfig.warningThresholdInDays;

    // Check if key is expired based on max age
    if (keyAge >= maxAge) {
      return 'expired';
    }

    // Check if key is approaching expiration (warning state)
    if (keyAge >= maxAge - warningThreshold) {
      return 'warning';
    }

    // Check if key hasn't been rotated recently and is approaching warning threshold
    if (daysSinceLastRotation >= maxAge - warningThreshold) {
      return 'warning';
    }

    // Key is healthy
    return 'healthy';
  }

  /**
   * Generate detailed health check message
   */
  private generateHealthCheckDetails(
    success: boolean,
    reason: string,
    healthStatus: string,
    MultiRotationResult?: MultiRotationResult,
  ): string {
    if (!success) {
      return `Key operation failed during ${reason} operation. Status: ${healthStatus}`;
    }

    const baseMessage = `Key operation completed successfully. Status: ${healthStatus}.`;
    const rotationDetails = MultiRotationResult
      ? ` Re-encrypted ${MultiRotationResult.reEncryptedCount} variables across ${MultiRotationResult.affectedFiles.length} files.`
      : '';

    const statusMessages = {
      healthy: 'Key is within safe rotation period.',
      warning: 'Key is approaching rotation threshold - consider rotating soon.',
      critical: 'Key operation failed or is in critical state.',
      expired: 'Key has exceeded maximum age and should be rotated immediately.',
    };

    return `${baseMessage}${rotationDetails} ${statusMessages[healthStatus as keyof typeof statusMessages] || ''}`;
  }

  /**
   * Calculate days since last rotation
   */
  private calculateDaysSinceLastRotation(keyMetadata: KeyMetadata): number {
    const now = new Date();
    const lastRotatedAt = keyMetadata.lastRotatedAt
      ? new Date(keyMetadata.lastRotatedAt)
      : new Date(keyMetadata.createdAt);
    return Math.floor((now.getTime() - lastRotatedAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Add method to track usage during rotation
   */
  public updateUsageTracking(
    decryptedDataMap: Map<string, Record<string, string>>,
    existingUsageTracking?: KeyMetadata['usageTracking'],
  ): KeyMetadata['usageTracking'] {
    const environmentsUsedIn = new Set(existingUsageTracking?.environmentsUsedIn || []);
    const dependentVariables = new Set(existingUsageTracking?.dependentVariables || []);

    // Add all environment files that had variables processed
    for (const [envFilePath, variables] of decryptedDataMap.entries()) {
      environmentsUsedIn.add(envFilePath);

      // Add all variable names that were processed
      for (const variableName of Object.keys(variables)) {
        dependentVariables.add(variableName);
      }
    }

    return {
      environmentsUsedIn: Array.from(environmentsUsedIn),
      dependentVariables: Array.from(dependentVariables),
    };
  }

  public async validateAndRepairAllMetadata(): Promise<{
    totalKeys: number;
    repairedKeys: string[];
    errors: Array<{ keyName: string; error: string }>;
  }> {
    const metadata = await this.metadataRepo.readKeyMetadata();
    const repairedKeys: string[] = [];
    const errors: Array<{ keyName: string; error: string }> = [];

    for (const [keyName, keyMetadata] of Object.entries(metadata)) {
      if (keyName === 'SYSTEM') continue; // Skip system metadata

      try {
        this.validateRotationConfig(keyMetadata.rotationConfig);
      } catch (error) {
        try {
          const errorAsError = error as Error;

          // Attempt to repair with default config
          keyMetadata.rotationConfig = {
            maxAgeInDays: this.keyRotationConfig.maxAgeInDays,
            warningThresholdInDays: this.keyRotationConfig.warningThresholdInDays,
            enableAutoRotation: this.keyRotationConfig.enableAutoRotation,
          };
          repairedKeys.push(keyName);

          // Log the repair
          await this.recordAuditEvent(
            keyName,
            'rotated', // or create a new event type like 'metadata_repaired'
            'warning',
            'validateAndRepairAllMetadata',
            `Repaired invalid rotation config: ${errorAsError.message}`,
          );
        } catch (repairError) {
          const errorAsError = repairError as Error;
          errors.push({
            keyName,
            error: `Failed to repair: ${errorAsError.message}`,
          });
        }
      }
    }

    if (repairedKeys.length > 0) {
      await this.metadataRepo.writeKeyMetadata(metadata);
      logger.info(`Repaired rotation config for keys: ${repairedKeys.join(', ')}`);
    }

    return {
      totalKeys: Object.keys(metadata).length - 1, // Exclude SYSTEM
      repairedKeys,
      errors,
    };
  }

  public createEmptyAuditTrail(): AuditTrail {
    return {
      scheduledRotationHistory: [],
      auditTrail: [],
      rotationHistory: [],
      healthCheckHistory: [],
    };
  }

  // Helper function to create default usage tracking
  public createDefaultUsageTracking(): UsageTracking {
    return {
      environmentsUsedIn: [],
      dependentVariables: [],
    };
  }

  public createDefaultStatusTracking(autoRotationEnabled: boolean): StatusTracking {
    return {
      currentStatus: 'healthy',
      lastStatusChange: new Date(),
      autoRotationEnabled,
    };
  }

  /**
   * Simple key hashing for audit purposes (not for security)
   */
  public hashKey(key: string): string {
    // Simple hash for audit trail - not cryptographically secure
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  public validateRotationConfig(config: KeyRotationConfig): KeyRotationConfig {
    if (!config || typeof config !== 'object') {
      ErrorHandler.logAndThrow(
        'Invalid rotation config: config must be an object',
        'validateRotationConfig',
      );
    }

    if (typeof config.maxAgeInDays !== 'number' || config.maxAgeInDays <= 0) {
      ErrorHandler.logAndThrow(
        'Invalid rotation config: maxAgeInDays must be a positive number',
        'validateRotationConfig',
      );
    }

    if (typeof config.warningThresholdInDays !== 'number' || config.warningThresholdInDays < 0) {
      ErrorHandler.logAndThrow(
        'Invalid rotation config: warningThresholdInDays must be a non-negative number',
        'validateRotationConfig',
      );
    }

    if (typeof config.enableAutoRotation !== 'boolean') {
      ErrorHandler.logAndThrow(
        'Invalid rotation config: enableAutoRotation must be a boolean',
        'validateRotationConfig',
      );
    }

    // Additional validation: warning threshold should be less than max age
    if (config.warningThresholdInDays >= config.maxAgeInDays) {
      ErrorHandler.logAndThrow(
        'Invalid rotation config: warningThresholdInDays must be less than maxAgeInDays',
        'validateRotationConfig',
      );
    }

    return config as KeyRotationConfig;
  }
}
