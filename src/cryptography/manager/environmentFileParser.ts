import AsyncFileManager from '../../utils/fileSystem/asyncFileManager';
import { SECURITY_CONSTANTS } from '../config/security.constant';
import { FileEncoding } from '../../config/types/enums/file-encoding.enum';
import ErrorHandler from '../../utils/errors/errorHandler';
import logger from '../../utils/logging/loggerManager';

/**
 * Handles parsing, reading, and writing of environment files.
 * Responsible for file I/O operations and environment variable extraction.
 */
export class EnvironmentFileParser {
  /**
   * Reads the environment file and returns its content as an array of lines.
   */
  public async readEnvironmentFileAsLines(
    directory: string,
    environmentFilePath: string,
  ): Promise<string[]> {
    try {
      const resolvedPath = await this.resolveFilePath(directory, environmentFilePath);

      const exists = await AsyncFileManager.doesFileExist(resolvedPath);
      if (!exists) {
        throw new Error(`Environment file not found: ${resolvedPath}`);
      }

      const content = await AsyncFileManager.readFile(resolvedPath, FileEncoding.UTF8);

      if (!content) {
        logger.warn(`Environment file is empty: ${resolvedPath}`);
        return [];
      }

      // Handle both Windows (\r\n) and Unix (\n) line endings
      return content.split(/\r?\n/);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'readEnvironmentFileAsLines',
        'Failed to read environment file',
      );
      throw error;
    }
  }

  /**
   * Writes the updated lines back to the environment file.
   */
  public async writeEnvironmentFileLines(
    environmentFilePath: string,
    lines: string[],
  ): Promise<void> {
    try {
      const content = lines.join('\n');
      await AsyncFileManager.writeFile(environmentFilePath, content, FileEncoding.UTF8);
      logger.debug(`Successfully wrote ${lines.length} lines to ${environmentFilePath}`);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'writeEnvironmentFileLines',
        'Failed to write environment file',
      );
      throw error;
    }
  }

  /**
   * Extracts all environment variables from the file lines.
   */
  public extractEnvironmentVariables(lines: string[]): Record<string, string> {
    const variables: Record<string, string> = {};
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const parsedVariable = this.parseEnvironmentLine(line, lineNumber);

      if (parsedVariable) {
        const [key, value] = parsedVariable;

        if (Object.prototype.hasOwnProperty.call(variables, key)) {
          logger.warn(`Duplicate environment variable '${key}' found at line ${lineNumber}`);
        }

        variables[key] = value;
      }
    }

    logger.debug(`Extracted ${Object.keys(variables).length} environment variables`);
    return variables;
  }

  /**
   * Parses a single environment file line to extract key-value pairs.
   */
  private parseEnvironmentLine(line: string, lineNumber?: number): [string, string] | null {
    const trimmedLine = line.trim();

    // Skip empty lines, comments, and lines without equals
    if (!trimmedLine || trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
      return null;
    }

    const equalIndex = trimmedLine.indexOf('=');
    const key = trimmedLine.substring(0, equalIndex).trim();
    const value = trimmedLine.substring(equalIndex + 1);

    // Validate key format
    if (!key || !SECURITY_CONSTANTS.VALIDATION.ENV_VAR_KEY_PATTERN.test(key)) {
      const lineInfo = lineNumber ? ` at line ${lineNumber}` : '';
      logger.warn(`Invalid environment variable key format: '${key}'${lineInfo}`);
      return null;
    }

    return [key, value];
  }

  /**
   * Updates the environment file lines with a new value for the specified variable.
   */
  public updateEnvironmentFileLines(
    existingLines: string[],
    envVariable: string,
    value: string,
  ): string[] {
    let wasUpdated = false;

    const updatedLines = existingLines.map((line) => {
      const trimmedLine = line.trim();

      // Look for the exact variable assignment
      if (trimmedLine.startsWith(`${envVariable}=`)) {
        wasUpdated = true;
        return `${envVariable}=${value}`;
      }

      return line;
    });

    // If the variable wasn't found, append it to the end
    if (!wasUpdated) {
      updatedLines.push(`${envVariable}=${value}`);
      logger.debug(`Added new environment variable: ${envVariable}`);
    }

    return updatedLines;
  }

  /**
   * Finds an environment variable by key or value.
   */
  public findEnvironmentVariableByKey(
    allEnvVariables: Record<string, string>,
    lookupValue: string,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    // First, check if it's a direct key match
    if (Object.prototype.hasOwnProperty.call(allEnvVariables, lookupValue)) {
      result[lookupValue] = allEnvVariables[lookupValue];
      return result;
    }

    // Then, check if it matches any value
    for (const [key, value] of Object.entries(allEnvVariables)) {
      if (value === lookupValue) {
        result[key] = value;
        return result;
      }
    }

    return result;
  }

  /**
   * Resolves the full file path by ensuring the directory exists and combining paths.
   */
  public async resolveFilePath(directoryName: string, fileName: string): Promise<string> {
    try {
      await AsyncFileManager.ensureDirectoryExists(directoryName);
      return AsyncFileManager.getFilePath(directoryName, fileName);
    } catch (error) {
      ErrorHandler.captureError(error, 'resolveFilePath', 'Failed to resolve file path');
      throw error;
    }
  }
}
