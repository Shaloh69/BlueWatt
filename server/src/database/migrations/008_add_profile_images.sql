-- Add profile image URLs to users and devices tables
ALTER TABLE users
ADD COLUMN profile_image_url VARCHAR(500) NULL COMMENT 'Supabase storage URL for profile image';

ALTER TABLE devices
ADD COLUMN device_image_url VARCHAR(500) NULL COMMENT 'Supabase storage URL for device image';
