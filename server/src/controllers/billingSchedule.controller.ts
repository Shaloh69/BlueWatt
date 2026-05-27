import { Request, Response, NextFunction } from 'express';
import { BillingScheduleModel } from '../models/billingSchedule.model';
import { BillingPeriodModel } from '../models/billingPeriod.model';
import { PadModel } from '../models/pad.model';
import { BillingService } from '../services/billing.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { cache } from '../services/cache.service';

/** GET /billing/schedules */
export const listSchedules = asyncHandler(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const schedules = await BillingScheduleModel.findAll();
    sendSuccess(res, { schedules });
  }
);

/** POST /billing/schedules */
export const createSchedule = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { pad_id, bill_type, frequency, due_date_offset_days, flat_amount, start_date } =
      req.body;

    if (!pad_id || !bill_type || !frequency || !start_date) {
      throw new AppError(
        'pad_id, bill_type, frequency, and start_date are required',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const pad = await PadModel.findById(parseInt(pad_id, 10));
    if (!pad || !pad.is_active) {
      throw new AppError('Pad not found or inactive', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    }

    const schedule = await BillingScheduleModel.create({
      pad_id: parseInt(pad_id, 10),
      bill_type,
      frequency,
      due_date_offset_days: parseInt(due_date_offset_days ?? '7', 10),
      flat_amount: flat_amount ? parseFloat(flat_amount) : null,
      start_date,
    });

    sendSuccess(res, { schedule }, HTTP_STATUS.CREATED);
  }
);

/** PUT /billing/schedules/:id/stop */
export const stopSchedule = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const id = parseInt(req.params.id, 10);
    const schedule = await BillingScheduleModel.findById(id);
    if (!schedule) {
      throw new AppError('Schedule not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    }
    await BillingScheduleModel.stop(id);
    sendSuccess(res, { message: 'Schedule stopped' });
  }
);

/** POST /billing/schedules/run — manually trigger schedule processing immediately */
export const runSchedules = asyncHandler(
  async (_req: Request, res: Response, _next: NextFunction) => {
    await BillingService.processSchedules();
    const due = await BillingScheduleModel.findActiveDue();
    sendSuccess(res, { processed: true, remaining_due: due.length });
  }
);

/** DELETE /billing/schedules/:id
 *  Query param: ?cascade=bills  — also deletes all billing periods for that pad */
export const deleteSchedule = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const id = parseInt(req.params.id, 10);
    const cascade = req.query.cascade === 'bills';

    const schedule = await BillingScheduleModel.findById(id);
    if (!schedule) {
      throw new AppError('Schedule not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    }

    let deletedBills = 0;
    if (cascade) {
      deletedBills = await BillingPeriodModel.deleteByPad(schedule.pad_id);
      cache.invalidate('billing:');
    }

    await BillingScheduleModel.delete(id);
    sendSuccess(res, { message: 'Schedule deleted', deleted_bills: deletedBills });
  }
);
