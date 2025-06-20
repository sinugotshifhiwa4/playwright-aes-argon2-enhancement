// Union types defined first for consistency
export type KeyStatus = 'healthy' | 'warning' | 'critical' | 'expired';
export type EventType =
  | 'created'
  | 'rotated'
  | 'accessed'
  | 'warning_issued'
  | 'expired'
  | 'health_check';
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';
export type RotationReason = 'scheduled' | 'manual' | 'expired' | 'security_breach' | 'compromised';
export type CheckSource = 'startup' | 'scheduled' | 'manual' | 'api';
export type SystemHealth = 'healthy' | 'warning' | 'critical';

// Configuration interfaces
export interface KeyRotationConfig {
  maxAgeInDays: number;
  warningThresholdInDays: number;
}

// Tracking interfaces
export interface StatusTracking {
  currentStatus: KeyStatus;
  lastStatusChange: Date;
}

export interface UsageTracking {
  lastAccessedAt?: Date;
  environmentsUsedIn: string[];
  dependentVariables: string[];
}

// Event interfaces
export interface AuditEvent {
  timestamp: Date;
  eventType: EventType;
  severity: EventSeverity;
  source: string;
  details: string;
  metadata?: Record<string, unknown>;
}

export interface RotationEvent {
  timestamp: Date;
  reason: RotationReason;
  oldKeyHash?: string;
  newKeyHash?: string;
  affectedEnvironments: string[];
  affectedVariables: string[];
  success: boolean;
  errorDetails?: string;
  overrideMode?: boolean;
}

export interface HealthCheckEvent {
  timestamp: Date;
  ageInDays: number;
  daysUntilExpiry: number;
  status: KeyStatus;
  checkSource: CheckSource;
  recommendations?: string[];
}

// Audit trail interface
export interface AuditTrail {
  lastScheduledCheck?: Date;
  lastHealthCheck?: Date;
  lastWarningIssued?: Date;
  auditEvents: AuditEvent[];
  rotationHistory: RotationEvent[];
  healthCheckHistory: HealthCheckEvent[];
}

// Main metadata model
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

// Result interfaces
export interface RotationResult {
  success: boolean;
  reEncryptedCount: number;
  errorDetails?: string;
  affectedFiles: string[];
}

export interface KeyRotationStatus {
  needsRotation: boolean;
  needsWarning: boolean;
  ageInDays: number;
  daysUntilRotation: number;
}

// Summary interfaces
export interface AuditSummary {
  totalKeys: number;
  healthyKeys: number;
  warningKeys: number;
  criticalKeys: number;
  expiredKeys: number;
  averageKeyAge: number;
  oldestKeyAge: number;
  newestKeyAge: number;
  totalAuditEvents: number;
  totalRotations: number;
  lastRotation?: Date;
  lastHealthCheck?: Date;
  lastAccess?: Date;
  currentStatus: SystemHealth;
}

export interface ComprehensiveKeyInfo {
  exists: boolean;
  metadata?: KeyMetadata;
  rotationStatus?: KeyRotationStatus;
  auditSummary?: AuditSummary;
}

export interface SystemAuditResult {
  systemHealth: SystemHealth;
  keysNeedingRotation: string[];
  keysNeedingWarning: string[];
  expiredKeys: string[];
  auditSummary: AuditSummary;
  recommendations: string[];
}

export interface StartupSecurityCheckResult {
  passed: boolean;
  systemHealth: SystemHealth;
  criticalKeys: string[];
  warningKeys: string[];
  expiredKeys: string[];
  auditSummary: AuditSummary;
  recommendations: string[];
}

export interface KeyMetrics {
  averageKeyAge: number;
  oldestKeyAge: number;
  newestKeyAge: number;
}

export interface KeyRotationCheck {
  keyName: string;
  status: {
    needsRotation: boolean;
    needsWarning: boolean;
    ageInDays: number;
    daysUntilRotation: number;
  };
}