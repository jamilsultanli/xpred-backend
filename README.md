# XPred-AI Backend API Server

Backend API server for XPred-AI prediction market platform.

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account and project
- Environment variables configured

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

3. Update `.env` with your Supabase credentials and other required values.

### Development

Run the development server with hot reload:
```bash
npm run dev
```

The server will start on `http://localhost:3001`

### Build

Build for production:
```bash
npm run build
```

### Production

Start production server:
```bash
npm start
```

## Project Structure

```
server/
├── src/
│   ├── config/          # Configuration files
│   ├── middleware/       # Express middleware
│   ├── routes/          # API route definitions
│   ├── controllers/     # Business logic controllers
│   ├── services/        # External service integrations
│   ├── models/          # TypeScript interfaces/types
│   ├── utils/           # Utility functions
│   ├── app.ts           # Express app setup
│   └── index.ts         # Server entry point
├── tests/               # Test files
├── .env.example         # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## API Documentation

See the main project documentation:
- [Backend API Documentation](../BACKEND_API_DOCUMENTATION.md)
- [Implementation Roadmap](../BACKEND_IMPLEMENTATION_ROADMAP.md)
- [Quick Reference](../BACKEND_API_QUICK_REFERENCE.md)

## Environment Variables

Required environment variables (see `.env.example`):

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `JWT_SECRET` - Secret key for JWT tokens
- `CORS_ORIGIN` - Frontend URL for CORS

## Health Check

```bash
curl http://localhost:3001/health
```

## License

ISC


