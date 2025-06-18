import {
  KeyMetadata,
  KeyRotationConfig,
  AuditTrail,
  UsageTracking,
  StatusTracking,
  AuditEvent,
  RotationEvent,
  HealthCheckEvent,
} from '../types/keyMetadata.types';
import logger from '../../utils/logging/loggerManager';

export class KeyMetadataRepositoryValidator {

  /**
     * Validates that the parsed object has the correct structure for multiple keys
     */
    public static validateMetadataRecord(metadata: unknown): metadata is Record<string, KeyMetadata> {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return false;
      }
  
      const metadataRecord = metadata as Record<string, unknown>;
      for (const [keyName, keyMetadata] of Object.entries(metadataRecord)) {
        if (!this.validateMetadata(keyMetadata as KeyMetadata)) {
          logger.warn(`Invalid metadata structure for key: ${keyName}`);
          return false;
        }
      }
      return true;
    }

  /**
   * Comprehensive metadata validation with detailed error logging
   */
  private static validateMetadata(metadata: KeyMetadata): boolean {
    try {
      // Basic structure validation
      if (!metadata || typeof metadata !== 'object') {
        console.error('Metadata validation failed: metadata is null, undefined, or not an object');
        return false;
      }

      // Required fields validation
      if (!metadata.keyName || typeof metadata.keyName !== 'string') {
        console.error('Metadata validation failed: keyName is missing or not a string');
        return false;
      }

      if (!metadata.createdAt || !(metadata.createdAt instanceof Date)) {
        console.error('Metadata validation failed: createdAt is missing or not a Date');
        return false;
      }

      if (typeof metadata.rotationCount !== 'number' || metadata.rotationCount < 0) {
        console.error('Metadata validation failed: rotationCount is missing or invalid');
        return false;
      }

      // Optional lastRotatedAt validation
      if (metadata.lastRotatedAt && !(metadata.lastRotatedAt instanceof Date)) {
        console.error('Metadata validation failed: lastRotatedAt is not a Date when provided');
        return false;
      }

      // Rotation config validation
      if (!this.validateRotationConfig(metadata.rotationConfig)) {
        console.error('Metadata validation failed: rotationConfig is invalid');
        return false;
      }

      // Audit trail validation
      if (!this.validateAuditTrail(metadata.auditTrail)) {
        console.error('Metadata validation failed: auditTrail is invalid');
        return false;
      }

      // Usage tracking validation
      if (!this.validateUsageTracking(metadata.usageTracking)) {
        console.error('Metadata validation failed: usageTracking is invalid');
        return false;
      }

      // Status tracking validation
      if (!this.validateStatusTracking(metadata.statusTracking)) {
        console.error('Metadata validation failed: statusTracking is invalid');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Metadata validation failed with exception:', error);
      return false;
    }
  }

  /**
   * Helper method to validate rotation config
   */
  private static validateRotationConfig(config: KeyRotationConfig): boolean {
    if (!config || typeof config !== 'object') {
      return false;
    }

    if (typeof config.maxAgeInDays !== 'number' || config.maxAgeInDays <= 0) {
      return false;
    }

    if (typeof config.warningThresholdInDays !== 'number' || config.warningThresholdInDays <= 0) {
      return false;
    }

    // Logical validation: warning threshold should be less than max age
    if (config.warningThresholdInDays >= config.maxAgeInDays) {
      return false;
    }

    return true;
  }

  /**
   * Helper method to validate audit trail
   */
  private static validateAuditTrail(auditTrail: AuditTrail): boolean {
    if (!auditTrail || typeof auditTrail !== 'object') {
      return false;
    }

    // Optional date fields validation
    if (auditTrail.lastScheduledCheck && !(auditTrail.lastScheduledCheck instanceof Date)) {
      return false;
    }

    if (auditTrail.lastHealthCheck && !(auditTrail.lastHealthCheck instanceof Date)) {
      return false;
    }

    if (auditTrail.lastWarningIssued && !(auditTrail.lastWarningIssued instanceof Date)) {
      return false;
    }

    // Required arrays validation
    if (!Array.isArray(auditTrail.auditTrail)) {
      return false;
    }

    if (!Array.isArray(auditTrail.rotationHistory)) {
      return false;
    }

    if (!Array.isArray(auditTrail.healthCheckHistory)) {
      return false;
    }

    // Validate audit events
    for (const event of auditTrail.auditTrail) {
      if (!this.validateAuditEvent(event)) {
        return false;
      }
    }

    // Validate rotation events
    for (const event of auditTrail.rotationHistory) {
      if (!this.validateRotationEvent(event)) {
        return false;
      }
    }

    // Validate health check events
    for (const event of auditTrail.healthCheckHistory) {
      if (!this.validateHealthCheckEvent(event)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Helper method to validate usage tracking
   */
  private static validateUsageTracking(usageTracking: UsageTracking): boolean {
    if (!usageTracking || typeof usageTracking !== 'object') {
      return false;
    }

    // Optional lastAccessedAt validation
    if (usageTracking.lastAccessedAt && !(usageTracking.lastAccessedAt instanceof Date)) {
      return false;
    }

    // Required arrays validation
    if (!Array.isArray(usageTracking.environmentsUsedIn)) {
      return false;
    }

    if (!Array.isArray(usageTracking.dependentVariables)) {
      return false;
    }

    // Validate array contents are strings
    for (const env of usageTracking.environmentsUsedIn) {
      if (typeof env !== 'string') {
        return false;
      }
    }

    for (const variable of usageTracking.dependentVariables) {
      if (typeof variable !== 'string') {
        return false;
      }
    }

    return true;
  }

  /**
   * Helper method to validate status tracking
   */
  private static validateStatusTracking(statusTracking: StatusTracking): boolean {
    if (!statusTracking || typeof statusTracking !== 'object') {
      return false;
    }

    // Validate current status enum
    const validStatuses = ['healthy', 'warning', 'critical', 'expired'];
    if (!validStatuses.includes(statusTracking.currentStatus)) {
      return false;
    }

    // Validate lastStatusChange
    if (!statusTracking.lastStatusChange || !(statusTracking.lastStatusChange instanceof Date)) {
      return false;
    }

    return true;
  }

  /**
   * Helper method to validate audit event
   */
  private static validateAuditEvent(event: AuditEvent): boolean {
    if (!event || typeof event !== 'object') {
      return false;
    }

    if (!(event.timestamp instanceof Date)) {
      return false;
    }

    const validEventTypes = [
      'created',
      'rotated',
      'accessed',
      'warning_issued',
      'expired',
      'health_check',
    ];
    if (!validEventTypes.includes(event.eventType)) {
      return false;
    }

    const validSeverities = ['info', 'warning', 'error', 'critical'];
    if (!validSeverities.includes(event.severity)) {
      return false;
    }

    if (typeof event.source !== 'string' || !event.source.trim()) {
      return false;
    }

    if (typeof event.details !== 'string') {
      return false;
    }

    // Optional metadata validation
    if (event.metadata && typeof event.metadata !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * Helper method to validate rotation event
   */
  private static validateRotationEvent(event: RotationEvent): boolean {
    if (!event || typeof event !== 'object') {
      return false;
    }

    if (!(event.timestamp instanceof Date)) {
      return false;
    }

    const validReasons = ['scheduled', 'manual', 'expired', 'security_breach', 'compromised'];
    if (!validReasons.includes(event.reason)) {
      return false;
    }

    if (!Array.isArray(event.affectedEnvironment)) {
      return false;
    }

    if (!Array.isArray(event.affectedVariables)) {
      return false;
    }

    if (typeof event.success !== 'boolean') {
      return false;
    }

    // Optional fields validation
    if (event.oldKeyHash && typeof event.oldKeyHash !== 'string') {
      return false;
    }

    if (event.newKeyHash && typeof event.newKeyHash !== 'string') {
      return false;
    }

    if (event.errorDetails && typeof event.errorDetails !== 'string') {
      return false;
    }

    if (event.overrideMode && typeof event.overrideMode !== 'boolean') {
      return false;
    }

    return true;
  }

  /**
   * Helper method to validate health check event
   */
  private static validateHealthCheckEvent(event: HealthCheckEvent): boolean {
    if (!event || typeof event !== 'object') {
      return false;
    }

    if (!(event.timestamp instanceof Date)) {
      return false;
    }

    if (typeof event.ageInDays !== 'number' || event.ageInDays < 0) {
      return false;
    }

    if (typeof event.daysUntilExpiry !== 'number') {
      return false;
    }

    const validStatuses = ['healthy', 'warning', 'critical', 'expired'];
    if (!validStatuses.includes(event.status)) {
      return false;
    }

    const validCheckSources = ['startup', 'scheduled', 'manual', 'api'];
    if (!validCheckSources.includes(event.checkSource)) {
      return false;
    }

    // Optional recommendations validation
    if (event.recommendations) {
      if (!Array.isArray(event.recommendations)) {
        return false;
      }
      for (const recommendation of event.recommendations) {
        if (typeof recommendation !== 'string') {
          return false;
        }
      }
    }

    return true;
  }
}
