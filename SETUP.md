# Backend Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:
```bash
cp env.example .env
```

Edit `.env` and fill in your values:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key  
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `JWT_SECRET` - A random secret string for JWT
- `CORS_ORIGIN` - Your frontend URL (default: http://localhost:3000)

### 3. Run Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3001`

### 4. Test the API

```bash
# Health check
curl http://localhost:3001/health

# API health check
curl http://localhost:3001/api/v1/health
```

## Implemented Features

### ✅ Phase 1: Foundation (Completed)
- [x] Project structure with TypeScript
- [x] Express.js server setup
- [x] Supabase database connection
- [x] Environment configuration
- [x] Error handling middleware
- [x] Authentication middleware
- [x] Validation middleware
- [x] CORS, Helmet, Compression
- [x] Logging (Morgan)

### ✅ Phase 2: Core User APIs (Completed)
- [x] POST `/api/v1/auth/register` - User registration
- [x] POST `/api/v1/auth/login` - User login
- [x] POST `/api/v1/auth/logout` - User logout
- [x] POST `/api/v1/auth/refresh` - Token refresh
- [x] POST `/api/v1/auth/forgot-password` - Password reset request
- [x] POST `/api/v1/auth/reset-password` - Password reset
- [x] GET `/api/v1/users/me` - Get current user
- [x] GET `/api/v1/users/:username` - Get user by username
- [x] PUT `/api/v1/users/me` - Update profile
- [x] GET `/api/v1/users/:username/predictions` - User's predictions
- [x] GET `/api/v1/users/:username/followers` - User's followers
- [x] GET `/api/v1/users/:username/following` - Users being followed

### ✅ Phase 3: Predictions & Betting (Completed)
- [x] POST `/api/v1/predictions` - Create prediction (with AI moderation)
- [x] GET `/api/v1/predictions` - List predictions (with filters)
- [x] GET `/api/v1/predictions/:id` - Get prediction details
- [x] PUT `/api/v1/predictions/:id` - Update prediction
- [x] DELETE `/api/v1/predictions/:id` - Delete prediction
- [x] POST `/api/v1/predictions/:id/resolve` - Resolve prediction
- [x] POST `/api/v1/predictions/:id/propose-resolution` - Propose resolution
- [x] POST `/api/v1/bets` - Place bet
- [x] GET `/api/v1/bets` - Get user's bets
- [x] GET `/api/v1/bets/:id` - Get bet details
- [x] DELETE `/api/v1/bets/:id` - Cancel bet
- [x] AI Moderation Service (Google Gemini integration)
- [x] Betting logic with pari-mutuel system
- [x] Payout calculations

### ✅ Phase 4: Social Features (Completed)
- [x] POST `/api/v1/posts` - Create post
- [x] GET `/api/v1/posts` - Get feed (explore/following)
- [x] GET `/api/v1/posts/:id` - Get post details
- [x] PUT `/api/v1/posts/:id` - Update post
- [x] DELETE `/api/v1/posts/:id` - Delete post
- [x] POST `/api/v1/posts/:id/like` - Toggle like
- [x] GET `/api/v1/posts/:id/comments` - Get comments
- [x] POST `/api/v1/posts/:id/comments` - Add comment
- [x] DELETE `/api/v1/posts/comments/:id` - Delete comment
- [x] POST `/api/v1/users/:userId/follow` - Follow user
- [x] DELETE `/api/v1/users/:userId/follow` - Unfollow user
- [x] GET `/api/v1/users/:userId/follow-status` - Check follow status
- [x] Automatic notifications for likes, comments, follows

### ✅ Phase 5: Wallet & Payments (Completed)
- [x] GET `/api/v1/wallet/balance` - Get wallet balance
- [x] GET `/api/v1/wallet/transactions` - Get transaction history
- [x] GET `/api/v1/wallet/bundles` - Get available bundles
- [x] POST `/api/v1/wallet/create-payment-intent` - Create Stripe payment intent
- [x] POST `/api/v1/wallet/purchase-bundle` - Purchase XP/XC bundle
- [x] POST `/api/v1/wallet/exchange` - Exchange XP to XC
- [x] POST `/api/v1/wallet/withdraw` - Request withdrawal (KYC required)
- [x] POST `/api/v1/payment/webhook/stripe` - Stripe webhook handler
- [x] Stripe payment integration
- [x] Bundle purchase system
- [x] XP to XC exchange (configurable rate)
- [x] Withdrawal request system

### ✅ Phase 6: Notifications & Support (Completed)
- [x] GET `/api/v1/notifications` - Get notifications
- [x] PUT `/api/v1/notifications/:id/read` - Mark notification as read
- [x] PUT `/api/v1/notifications/read-all` - Mark all as read
- [x] DELETE `/api/v1/notifications/:id` - Delete notification
- [x] POST `/api/v1/support/tickets` - Create support ticket
- [x] GET `/api/v1/support/tickets` - Get user's tickets
- [x] GET `/api/v1/support/tickets/:id` - Get ticket details
- [x] POST `/api/v1/support/tickets/:id/reply` - Reply to ticket
- [x] Notification filtering (unread, type)
- [x] Support ticket status tracking

### ✅ Phase 7: KYC & Verification (Completed)
- [x] POST `/api/v1/verification/request` - Submit KYC request
- [x] GET `/api/v1/verification/status` - Get verification status
- [x] POST `/api/v1/upload/image` - Upload image
- [x] POST `/api/v1/upload/document` - Upload document (KYC)

### ✅ Phase 8: Admin APIs (Completed)
- [x] GET `/api/v1/admin/dashboard/stats` - Dashboard statistics
- [x] GET `/api/v1/admin/users` - List users
- [x] GET `/api/v1/admin/users/:id` - Get user details
- [x] PUT `/api/v1/admin/users/:id` - Update user
- [x] POST `/api/v1/admin/users/:id/ban` - Ban user
- [x] POST `/api/v1/admin/users/:id/add-funds` - Add funds
- [x] GET `/api/v1/admin/predictions` - List predictions
- [x] PUT `/api/v1/admin/predictions/:id` - Update prediction
- [x] POST `/api/v1/admin/predictions/:id/resolve` - Force resolve
- [x] DELETE `/api/v1/admin/predictions/:id` - Delete prediction
- [x] GET `/api/v1/admin/kyc/requests` - List KYC requests
- [x] PUT `/api/v1/admin/kyc/requests/:id` - Approve/reject KYC
- [x] GET `/api/v1/admin/support/tickets` - List all tickets
- [x] POST `/api/v1/admin/support/tickets/:id/reply` - Admin reply
- [x] GET `/api/v1/admin/reports` - List reports
- [x] PUT `/api/v1/admin/reports/:id` - Resolve report
- [x] GET `/api/v1/admin/settings` - Get settings
- [x] PUT `/api/v1/admin/settings/:key` - Update setting
- [x] POST `/api/v1/admin/broadcast` - Send broadcast
- [x] GET `/api/v1/admin/finance/analytics` - Financial analytics
- [x] GET `/api/v1/admin/audit-logs` - Get audit logs

### ✅ Phase 9 & 10: Explore & Search (Completed)
- [x] GET `/api/v1/explore/search` - Search predictions and users
- [x] GET `/api/v1/explore/categories` - Get categories with counts
- [x] GET `/api/v1/explore/trending` - Get trending predictions
- [x] GET `/api/v1/leaderboard` - Get leaderboard rankings

## API Testing Examples

### Register a User
```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "full_name": "Test User",
    "username": "testuser"
  }'
```

### Login
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Get Current User (requires auth token)
```bash
curl -X GET http://localhost:3001/api/v1/users/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Get User by Username
```bash
curl -X GET http://localhost:3001/api/v1/users/testuser
```

### Create Prediction
```bash
curl -X POST http://localhost:3001/api/v1/predictions \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Will Bitcoin hit $100k by December 2024?",
    "description": "Bitcoin price prediction",
    "deadline": "2024-12-31T23:59:59Z",
    "initial_pot_xp": 100
  }'
