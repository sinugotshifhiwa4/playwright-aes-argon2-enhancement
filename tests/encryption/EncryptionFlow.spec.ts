import { test, expect } from '../../fixtures/crypto.fixture';
import SecureKeyGenerator from '../../src/cryptography/key/secureKeyGenerator';
import {
  EnvironmentConstants,
  EnvironmentSecretKeys,
} from '../../src/config/environment/dotenv/constants';
import EncryptionVerification from '../../src/cryptography/manager/encryptionVerification';
import { EnvironmentFilePaths } from '../../src/config/environment/dotenv/mapping';
import { EncryptionTargets } from '../../src/config/environment/variables/encryptionTargets';
import logger from '../../src/utils/logging/loggerManager';

test.describe('Key Management Test Suite', () => {
  test('Rotate secret key and Re-encrypt data @rotate-key', async ({ cryptoOrchestrator }) => {
    await cryptoOrchestrator.rotateKeyAndReEncryptEnvironmentVariables(
      EnvironmentConstants.BASE_ENV_FILE,
      EnvironmentSecretKeys.DEV,
      SecureKeyGenerator.generateBase64SecretKey(),
      EnvironmentFilePaths.dev,
      'manual',
      30,
      true,
    );
  });

  test('Check key rotation status @status', async ({ cryptoOrchestrator }) => {
    const response = await cryptoOrchestrator.checkKeyRotationStatus(EnvironmentSecretKeys.DEV);
    logger.info(`Response: ${JSON.stringify(response)}`);
  });
});

test.describe.serial('Encryption Flow @full-encryption', () => {
  test('Generate rotatable secret key @key-gen', async ({ cryptoOrchestrator }) => {
    await cryptoOrchestrator.generateRotatableSecretKey(
      EnvironmentConstants.ENV_DIR,
      EnvironmentConstants.BASE_ENV_FILE,
      EnvironmentSecretKeys.DEV,
      SecureKeyGenerator.generateBase64SecretKey(),
      undefined,
      true,
    );
  });

  test('Encrypt environment variables @env-encrypt', async ({ cryptoOrchestrator }) => {
    await cryptoOrchestrator.encryptEnvironmentVariables(
      EnvironmentConstants.ENV_DIR,
      EnvironmentFilePaths.dev,
      EnvironmentSecretKeys.DEV,
      EncryptionTargets.PORTAL_CREDENTIALS,
    );

    // Verify encryption
    const results = await EncryptionVerification.validateEncryption(
      ['PORTAL_USERNAME', 'PORTAL_PASSWORD'],
      EnvironmentFilePaths.dev,
    );
    expect(results.PORTAL_USERNAME).toBe(true);
    expect(results.PORTAL_PASSWORD).toBe(true);

    // Check if all variables are encrypted
    // const areAllEncrypted = await EncryptionVerification.areAllEncrypted(
    //   ['PORTAL_USERNAME', 'PORTAL_PASSWORD'],
    //   EnvironmentFilePaths.dev,
    // );
    // expect(areAllEncrypted).toBe(true);
  });
});
