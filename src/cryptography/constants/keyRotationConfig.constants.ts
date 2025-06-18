import { KeyRotationConfig } from '../types/keyMetadata.types.js';

export const KeyRotationConfigDefaults: KeyRotationConfig = {
  maxAgeInDays: 90,
  warningThresholdInDays: 7
};
