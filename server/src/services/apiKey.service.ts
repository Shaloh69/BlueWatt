import crypto from 'crypto';
import { config } from '../config/environment';

export class ApiKeyService {
  static generateApiKey(): string {
    const randomBytes = crypto.randomBytes(config.apiKey.length);
    const apiKey = randomBytes.toString('hex');
    return `${config.apiKey.prefix}${apiKey}`;
  }

static isValidFormat(apiKey: string): boolean {
  if (!apiKey) {
    console.error(JSON.stringify({
      tag: 'ESP_LOG',
      event: 'API_KEY_MISSING',
    }));
    return false;
  }

  const trimmed = apiKey.trim();
  const expectedPrefix = config.apiKey.prefix;
  const expectedLength = config.apiKey.length * 2;

  const keyPart = trimmed.slice(expectedPrefix.length);

  const isValidPrefix = trimmed.startsWith(expectedPrefix);
  const isValidLength = keyPart.length === expectedLength;

  const mask = (key: string) =>
    key.length > 8
      ? `${key.slice(0, 4)}...${key.slice(-4)}`
      : key;

  console.log(JSON.stringify({
    tag: 'ESP_LOG',
    event: 'API_KEY_VALIDATION',
    received: mask(trimmed),
    received_length: trimmed.length,
    expected_prefix: expectedPrefix,
    has_valid_prefix: isValidPrefix,
    key_part_length: keyPart.length,
    expected_key_part_length: expectedLength,
    format_valid: isValidPrefix && isValidLength,
  }));

  return isValidPrefix && isValidLength;
}
}
