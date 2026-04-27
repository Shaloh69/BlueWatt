import { Request, Response, NextFunction } from 'express';
import { pool } from '../database/connection';
import { UserModel } from '../models/user.model';
import { PadModel } from '../models/pad.model';
import { HashService } from '../services/hash.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { RowDataPacket } from 'mysql2';

/** GET /admin/tenants — list all tenant accounts with their pad info */
export const listTenants = asyncHandler(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
       u.id, u.email, u.full_name, u.role, u.is_active, u.profile_image_url,
       u.created_at, u.last_login_at,
       p.id         AS pad_id,
       p.name       AS pad_name,
       p.rate_per_kwh,
       d.id         AS device_db_id,
       d.device_id  AS device_serial,
       d.device_name,
       d.location   AS device_location
     FROM users u
     LEFT JOIN pads p ON p.tenant_id = u.id AND p.is_active = 1
     LEFT JOIN devices d ON d.id = p.device_id
     WHERE u.role = 'user' AND u.is_active = 1
     ORDER BY u.created_at DESC`
    );
    sendSuccess(res, { tenants: rows, count: rows.length });
  }
);

/**
 * POST /admin/tenants
 * Body: { email, full_name, password, pad_name?, rate_per_kwh?, device_id? }
 *
 * Creates a tenant account.
 * If pad_name is provided, also creates a pad and assigns the tenant.
 * If device_id is also provided, assigns that ESP device to the pad.
 */
export const createTenant = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);

    const { email, full_name, password, pad_name, rate_per_kwh, device_id } = req.body as {
      email: string;
      full_name: string;
      password: string;
      pad_name?: string;
      rate_per_kwh?: number;
      device_id?: number;
    };

    if (!email?.trim() || !full_name?.trim() || !password) {
      throw new AppError(
        'email, full_name and password are required',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    if (password.length < 8) {
      throw new AppError(
        'Password must be at least 8 characters',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const existing = await UserModel.findByEmail(email.trim());
    if (existing) {
      throw new AppError(
        'Email already registered',
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.DUPLICATE_ENTRY
      );
    }

    const passwordHash = await HashService.hashPassword(password);
    const tenant = await UserModel.create(email.trim(), passwordHash, full_name.trim(), 'user');

    let pad = null;
    if (pad_name?.trim()) {
      pad = await PadModel.create(
        req.user.id,
        pad_name.trim(),
        undefined,
        rate_per_kwh ? Number(rate_per_kwh) : 11.0
      );
      await PadModel.assignTenant(pad.id, tenant.id);
      if (device_id) {
        await PadModel.assignDevice(pad.id, Number(device_id));
      }
      // Re-fetch pad with updated relations
      pad = await PadModel.findById(pad.id);
    }

    sendSuccess(
      res,
      {
        tenant: {
          id: tenant.id,
          email: tenant.email,
          full_name: tenant.full_name,
          role: tenant.role,
        },
        pad: pad ?? null,
      },
      HTTP_STATUS.CREATED,
      'Tenant created successfully'
    );
  }
);

/** DELETE /admin/tenants/:id — remove a tenant account */
export const deleteTenant = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const tenantId = parseInt(req.params.id, 10);
    const user = await UserModel.findById(tenantId);
    if (!user) throw new AppError('Tenant not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    if (user.role === 'admin')
      throw new AppError(
        'Cannot delete an admin account',
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN
      );

    // Unassign from any pads first
    await pool.execute('UPDATE pads SET tenant_id = NULL WHERE tenant_id = ?', [tenantId]);
    await UserModel.delete(tenantId);

    sendSuccess(res, { id: tenantId }, HTTP_STATUS.OK, 'Tenant deleted');
  }
);
