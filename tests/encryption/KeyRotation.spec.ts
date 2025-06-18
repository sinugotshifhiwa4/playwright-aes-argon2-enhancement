import { test } from '../../fixtures/crypto.fixture';
import SecureKeyGenerator from '../../src/cryptography/key/secureKeyGenerator';
import {
  EnvironmentConstants,
  EnvironmentSecretKeys,
} from '../../src/config/environment/dotenv/constants';
import { EnvironmentFilePaths } from '../../src/config/environment/dotenv/mapping';
import { EncryptionTargets } from '../../src/config/environment/variables/encryptionTargets';
//import ENV from '../../src/config/environment/variables/variables';
import logger from '../../src/utils/logging/loggerManager';

// import { test } from '../../fixtures/crypto.fixture';
// import {
//   EnvironmentConstants,
//   EnvironmentSecretKeys,
// } from '../../src/config/environment/dotenv/constants';
// import { EnvironmentFilePaths } from '../../src/config/environment/dotenv/mapping';
// import { VARIABLES_TO_ENCRYPT } from '../../src/config/environment/variables/getVariablesToEncrypt';

// import logger from '../../src/utils/logging/loggerManager';

// test.describe.serial('Encryption Flow @full-encryption', () => {
//   test('Generate Secret Key @key-gen', async ({ cryptoOrchestrator }) => {
//     await cryptoOrchestrator.generateSecretKey(
//       EnvironmentConstants.ENV_DIR,
//       EnvironmentConstants.BASE_ENV_FILE,
//       EnvironmentSecretKeys.DEV,
//     );

//     logger.info('Secret key generation completed successfully.');
//   });

//   test('Encrypt Credentials @env-encrypt', async ({ cryptoOrchestrator }) => {
//     await cryptoOrchestrator.encryptEnvironmentVariables(
//       EnvironmentConstants.ENV_DIR,
//       EnvironmentFilePaths.dev,
//       EnvironmentSecretKeys.DEV,
//       VARIABLES_TO_ENCRYPT.ADMIN_CREDENTIALS,
//     );

//     logger.info('Encryption process completed successfully.');
//   });
// });


test.describe('Key Rotation @key-rotation Test Suite', () => {
  test('Generate rotatable secret key @rotatable-key', async ({ encryptionCoordinator }) => {
    await encryptionCoordinator.generateRotatableSecretKey(
      EnvironmentConstants.ENV_DIR,
      EnvironmentConstants.BASE_ENV_FILE,
      EnvironmentSecretKeys.DEV,
      SecureKeyGenerator.generateBase64SecretKey(),
      undefined,
    );
  });

  // test('Rotate secret key and Re-encrypt data @del', async ({ encryptionCoordinator }) => {
  //   await encryptionCoordinator.r(
  //     EnvironmentConstants.BASE_ENV_FILE,
  //     EnvironmentSecretKeys.DEV,
  //     SecureKeyGenerator.generateBase64SecretKey(),
  //     EnvironmentFilePaths.dev,
  //     'manual',
  //     100,
  //     true,
  //   );
  // });

  // test('Rotate secret key and Re-encrypt data for single environment @single', async ({
  //   encryptionCoordinator,
  // }) => {
  //   await encryptionCoordinator.rotateKeyForSingleEnvironment(
  //     EnvironmentConstants.BASE_ENV_FILE,
  //     EnvironmentSecretKeys.DEV,
  //     SecureKeyGenerator.generateBase64SecretKey(),
  //     '',
  //     'manual',
  //     100,
  //     true,
  //   );
  // });
});

test.describe('Environment variables Encryption Test Suite', () => {
  test('Generate rotatable secret key @encrypt', async ({ encryptionCoordinator }) => {
    await encryptionCoordinator.encryptEnvironmentVariables(
      EnvironmentConstants.ENV_DIR,
      EnvironmentFilePaths.dev,
      EnvironmentSecretKeys.DEV,
      EncryptionTargets.PORTAL_CREDENTIALS,
    );
  });
});

test.describe('Key Audit Test Suite', () => {
  test('Generate rotatable secret key @audit', async ({ encryptionCoordinator }) => {
    const audit = await encryptionCoordinator.performKeyRotationAudit();

    if (audit.keysNeedingRotation.length === 0) {
      logger.info('No keys require rotation. All keys are healthy.');
    } else {
      logger.error('Keys needing rotation:', audit.keysNeedingRotation);
    }

    if (audit.keysNeedingWarning.length === 0) {
      logger.info('No keys nearing expiration. No warnings issued.');
    } else {
      logger.warn('Keys needing warning:', audit.keysNeedingWarning);
    }
  });

  test('get Key information @info', async ({ encryptionCoordinator }) => {
    const info = await encryptionCoordinator.getKeyInformation(EnvironmentSecretKeys.DEV);

    if (info.exists) {
      logger.info('Key metadata:', info.metadata);
      logger.info('Rotation status:', info.rotationStatus);
    } else {
      logger.info(`No data available for ${EnvironmentSecretKeys.DEV}`);
    }
  });
});
