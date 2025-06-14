// src/config/environment/encryption/encryptionTargets.ts
import ENV from '../variables/variables';

/**
 * Configuration for environment variables that should be encrypted
 * Organized by category for better maintainability
 */
export const EncryptionTargets = {
  // Database credentials
  DATABASE_CREDENTIALS: [ENV.DB_USERNAME, ENV.DB_PASSWORD],

  // Admin credentials
  ADMIN_CREDENTIALS: [ENV.ADMIN_USERNAME, ENV.ADMIN_PASSWORD],

  // Portal/Application credentials
  PORTAL_CREDENTIALS: [ENV.PORTAL_USERNAME, ENV.PORTAL_PASSWORD],

  // Combined sets for bulk operations
  ALL_CREDENTIALS: [] as string[],
};

// Populate combined arrays
EncryptionTargets.ALL_CREDENTIALS = [
  ...EncryptionTargets.DATABASE_CREDENTIALS,
  ...EncryptionTargets.ADMIN_CREDENTIALS,
  ...EncryptionTargets.PORTAL_CREDENTIALS,
];
