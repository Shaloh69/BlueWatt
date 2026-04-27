import { Request, Response, NextFunction } from 'express';
import { StayModel } from '../models/stay.model';
import { PadModel } from '../models/pad.model';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { StayBillingService } from '../services/stayBilling.service';

/** GET /stays — list all stays */
export const listStays = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const stays = await StayModel.findAll();
  sendSuccess(res, { stays, count: stays.length });
});

/** GET /stays/pad/:padId — stays for a specific pad */
export const getStaysByPad = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const padId = parseInt(req.params.padId, 10);
    const pad = await PadModel.findById(padId);
    if (!pad) throw new AppError('Pad not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

    const stays = await StayModel.findByPad(padId);
    sendSuccess(res, { stays });
  }
);

/** GET /stays/:id — single stay */
export const getStay = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const stay = await StayModel.findById(parseInt(req.params.id, 10));
  if (!stay) throw new AppError('Stay not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  sendSuccess(res, { stay });
});

/** POST /stays — check in (admin creates a stay for a pad/tenant) */
export const checkIn = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user)
    throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);

  const { pad_id, tenant_id, billing_cycle, flat_rate_per_cycle, notes, check_in_at } = req.body;

  if (!pad_id || !tenant_id || !billing_cycle) {
    throw new AppError(
      'pad_id, tenant_id, and billing_cycle are required',
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  if (!['daily', 'monthly'].includes(billing_cycle)) {
    throw new AppError(
      "billing_cycle must be 'daily' or 'monthly'",
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const pad = await PadModel.findById(parseInt(pad_id, 10));
  if (!pad) throw new AppError('Pad not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

  // Use provided check-in time or default to now (minute precision)
  const checkInAt = check_in_at ? new Date(check_in_at) : new Date();
  // Truncate to minute precision
  checkInAt.setSeconds(0, 0);

  const stay = await StayModel.create({
    pad_id: parseInt(pad_id, 10),
    tenant_id: parseInt(tenant_id, 10),
    check_in_at: checkInAt,
    billing_cycle: billing_cycle as 'daily' | 'monthly',
    flat_rate_per_cycle: parseFloat(flat_rate_per_cycle ?? '0') || 0,
    rate_per_kwh: pad.rate_per_kwh,
    notes: notes ?? undefined,
    created_by: req.user.id,
  });

  sendSuccess(res, { stay }, HTTP_STATUS.CREATED);
});

/** PUT /stays/:id/checkout — check out (sets check_out_at and triggers prorated bill) */
export const checkOut = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const id = parseInt(req.params.id, 10);
  const stay = await StayModel.findById(id);
  if (!stay) throw new AppError('Stay not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  if ((stay as any).status === 'ended') {
    throw new AppError('Stay already ended', HTTP_STATUS.CONFLICT, ERROR_CODES.VALIDATION_ERROR);
  }

  // Minute-precision check-out time
  const checkOutAt = req.body.check_out_at ? new Date(req.body.check_out_at) : new Date();
  checkOutAt.setSeconds(0, 0);

  await StayModel.checkout(id, checkOutAt);

  // Immediately run billing for this stay so the prorated final bill is created now
  const updatedStay = await StayModel.findById(id);
  if (updatedStay) {
    try {
      await StayBillingService.billStay(updatedStay, checkOutAt);
    } catch (err) {
      // Don't fail the checkout if billing hits an error — it will retry on the next cron run
    }
  }

  sendSuccess(res, { message: 'Checked out', check_out_at: checkOutAt });
});

/** DELETE /stays/:id — remove a stay (admin only) */
export const deleteStay = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const id = parseInt(req.params.id, 10);
  const stay = await StayModel.findById(id);
  if (!stay) throw new AppError('Stay not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  await StayModel.delete(id);
  sendSuccess(res, { id }, HTTP_STATUS.OK, 'Stay deleted');
});

/** POST /stays/:id/generate-bill — manually trigger bill generation for a stay */
export const generateBillNow = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const id = parseInt(req.params.id, 10);
    const stay = await StayModel.findById(id);
    if (!stay) throw new AppError('Stay not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

    const now = new Date();
    const created = await StayBillingService.billStay(stay, now);

    sendSuccess(
      res,
      { bills_created: created },
      HTTP_STATUS.OK,
      created > 0 ? `Generated ${created} bill(s)` : 'No new bills — all cycles already billed'
    );
  }
);
