import { Router } from 'express';
import { authenticateJWT, authenticateApiKey, requireAdmin } from '../middleware/auth.middleware';
import {
  issueRelayCommand,
  getPendingCommand,
  ackRelayCommand,
  getCommandHistory,
} from '../controllers/relayCommand.controller';

const router = Router();

// Admin issues a relay command to a device
router.post('/:id/relay-command', authenticateJWT, requireAdmin, issueRelayCommand);

// ESP polls for pending command (API key auth)
router.get('/:id/relay-command', authenticateApiKey, getPendingCommand);

// ESP acknowledges a command (API key auth)
router.put('/:id/relay-command/ack', authenticateApiKey, ackRelayCommand);

// Admin views command history
router.get('/:id/relay-command/history', authenticateJWT, requireAdmin, getCommandHistory);

export default router;
