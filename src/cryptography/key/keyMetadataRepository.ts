import AsyncFileManager from '../../utils/fileSystem/asyncFileManager';
import { CryptoMetadata } from '../../config/environment/dotenv/constants';
import { KeyMetadata } from '../types/keyMetadata.types';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import ErrorHandler from '../../utils/errors/errorHandler';
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
    // List of known date field names in your metadata structure
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
   * Validates that the parsed object has the correct structure
   */
  private validateMetadata(metadata: unknown): metadata is Record<string, KeyMetadata> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return false;
    }

    const metadataRecord = metadata as Record<string, unknown>;
    for (const [keyName, keyMetadata] of Object.entries(metadataRecord)) {
      if (!this.isValidKeyMetadata(keyMetadata, keyName)) {
        logger.warn(`Invalid metadata structure for key: ${keyName}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Type guard for KeyMetadata with comprehensive validation
   */
  private isValidKeyMetadata(obj: unknown, expectedKeyName: string): obj is KeyMetadata {
    if (!obj || typeof obj !== 'object') return false;

    const metadata = obj as Record<string, unknown>;

    return (
      typeof metadata.keyName === 'string' &&
      metadata.keyName === expectedKeyName &&
      metadata.createdAt instanceof Date &&
      typeof metadata.rotationCount === 'number' &&
      this.isValidRotationConfig(metadata.rotationConfig) &&
      this.isValidAuditTrail(metadata.auditTrail) &&
      this.isValidUsageTracking(metadata.usageTracking) &&
      this.isValidStatusTracking(metadata.statusTracking)
    );
  }

  /**
   * Validates rotation config structure
   */
  private isValidRotationConfig(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;

    const config = obj as Record<string, unknown>;
    return (
      typeof config.maxAgeInDays === 'number' &&
      typeof config.warningThresholdInDays === 'number' &&
      typeof config.enableAutoRotation === 'boolean'
    );
  }

  /**
   * Validates audit trail structure
   */
  private isValidAuditTrail(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;

    const auditTrail = obj as Record<string, unknown>;
    return (
      Array.isArray(auditTrail.scheduledRotationHistory) &&
      Array.isArray(auditTrail.auditTrail) &&
      Array.isArray(auditTrail.rotationHistory) &&
      Array.isArray(auditTrail.healthCheckHistory)
    );
  }

  /**
   * Validates usage tracking structure
   */
  private isValidUsageTracking(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;

    const usage = obj as Record<string, unknown>;
    return Array.isArray(usage.environmentsUsedIn) && Array.isArray(usage.dependentVariables);
  }

  /**
   * Validates status tracking structure
   */
  private isValidStatusTracking(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;

    const status = obj as Record<string, unknown>;
    const validStatuses = ['healthy', 'warning', 'critical', 'expired'];

    return (
      typeof status.currentStatus === 'string' &&
      validStatuses.includes(status.currentStatus) &&
      status.lastStatusChange instanceof Date &&
      typeof status.autoRotationEnabled === 'boolean'
    );
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
   * Creates a backup of the current metadata file
   */
  private async createMetadataBackup(): Promise<void> {
    try {
      const metadataPath = await this.getMetadataFilePath();
      const fileExists = await AsyncFileManager.doesFileExist(metadataPath);

      if (fileExists) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        const archiveFolder = path.join(path.dirname(metadataPath), 'archive');
        await AsyncFileManager.ensureDirectoryExists(archiveFolder); // Ensure archive folder exists

        const fileName = path.basename(metadataPath);
        const backupPath = path.join(archiveFolder, `${fileName}.backup-${timestamp}`);

        const content = await AsyncFileManager.readFile(metadataPath, FileEncoding.UTF8);
        await AsyncFileManager.writeFile(backupPath, content, 'Metadata backup');
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
        // Use the date reviver to automatically convert date strings to Date objects
        metadata = JSON.parse(content, this.dateReviver);
      } catch (parseError) {
        ErrorHandler.logAndThrow(`Invalid JSON in metadata file: ${parseError}`, 'readKeyMetadata');
      }

      // Validate metadata structure
      if (!this.validateMetadata(metadata)) {
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
      // Ensure directory exists
      await this.ensureMetadataDirectory();

      // Create backup before writing
      await this.createMetadataBackup();

      // Validate before writing
      if (!this.validateMetadata(metadata)) {
        throw new Error('Metadata validation failed before writing');
      }

      const metadataPath = await this.getMetadataFilePath();

      // JSON.stringify automatically converts Date objects to ISO strings
      const content = JSON.stringify(metadata, null, 2);

      await AsyncFileManager.writeFile(metadataPath, content, 'Updated key metadata');

      //logger.info(`Successfully wrote metadata for ${Object.keys(metadata).length} keys`);
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
