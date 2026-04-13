import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/user.model';
import { HashService } from '../services/hash.service';
import { AuthService } from '../services/auth.service';
import { emailService } from '../services/email.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { RegisterRequest, LoginRequest } from '../types/api';

// ── In-memory OTP store (15-minute expiry) ───────────────────────────────────
interface OtpEntry { otp: string; expiresAt: number; }
const otpStore = new Map<string, OtpEntry>();

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const register = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { email, password, full_name } = req.body as RegisterRequest;

  const existingUser = await UserModel.findByEmail(email);
  if (existingUser) {
    throw new AppError('Email already registered', HTTP_STATUS.CONFLICT, ERROR_CODES.DUPLICATE_ENTRY);
  }

  const passwordHash = await HashService.hashPassword(password);

  const user = await UserModel.create(email, passwordHash, full_name);

  const accessToken = AuthService.generateAccessToken(user);
  const refreshToken = AuthService.generateRefreshToken(user);

  sendSuccess(
    res,
    {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
      accessToken,
      refreshToken,
    },
    HTTP_STATUS.CREATED,
    'User registered successfully'
  );
});

export const login = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { email, password } = req.body as LoginRequest;

  const user = await UserModel.findByEmail(email);

  if (!user) {
    throw new AppError('Invalid credentials', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS);
  }

  const isPasswordValid = await HashService.comparePassword(password, user.password_hash);

  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS);
  }

  const accessToken = AuthService.generateAccessToken(user);
  const refreshToken = AuthService.generateRefreshToken(user);

  sendSuccess(res, {
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    },
    accessToken,
    refreshToken,
  });
});

export const getCurrentUser = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  // Re-fetch so profile_image_url is always fresh
  const user = await UserModel.findById(req.user.id);
  sendSuccess(res, {
    id: user!.id,
    email: user!.email,
    full_name: user!.full_name,
    role: user!.role,
    profile_image_url: user!.profile_image_url ?? null,
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  const { full_name, email } = req.body as { full_name?: string; email?: string };

  if (!full_name?.trim() && !email?.trim()) {
    throw new AppError('Nothing to update', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  if (email?.trim() && email !== req.user.email) {
    const existing = await UserModel.findByEmail(email.trim());
    if (existing && existing.id !== req.user.id) {
      throw new AppError('Email already in use', HTTP_STATUS.CONFLICT, ERROR_CODES.DUPLICATE_ENTRY);
    }
  }

  await UserModel.update(req.user.id, {
    ...(full_name?.trim() && { full_name: full_name.trim() }),
    ...(email?.trim()     && { email: email.trim() }),
  });

  const updated = await UserModel.findById(req.user.id);
  sendSuccess(res, {
    id: updated!.id,
    email: updated!.email,
    full_name: updated!.full_name,
    role: updated!.role,
    profile_image_url: updated!.profile_image_url ?? null,
  });
});

export const changePassword = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  const { current_password, new_password } = req.body as { current_password: string; new_password: string };

  if (!current_password || !new_password) {
    throw new AppError('current_password and new_password are required', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  if (new_password.length < 8) {
    throw new AppError('New password must be at least 8 characters', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  const user = await UserModel.findById(req.user.id);
  const valid = await HashService.comparePassword(current_password, user!.password_hash);
  if (!valid) {
    throw new AppError('Current password is incorrect', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS);
  }

  const hash = await HashService.hashPassword(new_password);
  await UserModel.update(req.user.id, { password_hash: hash });

  sendSuccess(res, { message: 'Password changed successfully' });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { email } = req.body as { email: string };

  if (!email?.trim()) {
    throw new AppError('Email is required', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  // Always respond 200 to prevent email enumeration
  const user = await UserModel.findByEmail(email.trim().toLowerCase());
  if (user) {
    const otp = generateOtp();
    otpStore.set(email.trim().toLowerCase(), {
      otp,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
    });
    await emailService.sendPasswordResetOtp(email.trim(), otp);
  }

  sendSuccess(res, { message: 'If that email is registered, a reset code has been sent.' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { email, otp, new_password } = req.body as {
    email: string;
    otp: string;
    new_password: string;
  };

  if (!email?.trim() || !otp?.trim() || !new_password) {
    throw new AppError('email, otp and new_password are required', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  if (new_password.length < 8) {
    throw new AppError('Password must be at least 8 characters', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  const key = email.trim().toLowerCase();
  const entry = otpStore.get(key);

  if (!entry) {
    throw new AppError('Invalid or expired reset code', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    throw new AppError('Reset code has expired. Please request a new one.', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  if (entry.otp !== otp.trim()) {
    throw new AppError('Invalid reset code', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  const user = await UserModel.findByEmail(key);
  if (!user) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  }

  const hash = await HashService.hashPassword(new_password);
  await UserModel.update(user.id, { password_hash: hash });
  otpStore.delete(key);

  sendSuccess(res, { message: 'Password reset successfully' });
});
