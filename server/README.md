# BlueWatt Backend API

Backend server for the BlueWatt Electrical Monitoring System. Built with Express.js, TypeScript, and MySQL.

## Features

- **Authentication**: JWT-based authentication for users, API key authentication for ESP32 devices
- **Device Management**: Register and manage ESP32 monitoring devices
- **Data Ingestion**: Accept power readings and anomaly events from IoT devices
- **Time-Series Storage**: Efficient storage and querying of electrical measurements
- **Data Aggregation**: Automatic hourly and daily statistics computation
- **RESTful API**: Clean API for web and mobile applications

## Prerequisites

- Node.js >= 18.0.0
- MySQL >= 8.0
- npm >= 9.0.0

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` file with database credentials and secrets

5. Run database migrations:
   ```bash
   npm run migrate:up
   ```

## Development

Start the development server with hot reload:

```bash
npm run dev
```

The server will run on `http://localhost:3000`

## Build for Production

```bash
npm run build
npm start
```

## Database Migrations

- **Apply migrations**: `npm run migrate:up`
- **Rollback last migration**: `npm run migrate:down`
- **Check migration status**: `npm run migrate:status`

## API Documentation

### Authentication Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info

### Device Endpoints

- `POST /api/devices/register` - Register new ESP32 device
- `GET /api/devices` - List user's devices
- `GET /api/devices/:id` - Get device details
- `PUT /api/devices/:id` - Update device info
- `DELETE /api/devices/:id` - Delete device

### Data Endpoints

- `POST /api/power-data` - ESP32 posts power reading (API key auth)
- `GET /api/devices/:id/power-data` - Query power data with time range
- `POST /api/anomaly-events` - ESP32 posts anomaly event (API key auth)
- `GET /api/devices/:id/anomaly-events` - Query anomaly history
- `GET /api/devices/:id/stats` - Get device statistics

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
```

## Deployment

This project is configured for deployment on Render.com. See `render.yaml` for configuration.

## License

MIT
