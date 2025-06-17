/**
 * Common weak keys to be rejected during validation.
 * This avoids rejecting all low-entropy values,
 * but still filters obvious insecure defaults and predictable keys.
 */
export const COMMON_WEAK_KEYS = [
  // Generic weak terms
  'test',
  'default',
  'secret',
  'password',
  'password123',
  'pass',
  // 'admin',
  // 'root',
  'key',
  'api',
  'access',

  // Obvious numeric sequences
  '123',
  '1234',
  '12345',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '111111',
  '000000',
  '654321',

  // Popular default or reused passwords
  'letmein',
  'welcome',
  'qwerty',
  'qwertyuiop',
  'abc123',

  // Variants of 'password'
  'password1',
  'passw0rd',
  'p@ssword',
  'p@ssw0rd',

  // Service/setup-related
  'changeme',
  'temp123',
  'mysecret',
  'defaultpassword',
  'opensesame',
];
