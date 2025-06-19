// import AsyncFileManager from '../../utils/fileSystem/asyncFileManager';
// import { CryptoMetadata } from '../../config/environment/dotenv/constants';
// import { KeyMetadata } from '../types/keyMetadata.types';
// import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
// import ErrorHandler from '../../utils/errors/errorHandler';
// import { KeyMetadataRepositoryValidator } from './keyMetadataRepositoryValidator';
// import path from 'path';
// import logger from '../../utils/logging/loggerManager';

// export class KeyMetadataRepository {
//   /**
//    * Gets the metadata file path
//    */
//   private async getMetadataFilePath(): Promise<string> {
//     return AsyncFileManager.resolvePath(CryptoMetadata.DIRECTORY, CryptoMetadata.FILE_NAME);
//   }

//   /**
//    * Custom JSON reviver that converts ISO date strings back to Date objects
//    */
//   private dateReviver = (key: string, value: unknown): unknown => {
//     const dateFields = [
//       'createdAt',
//       'lastRotatedAt',
//       'lastAccessedAt',
//       'lastStatusChange',
//       'lastScheduledCheck',
//       'lastHealthCheck',
//       'lastWarningIssued',
//       'timestamp',
//     ];

//     if (dateFields.includes(key) && typeof value === 'string') {
//       const date = new Date(value);
//       return isNaN(date.getTime()) ? value : date;
//     }
//     return value;
//   };

//   /**
//    * Method to sanitize and fix metadata structure
//    */
//   public sanitizeMetadata(metadata: Partial<KeyMetadata>): KeyMetadata {
//     const defaultMetadata = this.createDefaultMetadata(metadata.keyName || 'unknown');
    
//     return {
//       keyName: metadata.keyName || defaultMetadata.keyName,
//       createdAt: metadata.createdAt instanceof Date ? metadata.createdAt : defaultMetadata.createdAt,
//       rotationCount: typeof metadata.rotationCount === 'number' ? metadata.rotationCount : defaultMetadata.rotationCount,
//       lastRotatedAt: metadata.lastRotatedAt instanceof Date ? metadata.lastRotatedAt : undefined,
//       rotationConfig: {
//         maxAgeInDays: metadata.rotationConfig?.maxAgeInDays || defaultMetadata.rotationConfig.maxAgeInDays,
//         warningThresholdInDays: metadata.rotationConfig?.warningThresholdInDays || defaultMetadata.rotationConfig.warningThresholdInDays,
//       },
//       auditTrail: {
//         lastScheduledCheck: metadata.auditTrail?.lastScheduledCheck instanceof Date ? 
//           metadata.auditTrail.lastScheduledCheck : undefined,
//         lastHealthCheck: metadata.auditTrail?.lastHealthCheck instanceof Date ? 
//           metadata.auditTrail.lastHealthCheck : undefined,
//         lastWarningIssued: metadata.auditTrail?.lastWarningIssued instanceof Date ? 
//           metadata.auditTrail.lastWarningIssued : undefined,
//         auditTrail: Array.isArray(metadata.auditTrail?.auditTrail) ? 
//           metadata.auditTrail.auditTrail : defaultMetadata.auditTrail.auditTrail,
//         rotationHistory: Array.isArray(metadata.auditTrail?.rotationHistory) ? 
//           metadata.auditTrail.rotationHistory : defaultMetadata.auditTrail.rotationHistory,
//         healthCheckHistory: Array.isArray(metadata.auditTrail?.healthCheckHistory) ? 
//           metadata.auditTrail.healthCheckHistory : defaultMetadata.auditTrail.healthCheckHistory
//       },
//       usageTracking: {
//         lastAccessedAt: metadata.usageTracking?.lastAccessedAt instanceof Date ? 
//           metadata.usageTracking.lastAccessedAt : undefined,
//         environmentsUsedIn: Array.isArray(metadata.usageTracking?.environmentsUsedIn) ? 
//           metadata.usageTracking.environmentsUsedIn : defaultMetadata.usageTracking.environmentsUsedIn,
//         dependentVariables: Array.isArray(metadata.usageTracking?.dependentVariables) ? 
//           metadata.usageTracking.dependentVariables : defaultMetadata.usageTracking.dependentVariables
//       },
//       statusTracking: {
//         currentStatus: ['healthy', 'warning', 'critical', 'expired'].includes(metadata.statusTracking?.currentStatus as string) ? 
//           metadata.statusTracking!.currentStatus : defaultMetadata.statusTracking.currentStatus,
//         lastStatusChange: metadata.statusTracking?.lastStatusChange instanceof Date ? 
//           metadata.statusTracking.lastStatusChange : defaultMetadata.statusTracking.lastStatusChange,
//       }
//     };
//   }

