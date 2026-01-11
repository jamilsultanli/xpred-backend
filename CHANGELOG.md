# Changelog

## [1.0.0] - Phase 1-5 Implementation

### Added

#### Phase 1: Foundation
- Project structure with TypeScript
- Express.js server with middleware
- Supabase database connection (admin & user clients)
- Environment configuration system
- Error handling middleware
- Authentication middleware (`authenticateUser`, `requireAdmin`, `requireModerator`)
- Request validation middleware (Zod)
- Security middleware (Helmet, CORS, Compression)
- Logging (Morgan)

#### Phase 2: Core User APIs
- **Authentication APIs:**
  - POST `/api/v1/auth/register` - User registration
  - POST `/api/v1/auth/login` - User login
  - POST `/api/v1/auth/logout` - User logout
  - POST `/api/v1/auth/refresh` - Token refresh
  - POST `/api/v1/auth/forgot-password` - Password reset request
  - POST `/api/v1/auth/reset-password` - Password reset

- **User Profile APIs:**
  - GET `/api/v1/users/me` - Get current user
  - GET `/api/v1/users/:username` - Get user by username
  - PUT `/api/v1/users/me` - Update profile
  - GET `/api/v1/users/:username/predictions` - User's predictions
  - GET `/api/v1/users/:username/followers` - User's followers
  - GET `/api/v1/users/:username/following` - Users being followed

#### Phase 3: Predictions & Betting
- **Prediction APIs:**
  - POST `/api/v1/predictions` - Create prediction (with AI moderation)
  - GET `/api/v1/predictions` - List predictions (with filters, pagination, sorting)
  - GET `/api/v1/predictions/:id` - Get prediction details with stats
  - PUT `/api/v1/predictions/:id` - Update prediction
  - DELETE `/api/v1/predictions/:id` - Delete prediction
  - POST `/api/v1/predictions/:id/resolve` - Resolve prediction and distribute payouts
  - POST `/api/v1/predictions/:id/propose-resolution` - Propose resolution (creator)

- **Betting APIs:**
  - POST `/api/v1/bets` - Place bet (atomic operation via RPC)
  - GET `/api/v1/bets` - Get user's bets with stats
  - GET `/api/v1/bets/:id` - Get bet details
  - DELETE `/api/v1/bets/:id` - Cancel bet (with refund)

- **AI Moderation Service:**
  - Google Gemini API integration
  - Content safety checking
  - Automatic category classification
  - Fallback handling

- **Betting Logic:**
  - Pari-mutuel betting system
  - Balance validation
  - Payout calculations
  - Transaction logging
  - Pool updates

#### Phase 4: Social Features
- **Posts APIs:**
  - POST `/api/v1/posts` - Create post
  - GET `/api/v1/posts` - Get feed (explore/following modes)
  - GET `/api/v1/posts/:id` - Get post details with comments
  - PUT `/api/v1/posts/:id` - Update post (author only)
  - DELETE `/api/v1/posts/:id` - Delete post (author/admin)
  - POST `/api/v1/posts/:id/like` - Toggle like on post

- **Comments APIs:**
  - GET `/api/v1/posts/:id/comments` - Get comments for a post
  - POST `/api/v1/posts/:id/comments` - Add comment to post
  - DELETE `/api/v1/posts/comments/:id` - Delete comment (author/admin)

- **Social Interaction APIs:**
  - POST `/api/v1/users/:userId/follow` - Follow a user
  - DELETE `/api/v1/users/:userId/follow` - Unfollow a user
  - GET `/api/v1/users/:userId/follow-status` - Check follow status

#### Phase 5: Wallet & Payments
- **Wallet APIs:**
  - GET `/api/v1/wallet/balance` - Get wallet balance
  - GET `/api/v1/wallet/transactions` - Get transaction history (with filters)
  - GET `/api/v1/wallet/bundles` - Get available bundles

- **Payment APIs:**
  - POST `/api/v1/wallet/create-payment-intent` - Create Stripe payment intent
  - POST `/api/v1/wallet/purchase-bundle` - Purchase XP/XC bundle
  - POST `/api/v1/payment/webhook/stripe` - Stripe webhook handler

- **Exchange & Withdrawal:**
  - POST `/api/v1/wallet/exchange` - Exchange XP to XC (configurable rate)
  - POST `/api/v1/wallet/withdraw` - Request withdrawal (KYC required)

