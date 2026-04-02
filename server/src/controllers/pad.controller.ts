import { Request, Response, NextFunction } from 'express';
import { PadModel } from '../models/pad.model';
import { DeviceModel } from '../models/device.model';
import { UserModel } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';

/** POST /pads — admin creates a pad */
export const createPad = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const { name, description, rate_per_kwh } = req.body;
  const pad = await PadModel.create(req.user.id, name, description, rate_per_kwh);
  sendSuccess(res, { pad }, HTTP_STATUS.CREATED);
});

/** GET /pads — admin gets all pads with details */
export const listPads = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const ownerId = req.user.role === 'admin' ? undefined : req.user.id;
  const pads = await PadModel.findAllWithDetails(ownerId);
  sendSuccess(res, { pads, count: pads.length });
});

/** GET /pads/my — tenant gets own pad */
export const getMyPad = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const pad = await PadModel.findByTenantId(req.user.id);
  if (!pad) throw new AppError('No pad assigned to this account', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  sendSuccess(res, { pad });
});

/** GET /pads/:id */
export const getPad = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const pad = await PadModel.findById(parseInt(req.params.id, 10));
  if (!pad) throw new AppError('Pad not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

  // Tenant can only see own pad
  if (req.user.role !== 'admin' && pad.tenant_id !== req.user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }
  sendSuccess(res, { pad });
});

/** PUT /pads/:id — admin updates name/rate/description */
export const updatePad = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const padId = parseInt(req.params.id, 10);
  const pad = await PadModel.findById(padId);
  if (!pad) throw new AppError('Pad not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  const { name, description, rate_per_kwh } = req.body;
  await PadModel.update(padId, { name, description, rate_per_kwh });
  sendSuccess(res, { pad: await PadModel.findById(padId) });
});

/** DELETE /pads/:id — admin deactivates */
export const deletePad = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const padId = parseInt(req.params.id, 10);
  const pad = await PadModel.findById(padId);
  if (!pad) throw new AppError('Pad not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  await PadModel.delete(padId);
  sendSuccess(res, { message: 'Pad deactivated' });
});

/** PUT /pads/:id/assign — admin assigns tenant + device to pad */
export const assignPad = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const padId = parseInt(req.params.id, 10);
  const { tenant_id, device_id } = req.body;

  const pad = await PadModel.findById(padId);
  if (!pad) throw new AppError('Pad not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

  if (tenant_id !== undefined) {
    if (tenant_id !== null) {
      const tenant = await UserModel.findById(tenant_id);
      if (!tenant) throw new AppError('Tenant not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    }
    await PadModel.assignTenant(padId, tenant_id);
  }

  if (device_id !== undefined) {
    if (device_id !== null) {
      const device = await DeviceModel.findById(device_id);
      if (!device) throw new AppError('Device not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.DEVICE_NOT_FOUND);
    }
    await PadModel.assignDevice(padId, device_id);
  }

  sendSuccess(res, { pad: await PadModel.findById(padId) });
});

/** PUT /pads/:id/unassign — admin removes tenant */
export const unassignPad = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const padId = parseInt(req.params.id, 10);
  const pad = await PadModel.findById(padId);
  if (!pad) throw new AppError('Pad not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  await PadModel.assignTenant(padId, null);
  sendSuccess(res, { message: 'Tenant removed from pad' });
});
