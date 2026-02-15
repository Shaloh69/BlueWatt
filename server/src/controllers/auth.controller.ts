import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/user.model';
import { HashService } from '../services/hash.service';
import { AuthService } from '../services/auth.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { RegisterRequest, LoginRequest } from '../types/api';

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
        name: user.full_name,
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
      name: user.full_name,
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

  sendSuccess(res, {
    id: req.user.id,
    email: req.user.email,
    name: req.user.full_name,
    role: req.user.role,
  });
});
