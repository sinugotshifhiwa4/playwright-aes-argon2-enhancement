import { KeyRotationConfig } from './keyMetadata.types.ts';

export const KeyRotationConfigDefaults: KeyRotationConfig = {
  maxAgeInDays: 90,
  warningThresholdInDays: 7,
  enableAutoRotation: false,
};