```

### Get Predictions
```bash
curl -X GET "http://localhost:3001/api/v1/predictions?page=1&limit=20&status=active"
```

### Place Bet
```bash
curl -X POST http://localhost:3001/api/v1/bets \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "prediction_id": "prediction-uuid",
    "amount": 100,
    "currency": "XP",
    "choice": "yes"
  }'
```

### Get User's Bets
```bash
curl -X GET "http://localhost:3001/api/v1/bets?status=active" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Create Post
```bash
curl -X POST http://localhost:3001/api/v1/posts \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is my first post!",
    "image_url": "https://example.com/image.jpg"
  }'
```

### Get Posts Feed
```bash
curl -X GET "http://localhost:3001/api/v1/posts?feed_type=explore&page=1&limit=20"
```

### Like a Post
```bash
curl -X POST http://localhost:3001/api/v1/posts/POST_ID/like \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Add Comment
```bash
curl -X POST http://localhost:3001/api/v1/posts/POST_ID/comments \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Great post!"
  }'
```

### Follow User
```bash
curl -X POST http://localhost:3001/api/v1/users/USER_ID/follow \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Get Wallet Balance
```bash
curl -X GET http://localhost:3001/api/v1/wallet/balance \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Get Transactions
```bash
curl -X GET "http://localhost:3001/api/v1/wallet/transactions?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Get Available Bundles
```bash
curl -X GET http://localhost:3001/api/v1/wallet/bundles
```

