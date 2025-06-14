export const ENCRYPTION_CONSTANTS = {
  /**
   * Format constants for encrypted values
   */
  FORMAT: {
    /** Prefix used to identify encrypted values */
    PREFIX: 'ENC:',
    /** Separator used between encrypted value parts */
    SEPARATOR: ':',
    /** Expected number of parts in encrypted value (salt:iv:cipherText) */
    EXPECTED_PARTS: 3,
    /** Length of the encryption prefix */
    PREFIX_LENGTH: 4,
  },

  /**
   * Cryptographic algorithm constants
   */
  CRYPTO: {
    /** AES-GCM algorithm identifier */
    ALGORITHM: 'AES-GCM',
    /** Allowed key usages for encryption operations */
    KEY_USAGE: ['encrypt', 'decrypt'] as KeyUsage[],
  },

  /**
   * Environment variable validation patterns
   */
  VALIDATION: {
    /** Regex pattern for valid environment variable key names */
    ENV_VAR_KEY_PATTERN: /^[A-Z_][A-Z0-9_]*$/i,
  },
} as const;

/**
 * Type definitions for encryption constants
 */
export type EncryptionFormat = typeof ENCRYPTION_CONSTANTS.FORMAT;
export type EncryptionCrypto = typeof ENCRYPTION_CONSTANTS.CRYPTO;
export type EncryptionValidation = typeof ENCRYPTION_CONSTANTS.VALIDATION;
