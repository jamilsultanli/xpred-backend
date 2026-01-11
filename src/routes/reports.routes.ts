import { Router } from 'express';
import * as reportsController from '../controllers/reports.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

router.post('/', authenticateUser, reportsController.createReport);

export default router;

