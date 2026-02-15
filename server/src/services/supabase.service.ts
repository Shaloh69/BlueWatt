import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';

class SupabaseService {
  private client: SupabaseClient | null = null;

  initialize(): void {
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
      logger.warn('Supabase credentials not configured. Profile image upload will be disabled.');
      return;
    }

    this.client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    logger.info('Supabase client initialized');
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async uploadProfileImage(file: Buffer, fileName: string, contentType: string, userId: number): Promise<string> {
    if (!this.client) {
      throw new AppError('Supabase not configured', HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_ERROR);
    }

    const filePath = `users/${userId}/${Date.now()}-${fileName}`;

    const { data, error } = await this.client.storage
      .from(config.supabase.storageBucket)
      .upload(filePath, file, {
        contentType,
        upsert: false,
      });

    if (error) {
      logger.error('Supabase upload error:', error);
      throw new AppError('Failed to upload image', HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_ERROR);
    }

    const { data: urlData } = this.client.storage
      .from(config.supabase.storageBucket)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }

  async uploadDeviceImage(file: Buffer, fileName: string, contentType: string, deviceId: number): Promise<string> {
    if (!this.client) {
      throw new AppError('Supabase not configured', HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_ERROR);
    }

    const filePath = `devices/${deviceId}/${Date.now()}-${fileName}`;

    const { data, error } = await this.client.storage
      .from(config.supabase.storageBucket)
      .upload(filePath, file, {
        contentType,
        upsert: false,
      });

    if (error) {
      logger.error('Supabase upload error:', error);
      throw new AppError('Failed to upload image', HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_ERROR);
    }

    const { data: urlData } = this.client.storage
      .from(config.supabase.storageBucket)
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }

  async deleteImage(url: string): Promise<void> {
    if (!this.client) {
      return;
    }

    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const filePath = pathParts.slice(pathParts.indexOf(config.supabase.storageBucket) + 1).join('/');

    const { error } = await this.client.storage
      .from(config.supabase.storageBucket)
      .remove([filePath]);

    if (error) {
      logger.error('Supabase delete error:', error);
    }
  }
}

export const supabaseService = new SupabaseService();
