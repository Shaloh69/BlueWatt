import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export class HashService {
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static async hashApiKey(apiKey: string): Promise<string> {
    return bcrypt.hash(apiKey, SALT_ROUNDS);
  }

  static async compareApiKey(apiKey: string, hash: string): Promise<boolean> {
    return bcrypt.compare(apiKey, hash);
  }
}
