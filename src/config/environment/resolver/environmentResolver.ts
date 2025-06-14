import { FetchCIEnvironmentVariables } from './fetch/fetchCIEnvironmentVariables';
import { FetchLocalEnvironmentVariables } from './fetch/fetchLocalEnvironmentVariables';
import { EnvironmentUtils } from './environmentUtils';
import { Credentials } from '../../types/auth/credentials.types';
import { EnvironmentStage } from '../dotenv/types';

export class EnvironmentResolver {
  private fetchCIEnvironmentVariables: FetchCIEnvironmentVariables;
  private FetchLocalEnvironmentVariables: FetchLocalEnvironmentVariables;

  constructor(
    fetchCIEnvironmentVariables: FetchCIEnvironmentVariables,
    fetchLocalEnvironmentVariables: FetchLocalEnvironmentVariables,
  ) {
    this.fetchCIEnvironmentVariables = fetchCIEnvironmentVariables;
    this.FetchLocalEnvironmentVariables = fetchLocalEnvironmentVariables;
  }

  // App Metadata

  public async getAppVersion(): Promise<string> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getAppVersion(),
      () => this.FetchLocalEnvironmentVariables.getAppVersion(),
      'getAppVersion',
      'Failed to get app version',
    );
  }

  public async getTestPlatform(): Promise<string> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getTestPlatform(),
      () => this.FetchLocalEnvironmentVariables.getTestPlatform(),
      'getTestPlatform',
      'Failed to get test platform',
    );
  }

  public async getTestType(): Promise<string> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getTestType(),
      () => this.FetchLocalEnvironmentVariables.getTestType(),
      'getTestType',
      'Failed to get test type',
    );
  }

  // Urls

  public async getApiBaseUrl(): Promise<string> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getApiBaseUrl(),
      () => this.FetchLocalEnvironmentVariables.getApiBaseUrl(),
      'getApiBaseUrl',
      'Failed to get API base URL',
    );
  }

  public async getPortalBaseUrl(): Promise<string> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getPortalBaseUrl(),
      () => this.FetchLocalEnvironmentVariables.getPortalBaseUrl(),
      'getPortalBaseUrl',
      'Failed to get portal base URL',
    );
  }

  public async getAdminCredentials(
    environmentForSecretKeyVariable: EnvironmentStage,
  ): Promise<Credentials> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getAdminCredentials(),
      () =>
        this.FetchLocalEnvironmentVariables.getAdminCredentials(environmentForSecretKeyVariable),
      'getAdminCredentials',
      'Failed to get admin credentials',
    );
  }

  public async getPortalCredentials(
    environmentForSecretKeyVariable: EnvironmentStage,
  ): Promise<Credentials> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getPortalCredentials(),
      () =>
        this.FetchLocalEnvironmentVariables.getPortalCredentials(environmentForSecretKeyVariable),
      'getPortalCredentials',
      'Failed to get portal credentials',
    );
  }

  // Database

  public async getDatabaseCredentials(
    environmentForSecretKeyVariable: EnvironmentStage,
  ): Promise<Credentials> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getDatabaseCredentials(),
      () =>
        this.FetchLocalEnvironmentVariables.getDatabaseCredentials(environmentForSecretKeyVariable),
      'getDatabaseCredentials',
      'Failed to get database credentials',
    );
  }

  public async getDatabaseServer(): Promise<string> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getDatabaseServer(),
      () => this.FetchLocalEnvironmentVariables.getDatabaseServer(),
      'getDatabaseServer',
      'Failed to get database server',
    );
  }

  public async getDatabaseName(): Promise<string> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getDatabaseName(),
      () => this.FetchLocalEnvironmentVariables.getDatabaseName(),
      'getDatabaseName',
      'Failed to get database name',
    );
  }

  public async getDatabasePort(): Promise<number> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getDatabasePort(),
      () => this.FetchLocalEnvironmentVariables.getDatabasePort(),
      'getDatabasePort',
      'Failed to get database port',
    );
  }

  public async getAzureEndpoint(): Promise<string> {
    return EnvironmentUtils.getEnvironmentValue(
      () => this.fetchCIEnvironmentVariables.getAzureEndpoint(),
      () => this.FetchLocalEnvironmentVariables.getAzureEndpoint(),
      'getAzureEndpoint',
      'Failed to get Azure endpoint',
    );
  }
}
