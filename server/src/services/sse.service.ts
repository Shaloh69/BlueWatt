import { Response } from 'express';
import { logger } from '../utils/logger';

export interface SSEClient {
  id: string;
  userId: number;
  res: Response;
  deviceIds?: number[];
}

class SSEService {
  private clients: Map<string, SSEClient> = new Map();

  addClient(clientId: string, userId: number, res: Response, deviceIds?: number[]): void {
    this.clients.set(clientId, { id: clientId, userId, res, deviceIds });
    logger.info(`SSE client connected: ${clientId} (user: ${userId})`);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    logger.info(`SSE client disconnected: ${clientId}`);
  }

  sendToUser(userId: number, event: string, data: any): void {
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.userId === userId) {
        try {
          client.res.write(`event: ${event}\n`);
          client.res.write(`data: ${JSON.stringify(data)}\n\n`);
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send SSE to client ${client.id}:`, error);
          this.removeClient(client.id);
        }
      }
    });

    if (sentCount > 0) {
      logger.debug(`SSE event '${event}' sent to ${sentCount} client(s) for user ${userId}`);
    }
  }

  sendToDevice(deviceId: number, event: string, data: any): void {
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.deviceIds && client.deviceIds.includes(deviceId)) {
        try {
          client.res.write(`event: ${event}\n`);
          client.res.write(`data: ${JSON.stringify(data)}\n\n`);
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send SSE to client ${client.id}:`, error);
          this.removeClient(client.id);
        }
      }
    });

    if (sentCount > 0) {
      logger.debug(`SSE event '${event}' sent to ${sentCount} client(s) for device ${deviceId}`);
    }
  }

  broadcastToAll(event: string, data: any): void {
    let sentCount = 0;

    this.clients.forEach((client) => {
      try {
        client.res.write(`event: ${event}\n`);
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
        sentCount++;
      } catch (error) {
        logger.error(`Failed to send SSE to client ${client.id}:`, error);
        this.removeClient(client.id);
      }
    });

    logger.debug(`SSE event '${event}' broadcast to ${sentCount} client(s)`);
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const sseService = new SSEService();
