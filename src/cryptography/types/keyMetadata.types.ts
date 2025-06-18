// Defines the configuration for key rotation
export interface KeyRotationConfig {
  maxAgeInDays: number;
  warningThresholdInDays: number;
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
//  scheduledRotationHistory: ScheduledRotationEvent[];
  auditTrail: AuditEvent[];
  rotationHistory: RotationEvent[];
  healthCheckHistory: HealthCheckEvent[];
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
  affectedEnvironment: string[];
  affectedVariables: string[];
  success: boolean;
  errorDetails?: string;
  overrideMode?: boolean;
}

export interface RotationResult {
  success: boolean;
  reEncryptedCount: number;
  errorDetails?: string;
  affectedFile: string;
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

// Define proper audit summary type instead of 'any'
export interface AuditSummary {
  totalKeys: number;
  healthyKeys: number;
  warningKeys: number;
  criticalKeys: number;
  averageKeyAge: number;
  oldestKeyAge: number;
  newestKeyAge: number;
  totalAuditEvents: number;
  lastRotation?: Date;
  lastHealthCheck?: Date;
  lastAccess?: Date;
  currentStatus: string;
  totalRotations: number;
}

export interface KeyRotationStatus {
  needsRotation: boolean;
  needsWarning: boolean;
  ageInDays: number;
  daysUntilRotation: number;
}

export interface ComprehensiveKeyInfo {
  exists: boolean;
  metadata?: KeyMetadata;
  rotationStatus?: KeyRotationStatus;
  auditSummary?: AuditSummary;
}

export interface SystemAuditResult {
  systemHealth: 'healthy' | 'warning' | 'critical';
  keysNeedingRotation: string[];
  keysNeedingWarning: string[];
  auditSummary: AuditSummary;
  recommendations: string[];
}

export interface StartupSecurityCheckResult {
  passed: boolean;
  systemHealth: 'healthy' | 'warning' | 'critical';
  criticalKeys: string[];
  warningKeys: string[];
  auditSummary: AuditSummary;
  recommendations: string[];
}
