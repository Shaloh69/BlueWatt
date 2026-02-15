import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/user.model';
import { DeviceModel } from '../models/device.model';
import { supabaseService } from '../services/supabase.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';

export const uploadUserProfileImage = asyncHandler(async (req: Request, _res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  if (!req.file) {
    throw new AppError('No file uploaded', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(req.file.mimetype)) {
    throw new AppError('Invalid file type. Only JPEG, PNG, and WebP images are allowed', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (req.file.size > maxSize) {
    throw new AppError('File too large. Maximum size is 5MB', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  if (req.user.profile_image_url) {
    await supabaseService.deleteImage(req.user.profile_image_url);
  }

  const imageUrl = await supabaseService.uploadProfileImage(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
    req.user.id
  );

  await UserModel.updateProfileImage(req.user.id, imageUrl);

  sendSuccess(_res, { profile_image_url: imageUrl }, HTTP_STATUS.OK, 'Profile image uploaded successfully');
});

export const uploadDeviceImage = asyncHandler(async (req: Request, _res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  const deviceId = parseInt(req.params.id, 10);

  const device = await DeviceModel.findById(deviceId);

  if (!device) {
    throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
  }

  const isOwner = await DeviceModel.isOwnedByUser(deviceId, req.user.id);

  if (!isOwner) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }

  if (!req.file) {
    throw new AppError('No file uploaded', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(req.file.mimetype)) {
    throw new AppError('Invalid file type. Only JPEG, PNG, and WebP images are allowed', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (req.file.size > maxSize) {
    throw new AppError('File too large. Maximum size is 5MB', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  if (device.device_image_url) {
    await supabaseService.deleteImage(device.device_image_url);
  }

  const imageUrl = await supabaseService.uploadDeviceImage(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
    deviceId
  );

  await DeviceModel.updateDeviceImage(deviceId, imageUrl);

  sendSuccess(_res, { device_image_url: imageUrl }, HTTP_STATUS.OK, 'Device image uploaded successfully');
});
