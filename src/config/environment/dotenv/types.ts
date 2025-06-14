/**
 * Environment types and type guards
 */

export type EnvironmentStage = 'dev' | 'uat' | 'prod';

export const ENVIRONMENT_STAGES: readonly EnvironmentStage[] = ['dev', 'uat', 'prod'] as const;

export interface EnvironmentConfig {
  readonly filePath: string;
  readonly secretKey: string;
  readonly baseEnvFile: string;
  readonly envDir: string;
}

export function isValidEnvironmentStage(value: string): value is EnvironmentStage {
  return ENVIRONMENT_STAGES.includes(value as EnvironmentStage);
}
