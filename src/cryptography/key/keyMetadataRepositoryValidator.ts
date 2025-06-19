import {
  KeyMetadata,
  KeyRotationConfig,
  AuditTrail,
  UsageTracking,
  StatusTracking,
  AuditEvent,
  RotationEvent,
  HealthCheckEvent,
  KeyStatus,
  EventType,
  EventSeverity,
  RotationReason,
  CheckSource,
} from '../types/keyManagement.types';
import logger from '../../utils/logging/loggerManager';

export class KeyMetadataRepositoryValidator {
  // Use proper readonly arrays with specific types
  private static readonly VALID_STATUSES: readonly KeyStatus[] = [
    'healthy',
    'warning',
    'critical',
    'expired',
  ];
  private static readonly VALID_EVENT_TYPES: readonly EventType[] = [
    'created',
    'rotated',
    'accessed',
    'warning_issued',
    'expired',
    'health_check',
  ];
  private static readonly VALID_SEVERITIES: readonly EventSeverity[] = [
    'info',
    'warning',
    'error',
    'critical',
  ];
  private static readonly VALID_ROTATION_REASONS: readonly RotationReason[] = [
    'scheduled',
    'manual',
    'expired',
    'security_breach',
    'compromised',
  ];
  private static readonly VALID_CHECK_SOURCES: readonly CheckSource[] = [
    'startup',
    'scheduled',
    'manual',
    'api',
  ];

  /**
   * Type guard to check if a value is a valid status
   */
  private static isValidStatus(value: unknown): value is KeyStatus {
    return typeof value === 'string' && this.VALID_STATUSES.includes(value as KeyStatus);
  }

  /**
   * Type guard to check if a value is a valid event type
   */
  private static isValidEventType(value: unknown): value is EventType {
    return typeof value === 'string' && this.VALID_EVENT_TYPES.includes(value as EventType);
  }

  /**
   * Type guard to check if a value is a valid severity
   */
  private static isValidSeverity(value: unknown): value is EventSeverity {
    return typeof value === 'string' && this.VALID_SEVERITIES.includes(value as EventSeverity);
  }

  /**
   * Type guard to check if a value is a valid rotation reason
   */
  private static isValidRotationReason(value: unknown): value is RotationReason {
    return (
      typeof value === 'string' &&
      this.VALID_ROTATION_REASONS.includes(value as RotationReason)
    );
  }

  /**
   * Type guard to check if a value is a valid check source
   */
  private static isValidCheckSource(value: unknown): value is CheckSource {
    return (
      typeof value === 'string' && this.VALID_CHECK_SOURCES.includes(value as CheckSource)
    );
  }

  /**
   * Type guard to check if value is a non-empty string
   */
  private static isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * Type guard to check if value is a valid Date
   */
  private static isValidDate(value: unknown): value is Date {
    return value instanceof Date && !isNaN(value.getTime());
  }