//   /**
//    * Ensures metadata directory exists
//    */
//   private async ensureMetadataDirectory(): Promise<void> {
//     try {
//       const directoryExists = await AsyncFileManager.doesDirectoryExist(CryptoMetadata.DIRECTORY);
//       if (!directoryExists) {
//         await AsyncFileManager.ensureDirectoryExists(CryptoMetadata.DIRECTORY);
//       }
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'ensureMetadataDirectory',
//         'Failed to ensure metadata directory exists',
//       );
//       throw error;
//     }
//   }

//    /**
//    * Method to create default/empty metadata structure for debugging
//    */
//   public createDefaultMetadata(keyName: string): KeyMetadata {
//     const now = new Date();
    
//     return {
//       keyName,
//       createdAt: now,
//       rotationCount: 0,
//       lastRotatedAt: undefined,
//       rotationConfig: {
//         maxAgeInDays: 30,
//         warningThresholdInDays: 7,
//       },
//       auditTrail: {
//         lastScheduledCheck: undefined,
//         lastHealthCheck: undefined,
//         lastWarningIssued: undefined,
//         auditTrail: [],
//         rotationHistory: [],
//         healthCheckHistory: []
//       },
//       usageTracking: {
//         lastAccessedAt: undefined,
//         environmentsUsedIn: [],
//         dependentVariables: []
//       },
//       statusTracking: {
//         currentStatus: 'healthy',
//         lastStatusChange: now,
//       }
//     };
//   }

//   /**
//    * Creates a backup of the current metadata file
//    */
//   private async createMetadataBackup(): Promise<void> {
//     try {
//       const metadataPath = await this.getMetadataFilePath();
//       const fileExists = await AsyncFileManager.doesFileExist(metadataPath);

//       if (fileExists) {
//         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

//         const archiveFolder = path.join(path.dirname(metadataPath), 'archive');
//         await AsyncFileManager.ensureDirectoryExists(archiveFolder);

//         const fileName = path.basename(metadataPath);
//         const backupPath = path.join(archiveFolder, `${fileName}.backup-${timestamp}`);

//         const content = await AsyncFileManager.readFile(metadataPath, FileEncoding.UTF8);
//         await AsyncFileManager.writeFile(backupPath, content, 'Metadata backup');

//         logger.info(`Backup created at: ${backupPath}`);
//       } else {
//         logger.warn('No metadata file exists to back up.');
//       }
//     } catch (error) {
//       logger.warn('Failed to create metadata backup', error);
//       // Don't throw - backup failure shouldn't prevent metadata operations
//     }
//   }

//   /**
//    * Reads key metadata from the metadata file
//    */
//   public async readKeyMetadata(): Promise<Record<string, KeyMetadata>> {
//     try {
//       const metadataPath = await this.getMetadataFilePath();
//       const fileExists = await AsyncFileManager.doesFileExist(metadataPath);

//       if (!fileExists) {
//         logger.info('Metadata file does not exist, returning empty metadata');
//         return {};
//       }

//       const content = await AsyncFileManager.readFile(metadataPath, FileEncoding.UTF8);

//       if (!content || content.trim() === '') {
//         logger.warn('Metadata file is empty, returning empty metadata');
//         return {};
//       }