- **Payment Service:**
  - Stripe SDK integration
  - Payment intent creation
  - Webhook signature verification
  - Payment confirmation

### Features
- Type-safe API with TypeScript
- Comprehensive error handling
- Input validation with Zod
- Role-based access control
- Pagination support
- Filtering and sorting
- AI-powered content moderation
- Atomic betting operations
- Automatic payout distribution
- Social feed with following/explore modes
- Real-time-like statistics (likes, comments counts)
- Automatic notifications
- Stripe payment processing
- Bundle purchase system
- XP to XC exchange
- Withdrawal requests (KYC protected)

### Technical Details
- Uses Supabase RPC functions for atomic operations (`place_bet`, `resolve_prediction`)
- Integrates with Google Gemini API for content moderation
- Integrates with Stripe for payment processing
- Supports dual currency system (XP and XC)
- Implements pari-mutuel betting with automatic payout distribution
- Transaction logging for all financial operations
- Notification system for social interactions
- Feed filtering (explore vs following)
- Payment webhook handling for Stripe events

### Dependencies Added
- `stripe` - Stripe payment processing SDK

#### Phase 6: Notifications & Support
- **Notifications APIs:**
  - GET `/api/v1/notifications` - Get notifications (with filters)
  - PUT `/api/v1/notifications/:id/read` - Mark notification as read
  - PUT `/api/v1/notifications/read-all` - Mark all notifications as read
  - DELETE `/api/v1/notifications/:id` - Delete notification

- **Support Ticket APIs:**
  - POST `/api/v1/support/tickets` - Create support ticket
  - GET `/api/v1/support/tickets` - Get user's tickets
  - GET `/api/v1/support/tickets/:id` - Get ticket details
  - POST `/api/v1/support/tickets/:id/reply` - Reply to ticket

- **Features:**
  - Notification filtering (unread, type)
  - Unread count tracking
  - Support ticket status management
  - User ticket replies

#### Phase 7: KYC & Verification
- **KYC APIs:**
  - POST `/api/v1/verification/request` - Submit KYC request
  - GET `/api/v1/verification/status` - Get verification status

- **File Upload APIs:**
  - POST `/api/v1/upload/image` - Upload image
  - POST `/api/v1/upload/document` - Upload document (KYC)

#### Phase 8: Admin APIs
- **Dashboard:**
  - GET `/api/v1/admin/dashboard/stats` - Dashboard statistics

- **User Management:**
  - GET `/api/v1/admin/users` - List users
  - GET `/api/v1/admin/users/:id` - Get user details
  - PUT `/api/v1/admin/users/:id` - Update user
  - POST `/api/v1/admin/users/:id/ban` - Ban user
  - POST `/api/v1/admin/users/:id/add-funds` - Add funds

- **Prediction Management:**
  - GET `/api/v1/admin/predictions` - List predictions
  - PUT `/api/v1/admin/predictions/:id` - Update prediction
  - POST `/api/v1/admin/predictions/:id/resolve` - Force resolve
  - DELETE `/api/v1/admin/predictions/:id` - Delete prediction (with refunds)

- **KYC Management:**
  - GET `/api/v1/admin/kyc/requests` - List KYC requests
  - PUT `/api/v1/admin/kyc/requests/:id` - Approve/reject KYC

- **Support Management:**
  - GET `/api/v1/admin/support/tickets` - List all tickets
  - POST `/api/v1/admin/support/tickets/:id/reply` - Admin reply

- **Reports & Moderation:**
  - GET `/api/v1/admin/reports` - List reports
  - PUT `/api/v1/admin/reports/:id` - Resolve report

- **System Management:**
  - GET `/api/v1/admin/settings` - Get settings
  - PUT `/api/v1/admin/settings/:key` - Update setting
  - POST `/api/v1/admin/broadcast` - Send broadcast
  - GET `/api/v1/admin/finance/analytics` - Financial analytics
  - GET `/api/v1/admin/audit-logs` - Get audit logs

#### Phase 9 & 10: Explore & Search
- **Explore APIs:**
  - GET `/api/v1/explore/search` - Search predictions and users
  - GET `/api/v1/explore/categories` - Get categories with counts
  - GET `/api/v1/explore/trending` - Get trending predictions

- **Leaderboard:**
  - GET `/api/v1/leaderboard` - Get leaderboard rankings

### Implementation Complete! ✅

All planned phases have been successfully implemented. The backend is fully functional with 80+ API endpoints covering all platform features.
