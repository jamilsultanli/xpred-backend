# XPred-AI Backend API Summary

## Complete API Endpoint List

### Authentication (`/api/v1/auth`)
- `POST /register` - User registration
- `POST /login` - User login
- `POST /logout` - User logout
- `POST /refresh` - Refresh token
- `POST /forgot-password` - Password reset request
- `POST /reset-password` - Password reset

### Users (`/api/v1/users`)
- `GET /me` - Get current user
- `GET /:username` - Get user by username
- `PUT /me` - Update profile
- `GET /:username/predictions` - User's predictions
- `GET /:username/followers` - User's followers
- `GET /:username/following` - Users being followed

### Predictions (`/api/v1/predictions`)
- `POST /` - Create prediction
- `GET /` - List predictions
- `GET /:id` - Get prediction details
- `PUT /:id` - Update prediction
- `DELETE /:id` - Delete prediction
- `POST /:id/resolve` - Resolve prediction
- `POST /:id/propose-resolution` - Propose resolution

### Bets (`/api/v1/bets`)
- `POST /` - Place bet
- `GET /` - Get user's bets
- `GET /:id` - Get bet details
- `DELETE /:id` - Cancel bet

### Posts (`/api/v1/posts`)
- `POST /` - Create post
- `GET /` - Get feed
- `GET /:id` - Get post details
- `PUT /:id` - Update post
- `DELETE /:id` - Delete post
- `POST /:id/like` - Toggle like

### Comments (`/api/v1/posts`)
- `GET /:id/comments` - Get comments
- `POST /:id/comments` - Add comment
- `DELETE /comments/:id` - Delete comment

### Social (`/api/v1`)
- `POST /users/:userId/follow` - Follow user
- `DELETE /users/:userId/follow` - Unfollow user
- `GET /users/:userId/follow-status` - Check follow status

### Wallet (`/api/v1/wallet`)
- `GET /balance` - Get balance
- `GET /transactions` - Get transactions
- `GET /bundles` - Get bundles
- `POST /create-payment-intent` - Create payment intent
- `POST /purchase-bundle` - Purchase bundle
- `POST /exchange` - Exchange XP to XC
- `POST /withdraw` - Request withdrawal

### Payment (`/api/v1/payment`)
- `POST /webhook/stripe` - Stripe webhook

### Notifications (`/api/v1/notifications`)
- `GET /` - Get notifications
- `PUT /:id/read` - Mark as read
- `PUT /read-all` - Mark all as read
- `DELETE /:id` - Delete notification

### Support (`/api/v1/support`)
- `POST /tickets` - Create ticket
- `GET /tickets` - Get tickets
- `GET /tickets/:id` - Get ticket details
- `POST /tickets/:id/reply` - Reply to ticket

### Verification (`/api/v1/verification`)
- `POST /request` - Submit KYC request
- `GET /status` - Get verification status

### Upload (`/api/v1/upload`)
- `POST /image` - Upload image
- `POST /document` - Upload document

### Explore (`/api/v1/explore`)
- `GET /search` - Search predictions and users
- `GET /categories` - Get categories
- `GET /trending` - Get trending predictions

### Leaderboard (`/api/v1/leaderboard`)
- `GET /` - Get leaderboard

### Admin (`/api/v1/admin`) - Admin Only
- `GET /dashboard/stats` - Dashboard statistics
- `GET /users` - List users
- `GET /users/:id` - Get user details
- `PUT /users/:id` - Update user
- `POST /users/:id/ban` - Ban user
- `POST /users/:id/add-funds` - Add funds
- `GET /predictions` - List predictions
- `PUT /predictions/:id` - Update prediction
- `POST /predictions/:id/resolve` - Force resolve
- `DELETE /predictions/:id` - Delete prediction
- `GET /kyc/requests` - List KYC requests
- `PUT /kyc/requests/:id` - Approve/reject KYC
- `GET /support/tickets` - List all tickets
- `POST /support/tickets/:id/reply` - Admin reply
- `GET /reports` - List reports
- `PUT /reports/:id` - Resolve report
- `GET /settings` - Get settings
- `PUT /settings/:key` - Update setting
- `POST /broadcast` - Send broadcast
- `GET /finance/analytics` - Financial analytics
- `GET /audit-logs` - Get audit logs

## Total: 80+ API Endpoints

All endpoints are fully implemented, tested, and ready for production use!


