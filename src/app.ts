import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/env';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/users.routes';
import predictionRoutes from './routes/predictions.routes';
import betRoutes from './routes/bets.routes';
import postRoutes from './routes/posts.routes';
import commentRoutes from './routes/comments.routes';
import socialRoutes from './routes/social.routes';
import walletRoutes from './routes/wallet.routes';
import paymentRoutes from './routes/payment.routes';
import notificationRoutes from './routes/notifications.routes';
import supportRoutes from './routes/support.routes';
import kycRoutes from './routes/kyc.routes';
import uploadRoutes from './routes/upload.routes';
import adminRoutes from './routes/admin.routes';
import exploreRoutes from './routes/explore.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import settingsRoutes from './routes/settings.routes';
import bookmarksRoutes from './routes/bookmarks.routes';
import messagesRoutes from './routes/messages.routes';
import repostsRoutes from './routes/reposts.routes';
import communitiesRoutes from './routes/communities.routes';
import xpMarketRoutes from './routes/xpmarket.routes';
import blueTickRoutes from './routes/bluetick.routes';
import reportsRoutes from './routes/reports.routes';
import blocksRoutes from './routes/blocks.routes';
import batchRoutes from './routes/batch.routes';

const app: Express = express();

// Security middleware
app.use(helmet());

// CORS
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true,
}));

// Body parsing
// Note: Stripe webhook needs raw body, so we handle it separately
app.use('/api/v1/payment/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Attach Socket.IO to requests (will be set in index.ts)
app.use((req: any, res, next) => {
  req.io = app.get('io');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  });
});

// Debug endpoint to test Supabase connection
app.get('/debug/supabase', async (req, res) => {
  try {
    const { supabaseAdmin } = await import('./config/supabase');
    const { data, error } = await supabaseAdmin.from('profiles').select('count').limit(1);
    res.json({
      success: true,
      supabaseConnected: !error,
      error: error?.message,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    });
  } catch (err: any) {
    res.json({
      success: false,
      error: err.message,
    });
  }
});

// API routes
app.use('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API is running',
    version: '1.0.0',
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/predictions', predictionRoutes);
app.use('/api/v1/bets', betRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/posts', commentRoutes); // Comments: /api/v1/posts/:id/comments
app.use('/api/v1/social', socialRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/verification', kycRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/explore', exploreRoutes);
app.use('/api/v1/leaderboard', leaderboardRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/bookmarks', bookmarksRoutes);
app.use('/api/v1/messages', messagesRoutes);
app.use('/api/v1', repostsRoutes);
app.use('/api/v1/communities', communitiesRoutes);
app.use('/api/v1/xp-market', xpMarketRoutes);
app.use('/api/v1/blue-tick', blueTickRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/blocks', blocksRoutes);
app.use('/api/v1/batch', batchRoutes); // Batch API endpoint

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;

