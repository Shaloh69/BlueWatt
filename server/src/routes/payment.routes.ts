import { Router } from 'express';
import { authenticateJWT, requireAdmin } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';
import {
  submitPayment,
  getPendingVerification,
  approvePayment,
  rejectPayment,
  getPaymentStatus,
  getMyPaymentHistory,
  getAllPayments,
  uploadQrCode,
  getActiveQrCodes,
  getAllQrCodes,
  toggleQrCode,
  deleteQrCode,
} from '../controllers/payment.controller';

const router = Router();

// Tenant submits 1–3 receipt images + reference number
router.post('/submit', authenticateJWT, upload.array('receipts', 3), submitPayment);

// Admin: list all receipts pending verification
router.get('/pending-verification', authenticateJWT, requireAdmin, getPendingVerification);

// Admin: approve or reject a submitted receipt
router.put('/:id/approve', authenticateJWT, requireAdmin, approvePayment);
router.put('/:id/reject', authenticateJWT, requireAdmin, rejectPayment);

// Payment status for a bill (tenant sees own, admin sees all)
router.get('/billing/:billId', authenticateJWT, getPaymentStatus);

// Tenant: own payment history
router.get('/history', authenticateJWT, getMyPaymentHistory);

// Admin: all payments
router.get('/admin/all', authenticateJWT, requireAdmin, getAllPayments);

// ── QR Code routes ────────────────────────────────────────────────────────────

// Tenants see active QR codes to know where to send money (public once logged in)
router.get('/qr-codes', authenticateJWT, getActiveQrCodes);

// Admin: upload a new QR code
router.post('/qr-codes', authenticateJWT, requireAdmin, upload.single('image'), uploadQrCode);

// Admin: manage existing QR codes
router.get('/qr-codes/all', authenticateJWT, requireAdmin, getAllQrCodes);
router.put('/qr-codes/:id/toggle', authenticateJWT, requireAdmin, toggleQrCode);
router.delete('/qr-codes/:id', authenticateJWT, requireAdmin, deleteQrCode);

export default router;
