import winston from 'winston';
import WinstonLoggerFactory from './loggerFactory';
import { DEFAULT_LOGGER_CONFIG, LoggerMetadata } from '../../config/types/config/logger.types';

class LoggerManager {
  private static instance: winston.Logger;

  /**
   * Retrieves the singleton logger instance
   * @returns {winston.Logger} The winston logger instance
   */
  public static getLogger(): winston.Logger {
    if (!this.instance) {
      this.initializeLogger();
    }
    return this.instance;
  }

  /**
   * Initializes the winston logger instance
   * @private
   */
  private static initializeLogger(): void {
    const loggerDir = WinstonLoggerFactory.resolvePath(
      process.cwd(),
      DEFAULT_LOGGER_CONFIG.LOG_DIR,
    );

    this.instance = WinstonLoggerFactory.createLogger(loggerDir);
  }

  /**
   * Creates a child logger with additional metadata
   * @param meta - Additional metadata to include in all log messages
   * @returns {winston.Logger} Child logger instance
   */
  public static createChildLogger(meta: LoggerMetadata): winston.Logger {
    return this.getLogger().child(meta);
  }

  /**
   * Safely closes the logger and all its transports
   */
  public static close(): void {
    if (this.instance) {
      this.instance.close();
    }
  }
}

// Export the logger instance
export default LoggerManager.getLogger();
