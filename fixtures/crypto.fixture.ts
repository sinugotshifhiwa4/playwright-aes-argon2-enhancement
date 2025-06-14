import { test as cryptoBaseTest } from '@playwright/test';

import { EnvironmentSecretFileManager } from '../src/utils/environment/environmentSecretFileManager';
import { EncryptionManager } from '../src/cryptography/service/encryptionManager';
import { EncryptionCoordinator } from '../src/cryptography/service/encryptionCoordinator';

type customFixtures = {
  environmentSecretFileManager: EnvironmentSecretFileManager;
  encryptionManager: EncryptionManager;
  encryptionCoordinator: EncryptionCoordinator;
};

export const cryptoFixtures = cryptoBaseTest.extend<customFixtures>({
  environmentSecretFileManager: async ({}, use) => {
    await use(new EnvironmentSecretFileManager());
  },
  encryptionManager: async ({}, use) => {
    await use(new EncryptionManager());
  },
  encryptionCoordinator: async ({ environmentSecretFileManager, encryptionManager }, use) => {
    await use(new EncryptionCoordinator(environmentSecretFileManager, encryptionManager));
  },
});

export const test = cryptoFixtures;
export const expect = cryptoBaseTest.expect;
