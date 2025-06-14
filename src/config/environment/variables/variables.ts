/**
 * Runtime environment variables
 */
import type { EnvironmentStage } from '../dotenv/types';

export default class EnvironmentVariables {
  // App Meta Data
  public static readonly APP_VERSION = process.env.APP_VERSION!;
  public static readonly TEST_PLATFORM = process.env.TEST_PLATFORM!;
  public static readonly TEST_TYPE = process.env.TEST_TYPE!;

  // URLS
  public static readonly API_BASE_URL = process.env.API_BASE_URL!;
  public static readonly PORTAL_BASE_URL = process.env.PORTAL_BASE_URL!;

  // Users

  public static readonly ADMIN_USERNAME = process.env.ADMIN_USERNAME!;
  public static readonly ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

  public static readonly PORTAL_USERNAME = process.env.PORTAL_USERNAME!;
  public static readonly PORTAL_PASSWORD = process.env.PORTAL_PASSWORD!;

  // Database

  public static readonly DB_SERVER = process.env.DB_SERVER!;
  public static readonly DATABASE_NAME = process.env.DATABASE_NAME!;
  public static readonly DB_USERNAME = process.env.DB_USERNAME!;
  public static readonly DB_PASSWORD = process.env.DB_PASSWORD!;
  public static readonly DB_PORT = process.env.DB_PORT!;
  public static readonly AZURE_DB_ENDPOINT = process.env.AZURE_DB_ENDPOINT!;

  // Environment detection
  public static readonly ENV = (process.env.ENV as EnvironmentStage) || 'dev';
}
