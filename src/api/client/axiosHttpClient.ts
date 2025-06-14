import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import EnvironmentDetector from '../../config/environment/detector/detector';
import https from 'https';
import { HTTP_MEDIA_TYPES } from './httpMediaType';

/**
 * HTTP client for making requests using the Axios library.
 *
 * This class follows the single responsibility principle by focusing solely on
 * HTTP communication. It does not handle or transform errors - all exceptions
 * bubble up naturally to be processed by appropriate error handlers.
 *
 * Features:
 * - Automatic SSL certificate bypass for development environments
 * - Consistent header management with JSON content-type defaults
 * - Support for all standard HTTP methods (GET, POST, PUT, PATCH, DELETE)
 * - Optional authorization header injection
 */

export class AxiosHttpClient {
  private readonly defaultHeaders: Record<string, string>;
  private readonly httpsAgent?: https.Agent;

  /**
   * Initializes the HttpClient with default headers and SSL configuration.
   */
  constructor() {
    this.defaultHeaders = {
      'Content-Type': HTTP_MEDIA_TYPES.APPLICATION_JSON,
    };

    // Only create HTTPS agent for development environment
    if (this.isDevelopment()) {
      this.httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
    }
  }

  private isDevelopment(): boolean {
    return EnvironmentDetector.isDevelopment();
  }

  /**
   * Creates axios configuration with appropriate SSL handling
   */
  private createAxiosConfig(headers?: Record<string, string>): AxiosRequestConfig {
    const config: AxiosRequestConfig = {
      headers: { ...this.defaultHeaders, ...headers },
    };

    if (this.httpsAgent) {
      config.httpsAgent = this.httpsAgent;
    }

    return config;
  }

  private createHeaders(authorizationHeader?: string): {
    [key: string]: string;
  } {
    const headers = { ...this.defaultHeaders };
    if (authorizationHeader) {
      headers['Authorization'] = authorizationHeader;
    }
    return headers;
  }

  /**
   * Sends an HTTP request using the specified method, endpoint, payload, and headers.
   *
   * @template T - The expected response type.
   * @param method - The HTTP method to use for the request
   * @param endpoint - The URL endpoint to which the request is sent.
   * @param payload - The optional payload to be included in the request body.
   * @param headers - Optional headers to be included in the request.
   * @returns A promise that resolves with the Axios response for successful requests.
   * @throws AxiosError for HTTP errors (4xx, 5xx) and network/connection errors.
   */
  private async sendRequest<T>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    endpoint: string,
    payload?: unknown,
    headers?: Record<string, string>,
  ): Promise<AxiosResponse<T>> {
    // Create axios configuration
    const config = this.createAxiosConfig(headers);

    switch (method) {
      case 'get':
      case 'delete':
        return await axios[method]<T>(endpoint, config);
      case 'post':
      case 'put':
      case 'patch':
        return await axios[method]<T>(endpoint, payload, config);
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }

  // Public HTTP method implementations
  async get<T>(endpoint: string, authorization?: string): Promise<AxiosResponse<T>> {
    const headers = this.createHeaders(authorization);
    return this.sendRequest<T>('get', endpoint, undefined, headers);
  }

  async post<T>(
    endpoint: string,
    payload?: unknown,
    authorization?: string,
  ): Promise<AxiosResponse<T>> {
    const headers = this.createHeaders(authorization);
    return this.sendRequest<T>('post', endpoint, payload, headers);
  }

  async put<T>(
    endpoint: string,
    payload?: unknown,
    authorization?: string,
  ): Promise<AxiosResponse<T>> {
    const headers = this.createHeaders(authorization);
    return this.sendRequest<T>('put', endpoint, payload, headers);
  }

  async patch<T>(
    endpoint: string,
    payload?: unknown,
    authorization?: string,
  ): Promise<AxiosResponse<T>> {
    const headers = this.createHeaders(authorization);
    return this.sendRequest<T>('patch', endpoint, payload, headers);
  }

  async delete<T>(endpoint: string, authorization?: string): Promise<AxiosResponse<T>> {
    const headers = this.createHeaders(authorization);
    return this.sendRequest<T>('delete', endpoint, undefined, headers);
  }
}