//       let metadata: unknown;
//       try {
//         metadata = JSON.parse(content, this.dateReviver);
//       } catch (parseError) {
//         ErrorHandler.logAndThrow(`Invalid JSON in metadata file: ${parseError}`, 'readKeyMetadata');
//       }

//       if (!KeyMetadataRepositoryValidator.validateMetadataRecord(metadata)) {
//         logger.warn('Metadata validation failed, returning empty metadata');
//         return {};
//       }

//       logger.info(`Successfully loaded metadata for ${Object.keys(metadata).length} keys`);
//       return metadata;
//     } catch (error) {
//       ErrorHandler.captureError(error, 'readKeyMetadata', 'Failed to read key metadata');
//       return {};
//     }
//   }

//   /**
//    * Writes key metadata to the metadata file with backup and validation
//    */
//   public async writeKeyMetadata(metadata: Record<string, KeyMetadata>): Promise<void> {
//     try {
//       await this.ensureMetadataDirectory();
//       await this.createMetadataBackup();

//       if (!KeyMetadataRepositoryValidator.validateMetadataRecord(metadata)) {
//         throw new Error('Metadata validation failed before writing');
//       }

//       const metadataPath = await this.getMetadataFilePath();
//       const content = JSON.stringify(metadata, null, 2);

//       await AsyncFileManager.writeFile(metadataPath, content, 'Updated key metadata');
//     } catch (error) {
//       ErrorHandler.captureError(error, 'writeKeyMetadata', 'Failed to write key metadata');
//       throw error;
//     }
//   }

//   /**
//    * Safely updates metadata for a single key
//    */
//   public async updateSingleKeyMetadata(
//     keyName: string,
//     updatedMetadata: KeyMetadata,
//   ): Promise<void> {
//     try {
//       const currentMetadata = await this.readKeyMetadata();
//       currentMetadata[keyName] = updatedMetadata;
//       await this.writeKeyMetadata(currentMetadata);

//       logger.info(`Successfully updated metadata for key: ${keyName}`);
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'updateSingleKeyMetadata',
//         `Failed to update metadata for key: ${keyName}`,
//       );
//       throw error;
//     }
//   }

//   /**
//    * Removes metadata for a specific key
//    */
//   public async removeKeyMetadata(keyName: string): Promise<boolean> {
//     try {
//       const currentMetadata = await this.readKeyMetadata();

//       if (!currentMetadata[keyName]) {
//         logger.warn(`Key metadata not found for removal: ${keyName}`);
//         return false;
//       }

//       delete currentMetadata[keyName];
//       await this.writeKeyMetadata(currentMetadata);

//       logger.info(`Successfully removed metadata for key: ${keyName}`);
//       return true;
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'removeKeyMetadata',
//         `Failed to remove metadata for key: ${keyName}`,
//       );
//       throw error;
//     }
//   }

//   /**
//    * Gets metadata for a specific key
//    */
//   public async getKeyMetadata(keyName: string): Promise<KeyMetadata | null> {
//     try {
//       const metadata = await this.readKeyMetadata();
//       return metadata[keyName] || null;
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'getKeyMetadata',
//         `Failed to get metadata for key: ${keyName}`,
//       );
//       return null;
//     }
//   }

//   /**
//    * Checks if metadata exists for a specific key
//    */
//   public async hasKeyMetadata(keyName: string): Promise<boolean> {
//     try {
//       const metadata = await this.readKeyMetadata();
//       return keyName in metadata;
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         'hasKeyMetadata',
//         `Failed to check metadata existence for key: ${keyName}`,
//       );
//       return false;
//     }
//   }
// }




import AsyncFileManager from '../../utils/fileSystem/asyncFileManager';
import { CryptoMetadata } from '../../config/environment/dotenv/constants';
import { KeyMetadata } from '../types/keyManagement.types';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import ErrorHandler from '../../utils/errors/errorHandler';
import { KeyMetadataRepositoryValidator } from './keyMetadataRepositoryValidator';
import path from 'path';
import logger from '../../utils/logging/loggerManager';

