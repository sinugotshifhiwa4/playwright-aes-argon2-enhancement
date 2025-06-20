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
  KeyMetrics,
  KeyRotationCheck,
} from '../types/keyManagement.types';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export class KeyLifecycleManager {
  public readonly keyRotationConfig: KeyRotationConfig;
  private environmentSecretFileManager: EnvironmentSecretFileManager;
  private keyMetadataRepository: KeyMetadataRepository;

  constructor(
    environmentSecretFileManager: EnvironmentSecretFileManager,
    keyMetadataRepository: KeyMetadataRepository,
    rotationConfig?: Partial<KeyRotationConfig>,
  ) {
    this.keyRotationConfig = {
      maxAgeInDays: rotationConfig?.maxAgeInDays ?? KeyRotationConfigDefaults.maxAgeInDays,
      warningThresholdInDays:
        rotationConfig?.warningThresholdInDays ?? KeyRotationConfigDefaults.warningThresholdInDays,
    };
    this.environmentSecretFileManager = environmentSecretFileManager;
    this.keyMetadataRepository = keyMetadataRepository;
  }

  public async checkAllKeysForRotation(): Promise<{
    keysNeedingRotation: string[];
    keysNeedingWarning: string[];
  }> {
    try {
      const metadata = await this.keyMetadataRepository.readKeyMetadata();
      const keyNames = Object.keys(metadata);

      const rotationChecks = await this.performRotationChecks(keyNames);

      this.logRotationAlerts(rotationChecks);

      return this.categorizeKeys(rotationChecks);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'checkAllKeysForRotation',
        'Failed to check keys for rotation',
      );
      throw error;
    }
  }

  private async performRotationChecks(keyNames: string[]): Promise<KeyRotationCheck[]> {
    const checks: KeyRotationCheck[] = [];

    for (const keyName of keyNames) {
      const status = await this.checkKeyRotationStatus(keyName, 'scheduled');
      checks.push({
        keyName,
        status,
      });
    }

    return checks;
  }

  private logRotationAlerts(rotationChecks: KeyRotationCheck[]): void {
    for (const check of rotationChecks) {
      if (check.status.needsRotation) {
        this.logSecurityAlert(check.keyName, check.status.ageInDays);
      } else if (check.status.needsWarning) {
        this.logWarningAlert(check.keyName, check.status.ageInDays, check.status.daysUntilRotation);
      }
    }
  }

  private logSecurityAlert(keyName: string, ageInDays: number): void {
    logger.error(
      `SECURITY ALERT: Key "${keyName}" is ${ageInDays} days old and MUST be rotated immediately!`,
    );
  }

  private logWarningAlert(keyName: string, ageInDays: number, daysUntilRotation: number): void {
    logger.warn(
      `Key "${keyName}" will expire in ${daysUntilRotation} days (current age: ${ageInDays} days). Consider rotating soon.`,
    );
  }

  private categorizeKeys(rotationChecks: KeyRotationCheck[]): {
    keysNeedingRotation: string[];
    keysNeedingWarning: string[];
  } {
    const keysNeedingRotation: string[] = [];
    const keysNeedingWarning: string[] = [];

    for (const check of rotationChecks) {
      if (check.status.needsRotation) {
        keysNeedingRotation.push(check.keyName);
      } else if (check.status.needsWarning) {
        keysNeedingWarning.push(check.keyName);
      }
    }

    return { keysNeedingRotation, keysNeedingWarning };
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
      const metadata = await this.keyMetadataRepository.readKeyMetadata();

      if (!metadata[keyName]) {
        logger.warn(`No metadata found for key: ${keyName} during audit trail update`);
        return;
      }

      const oldKeyHash = await this.getOldKeyHash(keyFilePath, keyName, success);
      const newKeyHash = this.hashKey(newKeyValue);

      this.ensureAuditTrailStructureForUpdate(metadata[keyName]);

      const auditEntry = this.createAuditEntry(
        startTime,
        reason,
        oldKeyHash,
        newKeyHash,
        rotationResult,
        processedVariableNames,
        success,
        shouldRotateKey,
        error,
      );

      metadata[keyName].auditTrail.rotationHistory.push(auditEntry);

      if (success && rotationResult.affectedFiles.length > 0) {
        await this.updateSuccessfulRotationMetadata(
          metadata[keyName],
          rotationResult,
          processedVariableNames,
        );
      }

      await this.keyMetadataRepository.updateSingleKeyMetadata(keyName, metadata[keyName]);

      if (success) {
        await this.recordSuccessfulRotationAuditEvent(
          keyName,
          reason,
          rotationResult,
          metadata[keyName].rotationCount,
          shouldRotateKey,
          processedVariableNames,
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

  private async getOldKeyHash(
    keyFilePath: string,
    keyName: string,
    success: boolean,
  ): Promise<string | undefined> {
    if (success) {
      return undefined;
    }

    const currentKeyValue = await this.environmentSecretFileManager.getKeyValue(
      keyFilePath,
      keyName,
    );

    return currentKeyValue ? this.hashKey(currentKeyValue) : undefined;
  }

 private ensureAuditTrailStructureForUpdate(keyMetadata: KeyMetadata): void {
  if (!keyMetadata.auditTrail) {
    keyMetadata.auditTrail = this.createEmptyAuditTrail();
    logger.debug('Initialized empty audit trail structure for update operation');
  }

  if (!keyMetadata.auditTrail.rotationHistory) {
    keyMetadata.auditTrail.rotationHistory = [];
    logger.debug('Initialized rotation history array for audit trail update');
  }
}

  private createAuditEntry(
    startTime: Date,
    reason: RotationReason,
    oldKeyHash: string | undefined,
    newKeyHash: string,
    rotationResult: RotationResult,
    processedVariableNames: string[] | undefined,
    success: boolean,
    shouldRotateKey: boolean,
    error?: Error,
  ): RotationEvent {
    const affectedVariables = processedVariableNames || [];
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
    };

    if (error) {
      auditEntry.errorDetails = error.message;
    }

    return auditEntry;
  }

  private async updateSuccessfulRotationMetadata(
    keyMetadata: KeyMetadata,
    rotationResult: RotationResult,
    processedVariableNames: string[] | undefined,
  ): Promise<void> {
    this.updateUsageTrackingForRotation(keyMetadata, rotationResult, processedVariableNames);
    this.updateInitialAuditEntry(keyMetadata, rotationResult, processedVariableNames);
  }

private updateUsageTrackingForRotation(
  keyMetadata: KeyMetadata,
  rotationResult: RotationResult,
  processedVariableNames: string[] | undefined,
): void {
  // Update environments affected by rotation
  for (const envFile of rotationResult.affectedFiles) {
    if (!keyMetadata.usageTracking.environmentsUsedIn.includes(envFile)) {
      keyMetadata.usageTracking.environmentsUsedIn.push(envFile);
      logger.debug(`Added environment ${envFile} to usage tracking during rotation`);
    }
  }

  // Track variables that were rotated
  if (processedVariableNames && processedVariableNames.length > 0) {
    const existingVars = new Set(keyMetadata.usageTracking.dependentVariables);
    const newVarsAdded: string[] = [];
    
    processedVariableNames.forEach((varName) => {
      if (!existingVars.has(varName)) {
        newVarsAdded.push(varName);
      }
      existingVars.add(varName);
    });
    
    keyMetadata.usageTracking.dependentVariables = Array.from(existingVars);
    
    if (newVarsAdded.length > 0) {
      logger.info(`Rotation tracked new dependent variables: ${newVarsAdded.join(', ')}`);
    }
  }

  keyMetadata.usageTracking.lastAccessedAt = new Date();
  logger.debug('Updated last accessed timestamp during rotation');
}

  private updateInitialAuditEntry(
    keyMetadata: KeyMetadata,
    rotationResult: RotationResult,
    processedVariableNames: string[] | undefined,
  ): void {
    if (!processedVariableNames || processedVariableNames.length === 0) {
      return;
    }

    const initialAuditEntry = this.findInitialAuditEntry(keyMetadata.auditTrail.rotationHistory);

    if (initialAuditEntry) {
      initialAuditEntry.affectedEnvironments = [...rotationResult.affectedFiles];
      initialAuditEntry.affectedVariables = processedVariableNames;

      logger.info(`Updated initial audit entry for key with usage information`);
    }
  }

  private findInitialAuditEntry(rotationHistory: RotationEvent[]): RotationEvent | undefined {
    return rotationHistory
      .sort((a: RotationEvent, b: RotationEvent) => a.timestamp.getTime() - b.timestamp.getTime())
      .find(
        (entry: RotationEvent) =>
          Array.isArray(entry.affectedEnvironments) &&
          Array.isArray(entry.affectedVariables) &&
          entry.affectedEnvironments.length === 0 &&
          entry.affectedVariables.length === 0,
      );
  }

  private async recordSuccessfulRotationAuditEvent(
    keyName: string,
    reason: RotationReason,
    rotationResult: RotationResult,
    rotationCount: number,
    shouldRotateKey: boolean,
    processedVariableNames: string[] | undefined,
  ): Promise<void> {
    const auditEventMetadata: Record<string, unknown> = {
      reason,
      affectedEnvironments: rotationResult.affectedFiles,
      reEncryptedCount: rotationResult.reEncryptedCount,
      rotationCount,
      overrideMode: shouldRotateKey,
      affectedVariables: processedVariableNames || [],
    };

    const variablesList = (processedVariableNames || []).join(', ');
    const message = `Key rotated successfully. Reason: ${reason}. Re-encrypted ${rotationResult.reEncryptedCount} variables: ${variablesList}. Override mode: ${shouldRotateKey}`;

    await this.recordAuditEvent(
      keyName,
      'rotated',
      'info',
      'rotateKeyWithAudit',
      message,
      auditEventMetadata,
    );
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
      const metadata = await this.keyMetadataRepository.readKeyMetadata();
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
      const fileContent =
        await this.environmentSecretFileManager.getOrCreateBaseEnvFileContent(filePath);
      const keyExists = this.checkIfKeyExists(fileContent, keyName);

      if (keyExists && !shouldRotateKey) {
        this.logKeyAlreadyExists(keyName);
        return;
      }

      const effectiveMaxAge = this.calculateEffectiveMaxAge(customMaxAge);
      const updatedFileContent = this.updateFileContent(
        fileContent,
        keyName,
        keyValue,
        keyExists,
        shouldRotateKey,
      );

      await this.writeUpdatedFileContent(filePath, updatedFileContent, keyName);
      await this.updateKeyMetadata(
        keyName,
        customMaxAge,
        keyExists,
        shouldRotateKey,
        environmentsUsedIn,
        dependentVariables,
      );
      await this.recordKeyStorageAuditEvent(
        keyName,
        shouldRotateKey,
        effectiveMaxAge,
        environmentsUsedIn,
        dependentVariables,
      );

      this.logSuccessfulKeyOperation(keyName, shouldRotateKey);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'storeBaseEnvironmentKey',
        `Failed to store key "${keyName}" in environment file.`,
      );
      throw error;
    }
  }

  private checkIfKeyExists(fileContent: string, keyName: string): boolean {
    const keyRegex = new RegExp(`^${keyName}=.*`, 'm');
    return keyRegex.test(fileContent);
  }

  private logKeyAlreadyExists(keyName: string): void {
    logger.info(
      `The environment variable "${keyName}" already exists. Delete it or set shouldRotateKey=true to regenerate.`,
    );
  }

  private calculateEffectiveMaxAge(customMaxAge?: number): number {
    return customMaxAge || this.keyRotationConfig.maxAgeInDays;
  }

  private updateFileContent(
    fileContent: string,
    keyName: string,
    keyValue: string,
    keyExists: boolean,
    shouldRotateKey: boolean,
  ): string {
    if (keyExists && shouldRotateKey) {
      return this.rotateExistingKey(fileContent, keyName, keyValue);
    } else {
      return this.addNewKey(fileContent, keyName, keyValue);
    }
  }

  private rotateExistingKey(fileContent: string, keyName: string, keyValue: string): string {
    const keyRegex = new RegExp(`^${keyName}=.*`, 'm');
    const updatedContent = fileContent.replace(keyRegex, `${keyName}=${keyValue}`);
    logger.info(`Environment variable "${keyName}" has been rotated (overwritten).`);
    return updatedContent;
  }

  private addNewKey(fileContent: string, keyName: string, keyValue: string): string {
    let updatedContent = fileContent;

    if (updatedContent && !updatedContent.endsWith('\n')) {
      updatedContent += '\n';
    }

    updatedContent += `${keyName}=${keyValue}`;

    const effectiveMaxAge = this.keyRotationConfig.maxAgeInDays;
    const rotationInfo = `with default rotation (${effectiveMaxAge} days)`;
    logger.info(`Secret key "${keyName}" generated and stored ${rotationInfo}`);

    return updatedContent;
  }

  private async writeUpdatedFileContent(
    filePath: string,
    fileContent: string,
    keyName: string,
  ): Promise<void> {
    await this.environmentSecretFileManager.writeSecretKeyVariableToBaseEnvFile(
      filePath,
      fileContent,
      keyName,
    );
  }

  private async updateKeyMetadata(
    keyName: string,
    customMaxAge: number | undefined,
    keyExists: boolean,
    shouldRotateKey: boolean,
    environmentsUsedIn: string[],
    dependentVariables: string[],
  ): Promise<void> {
    const metadata = await this.keyMetadataRepository.readKeyMetadata();
    const rotationConfig = this.createRotationConfig(customMaxAge);
    const validatedConfig = this.validateRotationConfig(rotationConfig);

    metadata[keyName] = this.createKeyMetadata(
      keyName,
      validatedConfig,
      keyExists,
      shouldRotateKey,
      environmentsUsedIn,
      dependentVariables,
      metadata[keyName]?.rotationCount,
    );

    await this.keyMetadataRepository.writeKeyMetadata(metadata);
  }

  private createRotationConfig(customMaxAge?: number): KeyRotationConfig {
    return {
      maxAgeInDays: customMaxAge || this.keyRotationConfig.maxAgeInDays,
      warningThresholdInDays: this.keyRotationConfig.warningThresholdInDays,
    };
  }

  private createKeyMetadata(
    keyName: string,
    rotationConfig: KeyRotationConfig,
    keyExists: boolean,
    shouldRotateKey: boolean,
    environmentsUsedIn: string[],
    dependentVariables: string[],
    existingRotationCount?: number,
  ): KeyMetadata {
    const rotationCount = this.calculateRotationCount(
      keyExists,
      shouldRotateKey,
      existingRotationCount,
    );

    return {
      keyName,
      createdAt: new Date(),
      rotationCount,
      lastRotatedAt: shouldRotateKey ? new Date() : undefined,
      rotationConfig,
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
  }

  private calculateRotationCount(
    keyExists: boolean,
    shouldRotateKey: boolean,
    existingRotationCount?: number,
  ): number {
    if (keyExists && shouldRotateKey) {
      return (existingRotationCount ?? 0) + 1;
    }
    return 0;
  }

  private async recordKeyStorageAuditEvent(
    keyName: string,
    shouldRotateKey: boolean,
    effectiveMaxAge: number,
    environmentsUsedIn: string[],
    dependentVariables: string[],
  ): Promise<void> {
    const eventType = shouldRotateKey ? 'rotated' : 'created';
    const eventMessage = `Secret key ${eventType} with ${effectiveMaxAge}-day rotation period`;

    await this.recordAuditEvent(
      keyName,
      eventType,
      'info',
      'storeBaseEnvironmentKey',
      eventMessage,
      {
        initialMaxAge: effectiveMaxAge,
        environmentsUsedIn,
        dependentVariables,
      },
    );
  }

  private logSuccessfulKeyOperation(keyName: string, shouldRotateKey: boolean): void {
    const operation = shouldRotateKey ? 'rotated' : 'created';
    logger.info(
      `Environment variable "${keyName}" ${operation} successfully with rotation tracking.`,
    );
  }

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
      const keyMetadata = await this.getKeyMetadata(keyName);

      if (!keyMetadata) {
        return this.createDefaultRotationStatus();
      }

      const ageInDays = this.calculateKeyAge(keyMetadata);
      const validatedConfig = this.getValidatedRotationConfig(keyName, keyMetadata);
      const rotationStatus = this.calculateRotationStatus(ageInDays, validatedConfig);

      await this.processHealthCheckAndAudit(keyName, rotationStatus, checkSource);

      return rotationStatus;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'checkKeyRotationStatus',
        `Failed to check rotation status for key "${keyName}"`,
      );
      throw error;
    }
  }

  private async getKeyMetadata(keyName: string): Promise<KeyMetadata | undefined> {
    const metadata = await this.keyMetadataRepository.readKeyMetadata();
    return metadata[keyName];
  }

  private createDefaultRotationStatus(): {
    needsRotation: boolean;
    needsWarning: boolean;
    ageInDays: number;
    daysUntilRotation: number;
  } {
    return {
      needsRotation: false,
      needsWarning: false,
      ageInDays: 0,
      daysUntilRotation: this.keyRotationConfig.maxAgeInDays,
    };
  }

  private getValidatedRotationConfig(keyName: string, keyMetadata: KeyMetadata): KeyRotationConfig {
    try {
      return this.validateRotationConfig(keyMetadata.rotationConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Invalid rotation config for key "${keyName}", using defaults: ${errorMessage}`);
      return this.keyRotationConfig;
    }
  }

  private calculateRotationStatus(
    ageInDays: number,
    config: KeyRotationConfig,
  ): {
    needsRotation: boolean;
    needsWarning: boolean;
    ageInDays: number;
    daysUntilRotation: number;
  } {
    const maxAge = config.maxAgeInDays;
    const daysUntilRotation = maxAge - ageInDays;
    const needsRotation = ageInDays >= maxAge;
    const needsWarning =
      daysUntilRotation <= this.keyRotationConfig.warningThresholdInDays && !needsRotation;

    return {
      needsRotation,
      needsWarning,
      ageInDays,
      daysUntilRotation: Math.max(0, daysUntilRotation),
    };
  }

  private async processHealthCheckAndAudit(
    keyName: string,
    status: {
      needsRotation: boolean;
      needsWarning: boolean;
      ageInDays: number;
      daysUntilRotation: number;
    },
    checkSource: CheckSource,
  ): Promise<void> {
    const { healthStatus, recommendations } = this.determineHealthStatusAndRecommendations(status);

    await this.recordHealthCheck(
      keyName,
      status.ageInDays,
      status.daysUntilRotation,
      healthStatus,
      checkSource,
      recommendations,
    );

    await this.recordRotationAuditEvents(keyName, status);
  }

  private determineHealthStatusAndRecommendations(status: {
    needsRotation: boolean;
    needsWarning: boolean;
    daysUntilRotation: number;
  }): { healthStatus: KeyStatus; recommendations: string[] } {
    const recommendations: string[] = [];
    let healthStatus: KeyStatus;

    if (status.needsRotation) {
      healthStatus = 'critical';
      recommendations.push('Immediate rotation required');
    } else if (status.needsWarning) {
      healthStatus = 'warning';
      recommendations.push(`Consider rotating within ${status.daysUntilRotation} days`);
    } else {
      healthStatus = 'healthy';
    }

    return { healthStatus, recommendations };
  }

  private async recordRotationAuditEvents(
    keyName: string,
    status: {
      needsRotation: boolean;
      needsWarning: boolean;
      ageInDays: number;
      daysUntilRotation: number;
    },
  ): Promise<void> {
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
      const metadata = await this.keyMetadataRepository.readKeyMetadata();
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
      const metadata = await this.keyMetadataRepository.readKeyMetadata();
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

      await this.keyMetadataRepository.writeKeyMetadata(metadata);
    } catch (error) {
      logger.error('Failed to record audit event', error);
    }
  }

  private async recordHealthCheck(
    keyName: string,
    ageInDays: number,
    daysUntilExpiry: number,
    status: KeyStatus,
    checkSource: CheckSource,
    recommendations?: string[],
  ): Promise<void> {
    try {
      const metadata = await this.keyMetadataRepository.readKeyMetadata();
      if (!metadata[keyName]) return;

      this.ensureAuditTrailStructureForHealthCheck(metadata[keyName]);
      this.addHealthCheckEntryForMonitoring(
        metadata[keyName],
        ageInDays,
        daysUntilExpiry,
        status,
        checkSource,
        recommendations,
      );
      this.updateStatusIfChanged(metadata[keyName], status);
      this.trimHealthCheckHistoryForMonitoring(metadata[keyName]);

      await this.keyMetadataRepository.writeKeyMetadata(metadata);
    } catch (error) {
      logger.error('Failed to record health check', error);
    }
  }

 private ensureAuditTrailStructureForHealthCheck(keyMetadata: KeyMetadata): void {
  if (!keyMetadata.auditTrail) {
    keyMetadata.auditTrail = this.createEmptyAuditTrail();
    logger.debug('Initialized audit trail for health check recording');
  }

  if (!keyMetadata.auditTrail.healthCheckHistory) {
    keyMetadata.auditTrail.healthCheckHistory = [];
    logger.debug('Initialized health check history for monitoring');
  }

  if (!keyMetadata.auditTrail.auditEvents) {
    keyMetadata.auditTrail.auditEvents = [];
    logger.debug('Initialized audit events array for health check');
  }
}

  private addHealthCheckEntryForMonitoring(
  keyMetadata: KeyMetadata,
  ageInDays: number,
  daysUntilExpiry: number,
  status: KeyStatus,
  checkSource: CheckSource,
  recommendations?: string[],
): void {
  const healthCheckEntry: HealthCheckEvent = {
    timestamp: new Date(),
    ageInDays,
    daysUntilExpiry,
    status,
    checkSource,
    recommendations,
  };

  keyMetadata.auditTrail.healthCheckHistory.push(healthCheckEntry);
  keyMetadata.auditTrail.lastHealthCheck = new Date();
  
  logger.debug(`Recorded health check: status=${status}, source=${checkSource}, age=${ageInDays}d`);
  
  if (recommendations && recommendations.length > 0) {
    logger.info(`Health check recommendations for key: ${recommendations.join('; ')}`);
  }
}

  private updateStatusIfChanged(keyMetadata: KeyMetadata, newStatus: KeyStatus): void {
    if (!keyMetadata.statusTracking) {
      keyMetadata.statusTracking = this.createDefaultStatusTracking();
      return;
    }

    if (keyMetadata.statusTracking.currentStatus !== newStatus) {
      keyMetadata.statusTracking.currentStatus = newStatus;
      keyMetadata.statusTracking.lastStatusChange = new Date();
    }
  }

private trimHealthCheckHistoryForMonitoring(keyMetadata: KeyMetadata): void {
  const MAX_HEALTH_CHECK_ENTRIES = 50;
  const history = keyMetadata.auditTrail.healthCheckHistory;

  if (history.length > MAX_HEALTH_CHECK_ENTRIES) {
    const removedCount = history.length - MAX_HEALTH_CHECK_ENTRIES;
    keyMetadata.auditTrail.healthCheckHistory = history.slice(-MAX_HEALTH_CHECK_ENTRIES);
    logger.debug(`Trimmed ${removedCount} old health check entries for monitoring`);
  }
}

  public async performComprehensiveAudit(): Promise<{
    systemHealth: SystemHealth;
    keysNeedingRotation: string[];
    keysNeedingWarning: string[];
    expiredKeys: string[];
    auditSummary: AuditSummary;
    recommendations: string[];
  }> {
    const { keysNeedingRotation, keysNeedingWarning } = await this.checkAllKeysForRotation();
    const metadata = await this.keyMetadataRepository.readKeyMetadata();
    const allKeys = this.getAllNonSystemKeys(metadata);

    const expiredKeys = this.identifyExpiredKeys(allKeys, metadata);
    const keyMetrics = this.calculateKeyMetrics(allKeys, metadata);
    const systemHealth = this.determineSystemHealth(
      keysNeedingRotation.length,
      keysNeedingWarning.length,
    );
    const recommendations = this.generateAuditRecommendations(
      keysNeedingRotation.length,
      keysNeedingWarning.length,
      keyMetrics.averageKeyAge,
    );

    const auditSummary = this.createAuditSummary(
      allKeys.length,
      keysNeedingRotation.length,
      keysNeedingWarning.length,
      expiredKeys.length,
      keyMetrics,
      systemHealth,
    );

    return {
      systemHealth,
      keysNeedingRotation,
      keysNeedingWarning,
      expiredKeys,
      auditSummary,
      recommendations,
    };
  }

  private getAllNonSystemKeys(metadata: Record<string, KeyMetadata>): string[] {
    return Object.keys(metadata).filter((key) => key !== 'SYSTEM');
  }

  private identifyExpiredKeys(allKeys: string[], metadata: Record<string, KeyMetadata>): string[] {
    const expiredKeys: string[] = [];

    for (const keyName of allKeys) {
      if (this.isKeyExpired(keyName, metadata)) {
        expiredKeys.push(keyName);
      }
    }

    return expiredKeys;
  }

  private isKeyExpired(keyName: string, metadata: Record<string, KeyMetadata>): boolean {
    const keyAge = this.calculateKeyAge(metadata[keyName]);
    const maxAge =
      metadata[keyName].rotationConfig?.maxAgeInDays ?? this.keyRotationConfig.maxAgeInDays;
    return keyAge >= maxAge;
  }

  private calculateKeyMetrics(
    allKeys: string[],
    metadata: Record<string, KeyMetadata>,
  ): KeyMetrics {
    if (allKeys.length === 0) {
      return {
        averageKeyAge: 0,
        oldestKeyAge: 0,
        newestKeyAge: 0,
      };
    }

    const keyAges = allKeys.map((keyName) => this.calculateKeyAge(metadata[keyName]));

    return {
      averageKeyAge: keyAges.reduce((a, b) => a + b, 0) / keyAges.length,
      oldestKeyAge: Math.max(...keyAges),
      newestKeyAge: Math.min(...keyAges),
    };
  }

  private determineSystemHealth(criticalKeys: number, warningKeys: number): SystemHealth {
    if (criticalKeys > 0) {
      return 'critical';
    } else if (warningKeys > 0) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  private generateAuditRecommendations(
    criticalKeys: number,
    warningKeys: number,
    averageKeyAge: number,
  ): string[] {
    const recommendations: string[] = [];

    if (criticalKeys > 0) {
      recommendations.push(`${criticalKeys} key(s) require immediate rotation`);
    }

    if (warningKeys > 0) {
      recommendations.push(`${warningKeys} key(s) should be rotated soon`);
    }

    if (this.shouldReduceRotationInterval(averageKeyAge)) {
      recommendations.push('Consider reducing key rotation intervals');
    }

    return recommendations;
  }

  private shouldReduceRotationInterval(averageKeyAge: number): boolean {
    const threshold = this.keyRotationConfig.maxAgeInDays * 0.8;
    return averageKeyAge > threshold;
  }

  private createAuditSummary(
    totalKeys: number,
    criticalKeys: number,
    warningKeys: number,
    expiredKeysCount: number,
    keyMetrics: KeyMetrics,
    systemHealth: SystemHealth,
  ): AuditSummary {
    const healthyKeys = totalKeys - criticalKeys - warningKeys - expiredKeysCount;

    return {
      totalKeys,
      healthyKeys,
      warningKeys,
      criticalKeys,
      expiredKeys: expiredKeysCount,
      averageKeyAge: Math.round(keyMetrics.averageKeyAge * 100) / 100,
      oldestKeyAge: keyMetrics.oldestKeyAge,
      newestKeyAge: keyMetrics.newestKeyAge,
      totalAuditEvents: 0, // Could compute total audit events across all keys if needed
      totalRotations: 0, // Could compute total rotations across all keys if needed
      lastRotation: undefined, // Could compute if needed
      lastHealthCheck: undefined, // Could compute if needed
      lastAccess: undefined, // Could compute if needed
      currentStatus: systemHealth,
    };
  }

  /**
   * Records key access for usage tracking
   */
  public async recordKeyAccess(keyName: string, accessSource: string): Promise<void> {
    try {
      const metadata = await this.keyMetadataRepository.readKeyMetadata();
      if (!metadata[keyName]) return;

      if (!metadata[keyName].usageTracking) {
        metadata[keyName].usageTracking = {
          environmentsUsedIn: [],
          dependentVariables: [],
        };
      }

      metadata[keyName].usageTracking.lastAccessedAt = new Date();
      await this.keyMetadataRepository.writeKeyMetadata(metadata);

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

  public async addHealthCheckEntry(
    keyName: string,
    keyMetadata: KeyMetadata,
    success: boolean,
    reason: string,
    rotationResult?: RotationResult,
  ): Promise<void> {
    try {
      this.initializeHealthCheckHistory(keyMetadata);

      const healthCheckEntry = this.createHealthCheckEntry(
        keyMetadata,
        success,
        reason,
        rotationResult,
      );
      this.addHealthCheckToHistory(keyMetadata, healthCheckEntry);
      this.updateKeyStatus(keyMetadata, healthCheckEntry.status);

      if (rotationResult) {
        this.addRotationAuditEvent(
          keyMetadata,
          success,
          reason,
          healthCheckEntry.status,
          rotationResult,
        );
      }
    } catch (error) {
      logger.error(`Failed to add health check entry for key ${keyName}: ${error}`);
    }
  }

  private initializeHealthCheckHistory(keyMetadata: KeyMetadata): void {
    if (!keyMetadata.auditTrail.healthCheckHistory) {
      keyMetadata.auditTrail.healthCheckHistory = [];
    }
  }

  private createHealthCheckEntry(
    keyMetadata: KeyMetadata,
    success: boolean,
    reason: string,
    rotationResult?: RotationResult,
  ): HealthCheckEvent {
    const healthStatus = this.determineHealthStatus(keyMetadata, success, reason);
    const checkSource = this.determineCheckSource(reason);
    const ageInDays = this.calculateKeyAge(keyMetadata);
    const daysUntilExpiry = this.calculateDaysUntilExpiry(keyMetadata);

    return {
      timestamp: new Date(),
      ageInDays,
      daysUntilExpiry,
      status: healthStatus,
      checkSource,
      recommendations: this.generateRecommendations(healthStatus, reason, rotationResult),
    };
  }

  private determineCheckSource(reason: string): CheckSource {
    switch (reason) {
      case 'manual':
        return 'manual';
      case 'scheduled':
        return 'scheduled';
      case 'health_check':
        return 'api';
      default:
        return 'api';
    }
  }

  private addHealthCheckToHistory(
    keyMetadata: KeyMetadata,
    healthCheckEntry: HealthCheckEvent,
  ): void {
    keyMetadata.auditTrail.healthCheckHistory.push(healthCheckEntry);
    this.trimHealthCheckHistoryForRotation(keyMetadata);
  }

 private trimHealthCheckHistoryForRotation(keyMetadata: KeyMetadata): void {
  const MAX_ROTATION_HEALTH_ENTRIES = 25; // Smaller limit for rotation-specific entries
  const history = keyMetadata.auditTrail.healthCheckHistory;

  if (history.length > MAX_ROTATION_HEALTH_ENTRIES) {
    const removedCount = history.length - MAX_ROTATION_HEALTH_ENTRIES;
    keyMetadata.auditTrail.healthCheckHistory = history.slice(-MAX_ROTATION_HEALTH_ENTRIES);
    logger.debug(`Trimmed ${removedCount} health check entries post-rotation`);
  }
}

  private updateKeyStatus(keyMetadata: KeyMetadata, healthStatus: KeyStatus): void {
    keyMetadata.statusTracking.currentStatus = healthStatus;
    keyMetadata.statusTracking.lastStatusChange = new Date();
  }

  private addRotationAuditEvent(
    keyMetadata: KeyMetadata,
    success: boolean,
    reason: string,
    healthStatus: KeyStatus,
    rotationResult: RotationResult,
  ): void {
    const auditEvent = this.createRotationAuditEvent(
      keyMetadata,
      success,
      reason,
      healthStatus,
      rotationResult,
    );
    keyMetadata.auditTrail.auditEvents.push(auditEvent);
  }

  private createRotationAuditEvent(
    keyMetadata: KeyMetadata,
    success: boolean,
    reason: string,
    healthStatus: KeyStatus,
    rotationResult: RotationResult,
  ): AuditEvent {
    const ageInDays = this.calculateKeyAge(keyMetadata);

    return {
      timestamp: new Date(),
      eventType: 'health_check',
      severity: this.determineSeverityFromHealthStatus(healthStatus),
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
  }

  private determineSeverityFromHealthStatus(healthStatus: string): 'critical' | 'warning' | 'info' {
    switch (healthStatus) {
      case 'critical':
        return 'critical';
      case 'warning':
        return 'warning';
      default:
        return 'info';
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

    // return `${baseMessage}${rotationDetails} ${statusMessages[healthStatus] || ''}`;
    return KeyLifecycleManager.formatHealthCheckDetails(
      baseMessage,
      rotationDetails,
      statusMessages,
      healthStatus,
    );
  }

  private static formatHealthCheckDetails(
    baseMessage: string,
    rotationDetails: string,
    statusMessages: Record<KeyStatus, string>,
    healthStatus: KeyStatus,
  ): string {
    return `${baseMessage}${rotationDetails} ${statusMessages[healthStatus] || ''}`;
  }

  public async validateAndRepairAllMetadata(): Promise<{
    totalKeys: number;
    repairedKeys: string[];
    errors: Array<{ keyName: string; error: string }>;
  }> {
    const metadata = await this.keyMetadataRepository.readKeyMetadata();
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
      await this.keyMetadataRepository.writeKeyMetadata(metadata);
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

  private calculateDaysSinceLastRotation(keyMetadata: KeyMetadata): number {
    const now = new Date();
    const lastRotatedAt = keyMetadata.lastRotatedAt || keyMetadata.createdAt;
    return Math.floor((now.getTime() - lastRotatedAt.getTime()) / (1000 * 60 * 60 * 24));
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
