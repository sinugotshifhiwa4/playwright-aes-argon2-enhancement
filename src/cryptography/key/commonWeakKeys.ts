// Generic placeholder/insecure names
const GENERIC = [
  'test',
  'default',
  'secret',
  'password',
  'password123',
  'pass',
  'key',
  'api',
  'access',
];

// Obvious numeric sequences
const NUMERIC_SEQUENCES = [
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
];

// Popular passwords
const POPULAR_PASSWORDS = [
  'letmein',
  'welcome',
  'qwerty',
  'qwertyuiop',
  'abc123',
  'password1',
  'passw0rd',
  'p@ssword',
  'p@ssw0rd',
  'changeme',
  'temp123',
  'mysecret',
  'defaultpassword',
  'opensesame',
];

// Development and testing
const DEV_ENV = [
  'development',
  'dev',
  'testing',
  'stage',
  'staging',
  'prod',
  'production',
  'demo',
  'example',
  'sample',
  'placeholder',
  'dummy',
  'fake',
  'mock',
];

// Default service credentials and common terms
const SERVICE_DEFAULTS = [
  'admin123',
  'root123',
  'user123',
  'guest',
  'public',
  'private',
  'service',
  'system',
  'config',
  'settings',
];

// Database/API terms
const DATABASE_TERMS = [
  'database',
  'db',
  'mysql',
  'postgres',
  'redis',
  'mongodb',
  'sqlite',
  'localhost',
  'local',
  'server',
  'client',
  'token',
  'bearer',
  'jwt',
  'session',
  'cookie',
  'auth',
  'oauth',
];

// Framework/library names
const FRAMEWORKS = [
  'laravel',
  'django',
  'rails',
  'express',
  'nextjs',
  'react',
  'vue',
  'angular',
  'spring',
  'hibernate',
];

// Cloud and deployment terms
const CLOUD_TERMS = [
  'aws',
  'azure',
  'gcp',
  'docker',
  'kubernetes',
  'k8s',
  'heroku',
  'vercel',
  'netlify',
  'github',
  'gitlab',
  'bitbucket',
];

// Environment indicators
const ENV_INDICATORS = [
  'qa',
  'uat',
  'temp',
  'temporary',
  'change',
  'replace',
  'update',
  'modify',
  'edit',
];

// Obvious weak patterns
const WEAK_PATTERNS = [
  'insecure',
  'unsafe',
  'weak',
  'simple',
  'basic',
  'minimal',
  'empty',
  'null',
  'undefined',
  'none',
  'nothing',
  'blank',
];

// Predictable date/time terms
const DATE_PATTERNS = [
  '2023',
  '2024',
  '2025',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

// Final export
export const COMMON_WEAK_KEYS = [
  ...GENERIC,
  ...NUMERIC_SEQUENCES,
  ...POPULAR_PASSWORDS,
  ...DEV_ENV,
  ...SERVICE_DEFAULTS,
  ...DATABASE_TERMS,
  ...FRAMEWORKS,
  ...CLOUD_TERMS,
  ...ENV_INDICATORS,
  ...WEAK_PATTERNS,
  ...DATE_PATTERNS,
];
