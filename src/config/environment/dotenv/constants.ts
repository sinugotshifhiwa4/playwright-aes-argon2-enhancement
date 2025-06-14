/**
 * Environment configuration constants and file paths
 */

export enum EnvironmentConstants {
  ENV_DIR = 'envs',
  BASE_ENV_FILE = '.env',
}

export enum EnvironmentFiles {
  DEV = '.env.dev',
  UAT = '.env.uat',
  PROD = '.env.prod',
}

export enum EnvironmentSecretKeys {
  DEV = 'DEV_SECRET_KEY',
  UAT = 'UAT_SECRET_KEY',
  PROD = 'PROD_SECRET_KEY',
}
