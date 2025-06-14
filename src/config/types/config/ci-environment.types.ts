export interface CIEnvironmentConfig {
  appMetadata: AppMetadata;
  urls: ServiceUrls;
  users: UserCredentialsSet;
  database: DatabaseConfig;
}

export interface AppMetadata {
  version: string;
  platform: string;
  type: string;
}

export interface ServiceUrls {
  apiBaseUrl: string;
  portalBaseUrl: string;
}

export interface UserCredentialsSet {
  admin: Credentials;
  portal: Credentials;
  database: Credentials;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface DatabaseConfig {
  azureEndpoint: string;
  server: string;
  name: string;
  port: number;
}
