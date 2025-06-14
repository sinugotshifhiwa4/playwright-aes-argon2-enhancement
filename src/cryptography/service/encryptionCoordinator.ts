import { EncryptionManager } from './encryptionManager';
import { EnvironmentSecretFileManager } from '../../utils/environment/environmentSecretFileManager';
import SecureKeyGenerator from '../keyGenerator/secureKeyGenerator';
import ErrorHandler from '../../utils/errors/errorHandler';

export class EncryptionCoordinator {
  private environmentSecretFileManager: EnvironmentSecretFileManager;
  private encryptionManager: EncryptionManager;

  constructor(
    environmentSecretFileManager: EnvironmentSecretFileManager,
    encryptionManager: EncryptionManager,
  ) {
    this.environmentSecretFileManager = environmentSecretFileManager;
    this.encryptionManager = encryptionManager;
  }

  public async generateAndStoreSecretKey(
    directory: string,
    environmentBaseFilePath: string,
    keyName: string,
  ) {
    try {
      // Call the generateSecretKey method to generate a secret key
      const secretKey = SecureKeyGenerator.generateBase64SecretKey();

      if (!secretKey) {
        ErrorHandler.logAndThrow(
          'Failed to generate secret key: Secret key cannot be null or undefined',
          'createAndSaveSecretKey',
        );
      }

      // Resolve the base file path
      const resolvedBaseEnvironmentFilePath = await this.encryptionManager.resolveFilePath(
        directory,
        environmentBaseFilePath,
      );

      // Assuming there is a method to store the secret key
      await this.environmentSecretFileManager.storeBaseEnvironmentKey(
        resolvedBaseEnvironmentFilePath,
        keyName,
        secretKey,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'generateAndStoreSecretKey',
        'Failed to create and save secret key',
      );
      throw error;
    }
  }

  public async orchestrateEnvironmentEncryption(
    directory: string,
    envFilePath: string,
    secretKeyVariable: string,
    envVariables?: string[],
  ) {
    try {
      // Encrypt environment variables
      await this.encryptionManager.encryptAndUpdateEnvironmentVariables(
        directory,
        envFilePath,
        secretKeyVariable,
        envVariables,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'orchestrateEnvironmentEncryption',
        'Failed to orchestrate environment variables',
      );
      throw error;
    }
  }
}
