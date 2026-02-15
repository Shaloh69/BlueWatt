import { User, Device } from './models';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      device?: Device;
      deviceId?: number;
    }
  }
}

export {};
