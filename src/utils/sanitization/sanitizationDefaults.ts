/**
 * List of sensitive keys to sanitize
 */

export const DefaultSensitiveKeys = [
  // Authentication & Authorization
  'password',
  'passwd',
  'pwd',
  'apiKey',
  'api_key',
  'secret',
  'authorization',
  'auth',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'bearerToken',
  'bearer_token',
  'cookie',
  'jwt',
  'session',
  'sessionId',
  'session_id',

  // Personal Information
  'ssn',
  'idNumber',
  'id_number',
  'identityNumber',
  'identity_number',
  'creditCard',
  'credit_card',
  'ccNumber',
  'cardNumber',
  'cvv',
  'pin',
  //'email', // Consider if you want to mask emails

  // Database & Infrastructure
  'connectionString',
  'connection_string',
  'dbPassword',
  'db_password',
  'privateKey',
  'private_key',
  'publicKey', // Usually safe, but some prefer to mask
  'encryptionKey',
  'encryption_key',

  // Cloud & Services
  'awsAccessKey',
  'aws_access_key',
  'awsSecretKey',
  'aws_secret_key',
  'gcpKey',
  'gcp_key',
  'azureKey',
  'azure_key',
];

export const neverTruncateDefaultKeys = [
  'context',
  'url',
  'source',
  'method',
  'environment',
  'timestamp',
];

/**
 * Default mask value for sensitive data
 */
export const MaskValue = '********';
