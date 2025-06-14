import { test, expect } from '../../fixtures/crypto.fixture';
import {
  EnvironmentConstants,
  EnvironmentSecretKeys,
} from '../../src/config/environment/dotenv/constants';
import { EnvironmentFilePaths } from '../../src/config/environment/dotenv/mapping';
import { EncryptionTargets } from '../../src/config/environment/variables/encryptionTargets';
import EncryptionService from '../../src/cryptography/service/encryptionService';
import ENV from '../../src/config/environment/variables/variables';
import logger from '../../src/utils/logging/loggerManager';

test.describe.serial('Encryption Flow @all', () => {
  test('Generate Secret Key @generate-key', async ({ encryptionCoordinator }) => {
    await encryptionCoordinator.generateAndStoreSecretKey(
      EnvironmentConstants.ENV_DIR,
      EnvironmentConstants.BASE_ENV_FILE,
      EnvironmentSecretKeys.DEV, // Secret key Environment variable, if you wanna run it for UAT or PROD, change here
    );
  });

  test('Encrypt Credentials @encrypt', async ({ encryptionCoordinator }) => {
    await encryptionCoordinator.orchestrateEnvironmentEncryption(
      EnvironmentConstants.ENV_DIR,
      EnvironmentFilePaths.dev, // Environment file, if you wanna run it for UAT or PROD, change here
      EnvironmentSecretKeys.DEV, // Secret key Environment variable, if you wanna run it for UAT or PROD, change here
      EncryptionTargets.PORTAL_CREDENTIALS, // Credentials to be encrypted, you can change here
    );
  });
});

test.describe.serial('Decryption Flow @decrypt', () => {
  test('Decrypt multiple credentials @decrypt', async () => {
    const credentials: string[] = await EncryptionService.decryptMultiple(
      [ENV.PORTAL_USERNAME, ENV.PORTAL_PASSWORD],
      EnvironmentSecretKeys.DEV,
    );

    logger.info(`Successfully decrypted ${credentials.length} credentials`);

    // Add assertions to verify decryption worked
    expect(credentials).toBeDefined();
    expect(Array.isArray(credentials)).toBe(true);
    expect(credentials.length).toBeGreaterThan(0);
    expect(credentials.length).toBe(2);

    // Verify specific credentials exist and are valid
    expect(credentials[0]).toBeTruthy(); // PORTAL_USERNAME
    expect(credentials[1]).toBeTruthy(); // PORTAL_PASSWORD

    // Verify values are not empty and not still encrypted
    expect(credentials[0]).not.toContain('ENC:');
    expect(credentials[1]).not.toContain('ENC:');

    logger.info('Multiple credentials decryption validation completed successfully');
  });

  test('Decrypt single credential @decrypt', async () => {
    const credential: string = await EncryptionService.decrypt(
      ENV.PORTAL_PASSWORD,
      EnvironmentSecretKeys.DEV,
    );

    // Add assertions to verify decryption worked
    expect(credential).toBeDefined();
    expect(typeof credential).toBe('string');
    expect(credential.length).toBeGreaterThan(0);

    // Verify credential exists and is valid
    expect(credential).toBeTruthy();

    // Verify value is not empty and not still encrypted
    expect(credential).not.toContain('ENC:');

    logger.info('Single credential decryption validation completed successfully');
  });
});
