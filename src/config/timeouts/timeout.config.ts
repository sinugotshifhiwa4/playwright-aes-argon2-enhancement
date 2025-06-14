// src/config/timeouts.ts
import EnvironmentDetector from '../environment/detector/detector';

// Check if running in CI environment
const isCI = EnvironmentDetector.isCI();

// Base timeout multiplier for CI environments
const CI_MULTIPLIER = 2;

// Helper function to calculate timeout based on environment
const timeout = (base: number): number => (isCI ? base * CI_MULTIPLIER : base);

export const TIMEOUTS = {
  // Test framework timeouts
  test: timeout(15_000),
  expect: timeout(30_000),

  // UI timeouts
  ui: {
    action: timeout(45_000),
    navigation: timeout(15_000),
    pageLoad: timeout(30_000),
  },

  // API timeouts
  api: {
    standard: timeout(15_000), // Standard API calls
    upload: timeout(60_000), // File uploads
    download: timeout(90_000), // File downloads
    healthCheck: timeout(3_000), // Health checks
    connection: timeout(8_000), // Connection establishment
    longRunning: timeout(60_000), // Long operations
    retry: timeout(5_000), // New: retry delays
  },

  // Database timeouts
  db: {
    query: timeout(15_000), // Standard queries
    transaction: timeout(30_000), // Transactions
    migration: timeout(90_000), // Migrations
    connection: timeout(10_000), // DB connection
    poolAcquisition: timeout(10_000), // New: connection pool
    idle: timeout(10_000), // New: idle
  },

  // Network timeouts
  network: {
    dns: timeout(5_000), // DNS resolution
    socket: timeout(10_000), // Socket connection
    keepAlive: timeout(30_000), // Keep-alive
  },

  // Cache timeouts
  cache: {
    get: timeout(1_000), // Cache retrieval
    set: timeout(2_000), // Cache storage
    invalidation: timeout(5_000), // Cache invalidation
  },
} as const;

// Export individual timeout categories for convenience
export const { test: TEST_TIMEOUT, expect: EXPECT_TIMEOUT } = TIMEOUTS;
export const UI_TIMEOUTS = TIMEOUTS.ui;
export const API_TIMEOUTS = TIMEOUTS.api;
export const DB_TIMEOUTS = TIMEOUTS.db;
export const NETWORK_TIMEOUTS = TIMEOUTS.network;
export const CACHE_TIMEOUTS = TIMEOUTS.cache;

// Type definitions for better IDE support
export type TimeoutCategory = keyof typeof TIMEOUTS;
export type UITimeoutType = keyof typeof TIMEOUTS.ui;
export type APITimeoutType = keyof typeof TIMEOUTS.api;
export type DBTimeoutType = keyof typeof TIMEOUTS.db;

// Utility function to get timeout with custom multiplier
export const getTimeoutWithMultiplier = (
  baseTimeout: number,
  multiplier: number = isCI ? CI_MULTIPLIER : 1,
): number => baseTimeout * multiplier;
