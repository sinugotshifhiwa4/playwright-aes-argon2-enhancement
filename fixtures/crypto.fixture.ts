import { test as cryptoBaseTest } from '@playwright/test';

import { KeyRotationManager } from '../src/cryptography/manager/keyRotationManager';
import { KeyMetadataRepository } from '../src/cryptography/key/keyMetadataRepository';
import { EnvironmentSecretFileManager } from '../src/cryptography/manager/environmentSecretFileManager';
import { KeyRotationService } from '../src/cryptography/service/keyRotationService';
import { CryptoService } from '../src/cryptography/service/cryptoService';
import { EncryptionManager } from '../src/cryptography/manager/encryptionManager';
import { EnvironmentFileParser } from '../src/cryptography/manager/environmentFileParser';
import { EncryptionCoordinator } from '../src/cryptography/service/encryptionCoordinator';
import { CryptoOrchestrator } from '../src/cryptography/service/cryptoOrchestrator';

type customFixtures = {
  keyRotationManager: KeyRotationManager;
  keyRotationService: KeyRotationService;
  keyMetadataRepository: KeyMetadataRepository;
  environmentSecretFileManager: EnvironmentSecretFileManager;
  cryptoService: CryptoService;
  encryptionManager: EncryptionManager;
  environmentFileParser: EnvironmentFileParser;
  encryptionCoordinator: EncryptionCoordinator;
  cryptoOrchestrator: CryptoOrchestrator;
};

export const cryptoFixtures = cryptoBaseTest.extend<customFixtures>({
  keyRotationManager: async ({ environmentSecretFileManager, keyMetadataRepository }, use) => {
    await use(new KeyRotationManager(environmentSecretFileManager, keyMetadataRepository));
  },
  keyRotationService: async (
    {
      environmentSecretFileManager,
      keyMetadataRepository,
      environmentFileParser,
      keyRotationManager,
    },
    use,
  ) => {
    await use(
      new KeyRotationService(
        environmentSecretFileManager,
        keyMetadataRepository,
        environmentFileParser,
        keyRotationManager,
      ),
    );
  },
  keyMetadataRepository: async ({}, use) => {
    await use(new KeyMetadataRepository());
  },
  environmentSecretFileManager: async ({}, use) => {
    await use(new EnvironmentSecretFileManager());
  },
  cryptoService: async ({}, use) => {
    await use(new CryptoService());
  },
  encryptionManager: async ({ environmentFileParser }, use) => {
    await use(new EncryptionManager(environmentFileParser));
  },
  environmentFileParser: async ({}, use) => {
    await use(new EnvironmentFileParser());
  },
  encryptionCoordinator: async (
    { keyRotationManager, encryptionManager, keyRotationService },
    use,
  ) => {
    await use(new EncryptionCoordinator(keyRotationManager, encryptionManager, keyRotationService));
  },
  cryptoOrchestrator: async (
    { keyRotationManager, encryptionManager, keyRotationService },
    use,
  ) => {
    await use(new CryptoOrchestrator(keyRotationManager, encryptionManager, keyRotationService));
  },
});

export const test = cryptoFixtures;
export const expect = cryptoBaseTest.expect;
