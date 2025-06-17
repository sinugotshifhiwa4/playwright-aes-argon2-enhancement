import AsyncFileManager from '../../utils/fileSystem/asyncFileManager';
import path from 'path';
import { EnvironmentConstants } from '../../config/environment/dotenv/constants';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

export class EnvironmentSecretFileManager {
  private readonly DIRECTORY = EnvironmentConstants.ENV_DIR;
  private readonly BASE_ENV_FILE = EnvironmentConstants.BASE_ENV_FILE;

  /**
   * Gets the base environment file path
   */
  public async getBaseEnvironmentFilePath(): Promise<string> {
    try {
      const dirExists = await AsyncFileManager.doesDirectoryExist(this.DIRECTORY);
      if (!dirExists) {
        await AsyncFileManager.ensureDirectoryExists(this.DIRECTORY);
      }

      return AsyncFileManager.resolvePath(this.DIRECTORY, this.BASE_ENV_FILE);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'getBaseEnvironmentFilePath',
        'Failed to get base environment file path',
      );
      throw error;
    }
  }

  /**
   * Checks if the base environment file exists
   */
  public async doesBaseEnvFileExist(baseEnvFilePath: string): Promise<boolean> {
    return AsyncFileManager.doesFileExist(baseEnvFilePath);
  }

  /**
   * Returns the path to the environment file with the given file name
   */
  public resolveEnvironmentFilePath(fileName: string): string {
    try {
      return AsyncFileManager.resolvePath(this.DIRECTORY, fileName);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'resolveEnvironmentFilePath',
        'Failed to resolve environment file path',
      );
      throw error;
    }
  }

  /**
   * Checks if an environment-specific file exists
   */
  public async doesEnvironmentFileExist(fileName: string): Promise<boolean> {
    const filePath = this.resolveEnvironmentFilePath(fileName);
    return AsyncFileManager.doesFileExist(filePath);
  }

  /**
   * Logs appropriate message when environment file is not found
   */
  public logEnvironmentFileNotFound(fileName: string, filePath: string, envName: string): void {
    logger.warn(
      `Environment '${envName}' was specified but its configuration file could not be found at ${filePath}.`,
    );
  }

  /**
   * Handles the case where the base environment file is missing
   */
  public async handleMissingBaseEnvFile(baseEnvFilePath: string): Promise<void> {
    const shouldRequireBaseFile = process.env.REQUIRE_BASE_ENV_FILE === 'true';
    const isGeneratingKey = (process.env.PLAYWRIGHT_GREP || '').includes('@rotatable-key');
    const baseEnvFile = EnvironmentConstants.BASE_ENV_FILE;

    if (isGeneratingKey) {
      return;
    }

    if (shouldRequireBaseFile) {
      ErrorHandler.logAndThrow(
        `Required base environment file not found at ${baseEnvFilePath}. Expected location: ${path.join(this.DIRECTORY, baseEnvFile)}`,
        'handleMissingBaseEnvFile',
      );
    } else {
      const warningMessage = [
        `Base environment file not found at: ${baseEnvFilePath}.`,
        `Expected location based on configuration: ${path.join(this.DIRECTORY, baseEnvFile)}.`,
        `This file is optional if you are running the secret key generation for the first time.`,
        `To suppress this warning in future runs, ensure the file exists or set 'REQUIRE_BASE_ENV_FILE=false'.`,
      ].join('\n');
      logger.warn(warningMessage);
    }
  }

  /**
   * Reads content from the base environment file or creates it if it doesn't exist
   */
  public async getOrCreateBaseEnvFileContent(filePath: string): Promise<string> {
    try {
      const fileExists = await AsyncFileManager.ensureFileExists(filePath);

      if (!fileExists) {
        logger.warn(
          `Base environment file not found at "${filePath}". A new empty file will be created.`,
        );
        await AsyncFileManager.writeFile(filePath, '', 'Created empty environment file');
        return '';
      }

      return await AsyncFileManager.readFile(filePath, FileEncoding.UTF8);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'getOrCreateBaseEnvFileContent',
        `Failed to read or initialize environment file at "${filePath}"`,
      );
      throw error;
    }
  }

  /**
   * Writes secret key variable to base environment file
   */
  public async writeSecretKeyVariableToBaseEnvFile(
    filePath: string,
    content: string,
    keyName: string,
  ): Promise<void> {
    try {
      await AsyncFileManager.writeFile(filePath, content, keyName, FileEncoding.UTF8);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'writeSecretKeyVariableToBaseEnvFile',
        `Failed to write key "${keyName}" to environment file.`,
      );
      throw error;
    }
  }

  /**
   * Gets the value of a given key from the base environment file
   */
  public async getKeyValue(filePath: string, keyName: string): Promise<string | undefined> {
    try {
      const resolvePath = path.resolve(this.DIRECTORY, filePath);
      const fileContent = await this.getOrCreateBaseEnvFileContent(resolvePath);
      const regex = new RegExp(`^${keyName}=(.*)$`, 'm');
      const match = fileContent.match(regex);
      return match ? match[1] : undefined;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'getKeyValue',
        `Failed to retrieve value for key "${keyName}".`,
      );
      throw error;
    }
  }

  /**
   * Updates an existing key value in the environment file
   */
  public async updateKeyValue(filePath: string, keyName: string, newValue: string): Promise<void> {
    try {
      // Resolve the full path properly
      const resolvedPath = path.resolve(this.DIRECTORY, filePath);

      // Get current file content
      let fileContent = await this.getOrCreateBaseEnvFileContent(resolvedPath);

      // Create regex to match the key line
      const regex = new RegExp(`^${keyName}=.*$`, 'm');

      if (regex.test(fileContent)) {
        // Key exists - replace it
        fileContent = fileContent.replace(regex, `${keyName}=${newValue}`);
        logger.debug(`Key "${keyName}" found and updated`);
      } else {
        // Key doesn't exist - add it
        if (fileContent && !fileContent.endsWith('\n')) {
          fileContent += '\n';
        }
        fileContent += `${keyName}=${newValue}`;
        logger.debug(`Key "${keyName}" not found, added to end of file`);
      }

      // Write the updated content back to the file
      await this.writeSecretKeyVariableToBaseEnvFile(resolvedPath, fileContent, keyName);

      //logger.info(`Successfully updated key "${keyName}" in ${resolvedPath}`);
    } catch (error) {
      ErrorHandler.captureError(error, 'updateKeyValue', `Failed to update key "${keyName}" value`);
      throw error;
    }
  }
}
