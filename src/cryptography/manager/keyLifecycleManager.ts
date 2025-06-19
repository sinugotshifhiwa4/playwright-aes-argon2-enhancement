import { KeyRotationConfigDefaults } from '../constants/keyRotationConfig.constants';
import { EnvironmentSecretFileManager } from '../../cryptography/manager/environmentSecretFileManager';
import { KeyMetadataRepository } from '../../cryptography/key/keyMetadataRepository';
import {
  KeyMetadata,
  KeyRotationConfig,
  UsageTracking,
  AuditTrail,
  AuditSummary,
  StatusTracking,
  HealthCheckEvent,
  RotationResult,
  RotationEvent,
  AuditEvent,
  KeyStatus,
  EventType,
  EventSeverity,
  RotationReason,
  CheckSource,
  SystemHealth,
} from '../types/keyManagement.types';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export class KeyLifecycleManager {
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

  public async updateAuditTrail(
    keyName: string,
    keyFilePath: string,
    reason: RotationReason,
    startTime: Date,
    newKeyValue: string,
    rotationResult: RotationResult,
    shouldRotateKey: boolean,
    success: boolean,
    error?: Error,
    processedVariableNames?: string[],
  ): Promise<void> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();

      if (!metadata[keyName]) {
        logger.warn(`No metadata found for key: ${keyName} during audit trail update`);
        return;
      }

      let oldKeyHash: string | undefined;
      if (!success) {
        const currentKeyValue = await this.environmentSecretFileManager.getKeyValue(
          keyFilePath,
          keyName,
        );
        oldKeyHash = currentKeyValue ? this.hashKey(currentKeyValue) : undefined;
      }
      const newKeyHash = this.hashKey(newKeyValue);

      if (!metadata[keyName].auditTrail) {
        metadata[keyName].auditTrail = this.createEmptyAuditTrail();
      }

      if (!metadata[keyName].auditTrail.rotationHistory) {
        metadata[keyName].auditTrail.rotationHistory = [];
      }

      // Use the actual processed variable names passed from the rotation service
      const affectedVariables = processedVariableNames || [];

      // Use the actual affected environments passed from the rotation service
      const affectedEnvironments = success ? rotationResult.affectedFiles : [];

      const auditEntry: RotationEvent = {
        timestamp: startTime,
        reason,
        oldKeyHash,
        newKeyHash,
        affectedEnvironments,
        affectedVariables,
        success,
        overrideMode: shouldRotateKey,
        ...(error && { errorDetails: error.message }),
      };

      metadata[keyName].auditTrail.rotationHistory.push(auditEntry);

      if (success && rotationResult.affectedFiles.length > 0) {
        // Update usage tracking with actual processed variables
        for (const envFile of rotationResult.affectedFiles) {
          if (!metadata[keyName].usageTracking.environmentsUsedIn.includes(envFile)) {
            metadata[keyName].usageTracking.environmentsUsedIn.push(envFile);
          }
        }

        // Add processed variables to dependentVariables if not already present
        if (processedVariableNames && processedVariableNames.length > 0) {
          const existingVars = new Set(metadata[keyName].usageTracking.dependentVariables);
          processedVariableNames.forEach((varName) => existingVars.add(varName));
          metadata[keyName].usageTracking.dependentVariables = Array.from(existingVars);
        }

        metadata[keyName].usageTracking.lastAccessedAt = new Date();

        // Update the initial audit entry if it exists and has empty arrays
        if (processedVariableNames && processedVariableNames.length > 0) {
          // Find the earliest entry (likely the first rotation) that has empty arrays
          const initialAuditEntry = metadata[keyName].auditTrail.rotationHistory
            .sort(
              (a: RotationEvent, b: RotationEvent) => a.timestamp.getTime() - b.timestamp.getTime(),
            )
            .find(
              (entry: RotationEvent) =>
                Array.isArray(entry.affectedEnvironments) &&
                Array.isArray(entry.affectedVariables) &&
                entry.affectedEnvironments.length === 0 &&
                entry.affectedVariables.length === 0,
            );

          if (initialAuditEntry) {
            // Update the initial entry with current usage information
            initialAuditEntry.affectedEnvironments = [...rotationResult.affectedFiles];
            initialAuditEntry.affectedVariables = processedVariableNames;

            logger.info(`Updated initial audit entry for key ${keyName} with usage information`);
          }
        }
      }

      await this.metadataRepo.updateSingleKeyMetadata(keyName, metadata[keyName]);

      if (success) {
        const auditEventMetadata: Record<string, unknown> = {
          reason,
          affectedEnvironments: rotationResult.affectedFiles,
          reEncryptedCount: rotationResult.reEncryptedCount,
          rotationCount: metadata[keyName].rotationCount,
          overrideMode: shouldRotateKey,
          affectedVariables: processedVariableNames || [],
        };

        await this.recordAuditEvent(
          keyName,
          'rotated',
          'info',
          'rotateKeyWithAudit',
          `Key rotated successfully. Reason: ${reason}. Re-encrypted ${rotationResult.reEncryptedCount} variables: ${(processedVariableNames || []).join(', ')}. Override mode: ${shouldRotateKey}`,
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

  public updateUsageTracking(
    decryptedDataMap: Map<string, Record<string, string>>,
    existingUsageTracking?: UsageTracking,
  ): UsageTracking {
    const environmentsUsedIn = new Set(existingUsageTracking?.environmentsUsedIn || []);
    const dependentVariables = new Set(existingUsageTracking?.dependentVariables || []);

    for (const [envFilePath, variables] of decryptedDataMap.entries()) {
      environmentsUsedIn.add(envFilePath);

      for (const [variableName, value] of Object.entries(variables)) {
        if (value !== undefined && value !== null) {
          dependentVariables.add(variableName);
        }
      }
    }

    return {
      environmentsUsedIn: Array.from(environmentsUsedIn),
      dependentVariables: Array.from(dependentVariables),
      lastAccessedAt: new Date(),
    };
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

      try {
        this.validateRotationConfig(keyMetadata.rotationConfig);
      } catch (error) {
        const errorAsError = error as Error;
        logger.warn(`Invalid rotation config for key "${keyName}": ${errorAsError.message}`);
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
   * Consolidated store method with audit trail
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

      const rotationConfig: KeyRotationConfig = {
        maxAgeInDays: customMaxAge || this.keyRotationConfig.maxAgeInDays,
        warningThresholdInDays: this.keyRotationConfig.warningThresholdInDays,
      };

      const validatedConfig = this.validateRotationConfig(rotationConfig);

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
        },
      };

      await this.metadataRepo.writeKeyMetadata(metadata);

      await this.recordAuditEvent(
        keyName,
        shouldRotateKey ? 'rotated' : 'created',
        'info',
        'storeBaseEnvironmentKey',
        `Secret key ${shouldRotateKey ? 'rotated' : 'created'} with ${effectiveMaxAge}-day rotation period`,
        {
          initialMaxAge: effectiveMaxAge,
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
   * Consolidated check method with audit trail
   */
  public async checkKeyRotationStatus(
    keyName: string,
    checkSource: CheckSource = 'manual',
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

      let validatedConfig: KeyRotationConfig;
      try {
        validatedConfig = this.validateRotationConfig(keyMetadata.rotationConfig);
      } catch (error) {
        const errorAsError = error as Error;
        logger.warn(
          `Invalid rotation config for key "${keyName}", using defaults: ${errorAsError.message}`,
        );
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

      let healthStatus: KeyStatus;
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
   * Gets comprehensive key information including all audit data
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
      currentStatus: SystemHealth;
      totalAuditEvents: number;
      expiredKeys: number;
    };
  }> {
    try {
      const metadata = await this.metadataRepo.readKeyMetadata();
      const keyMetadata = metadata[keyName];

      if (!keyMetadata) {
        return { exists: false };
      }

      const rotationStatus = await this.checkKeyRotationStatus(keyName, 'api');

      // Convert KeyStatus to SystemHealth
      const convertKeyStatusToSystemHealth = (keyStatus: KeyStatus): SystemHealth => {
        switch (keyStatus) {
          case 'critical':
          case 'expired':
            return 'critical';
          case 'warning':
            return 'warning';
          case 'healthy':
            return 'healthy';
          default:
            return 'warning';
        }
      };

      const currentKeyStatus = keyMetadata.statusTracking?.currentStatus || 'healthy';
      const systemHealthStatus = convertKeyStatusToSystemHealth(currentKeyStatus);

      const auditSummary = {
        totalRotations: keyMetadata.rotationCount,
        lastRotation: keyMetadata.lastRotatedAt,
        lastHealthCheck: keyMetadata.auditTrail?.lastHealthCheck,
        lastAccess: keyMetadata.usageTracking?.lastAccessedAt,
        currentStatus: systemHealthStatus,
        totalAuditEvents: keyMetadata.auditTrail?.auditEvents?.length || 0,
        expiredKeys: 0, // Placeholder; update if you want to calculate expired keys count here
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
   * Records an audit event
   */
  public async recordAuditEvent(
    keyName: string,
    eventType: EventType,
    severity: EventSeverity,
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

      if (!metadata[keyName].auditTrail.auditEvents) {
        metadata[keyName].auditTrail.auditEvents = [];
      }

      metadata[keyName].auditTrail.auditEvents.push({
        timestamp: new Date(),
        eventType,
        severity,
        source,
        details,
        metadata: additionalMetadata,
      });

      // Limit to last 100 audit events
      if (metadata[keyName].auditTrail.auditEvents.length > 100) {
        metadata[keyName].auditTrail.auditEvents =
          metadata[keyName].auditTrail.auditEvents.slice(-100);
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
    status: KeyStatus,
    checkSource: CheckSource,
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
        metadata[keyName].statusTracking = this.createDefaultStatusTracking();
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
    systemHealth: SystemHealth;
    keysNeedingRotation: string[];
    keysNeedingWarning: string[];
    expiredKeys: string[];
    auditSummary: AuditSummary;
    recommendations: string[];
  }> {
    const { keysNeedingRotation, keysNeedingWarning } = await this.checkAllKeysForRotation();
    const metadata = await this.metadataRepo.readKeyMetadata();

    const allKeys = Object.keys(metadata).filter((key) => key !== 'SYSTEM');
    const totalKeys = allKeys.length;
    const expiredKeys: string[] = [];

    // Identify expired keys separately if needed
    for (const keyName of allKeys) {
      const keyAge = this.calculateKeyAge(metadata[keyName]);
      const maxAge =
        metadata[keyName].rotationConfig?.maxAgeInDays ?? this.keyRotationConfig.maxAgeInDays;
      if (keyAge >= maxAge) {
        expiredKeys.push(keyName);
      }
    }

    const criticalKeys = keysNeedingRotation.length;
    const warningKeys = keysNeedingWarning.length;
    const healthyKeys = totalKeys - criticalKeys - warningKeys - expiredKeys.length;

    const keyAges = allKeys.map((keyName) => this.calculateKeyAge(metadata[keyName]));
    const averageKeyAge =
      keyAges.length > 0 ? keyAges.reduce((a, b) => a + b, 0) / keyAges.length : 0;
    const oldestKeyAge = keyAges.length > 0 ? Math.max(...keyAges) : 0;
    const newestKeyAge = keyAges.length > 0 ? Math.min(...keyAges) : 0;

    let systemHealth: SystemHealth;
    if (criticalKeys > 0) {
      systemHealth = 'critical';
    } else if (warningKeys > 0) {
      systemHealth = 'warning';
    } else {
      systemHealth = 'healthy';
    }

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

    const auditSummary: AuditSummary = {
      totalKeys,
      healthyKeys,
      warningKeys,
      criticalKeys,
      expiredKeys: expiredKeys.length,
      averageKeyAge: Math.round(averageKeyAge * 100) / 100,
      oldestKeyAge,
      newestKeyAge,
      totalAuditEvents: 0, // Could compute total audit events across all keys if needed
      totalRotations: 0, // Could compute total rotations across all keys if needed
      lastRotation: undefined, // Could compute if needed
      lastHealthCheck: undefined, // Could compute if needed
      lastAccess: undefined, // Could compute if needed
      currentStatus: systemHealth,
    };

    return {
      systemHealth,
      keysNeedingRotation,
      keysNeedingWarning,
      expiredKeys,
      auditSummary,
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

      if (!metadata[keyName].usageTracking) {
        metadata[keyName].usageTracking = {
          environmentsUsedIn: [],
          dependentVariables: [],
        };
      }

      metadata[keyName].usageTracking.lastAccessedAt = new Date();
      await this.metadataRepo.writeKeyMetadata(metadata);

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
  public async addHealthCheckEntry(
    keyName: string,
    keyMetadata: KeyMetadata,
    success: boolean,
    reason: string,
    rotationResult?: RotationResult,
  ): Promise<void> {
    try {
      if (!keyMetadata.auditTrail.healthCheckHistory) {
        keyMetadata.auditTrail.healthCheckHistory = [];
      }

      const healthStatus = this.determineHealthStatus(keyMetadata, success, reason);

      const checkSource: CheckSource =
        reason === 'manual'
          ? 'manual'
          : reason === 'scheduled'
            ? 'scheduled'
            : reason === 'health_check'
              ? 'api'
              : 'api';

      const ageInDays = this.calculateKeyAge(keyMetadata);
      const daysUntilExpiry = this.calculateDaysUntilExpiry(keyMetadata);

      const healthCheckEntry: HealthCheckEvent = {
        timestamp: new Date(),
        ageInDays,
        daysUntilExpiry,
        status: healthStatus,
        checkSource,
        recommendations: this.generateRecommendations(healthStatus, reason, rotationResult),
      };

      keyMetadata.auditTrail.healthCheckHistory.push(healthCheckEntry);

      keyMetadata.statusTracking.currentStatus = healthStatus;
      keyMetadata.statusTracking.lastStatusChange = new Date();

      if (keyMetadata.auditTrail.healthCheckHistory.length > 50) {
        keyMetadata.auditTrail.healthCheckHistory =
          keyMetadata.auditTrail.healthCheckHistory.slice(-50);
      }

      if (rotationResult) {
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
          details: this.generateHealthCheckDetails(success, reason, healthStatus, rotationResult),
          metadata: {
            reason,
            success,
            healthStatus,
            keyAge: ageInDays,
            daysSinceLastRotation: this.calculateDaysSinceLastRotation(keyMetadata),
            reEncryptedCount: rotationResult.reEncryptedCount,
            affectedFiles: rotationResult.affectedFiles,
          },
        };
        keyMetadata.auditTrail.auditEvents.push(auditEvent);
      }
    } catch (error) {
      logger.error(`Failed to add health check entry for key ${keyName}: ${error}`);
    }
  }

  private generateRecommendations(
    healthStatus: KeyStatus,
    reason: string,
    rotationResult?: RotationResult,
  ): string[] | undefined {
    const recommendations: string[] = [];

    if (healthStatus === 'warning') {
      recommendations.push('Consider rotating this key soon');
    } else if (healthStatus === 'critical') {
      recommendations.push('Key rotation is urgently needed');
    } else if (healthStatus === 'expired') {
      recommendations.push('Key has expired and should be rotated immediately');
    }

    if (rotationResult && !rotationResult.success) {
      recommendations.push('Previous rotation failed - investigate and retry');
    }

    return recommendations.length > 0 ? recommendations : undefined;
  }

  private determineHealthStatus(
    keyMetadata: KeyMetadata,
    success: boolean,
    reason: string,
  ): KeyStatus {
    if (!success) {
      return 'critical';
    }

    if (reason === 'expired') {
      return success ? 'healthy' : 'expired';
    }

    const keyAge = this.calculateKeyAge(keyMetadata);
    const daysSinceLastRotation = this.calculateDaysSinceLastRotation(keyMetadata);
    const maxAge = keyMetadata.rotationConfig.maxAgeInDays;
    const warningThreshold = keyMetadata.rotationConfig.warningThresholdInDays;

    if (keyAge >= maxAge) {
      return 'expired';
    }

    if (keyAge >= maxAge - warningThreshold) {
      return 'warning';
    }

    if (daysSinceLastRotation >= maxAge - warningThreshold) {
      return 'warning';
    }

    return 'healthy';
  }

  private generateHealthCheckDetails(
    success: boolean,
    reason: string,
    healthStatus: KeyStatus,
    rotationResult?: RotationResult,
  ): string {
    if (!success) {
      return `Key operation failed during ${reason} operation. Status: ${healthStatus}`;
    }

    const baseMessage = `Key operation completed successfully. Status: ${healthStatus}.`;
    const rotationDetails = rotationResult
      ? ` Re-encrypted ${rotationResult.reEncryptedCount} variables across ${rotationResult.affectedFiles.length} files.`
      : '';

    const statusMessages = {
      healthy: 'Key is within safe rotation period.',
      warning: 'Key is approaching rotation threshold - consider rotating soon.',
      critical: 'Key operation failed or is in critical state.',
      expired: 'Key has exceeded maximum age and should be rotated immediately.',
    };

    return `${baseMessage}${rotationDetails} ${statusMessages[healthStatus] || ''}`;
  }

  private calculateDaysSinceLastRotation(keyMetadata: KeyMetadata): number {
    const now = new Date();
    const lastRotatedAt = keyMetadata.lastRotatedAt || keyMetadata.createdAt;
    return Math.floor((now.getTime() - lastRotatedAt.getTime()) / (1000 * 60 * 60 * 24));
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
      if (keyName === 'SYSTEM') continue;

      try {
        this.validateRotationConfig(keyMetadata.rotationConfig);
      } catch (error) {
        try {
          const errorAsError = error as Error;

          keyMetadata.rotationConfig = {
            maxAgeInDays: this.keyRotationConfig.maxAgeInDays,
            warningThresholdInDays: this.keyRotationConfig.warningThresholdInDays,
          };
          repairedKeys.push(keyName);

          await this.recordAuditEvent(
            keyName,
            'rotated',
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
      totalKeys: Object.keys(metadata).length - 1,
      repairedKeys,
      errors,
    };
  }

  public createEmptyAuditTrail(): AuditTrail {
    return {
      auditEvents: [],
      rotationHistory: [],
      healthCheckHistory: [],
    };
  }

  public createDefaultUsageTracking(): UsageTracking {
    return {
      environmentsUsedIn: [],
      dependentVariables: [],
    };
  }

  public createDefaultStatusTracking(): StatusTracking {
    return {
      currentStatus: 'healthy',
      lastStatusChange: new Date(),
    };
  }

  public hashKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  private calculateDaysUntilExpiry(keyMetadata: KeyMetadata): number {
    const ageInDays = this.calculateKeyAge(keyMetadata);
    return Math.max(0, keyMetadata.rotationConfig.maxAgeInDays - ageInDays);
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

    if (config.warningThresholdInDays >= config.maxAgeInDays) {
      ErrorHandler.logAndThrow(
        'Invalid rotation config: warningThresholdInDays must be less than maxAgeInDays',
        'validateRotationConfig',
      );
    }

    return config;
  }
}
