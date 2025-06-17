// Defines the configuration for key rotation
export interface KeyRotationConfig {
  maxAgeInDays: number;
  warningThresholdInDays: number;
  enableAutoRotation: boolean;
}

// The main metadata model for a secret key
export interface KeyMetadata {
  keyName: string;
  createdAt: Date;
  rotationCount: number;
  lastRotatedAt?: Date;
  rotationConfig: KeyRotationConfig;
  auditTrail: AuditTrail;
  usageTracking: UsageTracking;
  statusTracking: StatusTracking;
}

// Tracks the current status of a key
export interface StatusTracking {
  currentStatus: 'healthy' | 'warning' | 'critical' | 'expired';
  lastStatusChange: Date;
  autoRotationEnabled: boolean;
}

// Tracks key usage across environments and variables
export interface UsageTracking {
  lastAccessedAt?: Date;
  environmentsUsedIn: string[];
  dependentVariables: string[];
}

// Records the full audit trail of a key's lifecycle
export interface AuditTrail {
  lastScheduledCheck?: Date;
  lastHealthCheck?: Date;
  lastWarningIssued?: Date;
  scheduledRotationHistory: ScheduledRotationEvent[];
  auditTrail: AuditEvent[];
  rotationHistory: RotationEvent[];
  healthCheckHistory: HealthCheckEvent[];
}

// Individual scheduled rotation check event
export interface ScheduledRotationEvent {
  timestamp: Date;
  checkType: 'startup' | 'scheduled' | 'manual';
  result: 'passed' | 'warning' | 'failed';
  action: 'none' | 'rotated' | 'notification_sent';
  daysUntilExpiry: number;
  details?: string;
}

// Generic audit event
export interface AuditEvent {
  timestamp: Date;
  eventType: 'created' | 'rotated' | 'accessed' | 'warning_issued' | 'expired' | 'health_check';
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  details: string;
  metadata?: Record<string, unknown>;
}

// Key rotation event, includes success or error information
export interface RotationEvent {
  timestamp: Date;
  reason: 'scheduled' | 'manual' | 'expired' | 'security_breach' | 'compromised';
  oldKeyHash?: string;
  newKeyHash?: string;
  affectedEnvironments: string[];
  affectedVariables: string[];
  success: boolean;
  errorDetails?: string;
  overrideMode?: boolean;
}

interface BaseRotationResult {
  success: boolean;
  reEncryptedCount: number;
  errorDetails?: string;
}

export interface SingleRotationResult extends BaseRotationResult {
  affectedFile: string;
}

export interface MultiRotationResult extends BaseRotationResult {
  affectedFiles: string[];
}

// Periodic health check result
export interface HealthCheckEvent {
  timestamp: Date;
  ageInDays: number;
  daysUntilExpiry: number;
  status: 'healthy' | 'warning' | 'critical' | 'expired';
  checkSource: 'startup' | 'scheduled' | 'manual' | 'api';
  recommendations?: string[];
}
