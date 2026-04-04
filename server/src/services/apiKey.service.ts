import crypto from 'crypto';
import { config } from '../config/environment';

export class ApiKeyService {
  static generateApiKey(): string {
    const randomBytes = crypto.randomBytes(config.apiKey.length);
    const apiKey = randomBytes.toString('hex');
    return `${config.apiKey.prefix}${apiKey}`;
  }

static isValidFormat(apiKey: string): boolean {
  if (!apiKey) return false;

  const trimmed = apiKey.trim();
  const expectedPrefix = config.apiKey.prefix;
  const expectedLength = config.apiKey.length * 2;

  const keyPart = trimmed.slice(expectedPrefix.length);

  return trimmed.startsWith(expectedPrefix) && keyPart.length === expectedLength;
}
}