### Create Payment Intent (Stripe)
```bash
curl -X POST http://localhost:3001/api/v1/wallet/create-payment-intent \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "bundle_id": "b1"
  }'
```

### Purchase Bundle (after payment confirmed)
```bash
curl -X POST http://localhost:3001/api/v1/wallet/purchase-bundle \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "bundle_id": "b1",
    "payment_method": "stripe",
    "payment_intent_id": "pi_xxxxx"
  }'
```

### Exchange XP to XC
```bash
curl -X POST http://localhost:3001/api/v1/wallet/exchange \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_xp": 1000,
    "exchange_rate": 100
  }'
```

### Request Withdrawal
```bash
curl -X POST http://localhost:3001/api/v1/wallet/withdraw \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50,
    "currency": "XC",
    "withdrawal_method": "paypal"
  }'
```

### Get Notifications
```bash
curl -X GET "http://localhost:3001/api/v1/notifications?unread_only=true" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Mark Notification as Read
```bash
curl -X PUT http://localhost:3001/api/v1/notifications/NOTIFICATION_ID/read \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Mark All Notifications as Read
```bash
curl -X PUT http://localhost:3001/api/v1/notifications/read-all \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Create Support Ticket
```bash
curl -X POST http://localhost:3001/api/v1/support/tickets \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Issue with bet payout",
    "message": "I placed a bet but didn't receive my winnings..."
  }'
```

### Get Support Tickets
```bash
curl -X GET "http://localhost:3001/api/v1/support/tickets?status=open" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Reply to Support Ticket
```bash
curl -X POST http://localhost:3001/api/v1/support/tickets/TICKET_ID/reply \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Additional information about my issue..."
  }'
```

## Project Structure

```
server/
├── src/
│   ├── config/
│   │   ├── env.ts           # Environment configuration
│   │   └── supabase.ts      # Supabase client setup
│   ├── middleware/
│   │   ├── auth.ts          # Authentication middleware
│   │   ├── errorHandler.ts  # Error handling
│   │   └── validation.ts   # Request validation
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── users.controller.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   └── users.routes.ts
│   ├── models/
│   │   └── user.types.ts
│   ├── utils/
│   │   └── errors.ts
│   ├── app.ts               # Express app setup
│   └── index.ts             # Server entry point
├── package.json
├── tsconfig.json
├── env.example
└── README.md
```

## Implementation Complete! 🎉

All core phases have been implemented. The backend is now fully functional with:

- ✅ User authentication and management
- ✅ Prediction markets with AI moderation
- ✅ Betting system with automatic payouts
- ✅ Social features (posts, comments, likes, follows)
- ✅ Wallet and payment processing (Stripe)
- ✅ Notifications and support tickets
- ✅ KYC verification system
- ✅ Comprehensive admin panel
- ✅ Search and explore features
- ✅ Leaderboard system

## Optional Enhancements

### Real-time Features (Phase 9 - Optional)
- WebSocket implementation for live updates
- Real-time prediction pool updates
- Push notifications
- Live activity feeds

### Additional Features
- Email notifications
- Advanced analytics
- Machine learning for predictions
- Mobile app API support
- Third-party integrations

## Development Tips

1. **Hot Reload**: The `npm run dev` command uses `tsx watch` for automatic reloading on file changes.

2. **Type Safety**: All routes use Zod schemas for validation, ensuring type safety.

3. **Error Handling**: All errors are caught and formatted consistently using the error handler middleware.

4. **Authentication**: Use the `authenticateUser` middleware for protected routes, and `requireAdmin` for admin-only routes.

5. **Database**: Use `supabaseAdmin` for server-side operations that need to bypass RLS, and `supabase` for user operations.

## Troubleshooting

### Port Already in Use
If port 3001 is already in use, change it in `.env`:
```
PORT=3002
```

### Supabase Connection Issues
- Verify your Supabase URL and keys are correct
- Check that your Supabase project is active
- Ensure RLS policies allow the operations you're trying to perform

### TypeScript Errors
Run the TypeScript compiler to check for errors:
```bash
npm run build
```

## Production Deployment

1. Build the project:
```bash
npm run build
```

2. Set `NODE_ENV=production` in your production environment

3. Start the server:
```bash
npm start
```

The built files will be in the `dist/` directory.

