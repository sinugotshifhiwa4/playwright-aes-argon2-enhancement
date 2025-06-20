import { EnvironmentUtils } from '../environmentUtils';
import ENV from '../../variables/variables';
import { Credentials } from '../../../types/auth/credentials.types';
import { EnvironmentStage } from '../../dotenv/types';

export class FetchLocalEnvironmentVariables {
  // App Meta data

  public async getAppVersion(): Promise<string> {
    return EnvironmentUtils.getEnvironmentVariable<string>(
      () => ENV.APP_VERSION,
      'localAppVersion',
      'getAppVersion',
      'Failed to get local app version',
    );
  }

  public async getTestPlatform(): Promise<string> {
    return EnvironmentUtils.getEnvironmentVariable<string>(
      () => ENV.TEST_PLATFORM,
      'localTestPlatform',
      'getTestPlatform',
      'Failed to get local test platform',
    );
  }

  public async getTestType(): Promise<string> {
    return EnvironmentUtils.getEnvironmentVariable<string>(
      () => ENV.TEST_TYPE,
      'localTestType',
      'getTestType',
      'Failed to get local test type',
    );
  }

  // Urls

  public async getApiBaseUrl(): Promise<string> {
    return EnvironmentUtils.getEnvironmentVariable<string>(
      () => ENV.API_BASE_URL,
      'localApiBaseUrl',
      'getApiBaseUrl',
      'Failed to get local API base URL',
    );
  }

  public async getPortalBaseUrl(): Promise<string> {
    return EnvironmentUtils.getEnvironmentVariable<string>(
      () => ENV.PORTAL_BASE_URL,
      'localPortalBaseUrl',
      'getPortalBaseUrl',
      'Failed to get local portal base URL',
    );
  }

  // Users

  /**
   * Get admin credentials for specified environment
   * @param environmentForSecretKeyVariable - The environment ('dev', 'uat', or 'prod'). Defaults to 'dev'
   * @param shouldDecrypt - Whether to decrypt the credentials. Defaults to true
   */
  public async getAdminCredentials(
    environmentForSecretKeyVariable: EnvironmentStage,
    shouldDecrypt: boolean = true
  ): Promise<Credentials> {
    EnvironmentUtils.verifyCredentials({
      username: ENV.ADMIN_USERNAME,
      password: ENV.ADMIN_PASSWORD,
    });

    if (shouldDecrypt) {
      return EnvironmentUtils.decryptCredentials(
        ENV.ADMIN_USERNAME,
        ENV.ADMIN_PASSWORD,
        EnvironmentUtils.getSecretKeyForEnvironment(environmentForSecretKeyVariable),
      );
    } else {
      return {
        username: ENV.ADMIN_USERNAME,
        password: ENV.ADMIN_PASSWORD,
      };
    }
  }

  /**
   * Get portal credentials for specified environment
   * @param environmentForSecretKeyVariable - The environment ('dev', 'uat', or 'prod'). Defaults to 'dev'
   * @param shouldDecrypt - Whether to decrypt the credentials. Defaults to true
   */
  public async getPortalCredentials(
    environmentForSecretKeyVariable: EnvironmentStage,
    shouldDecrypt: boolean = true
  ): Promise<Credentials> {
    EnvironmentUtils.verifyCredentials({
      username: ENV.PORTAL_USERNAME,
      password: ENV.PORTAL_PASSWORD,
    });

    if (shouldDecrypt) {
      return EnvironmentUtils.decryptCredentials(
        ENV.PORTAL_USERNAME,
        ENV.PORTAL_PASSWORD,
        EnvironmentUtils.getSecretKeyForEnvironment(environmentForSecretKeyVariable),
      );
    } else {
      return {
        username: ENV.PORTAL_USERNAME,
        password: ENV.PORTAL_PASSWORD,
      };
    }
  }

  // Database
  /**
   * Get database credentials for specified environment
   * @param environmentForSecretKeyVariable - The environment ('dev', 'uat', or 'prod'). Defaults to 'dev'
   * @param shouldDecrypt - Whether to decrypt the credentials. Defaults to true
   */
  public async getDatabaseCredentials(
    environmentForSecretKeyVariable: EnvironmentStage,
    shouldDecrypt: boolean = true
  ): Promise<Credentials> {
    EnvironmentUtils.verifyCredentials({
      username: ENV.DB_USERNAME,
      password: ENV.DB_PASSWORD,
    });
    
    if (shouldDecrypt) {
      return EnvironmentUtils.decryptCredentials(
        ENV.DB_USERNAME,
        ENV.DB_PASSWORD,
        EnvironmentUtils.getSecretKeyForEnvironment(environmentForSecretKeyVariable),
      );
    } else {
      return {
        username: ENV.DB_USERNAME,
        password: ENV.DB_PASSWORD,
      };
    }
  }

  public async getDatabaseServer(): Promise<string> {
    return EnvironmentUtils.getEnvironmentVariable<string>(
      () => ENV.DB_SERVER,
      'localDatabaseServer',
      'getDatabaseServer',
      'Failed to get local database server',
    );
  }

  public async getDatabaseName(): Promise<string> {
    return EnvironmentUtils.getEnvironmentVariable<string>(
      () => ENV.DATABASE_NAME,
      'localDatabaseName',
      'getDatabaseName',
      'Failed to get local database name',
    );
  }

  public async getDatabasePort(): Promise<number> {
    return EnvironmentUtils.getEnvironmentVariable<number>(
      () => parseInt(ENV.DB_PORT, 10),
      'localDatabasePort',
      'getDatabasePort',
      'Failed to get local database port',
    );
  }

  public async getAzureEndpoint(): Promise<string> {
    return EnvironmentUtils.getEnvironmentVariable<string>(
      () => ENV.AZURE_DB_ENDPOINT,
      'localDatabaseAzureEndpoint',
      'getAzureEndpoint',
      'Failed to get local Azure endpoint',
    );
  }
}