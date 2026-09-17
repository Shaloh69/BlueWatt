import { Request, Response, NextFunction } from 'express';
import { BillingPeriodModel } from '../models/billingPeriod.model';
import { BillingScheduleModel } from '../models/billingSchedule.model';
import { PadModel } from '../models/pad.model';
import { BillingService } from '../services/billing.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { cache } from '../services/cache.service';
import { toDateOnly } from '../utils/date';

/** Drop all billing cache entries so the next GET sees fresh data. */
function bustBillingCache(): void {
  cache.invalidate('billing:');
}

/** GET /billing — admin: all billing periods */
export const listAllBilling = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { status, pad_id } = req.query;
    const bills = await BillingPeriodModel.findAll({
      status: status as string | undefined,
      padId: pad_id ? parseInt(pad_id as string, 10) : undefined,
    });
    sendSuccess(res, { bills, count: bills.length });
  }
);

/** GET /billing/pad/:padId — admin or tenant: billing history for one pad */
export const getBillingByPad = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    const padId = parseInt(req.params.padId, 10);
    const pad = await PadModel.findById(padId);
    if (!pad) throw new AppError('Pad not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

    if (req.user.role !== 'admin' && pad.tenant_id !== req.user.id) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
    }

    const bills = await BillingPeriodModel.findByPad(padId);
    sendSuccess(res, { bills });
  }
);

/** GET /billing/my — tenant: own billing history */
export const getMyBilling = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    const bills = await BillingPeriodModel.findByTenant(req.user.id);
    sendSuccess(res, { bills });
  }
);

/** GET /billing/:id */
export const getBillingById = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.user)
      throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    const bill = await BillingPeriodModel.findById(parseInt(req.params.id, 10));
    if (!bill)
      throw new AppError('Billing period not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

    if (req.user.role !== 'admin' && bill.tenant_id !== req.user.id) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
    }
    sendSuccess(res, { bill });
  }
);

/** POST /billing/generate — admin: manually generate billing for a pad + period */
export const generateBilling = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { pad_id, period_start, period_end, due_date } = req.body;
    if (!pad_id || !period_start) {
      throw new AppError(
        'pad_id and period_start required',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const padId = parseInt(pad_id, 10);
    if (Number.isNaN(padId)) {
      throw new AppError(
        'pad_id must be a number',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Parse dates here rather than in the service: an unparseable value used to
    // reach .toISOString() downstream and surface as an opaque 500.
    const parseDate = (value: unknown, field: string): Date => {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) {
        throw new AppError(
          `${field} is not a valid date`,
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR
        );
      }
      return d;
    };

    const periodDate = parseDate(period_start, 'period_start');
    const periodEnd = period_end ? parseDate(period_end, 'period_end') : undefined;
    const dueDate = due_date ? parseDate(due_date, 'due_date') : undefined;

    if (periodEnd && periodEnd < periodDate) {
      throw new AppError(
        'period_end cannot be before period_start',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // billing_periods has UNIQUE (pad_id, period_start, bill_type) — only one
    // electricity bill per pad per period start. Name the clashing bill instead
    // of letting the INSERT fail with a bare duplicate-key error.
    const existing = await BillingPeriodModel.findForPeriodType(padId, periodDate, 'electricity');
    if (existing) {
      throw new AppError(
        `An electricity bill already exists for this pad starting ` +
          `${toDateOnly(period_start)} (bill #${existing.id}). ` +
          `Delete that bill first, or choose a different period start.`,
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.DUPLICATE_ENTRY
      );
    }

    await BillingService.generateBilling(padId, periodDate, {
      periodEnd,
      dueDate,
      allowDuplicate: true,
    });
    bustBillingCache();
    sendSuccess(res, { message: 'Billing period generated' }, HTTP_STATUS.CREATED);
  }
);

/** PUT /billing/:id/mark-paid — admin: manually mark a bill as paid */
export const markBillingPaid = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const bill = await BillingPeriodModel.findById(parseInt(req.params.id, 10));
    if (!bill)
      throw new AppError('Billing period not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    await BillingPeriodModel.markPaid(bill.id);
    bustBillingCache();
    sendSuccess(res, { message: 'Bill marked as paid' });
  }
);

/** PUT /billing/:id/waive — admin: waive a bill */
export const waiveBilling = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const bill = await BillingPeriodModel.findById(parseInt(req.params.id, 10));
    if (!bill)
      throw new AppError('Billing period not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    await BillingPeriodModel.waive(bill.id);
    bustBillingCache();
    sendSuccess(res, { message: 'Bill waived' });
  }
);

/** DELETE /billing/:id — admin: permanently delete a billing period.
 *  If a schedule for the same pad had already advanced past this period,
 *  roll back next_period_start so the period can be regenerated. */
export const deleteBilling = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const bill = await BillingPeriodModel.findById(parseInt(req.params.id, 10));
    if (!bill)
      throw new AppError('Billing period not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

    await BillingPeriodModel.delete(bill.id);

    // Roll back any schedule whose next_period_start is exactly period_end + 1 day
    // (i.e. the deleted bill was the last generated period for that schedule)
    const periodEndStr = toDateOnly(bill.period_end);
    await BillingScheduleModel.rollbackIfLastPeriod(bill.pad_id, periodEndStr, toDateOnly(bill.period_start));

    bustBillingCache();
    sendSuccess(res, { id: bill.id }, HTTP_STATUS.OK, 'Bill deleted');
  }
);
