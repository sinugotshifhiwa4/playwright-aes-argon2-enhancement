/**
 * Represents the parameters required for encryption.
 */
export interface EncryptionResult {
  salt: string;
  iv: string;
  cipherText: string;
}

export interface CryptoByteLengths {
  IV: number;
  WEB_CRYPTO_IV: number;
  SALT: number;
  SECRET_KEY: number;
}

export interface Argon2Config {
  MEMORY_COST: number;
  TIME_COST: number;
  PARALLELISM: number;
}

export interface SecurityConfig {
  BYTE_LENGTHS: CryptoByteLengths;
  ARGON2_PARAMETERS: Argon2Config;
}

export const SECURITY_CONFIG: SecurityConfig = {
  BYTE_LENGTHS: {
    IV: 16,
    WEB_CRYPTO_IV: 12,
    SALT: 32,
    SECRET_KEY: 32,
  },
  ARGON2_PARAMETERS: {
    MEMORY_COST: 262144, // 256 MB
    TIME_COST: 4,
    PARALLELISM: 3,
  },
};