  /**
   * Type guard to check if value is a positive number
   */
  private static isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value) && value >= 0;
  }

  /**
   * Type guard to check if value is an array of strings
   */
  private static isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item): item is string => typeof item === 'string');
  }

  /**
   * Validates that the parsed object has the correct structure for multiple keys
   */
  public static validateMetadataRecord(metadata: unknown): metadata is Record<string, KeyMetadata> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return false;
    }

    const metadataRecord = metadata as Record<string, unknown>;
    for (const [keyName, keyMetadata] of Object.entries(metadataRecord)) {
      if (!this.validateMetadata(keyMetadata)) {
        logger.warn(`Invalid metadata structure for key: ${keyName}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Comprehensive metadata validation with type guards
   */
  private static validateMetadata(metadata: unknown): metadata is KeyMetadata {
    try {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        logger.error('Metadata validation failed: metadata is not a valid object');
        return false;
      }

      const meta = metadata as Partial<KeyMetadata>;

      return (
        this.validateBasicStructure(meta) &&
        this.validateRotationConfig(meta.rotationConfig) &&
        this.validateAuditTrail(meta.auditTrail) &&
        this.validateUsageTracking(meta.usageTracking) &&
        this.validateStatusTracking(meta.statusTracking)
      );
    } catch (error) {
      logger.error('Metadata validation failed with exception:', error);
      return false;
    }
  }

  /**
   * Validates basic metadata structure with proper type checking
   */
  private static validateBasicStructure(metadata: Partial<KeyMetadata>): boolean {
    // Required string field
    if (!this.isNonEmptyString(metadata.keyName)) {
      logger.error('Metadata validation failed: keyName must be a non-empty string');
      return false;
    }

    // Required date field
    if (!this.isValidDate(metadata.createdAt)) {
      logger.error('Metadata validation failed: createdAt must be a valid Date');
      return false;
    }

    // Required number field
    if (!this.isPositiveNumber(metadata.rotationCount)) {
      logger.error('Metadata validation failed: rotationCount must be a non-negative number');
      return false;
    }

    // Optional date field
    if (metadata.lastRotatedAt !== undefined && !this.isValidDate(metadata.lastRotatedAt)) {
      logger.error('Metadata validation failed: lastRotatedAt must be a Date when provided');
      return false;
    }

    return true;
  }

  /**
   * Validates rotation config with proper type guards
   */
  private static validateRotationConfig(config: unknown): config is KeyRotationConfig {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      logger.error('Metadata validation failed: rotationConfig must be an object');
      return false;
    }

    const rotationConfig = config as Partial<KeyRotationConfig>;

    if (!this.isPositiveNumber(rotationConfig.maxAgeInDays) || rotationConfig.maxAgeInDays === 0) {
      logger.error('Metadata validation failed: maxAgeInDays must be a positive number');
      return false;
    }

    if (
      !this.isPositiveNumber(rotationConfig.warningThresholdInDays) ||
      rotationConfig.warningThresholdInDays === 0
    ) {
      logger.error('Metadata validation failed: warningThresholdInDays must be a positive number');
      return false;
    }

    // Logical validation
    if (rotationConfig.warningThresholdInDays >= rotationConfig.maxAgeInDays) {
      logger.error(
        'Metadata validation failed: warningThresholdInDays must be less than maxAgeInDays',
      );
      return false;
    }

    return true;
  }

  /**
   * Validates audit trail with proper type checking
   */
  private static validateAuditTrail(auditTrail: unknown): auditTrail is AuditTrail {
    if (!auditTrail || typeof auditTrail !== 'object' || Array.isArray(auditTrail)) {
      logger.error('Metadata validation failed: auditTrail must be an object');
      return false;
    }

    const audit = auditTrail as Partial<AuditTrail>;

    // Validate optional date fields
    if (audit.lastScheduledCheck !== undefined && !this.isValidDate(audit.lastScheduledCheck)) {
      logger.error('Metadata validation failed: lastScheduledCheck must be a Date when provided');
      return false;
    }

    if (audit.lastHealthCheck !== undefined && !this.isValidDate(audit.lastHealthCheck)) {
      logger.error('Metadata validation failed: lastHealthCheck must be a Date when provided');
      return false;
    }

    if (audit.lastWarningIssued !== undefined && !this.isValidDate(audit.lastWarningIssued)) {
      logger.error('Metadata validation failed: lastWarningIssued must be a Date when provided');
      return false;
    }

    // Validate required arrays
    if (!Array.isArray(audit.auditEvents)) {
      logger.error('Metadata validation failed: auditTrail.auditEvents must be an array');
      return false;
    }

    if (!Array.isArray(audit.rotationHistory)) {
      logger.error('Metadata validation failed: auditTrail.rotationHistory must be an array');
      return false;
    }

    if (!Array.isArray(audit.healthCheckHistory)) {
      logger.error('Metadata validation failed: auditTrail.healthCheckHistory must be an array');
      return false;
    }

    // Validate array contents
    return (
      audit.auditEvents.every((event, index) => {
        if (!this.validateAuditEvent(event)) {
          logger.error(`Metadata validation failed: invalid audit event at index ${index}`);
          return false;
        }
        return true;
      }) &&
      audit.rotationHistory.every((event, index) => {
        if (!this.validateRotationEvent(event)) {
          logger.error(`Metadata validation failed: invalid rotation event at index ${index}`);
          return false;
        }
        return true;
      }) &&
      audit.healthCheckHistory.every((event, index) => {
        if (!this.validateHealthCheckEvent(event)) {
          logger.error(`Metadata validation failed: invalid health check event at index ${index}`);
          return false;
        }
        return true;
      })
    );
  }

  /**
   * Validates usage tracking with type guards
   */
  private static validateUsageTracking(usageTracking: unknown): usageTracking is UsageTracking {
    if (!usageTracking || typeof usageTracking !== 'object' || Array.isArray(usageTracking)) {
      logger.error('Metadata validation failed: usageTracking must be an object');
      return false;
    }

    const usage = usageTracking as Partial<UsageTracking>;

    // Optional lastAccessedAt validation
    if (usage.lastAccessedAt !== undefined && !this.isValidDate(usage.lastAccessedAt)) {
      logger.error('Metadata validation failed: lastAccessedAt must be a Date when provided');
      return false;
    }

    // Required string arrays
    if (!this.isStringArray(usage.environmentsUsedIn)) {
      logger.error('Metadata validation failed: environmentsUsedIn must be an array of strings');
      return false;
    }

    if (!this.isStringArray(usage.dependentVariables)) {
      logger.error('Metadata validation failed: dependentVariables must be an array of strings');
      return false;
    }

    return true;
  }

  /**
   * Validates status tracking with proper type guards
   */
  private static validateStatusTracking(statusTracking: unknown): statusTracking is StatusTracking {
    if (!statusTracking || typeof statusTracking !== 'object' || Array.isArray(statusTracking)) {
      logger.error('Metadata validation failed: statusTracking must be an object');
      return false;
    }

    const status = statusTracking as Partial<StatusTracking>;

    if (!this.isValidStatus(status.currentStatus)) {
      logger.error(
        `Metadata validation failed: currentStatus must be one of: ${this.VALID_STATUSES.join(', ')}`,
      );
      return false;
    }

    if (!this.isValidDate(status.lastStatusChange)) {
      logger.error('Metadata validation failed: lastStatusChange must be a valid Date');
      return false;
    }

    return true;
  }

  /**
   * Validates audit event with type guards
   */
  private static validateAuditEvent(event: unknown): event is AuditEvent {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return false;
    }

    const auditEvent = event as Partial<AuditEvent>;

    if (!this.isValidDate(auditEvent.timestamp)) {
      return false;
    }

    if (!this.isValidEventType(auditEvent.eventType)) {
      return false;
    }

    if (!this.isValidSeverity(auditEvent.severity)) {
      return false;
    }

    if (!this.isNonEmptyString(auditEvent.source)) {
      return false;
    }

    if (typeof auditEvent.details !== 'string') {
      return false;
    }

    // Optional metadata validation
    if (
      auditEvent.metadata !== undefined &&
      (typeof auditEvent.metadata !== 'object' || Array.isArray(auditEvent.metadata))
    ) {
      return false;
    }

    return true;
  }

  /**
   * Validates rotation event with type guards
   */
  private static validateRotationEvent(event: unknown): event is RotationEvent {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return false;
    }

    const rotationEvent = event as Partial<RotationEvent>;

    if (!this.isValidDate(rotationEvent.timestamp)) {
      return false;
    }

    if (!this.isValidRotationReason(rotationEvent.reason)) {
      return false;
    }

    if (!this.isStringArray(rotationEvent.affectedEnvironments)) {
      return false;
    }

    if (!this.isStringArray(rotationEvent.affectedVariables)) {
      return false;
    }

    if (typeof rotationEvent.success !== 'boolean') {
      return false;
    }

    // Optional fields validation
    if (rotationEvent.oldKeyHash !== undefined && typeof rotationEvent.oldKeyHash !== 'string') {
      return false;
    }

    if (rotationEvent.newKeyHash !== undefined && typeof rotationEvent.newKeyHash !== 'string') {
      return false;
    }

    if (
      rotationEvent.errorDetails !== undefined &&
      typeof rotationEvent.errorDetails !== 'string'
    ) {
      return false;
    }

    if (
      rotationEvent.overrideMode !== undefined &&
      typeof rotationEvent.overrideMode !== 'boolean'
    ) {
      return false;
    }

    return true;
  }

  /**
   * Validates health check event with type guards
   */
  private static validateHealthCheckEvent(event: unknown): event is HealthCheckEvent {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return false;
    }

    const healthEvent = event as Partial<HealthCheckEvent>;

    if (!this.isValidDate(healthEvent.timestamp)) {
      return false;
    }

    if (!this.isPositiveNumber(healthEvent.ageInDays)) {
      return false;
    }

    if (typeof healthEvent.daysUntilExpiry !== 'number' || isNaN(healthEvent.daysUntilExpiry)) {
      return false;
    }

    if (!this.isValidStatus(healthEvent.status)) {
      return false;
    }

    if (!this.isValidCheckSource(healthEvent.checkSource)) {
      return false;
    }

    // Optional recommendations validation
    if (
      healthEvent.recommendations !== undefined &&
      !this.isStringArray(healthEvent.recommendations)
    ) {
      return false;
    }

    return true;
  }
}
