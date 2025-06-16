// import { CryptoMetadata } from '../../config/environment/dotenv/constants';
// import { EnvironmentSecretFileManager } from './environmentSecretFileManager';
// import { KeyMetadata } from '../../cryptography/config/keyMetadata.types.ts';
// import AsyncFileManager from '../fileSystem/asyncFileManager';
// import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
// import ErrorHandler from '../errors/errorHandler';
// import logger from '../logging/loggerManager';

// export class KeyMetadataRepository {
//   private readonly environmentSecretFileManager: EnvironmentSecretFileManager;

//   constructor(environmentSecretFileManager: EnvironmentSecretFileManager) {
//     this.environmentSecretFileManager = environmentSecretFileManager;
//   }

//   /**
//    * Gets the metadata file path
//    */
//   private async getMetadataFilePath(): Promise<string> {
//     return AsyncFileManager.resolvePath(CryptoMetadata.DIRECTORY, CryptoMetadata.FILE_NAME);
//   }

//   /**
//    * Reads key metadata from the metadata file
//    */
//   public async readKeyMetadata(): Promise<Record<string, KeyMetadata>> {
//     try {
//       const metadataPath = await this.getMetadataFilePath();
//       const fileExists = await AsyncFileManager.doesFileExist(metadataPath);

//       if (!fileExists) {
//         return {};
//       }

//       const content = await AsyncFileManager.readFile(metadataPath, FileEncoding.UTF8);
//       const metadata = JSON.parse(content || '{}');

//       // Convert date strings back to Date objects
//       Object.keys(metadata).forEach((key) => {
//         if (metadata[key].createdAt) {
//           metadata[key].createdAt = new Date(metadata[key].createdAt);
//         }
//         if (metadata[key].lastRotatedAt) {
//           metadata[key].lastRotatedAt = new Date(metadata[key].lastRotatedAt);
//         }
//       });

//       return metadata as Record<string, KeyMetadata>;
//     } catch (error) {
//       logger.warn('Failed to read key metadata, starting with empty metadata', error);
//       return {};
//     }
//   }

//   /**
//    * Writes key metadata to the metadata file
//    */
//   public async writeKeyMetadata(metadata: Record<string, KeyMetadata>): Promise<void> {
//     try {
//       const metadataPath = await this.getMetadataFilePath();
//       const content = JSON.stringify(metadata, null, 2);
//       await AsyncFileManager.writeFile(metadataPath, content, 'Updated key metadata');
//     } catch (error) {
//       ErrorHandler.captureError(error, 'writeKeyMetadata', 'Failed to write key metadata');
//       throw error;
//     }
//   }
// }


import { CryptoMetadata } from '../../config/environment/dotenv/constants';
import { EnvironmentSecretFileManager } from './environmentSecretFileManager';
import { 
  KeyMetadata, 
  AuditTrail, 
  ScheduledRotationEvent, 
  AuditEvent, 
  RotationEvent, 
  HealthCheckEvent 
} from '../../cryptography/config/keyMetadata.types.ts';
import AsyncFileManager from '../fileSystem/asyncFileManager';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import ErrorHandler from '../errors/errorHandler';
import logger from '../logging/loggerManager';

// Type for raw metadata with string dates (as stored in JSON)
interface RawKeyMetadata {
  keyName: string;
  createdAt: string;
  rotationCount: number;
  lastRotatedAt?: string;
  rotationConfig: {
    maxAgeInDays: number;
    warningThresholdInDays: number;
    enableAutoRotation: boolean;
  };
  auditTrail: RawAuditTrail;
  usageTracking: {
    lastAccessedAt?: string;
    environmentsUsedIn: string[];
    dependentVariables: string[];
  };
  statusTracking: {
    currentStatus: 'healthy' | 'warning' | 'critical' | 'expired';
    lastStatusChange: string;
    autoRotationEnabled: boolean;
  };
}

interface RawAuditTrail {
  lastScheduledCheck?: string;
  lastHealthCheck?: string;
  lastWarningIssued?: string;
  scheduledRotationHistory: RawScheduledRotationEvent[];
  auditTrail: RawAuditEvent[];
  rotationHistory: RawRotationEvent[];
  healthCheckHistory: RawHealthCheckEvent[];
}

