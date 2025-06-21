import { test } from '../../fixtures/crypto.fixture';
import { EnvironmentSecretKeys } from '../../src/config/environment/dotenv/constants';
import logger from '../../src/utils/logging/loggerManager';

test.describe('Key Rotation Security Test Suite', () => {
  test('Perform system audit @system-audit', async ({ cryptoOrchestrator }) => {
    const response = await cryptoOrchestrator.performSystemAudit();

    if (response.keysNeedingRotation.length === 0) {
      logger.info('No keys require rotation. All keys are healthy.');
    } else {
      logger.error('Keys needing rotation:', response.keysNeedingRotation);
    }

    if (response.keysNeedingWarning.length === 0) {
      logger.info('No keys nearing expiration. No warnings issued.');
    } else {
      logger.warn('Keys needing warning:', response.keysNeedingWarning);
    }
  });

  test('Get Key information @key-info', async ({ cryptoOrchestrator }) => {
    const response = await cryptoOrchestrator.getKeyInformation(EnvironmentSecretKeys.DEV, false);

    if (response.exists) {
      logger.info('Key metadata:', response.metadata);
      logger.info('Rotation status:', response.rotationStatus);
    } else {
      logger.info(`No data available for ${EnvironmentSecretKeys.DEV}`);
    }
  });
});