export class KeyMetadataRepository {
  /**
   * Gets the metadata file path
   */
  private async getMetadataFilePath(): Promise<string> {
    return AsyncFileManager.resolvePath(CryptoMetadata.DIRECTORY, CryptoMetadata.FILE_NAME);
  }

  /**
   * Custom JSON reviver that converts ISO date strings back to Date objects
   */
  private dateReviver = (key: string, value: unknown): unknown => {
    const dateFields = [
      'createdAt',
      'lastRotatedAt',
      'lastAccessedAt',
      'lastStatusChange',
      'lastScheduledCheck',
      'lastHealthCheck',
      'lastWarningIssued',
      'timestamp',
    ];

    if (dateFields.includes(key) && typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? value : date;
    }
    return value;
  };

  /**
   * Method to sanitize and fix metadata structure
   */
  public sanitizeMetadata(metadata: Partial<KeyMetadata>): KeyMetadata {
    const defaultMetadata = this.createDefaultMetadata(metadata.keyName || 'unknown');
    
    return {
      keyName: metadata.keyName || defaultMetadata.keyName,
      createdAt: metadata.createdAt instanceof Date ? metadata.createdAt : defaultMetadata.createdAt,
      rotationCount: typeof metadata.rotationCount === 'number' ? metadata.rotationCount : defaultMetadata.rotationCount,
      lastRotatedAt: metadata.lastRotatedAt instanceof Date ? metadata.lastRotatedAt : undefined,
      rotationConfig: {
        maxAgeInDays: metadata.rotationConfig?.maxAgeInDays || defaultMetadata.rotationConfig.maxAgeInDays,
        warningThresholdInDays: metadata.rotationConfig?.warningThresholdInDays || defaultMetadata.rotationConfig.warningThresholdInDays,
      },
      auditTrail: {
        lastScheduledCheck: metadata.auditTrail?.lastScheduledCheck instanceof Date ? 
          metadata.auditTrail.lastScheduledCheck : undefined,
        lastHealthCheck: metadata.auditTrail?.lastHealthCheck instanceof Date ? 
          metadata.auditTrail.lastHealthCheck : undefined,
        lastWarningIssued: metadata.auditTrail?.lastWarningIssued instanceof Date ? 
          metadata.auditTrail.lastWarningIssued : undefined,
        auditEvents: Array.isArray(metadata.auditTrail?.auditEvents) ? 
          metadata.auditTrail.auditEvents : defaultMetadata.auditTrail.auditEvents,
        rotationHistory: Array.isArray(metadata.auditTrail?.rotationHistory) ? 
          metadata.auditTrail.rotationHistory : defaultMetadata.auditTrail.rotationHistory,
        healthCheckHistory: Array.isArray(metadata.auditTrail?.healthCheckHistory) ? 
          metadata.auditTrail.healthCheckHistory : defaultMetadata.auditTrail.healthCheckHistory
      },
      usageTracking: {
        lastAccessedAt: metadata.usageTracking?.lastAccessedAt instanceof Date ? 
          metadata.usageTracking.lastAccessedAt : undefined,
        environmentsUsedIn: Array.isArray(metadata.usageTracking?.environmentsUsedIn) ? 
          metadata.usageTracking.environmentsUsedIn : defaultMetadata.usageTracking.environmentsUsedIn,
        dependentVariables: Array.isArray(metadata.usageTracking?.dependentVariables) ? 
          metadata.usageTracking.dependentVariables : defaultMetadata.usageTracking.dependentVariables
      },
      statusTracking: {
        currentStatus: ['healthy', 'warning', 'critical', 'expired'].includes(metadata.statusTracking?.currentStatus as string) ? 
          metadata.statusTracking!.currentStatus : defaultMetadata.statusTracking.currentStatus,
        lastStatusChange: metadata.statusTracking?.lastStatusChange instanceof Date ? 
          metadata.statusTracking.lastStatusChange : defaultMetadata.statusTracking.lastStatusChange,
      }
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
      }
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'ensureMetadataDirectory',
        'Failed to ensure metadata directory exists',
      );
      throw error;
    }
  }

  /**
   * Method to create default/empty metadata structure for debugging
   */
  public createDefaultMetadata(keyName: string): KeyMetadata {
    const now = new Date();
    
    return {
      keyName,
      createdAt: now,
      rotationCount: 0,
      lastRotatedAt: undefined,
      rotationConfig: {
        maxAgeInDays: 30,
        warningThresholdInDays: 7,
      },
      auditTrail: {
        lastScheduledCheck: undefined,
        lastHealthCheck: undefined,
        lastWarningIssued: undefined,
        auditEvents: [], // Updated to match new structure
        rotationHistory: [],
        healthCheckHistory: []
      },
      usageTracking: {
        lastAccessedAt: undefined,
        environmentsUsedIn: [],
        dependentVariables: []
      },
      statusTracking: {
        currentStatus: 'healthy',
        lastStatusChange: now,
      }
    };
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

        const archiveFolder = path.join(path.dirname(metadataPath), 'archive');
        await AsyncFileManager.ensureDirectoryExists(archiveFolder);

        const fileName = path.basename(metadataPath);
        const backupPath = path.join(archiveFolder, `${fileName}.backup-${timestamp}`);

        const content = await AsyncFileManager.readFile(metadataPath, FileEncoding.UTF8);
        await AsyncFileManager.writeFile(backupPath, content, 'Metadata backup');

        logger.info(`Backup created at: ${backupPath}`);
      } else {
        logger.warn('No metadata file exists to back up.');
      }
    } catch (error) {
      logger.warn('Failed to create metadata backup', error);
      // Don't throw - backup failure shouldn't prevent metadata operations
    }
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

      let metadata: unknown;
      try {
        metadata = JSON.parse(content, this.dateReviver);
      } catch (parseError) {
        ErrorHandler.logAndThrow(`Invalid JSON in metadata file: ${parseError}`, 'readKeyMetadata');
      }

      if (!KeyMetadataRepositoryValidator.validateMetadataRecord(metadata)) {
        logger.warn('Metadata validation failed, returning empty metadata');
        return {};
      }

      logger.info(`Successfully loaded metadata for ${Object.keys(metadata).length} keys`);
      return metadata;
    } catch (error) {
      ErrorHandler.captureError(error, 'readKeyMetadata', 'Failed to read key metadata');
      return {};
    }
  }

  /**
   * Writes key metadata to the metadata file with backup and validation
   */
  public async writeKeyMetadata(metadata: Record<string, KeyMetadata>): Promise<void> {
    try {
      await this.ensureMetadataDirectory();
      await this.createMetadataBackup();

      if (!KeyMetadataRepositoryValidator.validateMetadataRecord(metadata)) {
        throw new Error('Metadata validation failed before writing');
      }

      const metadataPath = await this.getMetadataFilePath();
      const content = JSON.stringify(metadata, null, 2);

      await AsyncFileManager.writeFile(metadataPath, content, 'Updated key metadata');
    } catch (error) {
      ErrorHandler.captureError(error, 'writeKeyMetadata', 'Failed to write key metadata');
      throw error;
    }
  }

  /**
   * Safely updates metadata for a single key
   */
  public async updateSingleKeyMetadata(
    keyName: string,
    updatedMetadata: KeyMetadata,
  ): Promise<void> {
    try {
      const currentMetadata = await this.readKeyMetadata();
      currentMetadata[keyName] = updatedMetadata;
      await this.writeKeyMetadata(currentMetadata);

      logger.info(`Successfully updated metadata for key: ${keyName}`);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'updateSingleKeyMetadata',
        `Failed to update metadata for key: ${keyName}`,
      );
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
      ErrorHandler.captureError(
        error,
        'removeKeyMetadata',
        `Failed to remove metadata for key: ${keyName}`,
      );
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
      ErrorHandler.captureError(
        error,
        'getKeyMetadata',
        `Failed to get metadata for key: ${keyName}`,
      );
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
      ErrorHandler.captureError(
        error,
        'hasKeyMetadata',
        `Failed to check metadata existence for key: ${keyName}`,
      );
      return false;
    }
  }
}
