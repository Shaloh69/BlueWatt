import crypto from 'crypto';
import { config } from '../config/environment';

export class ApiKeyService {
  static generateApiKey(): string {
    const randomBytes = crypto.randomBytes(config.apiKey.length);
    const apiKey = randomBytes.toString('hex');
    return `${config.apiKey.prefix}${apiKey}`;
  }

  static isValidFormat(apiKey: string): boolean {
    if (!apiKey.startsWith(config.apiKey.prefix)) {
      return false;
    }

    const keyPart = apiKey.slice(config.apiKey.prefix.length);
    return keyPart.length === config.apiKey.length * 2;
  }
}
