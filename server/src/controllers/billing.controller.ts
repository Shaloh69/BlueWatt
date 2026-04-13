import { Request, Response, NextFunction } from 'express';
import { BillingPeriodModel } from '../models/billingPeriod.model';
import { PadModel } from '../models/pad.model';
import { BillingService } from '../services/billing.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';

/** GET /billing — admin: all billing periods */
export const listAllBilling = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { status, pad_id } = req.query;
  const bills = await BillingPeriodModel.findAll({
    status: status as string | undefined,
    padId:  pad_id ? parseInt(pad_id as string, 10) : undefined,
  });
  sendSuccess(res, { bills, count: bills.length });
});

/** GET /billing/pad/:padId — admin or tenant: billing history for one pad */
export const getBillingByPad = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const padId = parseInt(req.params.padId, 10);
  const pad = await PadModel.findById(padId);
  if (!pad) throw new AppError('Pad not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

  if (req.user.role !== 'admin' && pad.tenant_id !== req.user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }

  const bills = await BillingPeriodModel.findByPad(padId);
  sendSuccess(res, { bills });
});

/** GET /billing/my — tenant: own billing history */
export const getMyBilling = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const bills = await BillingPeriodModel.findByTenant(req.user.id);
  sendSuccess(res, { bills });
});

/** GET /billing/:id */
export const getBillingById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const bill = await BillingPeriodModel.findById(parseInt(req.params.id, 10));
  if (!bill) throw new AppError('Billing period not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

  if (req.user.role !== 'admin' && bill.tenant_id !== req.user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }
  sendSuccess(res, { bill });
});

/** POST /billing/generate — admin: manually generate billing for a pad + month */
export const generateBilling = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { pad_id, period_start } = req.body;
  if (!pad_id || !period_start) {
    throw new AppError('pad_id and period_start required', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }
  const periodDate = new Date(period_start);
  await BillingService.generateBilling(parseInt(pad_id, 10), periodDate);
  sendSuccess(res, { message: 'Billing period generated' }, HTTP_STATUS.CREATED);
});

/** PUT /billing/:id/waive — admin: waive a bill */
export const waiveBilling = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const bill = await BillingPeriodModel.findById(parseInt(req.params.id, 10));
  if (!bill) throw new AppError('Billing period not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  await BillingPeriodModel.waive(bill.id);
  sendSuccess(res, { message: 'Bill waived' });
});

/** DELETE /billing/:id — admin: permanently delete a billing period */
export const deleteBilling = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const bill = await BillingPeriodModel.findById(parseInt(req.params.id, 10));
  if (!bill) throw new AppError('Billing period not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  await BillingPeriodModel.delete(bill.id);
  sendSuccess(res, { id: bill.id }, HTTP_STATUS.OK, 'Bill deleted');
});
