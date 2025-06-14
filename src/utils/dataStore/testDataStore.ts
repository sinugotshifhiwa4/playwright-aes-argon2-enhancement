import { StorableObject } from '../../config/types/data/data-store.types';
import ErrorHandler from '../errors/errorHandler';
import logger from '../logging/loggerManager';

export default class TestDataStore {
  /**
   * Sets a value in the data map for a given testId.
   *
   * @param map The map in which to store the value.
   * @param testId The unique identifier for the test.
   * @param key The key to associate with the value.
   * @param value The value to store.
   * @returns true if the operation was successful, otherwise false.
   */
  public static setValue<T extends StorableObject, K extends keyof T>(
    map: Map<string, T>,
    testId: string,
    key: K,
    value: T[K],
  ): boolean {
    this.validateParams(testId, key);

    try {
      const existingData = map.get(testId) ?? ({} as Partial<T>);
      const dataForId = this.deepClone(existingData) as T;
      dataForId[key] = value;
      map.set(testId, dataForId);
      logger.debug(`Data successfully saved for key: "${String(key)}" in testId: "${testId}".`);
      return true;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'setValue',
        `Failed to set value for testId: ${testId}, key: ${String(key)}`,
      );
      throw error;
    }
  }

  /**
   * Retrieves a value from the data map for a given testId.
   *
   * @param map The map from which to retrieve the value.
   * @param testId The unique identifier for the test.
   * @param key The key associated with the value to retrieve.
   * @param options An object containing options for the retrieval.
   *                Options:
   *                - throwIfMissing: If true, throws an error if the key does not exist.
   *                - defaultValue: The default value to return if the key does not exist.
   * @returns The value associated with the key if it exists, or the default value if it does not.
   */
  public static getValue<T extends StorableObject, K extends keyof T>(
    map: Map<string, T>,
    testId: string,
    key: K,
    options?: { throwIfMissing?: boolean; defaultValue?: T[K] },
  ): T[K] | undefined {
    const { throwIfMissing = false, defaultValue } = options || {};
    this.validateParams(testId, key);

    try {
      const dataForId = map.get(testId);
      if (!dataForId) {
        return this.resolveOrThrow(
          `No data found for testId: "${testId}".`,
          throwIfMissing,
          defaultValue,
        );
      }

      if (!(key in dataForId)) {
        return this.resolveOrThrow(
          `Data is not set for key: "${String(key)}" in testId: "${testId}".`,
          throwIfMissing,
          defaultValue,
        );
      }

      return dataForId[key];
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'getValue',
        `Failed to get data for testId: ${testId}, key: ${String(key)}`,
      );
      throw error;
    }
  }

  /**
   * Resolves a value given a condition.
   * @param message The message to log in case of an error.
   * @param shouldThrow Whether to throw an error.
   * @param defaultValue The value to return if shouldThrow is false.
   * @returns The resolved value.
   * @throws If shouldThrow is true.
   */
  private static resolveOrThrow<T>(
    message: string,
    shouldThrow: boolean,
    defaultValue?: T,
  ): T | undefined {
    if (shouldThrow) {
      logger.error(message);
      throw new Error(message);
    }
    logger.warn(message);
    return defaultValue;
  }

  /**
   * Checks if a specific field exists for a testId.
   * @param map The map in which to search for the testId.
   * @param testId The unique identifier for the test.
   * @param key The key to check for.
   * @returns true if the key exists for the testId, false otherwise.
   * @throws If an error occurs while executing the method.
   */
  public static hasKeyForTestId<T extends StorableObject, K extends keyof T>(
    map: Map<string, T>,
    testId: string,
    key: K,
  ): boolean {
    try {
      this.validateParams(testId, key);
      const dataForId = map.get(testId);
      return Boolean(dataForId && key in dataForId);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'hasKeyForTestId',
        `Failed to check field for testId: ${testId}, key: ${String(key)}`,
      );
      throw error;
    }
  }

  /**
   * Checks if a testId exists in the data map.
   * @param map The map in which to search for the testId.
   * @param testId The unique identifier for the test.
   * @returns true if the testId exists in the map, false otherwise.
   * @throws If an error occurs while executing the method.
   */
  public static containsTestId<T extends StorableObject>(
    map: Map<string, T>,
    testId: string,
  ): boolean {
    try {
      this.validateParams(testId);
      return map.has(testId);
    } catch (error) {
      ErrorHandler.captureError(error, 'containsTestId', `Failed to check testId: ${testId}`);
      throw error;
    }
  }

  /**
   * Removes a testId from the data map.
   * @param map The map in which to remove the testId.
   * @param testId The unique identifier for the test.
   * @returns true if the testId was removed successfully, false otherwise.
   * @throws If an error occurs while executing the method.
   */
  public static removeTestId<T extends StorableObject>(
    map: Map<string, T>,
    testId: string,
  ): boolean {
    try {
      this.validateParams(testId);
      const result = map.delete(testId);
      logger.debug(
        result
          ? `TestId "${testId}" removed successfully.`
          : `TestId "${testId}" not found for removal.`,
      );
      return result;
    } catch (error) {
      ErrorHandler.captureError(error, 'removeTestId', `Failed to remove testId: ${testId}`);
      throw error;
    }
  }

  /**
   * Retrieves the data associated with a testId from the data map.
   *
   * @param map The map from which to retrieve the data.
   * @param testId The unique identifier for the test.
   * @returns The data associated with the testId if it exists, undefined otherwise.
   * @throws If an error occurs while executing the method.
   */
  public static getTestIdData<T extends StorableObject>(
    map: Map<string, T>,
    testId: string,
  ): T | undefined {
    try {
      this.validateParams(testId);
      return map.get(testId);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        'getTestIdData',
        `Failed to get test data for testId: ${testId}`,
      );
      throw error;
    }
  }

  /**
   * Retrieves all testIds in the data map.
   * @param map The map in which to search for testIds.
   * @returns An array of all testIds in the map.
   * @throws If an error occurs while executing the method.
   */
  public static getAllTestIds<T extends StorableObject>(map: Map<string, T>): string[] {
    try {
      return Array.from(map.keys());
    } catch (error) {
      ErrorHandler.captureError(error, 'getAllTestIds', 'Failed to get all testIds');
      throw error;
    }
  }

  /**
   * Clears all entries from the data map.
   *
   * @param map The map from which all test entries will be removed.
   * @throws If an error occurs while executing the method.
   */
  public static clearAll<T extends StorableObject>(map: Map<string, T>): void {
    try {
      const count = map.size;
      map.clear();
      logger.debug(`Cleared ${count} test entries from the map.`);
    } catch (error) {
      ErrorHandler.captureError(error, 'clearAll', 'Failed to clear all test data');
      throw error;
    }
  }

  /**
   * Returns the number of testIds stored in the data map.
   *
   * @param map The map from which to retrieve the count of testIds.
   * @returns The number of testIds in the map.
   * @throws If an error occurs while executing the method.
   */
  public static getTestIdsCount<T extends StorableObject>(map: Map<string, T>): number {
    try {
      return map.size;
    } catch (error) {
      ErrorHandler.captureError(error, 'getTestIdsCount', 'Failed to get test ids count');
      throw error;
    }
  }

  // Method overloads for validateParams
  private static validateParams(testId: string): void;
  private static validateParams(testId: string, key: string | number | symbol): void;

  /**
   * Validates that a testId and an optional key are valid.
   * @throws If either the testId or key is invalid.
   */
  private static validateParams(testId: string, key?: string | number | symbol): void {
    if (!testId?.trim()) {
      ErrorHandler.logAndThrow('Invalid testId provided.', 'TestDataMapStore');
    }
    // Check if key is explicitly passed (even if undefined)
    if (key !== undefined && key == null) {
      ErrorHandler.logAndThrow('Invalid key provided.', 'validateParams');
    }
  }

  /**
   * Creates a deep copy of the provided value.
   *
   * @param value The value to deep clone.
   * @returns A deep clone of the provided value.
   */
  private static deepClone<T>(value: T): T {
    return structuredClone(value);
  }
}
