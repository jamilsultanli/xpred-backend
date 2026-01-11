import { Router } from 'express';
import { z } from 'zod';
import * as adminController from '../controllers/admin.controller';
import { authenticateUser, requireAdmin, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// All admin routes require admin authentication
router.use(authenticateUser, requireAdmin);

// Validation schemas
const updateUserSchema = z.object({
  body: z.object({
    role: z.enum(['user', 'admin', 'moderator']).optional(),
    is_banned: z.boolean().optional(),
    balance_xp: z.number().optional(),
    balance_xc: z.number().optional(),
    is_verified: z.boolean().optional(),
  }),
});

const banUserSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
    duration_days: z.number().positive().optional().nullable(),
  }),
});

const addFundsSchema = z.object({
  body: z.object({
    amount: z.number().positive(),
    currency: z.enum(['XP', 'XC']),
    reason: z.string().optional(),
  }),
});

const updatePredictionSchema = z.object({
  body: z.object({
    is_featured: z.boolean().optional(),
    category: z.string().optional(),
  }),
});

const resolvePredictionSchema = z.object({
  body: z.object({
    outcome: z.boolean(),
    reason: z.string().optional(),
  }),
});

const updateKYCStatusSchema = z.object({
  body: z.object({
    decision: z.enum(['approved', 'rejected']),
    admin_notes: z.string().optional(),
  }),
});

const replyTicketSchema = z.object({
  body: z.object({
    admin_reply: z.string().min(1),
    status: z.enum(['resolved', 'in_progress']).optional(),
  }),
});

const resolveReportSchema = z.object({
  body: z.object({
    action: z.enum(['dismiss', 'ban_user', 'delete_content', 'warn_user']),
    notes: z.string().optional(),
  }),
});

const updateSettingSchema = z.object({
  body: z.object({
    value: z.string(),
  }),
});

const broadcastSchema = z.object({
  body: z.object({
    message: z.string().min(1).max(1000),
    type: z.enum(['info', 'warning', 'announcement']).optional(),
    set_banner: z.boolean().optional(),
  }),
});

const promoteSchema = z.object({
  body: z.object({
    role_name: z.enum(['super_admin', 'admin', 'moderator', 'content_reviewer']),
    reason: z.string().optional(),
  }),
});

const demoteSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
  }),
});

const addNoteSchema = z.object({
  body: z.object({
    note: z.string().min(1).max(5000),
    type: z.enum(['note', 'warning', 'ban_reason', 'internal']).optional(),
    is_visible_to_user: z.boolean().optional(),
  }),
});

const reviewResolutionSchema = z.object({
  body: z.object({
    decision: z.enum(['approved', 'rejected']),
    admin_notes: z.string().optional(),
    rejection_reason: z.string().optional(),
  }),
});

// =====================================================
// PERMISSIONS & ADMIN MANAGEMENT
// =====================================================

// Get current admin's permissions
router.get('/me/permissions', adminController.getMyPermissions);

// Admin management (super admin only)
router.get('/admins', requirePermission('admins', 'read'), adminController.getAdmins);
router.post('/admins/:userId/promote', requirePermission('admins', 'create'), validate(promoteSchema), adminController.promoteToAdmin);
router.post('/admins/:userId/demote', requirePermission('admins', 'delete'), validate(demoteSchema), adminController.demoteAdmin);

// =====================================================
// DASHBOARD
// =====================================================

router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/dashboard/charts', adminController.getDashboardCharts);
router.get('/dashboard/top-users', adminController.getTopUsers);
router.get('/dashboard/activity', adminController.getRecentActivity);

// =====================================================
// USER MANAGEMENT
// =====================================================

router.get('/users', requirePermission('users', 'read'), adminController.getUsers);
router.get('/users/:id', requirePermission('users', 'read'), adminController.getUserDetails);
router.put('/users/:id', requirePermission('users', 'update'), validate(updateUserSchema), adminController.updateUser);
router.post('/users/:id/ban', requirePermission('users', 'update'), validate(banUserSchema), adminController.banUser);
router.post('/users/:id/add-funds', requirePermission('users', 'update'), validate(addFundsSchema), adminController.addFunds);

// User notes
router.get('/users/:id/notes', requirePermission('users', 'read'), adminController.getUserNotes);
router.post('/users/:id/notes', requirePermission('users', 'update'), validate(addNoteSchema), adminController.addUserNote);

// =====================================================
// PREDICTION MANAGEMENT
// =====================================================

router.get('/predictions', requirePermission('predictions', 'read'), adminController.getPredictions);
router.put('/predictions/:id', requirePermission('predictions', 'update'), validate(updatePredictionSchema), adminController.updatePrediction);
router.post('/predictions/:id/resolve', requirePermission('predictions', 'approve'), validate(resolvePredictionSchema), adminController.forceResolvePrediction);
router.delete('/predictions/:id', requirePermission('predictions', 'delete'), adminController.deletePrediction);

// =====================================================
// RESOLUTION QUEUE
// =====================================================

router.get('/resolutions/queue', requirePermission('predictions', 'approve'), adminController.getResolutionQueue);
router.put('/resolutions/:id/review', requirePermission('predictions', 'approve'), validate(reviewResolutionSchema), adminController.reviewResolution);

// =====================================================
// KYC MANAGEMENT
// =====================================================

router.get('/kyc/requests', requirePermission('kyc', 'read'), adminController.getKYCRequests);
router.put('/kyc/requests/:id', requirePermission('kyc', 'approve'), validate(updateKYCStatusSchema), adminController.updateKYCStatus);

// =====================================================
// SUPPORT MANAGEMENT
// =====================================================

router.get('/support/tickets', requirePermission('support', 'read'), adminController.getAllTickets);
router.post('/support/tickets/:id/reply', requirePermission('support', 'update'), validate(replyTicketSchema), adminController.replyToTicket);

// =====================================================
// REPORTS & MODERATION
// =====================================================

router.get('/reports', requirePermission('reports', 'read'), adminController.getReports);
router.put('/reports/:id', requirePermission('reports', 'approve'), validate(resolveReportSchema), adminController.resolveReport);

// =====================================================
// SYSTEM SETTINGS (Super Admin / Admin only)
// =====================================================

router.get('/settings', requirePermission('settings', 'read'), adminController.getSettings);
router.put('/settings/:key', requirePermission('settings', 'update'), validate(updateSettingSchema), adminController.updateSetting);

// =====================================================
// BROADCAST
// =====================================================

router.post('/broadcast', requirePermission('broadcast', 'create'), validate(broadcastSchema), adminController.sendBroadcast);

// =====================================================
// FINANCE ANALYTICS
// =====================================================

router.get('/finance/analytics', requirePermission('finance', 'read'), adminController.getFinanceAnalytics);

// =====================================================
// AUDIT LOGS
// =====================================================

router.get('/audit-logs', requirePermission('audit_logs', 'read'), adminController.getAuditLogs);

export default router;


