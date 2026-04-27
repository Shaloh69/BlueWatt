import { Response } from 'express';
import { logger } from '../utils/logger';

export interface SSEClient {
  id: string;
  userId: number;
  res: Response;
  deviceIds?: number[];
}

/**
 * SSE event types:
 *   anomaly          — anomaly detected on a device
 *   power_reading    — live power reading forwarded from ESP ingest
 *   relay_state      — relay status changed (from ESP ack or admin command)
 *   relay_command_issued — admin issued a relay command
 *   payment_received — PayMongo webhook confirmed payment
 */
class SSEService {
  private clients: Map<string, SSEClient> = new Map();
  constructor() {
    // Send a comment ping every 20s to prevent Render's 30s idle timeout
    // from closing SSE connections
    setInterval(() => {
      this.clients.forEach((client) => {
        try {
          client.res.write('event: ping\ndata: {}\n\n');
          (client.res as any).flush?.();
        } catch {
          this.removeClient(client.id);
        }
      });
    }, 20000);
  }

  addClient(clientId: string, userId: number, res: Response, deviceIds?: number[]): void {
    this.clients.set(clientId, { id: clientId, userId, res, deviceIds });
    logger.info(`SSE client connected: ${clientId} (user: ${userId})`);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    logger.info(`SSE client disconnected: ${clientId}`);
  }

  private writeEvent(client: SSEClient, event: string, data: any): void {
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    (client.res as any).flush?.();
  }

  sendToUser(userId: number, event: string, data: any): void {
    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.userId === userId) {
        try {
          this.writeEvent(client, event, data);
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send SSE to client ${client.id}:`, error);
          this.removeClient(client.id);
        }
      }
    });
    if (sentCount > 0) {
      logger.debug(`SSE '${event}' → user ${userId} (${sentCount} client(s))`);
    }
  }

  sendToDevice(deviceId: number, event: string, data: any): void {
    let sentCount = 0;
    this.clients.forEach((client) => {
      if (!client.deviceIds || client.deviceIds.includes(deviceId)) {
        try {
          this.writeEvent(client, event, data);
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send SSE to client ${client.id}:`, error);
          this.removeClient(client.id);
        }
      }
    });
    if (sentCount > 0) {
      logger.debug(`SSE '${event}' → device ${deviceId} (${sentCount} client(s))`);
    }
  }

  broadcastToAll(event: string, data: any): void {
    let sentCount = 0;
    this.clients.forEach((client) => {
      try {
        this.writeEvent(client, event, data);
        sentCount++;
      } catch (error) {
        logger.error(`Failed to send SSE to client ${client.id}:`, error);
        this.removeClient(client.id);
      }
    });
    logger.debug(`SSE '${event}' broadcast to ${sentCount} client(s)`);
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const sseService = new SSEService();
