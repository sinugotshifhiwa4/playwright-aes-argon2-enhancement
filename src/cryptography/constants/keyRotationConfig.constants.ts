import { KeyRotationConfig } from '../types/keyManagement.types';

export const KeyRotationConfigDefaults: KeyRotationConfig = {
  maxAgeInDays: 90,
  warningThresholdInDays: 7
};