interface RawScheduledRotationEvent {
  timestamp: string;
  checkType: 'startup' | 'scheduled' | 'manual';
  result: 'passed' | 'warning' | 'failed';
  action: 'none' | 'rotated' | 'notification_sent';
  daysUntilExpiry: number;
  details?: string;
  scheduledFor?: string;
  executedAt?: string;
}

interface RawAuditEvent {
  timestamp: string;
  eventType: 'created' | 'rotated' | 'accessed' | 'warning_issued' | 'expired' | 'health_check';
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  details: string;
  metadata?: Record<string, unknown>;
}

interface RawRotationEvent {
  timestamp: string;
  reason: 'scheduled' | 'manual' | 'expired' | 'security_breach';
  oldKeyHash?: string;
  newKeyHash?: string;
  affectedEnvironments: string[];
  affectedVariables: string[];
  success: boolean;
  errorDetails?: string;
  overrideMode?: boolean;
}

interface RawHealthCheckEvent {
  timestamp: string;
  ageInDays: number;
  daysUntilExpiry: number;
  status: 'healthy' | 'warning' | 'critical';
  checkSource: 'startup' | 'scheduled' | 'manual' | 'api';
  recommendations?: string[];
  lastChecked?: string;
}

export class KeyMetadataRepository {
  private readonly environmentSecretFileManager: EnvironmentSecretFileManager;

  constructor(environmentSecretFileManager: EnvironmentSecretFileManager) {
    this.environmentSecretFileManager = environmentSecretFileManager;
  }

  /**
   * Gets the metadata file path
   */
  private async getMetadataFilePath(): Promise<string> {
    return AsyncFileManager.resolvePath(CryptoMetadata.DIRECTORY, CryptoMetadata.FILE_NAME);
  }

  /**
   * Converts date strings to Date objects in nested structures
   */
  private convertDatesToObjects(metadata: Record<string, RawKeyMetadata>): Record<string, KeyMetadata> {
    const convertedMetadata: Record<string, KeyMetadata> = {};

    Object.keys(metadata).forEach((key) => {
      const rawKeyMetadata = metadata[key];
      
      const convertedKeyMetadata: KeyMetadata = {
        keyName: rawKeyMetadata.keyName,
        createdAt: new Date(rawKeyMetadata.createdAt),
        rotationCount: rawKeyMetadata.rotationCount,
        lastRotatedAt: rawKeyMetadata.lastRotatedAt ? new Date(rawKeyMetadata.lastRotatedAt) : undefined,
        rotationConfig: rawKeyMetadata.rotationConfig,
        auditTrail: this.convertAuditTrailDates(rawKeyMetadata.auditTrail),
        usageTracking: {
          ...rawKeyMetadata.usageTracking,
          lastAccessedAt: rawKeyMetadata.usageTracking.lastAccessedAt 
            ? new Date(rawKeyMetadata.usageTracking.lastAccessedAt) 
            : undefined
        },
        statusTracking: {
          ...rawKeyMetadata.statusTracking,
          lastStatusChange: new Date(rawKeyMetadata.statusTracking.lastStatusChange)
        }
      };

      convertedMetadata[key] = convertedKeyMetadata;
    });

    return convertedMetadata;
  }

