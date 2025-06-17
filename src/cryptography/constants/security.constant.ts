import { SecurityConfig } from '../../config/types/config/security.types';

// Security configurations
export const SECURITY_CONFIG: SecurityConfig = {
  BYTE_LENGTHS: {
    IV: 16,
    WEB_CRYPTO_IV: 12,
    SALT: 32,
    SECRET_KEY: 32,
    HMAC_KEY_LENGTH: 32,
  },
  ARGON2_PARAMETERS: {
    MEMORY_COST: 262144, // 256 MB
    TIME_COST: 4,
    PARALLELISM: 3,
  },
};

// Encryption constants
export const SECURITY_CONSTANTS = {
  /**
   * Format constants for encrypted values
   */
  FORMAT: {
    PREFIX: 'ENC2:',
    SEPARATOR: ':',
    EXPECTED_PARTS: 4,
    PREFIX_LENGTH: 4,
  },

  /**
   * Cryptographic algorithm constants
   */
  CRYPTO: {
    ALGORITHM: 'AES-GCM',
    KEY_USAGE: ['encrypt', 'decrypt'] as KeyUsage[],
  },

  /**
   * Environment variable validation patterns
   */
  VALIDATION: {
    ENV_VAR_KEY_PATTERN: /^[A-Z_][A-Z0-9_]*$/i,
  },
} as const;

export type EncryptionFormat = typeof SECURITY_CONSTANTS.FORMAT;
export type EncryptionCrypto = typeof SECURITY_CONSTANTS.CRYPTO;
export type EncryptionValidation = typeof SECURITY_CONSTANTS.VALIDATION;
