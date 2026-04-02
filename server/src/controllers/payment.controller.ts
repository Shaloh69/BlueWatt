import { Request, Response, NextFunction } from 'express';
import { PaymentModel } from '../models/payment.model';
import { BillingPeriodModel } from '../models/billingPeriod.model';
import { PaymentQrCodeModel } from '../models/paymentQrCode.model';
import { supabaseService } from '../services/supabase.service';
import { AppError } from '../utils/AppError';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';
import { sseService } from '../services/sse.service';

/**
 * POST /payments/submit
 * Tenant submits a payment receipt image + reference number.
 * Multipart form fields:
 *   - billing_period_id (number)
 *   - reference_number  (string, required)
 *   - payment_method    (string: 'gcash' | 'maya' | 'bank_transfer' | other)
 *   - receipt           (image file, required)
 */
export const submitPayment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);

  const { billing_period_id, reference_number, payment_method } = req.body;

  if (!billing_period_id || !reference_number) {
    throw new AppError(
      'billing_period_id and reference_number are required',
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  if (!req.file) {
    throw new AppError('Receipt image is required', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  const bill = await BillingPeriodModel.findById(parseInt(billing_period_id, 10));
  if (!bill) throw new AppError('Billing period not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

  // Tenants can only pay their own bills
  if (req.user.role !== 'admin' && bill.tenant_id !== req.user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }

  if (bill.status === 'paid') {
    throw new AppError('This bill is already paid', HTTP_STATUS.CONFLICT, ERROR_CODES.DUPLICATE_ENTRY);
  }
  if (bill.status === 'waived') {
    throw new AppError('This bill has been waived', HTTP_STATUS.CONFLICT, ERROR_CODES.DUPLICATE_ENTRY);
  }

  // Upload receipt image to Supabase
  const receiptUrl = await supabaseService.uploadReceiptImage(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
    req.user.id
  );

  const payment = await PaymentModel.submitReceipt(
    bill.id,
    req.user.id,
    Number(bill.amount_due),
    payment_method || 'gcash',
    String(reference_number).trim(),
    receiptUrl
  );

  // Notify all admins via SSE that a new receipt is pending review
  sseService.broadcastToAll('payment_submitted', {
    payment_id: payment.id,
    billing_period_id: bill.id,
    tenant_id: req.user.id,
    amount: payment.amount,
    reference_number: payment.reference_number,
    payment_method: payment.payment_method,
  });

  sendSuccess(res, {
    payment_id: payment.id,
    status: payment.status,
    message: 'Receipt submitted. Pending admin verification.',
  }, HTTP_STATUS.CREATED);
});

/**
 * GET /payments/pending-verification
 * Admin: list all payments waiting for receipt verification.
 */
export const getPendingVerification = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const payments = await PaymentModel.findPendingVerification();
  sendSuccess(res, { payments, count: payments.length });
});

/**
 * PUT /payments/:id/approve
 * Admin verifies the reference number and approves the payment.
 * This marks the billing period as paid.
 */
export const approvePayment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);

  const payment = await PaymentModel.findById(parseInt(req.params.id, 10));
  if (!payment) throw new AppError('Payment not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

  if (payment.status !== 'pending_verification') {
    throw new AppError(
      `Cannot approve a payment with status '${payment.status}'`,
      HTTP_STATUS.CONFLICT,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  await PaymentModel.approve(payment.id, req.user.id);
  await BillingPeriodModel.markPaid(payment.billing_period_id);

  sseService.broadcastToAll('payment_received', {
    payment_id: payment.id,
    billing_period_id: payment.billing_period_id,
    tenant_id: payment.tenant_id,
    amount: payment.amount,
    verified_by: req.user.id,
  });

  sendSuccess(res, { message: 'Payment approved and bill marked as paid.' });
});

/**
 * PUT /payments/:id/reject
 * Admin rejects the receipt (wrong reference number, blurry image, etc.)
 * Body: { reason: string }
 */
export const rejectPayment = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);

  const { reason } = req.body;
  if (!reason) {
    throw new AppError('Rejection reason is required', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }

  const payment = await PaymentModel.findById(parseInt(req.params.id, 10));
  if (!payment) throw new AppError('Payment not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

  if (payment.status !== 'pending_verification') {
    throw new AppError(
      `Cannot reject a payment with status '${payment.status}'`,
      HTTP_STATUS.CONFLICT,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  await PaymentModel.reject(payment.id, req.user.id, String(reason));

  // Notify the tenant via SSE (if subscribed)
  sseService.sendToUser(payment.tenant_id, 'payment_rejected', {
    payment_id: payment.id,
    billing_period_id: payment.billing_period_id,
    reason,
  });

  sendSuccess(res, { message: 'Payment rejected. Tenant can resubmit.' });
});

/** GET /payments/billing/:billId — status + submissions for a bill */
export const getPaymentStatus = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const billId = parseInt(req.params.billId, 10);
  const bill = await BillingPeriodModel.findById(billId);
  if (!bill) throw new AppError('Bill not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);

  if (req.user.role !== 'admin' && bill.tenant_id !== req.user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODES.FORBIDDEN);
  }

  const payments = await PaymentModel.findByBillingPeriod(billId);
  sendSuccess(res, { bill_status: bill.status, payments });
});

/** GET /payments/history — tenant: own payment history */
export const getMyPaymentHistory = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  const payments = await PaymentModel.findByTenant(req.user.id);
  sendSuccess(res, { payments });
});

/** GET /payments/admin/all — admin: all payments */
export const getAllPayments = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const payments = await PaymentModel.findAll(limit);
  sendSuccess(res, { payments, count: payments.length });
});

// ── QR Code endpoints ─────────────────────────────────────────────────────────

/**
 * POST /payments/qr-codes
 * Admin uploads a payment QR code image.
 * Multipart fields: label (string), qr_image (file)
 */
export const uploadQrCode = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  if (!req.user) throw new AppError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);

  const { label } = req.body;
  if (!label) throw new AppError('label is required', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  if (!req.file) throw new AppError('QR code image is required', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);

  const imageUrl = await supabaseService.uploadQrCode(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype
  );

  const qr = await PaymentQrCodeModel.create(label, imageUrl, req.user.id);
  sendSuccess(res, { qr }, HTTP_STATUS.CREATED);
});

/**
 * GET /payments/qr-codes
 * Returns all active QR codes — visible to tenants so they know where to pay.
 */
export const getActiveQrCodes = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const qrCodes = await PaymentQrCodeModel.findAllActive();
  sendSuccess(res, { qr_codes: qrCodes });
});

/**
 * GET /payments/qr-codes/all — admin: all QR codes including inactive
 */
export const getAllQrCodes = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const qrCodes = await PaymentQrCodeModel.findAll();
  sendSuccess(res, { qr_codes: qrCodes });
});

/**
 * PUT /payments/qr-codes/:id/toggle — admin: activate or deactivate a QR code
 */
export const toggleQrCode = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const qr = await PaymentQrCodeModel.findById(parseInt(req.params.id, 10));
  if (!qr) throw new AppError('QR code not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  await PaymentQrCodeModel.setActive(qr.id, !qr.is_active);
  sendSuccess(res, { message: `QR code ${qr.is_active ? 'deactivated' : 'activated'}` });
});

/**
 * DELETE /payments/qr-codes/:id — admin: permanently remove a QR code
 */
export const deleteQrCode = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const qr = await PaymentQrCodeModel.findById(parseInt(req.params.id, 10));
  if (!qr) throw new AppError('QR code not found', HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  await PaymentQrCodeModel.delete(qr.id);
  sendSuccess(res, { message: 'QR code deleted' });
});
