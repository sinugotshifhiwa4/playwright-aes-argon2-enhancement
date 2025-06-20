import { test as cryptoBaseTest } from '@playwright/test';
import { KeyMetadataRepository } from '../src/cryptography/key/keyMetadataRepository';
import { EnvironmentSecretFileManager } from '../src/cryptography/manager/environmentSecretFileManager';
import { KeyLifecycleManager } from '../src/cryptography/manager/keyLifecycleManager';
import { KeyLifecycleService } from '../src/cryptography/service/keyLifecycleService';
import { CryptoService } from '../src/cryptography/service/cryptoService';
import { EncryptionManager } from '../src/cryptography/manager/encryptionManager';
import { EnvironmentFileParser } from '../src/cryptography/manager/environmentFileParser';
import { CryptoOrchestrator } from '../src/cryptography/service/cryptoOrchestrator';

type customFixtures = {
  environmentSecretFileManager: EnvironmentSecretFileManager;
  cryptoService: CryptoService;
  encryptionManager: EncryptionManager;
  environmentFileParser: EnvironmentFileParser;
  keyLifecycleManager: KeyLifecycleManager;
  keyLifecycleService: KeyLifecycleService;
  keyMetadataRepository: KeyMetadataRepository;
  cryptoOrchestrator: CryptoOrchestrator;
};

export const cryptoFixtures = cryptoBaseTest.extend<customFixtures>({
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
  keyLifecycleManager: async ({ environmentSecretFileManager, keyMetadataRepository }, use) => {
    await use(new KeyLifecycleManager(environmentSecretFileManager, keyMetadataRepository));
  },
  keyLifecycleService: async (
    {
      environmentSecretFileManager,
      keyMetadataRepository,
      environmentFileParser,
      keyLifecycleManager,
    },
    use,
  ) => {
    await use(
      new KeyLifecycleService(
        environmentSecretFileManager,
        keyMetadataRepository,
        environmentFileParser,
        keyLifecycleManager,
      ),
    );
  },
  keyMetadataRepository: async ({}, use) => {
    await use(new KeyMetadataRepository());
  },
  cryptoOrchestrator: async (
    { keyLifecycleManager, encryptionManager, keyLifecycleService },
    use,
  ) => {
    await use(new CryptoOrchestrator(keyLifecycleManager, encryptionManager, keyLifecycleService));
  },
});

export const test = cryptoFixtures;
export const expect = cryptoBaseTest.expect;