  /**
   * Converts audit trail date strings to Date objects
   */
  private convertAuditTrailDates(rawAuditTrail: RawAuditTrail): AuditTrail {
    return {
      lastScheduledCheck: rawAuditTrail.lastScheduledCheck 
        ? new Date(rawAuditTrail.lastScheduledCheck) 
        : undefined,
      lastHealthCheck: rawAuditTrail.lastHealthCheck 
        ? new Date(rawAuditTrail.lastHealthCheck) 
        : undefined,
      lastWarningIssued: rawAuditTrail.lastWarningIssued 
        ? new Date(rawAuditTrail.lastWarningIssued) 
        : undefined,
      scheduledRotationHistory: rawAuditTrail.scheduledRotationHistory.map(
        (entry: RawScheduledRotationEvent): ScheduledRotationEvent => ({
          timestamp: new Date(entry.timestamp),
          checkType: entry.checkType,
          result: entry.result,
          action: entry.action,
          daysUntilExpiry: entry.daysUntilExpiry,
          details: entry.details
        })
      ),
      auditTrail: rawAuditTrail.auditTrail.map(
        (entry: RawAuditEvent): AuditEvent => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        })
      ),
      rotationHistory: rawAuditTrail.rotationHistory.map(
        (entry: RawRotationEvent): RotationEvent => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        })
      ),
      healthCheckHistory: rawAuditTrail.healthCheckHistory.map(
        (entry: RawHealthCheckEvent): HealthCheckEvent => ({
          timestamp: new Date(entry.timestamp),
          ageInDays: entry.ageInDays,
          daysUntilExpiry: entry.daysUntilExpiry,
          status: entry.status,
          checkSource: entry.checkSource,
          recommendations: entry.recommendations
        })
      )
    };
  }

  /**
   * Ensures metadata directory exists
   */
  private async ensureMetadataDirectory(): Promise<void> {
    try {
      const directoryExists = await AsyncFileManager.doesDirectoryExist(CryptoMetadata.DIRECTORY);
      if (!directoryExists) {
        await AsyncFileManager.ensureDirectoryExists(CryptoMetadata.DIRECTORY);
        logger.info(`Created metadata directory: ${CryptoMetadata.DIRECTORY}`);
      }
    } catch (error) {
      ErrorHandler.captureError(error, 'ensureMetadataDirectory', 'Failed to ensure metadata directory exists');
      throw error;
    }
  }

  /**
   * Creates a backup of the current metadata file
   */
  private async createMetadataBackup(): Promise<void> {
    try {
      const metadataPath = await this.getMetadataFilePath();
      const fileExists = await AsyncFileManager.doesFileExist(metadataPath);
      
      if (fileExists) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${metadataPath}.backup-${timestamp}`;
        
        const content = await AsyncFileManager.readFile(metadataPath, FileEncoding.UTF8);
        await AsyncFileManager.writeFile(backupPath, content, 'Metadata backup');
        
        logger.info(`Created metadata backup: ${backupPath}`);
      }
    } catch (error) {
      logger.warn('Failed to create metadata backup', error);
      // Don't throw - backup failure shouldn't prevent metadata operations
    }
  }

  /**
   * Validates metadata structure
   */
  private validateMetadata(metadata: Record<string, unknown>): metadata is Record<string, RawKeyMetadata> {
    try {
      for (const [keyName, keyMetadata] of Object.entries(metadata)) {
        if (!this.isValidRawKeyMetadata(keyMetadata) || keyMetadata.keyName !== keyName) {
          logger.warn(`Invalid metadata structure for key: ${keyName}`);
          return false;
        }
        
        if (!keyMetadata.createdAt) {
          logger.warn(`Missing createdAt for key: ${keyName}`);
          return false;
        }
      }
      return true;
    } catch (error) {
      logger.warn('Metadata validation failed', error);
      return false;
    }
  }

  /**
   * Type guard to check if an object is valid RawKeyMetadata
   */
  private isValidRawKeyMetadata(obj: unknown): obj is RawKeyMetadata {
    if (!obj || typeof obj !== 'object') return false;
    
    const metadata = obj as Record<string, unknown>;
    
    return typeof metadata.keyName === 'string' &&
           typeof metadata.createdAt === 'string' &&
           typeof metadata.rotationCount === 'number' &&
           typeof metadata.rotationConfig === 'object' &&
           typeof metadata.auditTrail === 'object' &&
           typeof metadata.usageTracking === 'object' &&
           typeof metadata.statusTracking === 'object';
  }

  /**
   * Reads key metadata from the metadata file
   */
  public async readKeyMetadata(): Promise<Record<string, KeyMetadata>> {
    try {
      const metadataPath = await this.getMetadataFilePath();
      const fileExists = await AsyncFileManager.doesFileExist(metadataPath);
      
      if (!fileExists) {
        logger.info('Metadata file does not exist, returning empty metadata');
        return {};
      }

      const content = await AsyncFileManager.readFile(metadataPath, FileEncoding.UTF8);
      
      if (!content || content.trim() === '') {
        logger.warn('Metadata file is empty, returning empty metadata');
        return {};
      }

      let rawMetadata: unknown;
      try {
        rawMetadata = JSON.parse(content);
      } catch (parseError) {
        logger.error('Failed to parse metadata JSON', parseError);
        throw new Error(`Invalid JSON in metadata file: ${parseError}`);
      }

      // Validate that rawMetadata is an object
      if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
        logger.warn('Invalid metadata format, expected object');
        return {};
      }

      const metadataRecord = rawMetadata as Record<string, unknown>;

      // Validate metadata structure
      if (!this.validateMetadata(metadataRecord)) {
        logger.warn('Metadata validation failed, returning empty metadata');
        return {};
      }

      // Convert date strings back to Date objects
      const metadata = this.convertDatesToObjects(metadataRecord);
      
      logger.info(`Successfully loaded metadata for ${Object.keys(metadata).length} keys`);
      return metadata;
      
    } catch (error) {
      logger.error('Failed to read key metadata', error);
      ErrorHandler.captureError(error, 'readKeyMetadata', 'Failed to read key metadata');
      
      // Return empty metadata rather than throwing to allow system to continue
      return {};
    }
  }

  /**
   * Writes key metadata to the metadata file with backup and validation
   */
  public async writeKeyMetadata(metadata: Record<string, KeyMetadata>): Promise<void> {
    try {
      // Ensure directory exists
      await this.ensureMetadataDirectory();
      
      // Create backup before writing
      await this.createMetadataBackup();
      
      // Convert to raw format for validation
      const rawMetadata = JSON.parse(JSON.stringify(metadata)) as Record<string, RawKeyMetadata>;
      
      // Validate metadata before writing
      if (!this.validateMetadata(rawMetadata)) {
        throw new Error('Metadata validation failed before writing');
      }

      const metadataPath = await this.getMetadataFilePath();
      
      // Pretty print with proper formatting
      const content = JSON.stringify(rawMetadata, null, 2);
      
      // Write to file
      await AsyncFileManager.writeFile(metadataPath, content, 'Updated key metadata');
      
      logger.info(`Successfully wrote metadata for ${Object.keys(metadata).length} keys`);
      
    } catch (error) {
      logger.error('Failed to write key metadata', error);
      ErrorHandler.captureError(error, 'writeKeyMetadata', 'Failed to write key metadata');
      throw error;
    }
  }

  /**
   * Safely updates metadata for a single key
   */
  public async updateSingleKeyMetadata(keyName: string, updatedMetadata: KeyMetadata): Promise<void> {
    try {
      // Read current metadata
      const currentMetadata = await this.readKeyMetadata();
      
      // Update specific key
      currentMetadata[keyName] = updatedMetadata;
      
      // Write back
      await this.writeKeyMetadata(currentMetadata);
      
      logger.info(`Successfully updated metadata for key: ${keyName}`);
      
    } catch (error) {
      logger.error(`Failed to update metadata for key: ${keyName}`, error);
      ErrorHandler.captureError(error, 'updateSingleKeyMetadata', `Failed to update metadata for key: ${keyName}`);
      throw error;
    }
  }

  /**
   * Removes metadata for a specific key
   */
  public async removeKeyMetadata(keyName: string): Promise<boolean> {
    try {
      const currentMetadata = await this.readKeyMetadata();
      
      if (!currentMetadata[keyName]) {
        logger.warn(`Key metadata not found for removal: ${keyName}`);
        return false;
      }
      
      delete currentMetadata[keyName];
      await this.writeKeyMetadata(currentMetadata);
      
      logger.info(`Successfully removed metadata for key: ${keyName}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to remove metadata for key: ${keyName}`, error);
      ErrorHandler.captureError(error, 'removeKeyMetadata', `Failed to remove metadata for key: ${keyName}`);
      throw error;
    }
  }

  /**
   * Gets metadata for a specific key
   */
  public async getKeyMetadata(keyName: string): Promise<KeyMetadata | null> {
    try {
      const metadata = await this.readKeyMetadata();
      return metadata[keyName] || null;
    } catch (error) {
      logger.error(`Failed to get metadata for key: ${keyName}`, error);
      return null;
    }
  }

  /**
   * Checks if metadata exists for a specific key
   */
  public async hasKeyMetadata(keyName: string): Promise<boolean> {
    try {
      const metadata = await this.readKeyMetadata();
      return keyName in metadata;
    } catch (error) {
      logger.error(`Failed to check metadata existence for key: ${keyName}`, error);
      return false;
    }
  }
}