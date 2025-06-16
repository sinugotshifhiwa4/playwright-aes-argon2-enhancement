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
  HMAC_KEY_LENGTH: number;
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
