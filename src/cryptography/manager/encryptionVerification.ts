import { EnvironmentConstants } from './../../config/environment/dotenv/constants';
import AsyncFileManager from '../../utils/fileSystem/asyncFileManager';
import { SECURITY_CONSTANTS } from '../constants/security.constant';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import ErrorHandler from '../../utils/errors/errorHandler';


export default class EncryptionVerification {
  /**
   * Check if a value is properly encrypted with ENC2 format
   */
  private static isEncrypted(value: string): boolean {
    if (!value || typeof value !== 'string') {
      return false;
    }

    if (!value.startsWith(SECURITY_CONSTANTS.FORMAT.PREFIX)) {
      return false;
    }

    const withoutPrefix = value.substring(SECURITY_CONSTANTS.FORMAT.PREFIX.length);
    const parts = withoutPrefix.split(SECURITY_CONSTANTS.FORMAT.SEPARATOR);

    if (parts.length !== SECURITY_CONSTANTS.FORMAT.EXPECTED_PARTS) {
      return false;
    }

    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    return parts.every((part) => part.length > 0 && base64Regex.test(part));
  }

  /**
   * Load environment variables from a specific file
   */
  private static async loadEnvFile(filePath: string) {
    const resolvePath = AsyncFileManager.resolvePath(EnvironmentConstants.ENV_DIR, filePath);

    const exists = await AsyncFileManager.doesFileExist(resolvePath);

    if (!exists) {
      ErrorHandler.logAndThrow(`Environment file not found: ${resolvePath}`, 'loadEnvFile');
    }

    const envContent = await AsyncFileManager.readFile(resolvePath, FileEncoding.UTF8);
    const envVars: { [key: string]: string } = {};

    envContent.split('\n').forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    });

    return envVars;
  }

  public static async validateEncryption(
    varNames: string[],
    filePath: string,
  ): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};
    const envVars = await this.loadEnvFile(filePath);

    for (const varName of varNames) {
      const value = envVars[varName];
      results[varName] = value ? this.isEncrypted(value) : false;
    }

    return results;
  }

  /**
   * Check if all specified variables are encrypted
   * @param varNames - Array of variable names to validate
   * @param filePath - Path to the environment file to check
   */
  public static areAllEncrypted(varNames: string[], filePath: string): boolean {
    const results = this.validateEncryption(varNames, filePath);
    return Object.values(results).every((isEncrypted) => isEncrypted);
  }
}
