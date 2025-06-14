import EnvironmentConfigLoader from '../../../utils/environment/environmentConfigManager';
import { EnvironmentSecretFileManager } from '../../../utils/environment/environmentSecretFileManager';
import ErrorHandler from '../../../utils/errors/errorHandler';

async function globalSetup(): Promise<void> {
  try {
    // Initialize the environment secret file manager
    const environmentSecretFileManager = new EnvironmentSecretFileManager();

    // Initialize the environment config loader
    const environmentConfigLoader = new EnvironmentConfigLoader(environmentSecretFileManager);
    await environmentConfigLoader.initialize();
  } catch (error) {
    ErrorHandler.captureError(error, 'globalSetup', 'Global setup failed');
    throw error;
  }
}

export default globalSetup;
