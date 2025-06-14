/**
 * Environment stage mappings
 */
import { EnvironmentFiles, EnvironmentSecretKeys } from './constants';
import type { EnvironmentStage } from './types';

export const EnvironmentFilePaths: Readonly<Record<EnvironmentStage, string>> = {
  dev: EnvironmentFiles.DEV,
  uat: EnvironmentFiles.UAT,
  prod: EnvironmentFiles.PROD,
};

export const SecretKeyPaths: Readonly<Record<EnvironmentStage, string>> = {
  dev: EnvironmentSecretKeys.DEV,
  uat: EnvironmentSecretKeys.UAT,
  prod: EnvironmentSecretKeys.PROD,
};
