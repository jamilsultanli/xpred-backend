import { Router } from 'express';
import { z } from 'zod';
import * as predictionsController from '../controllers/predictions.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const createPredictionSchema = z.object({
  body: z.object({
    question: z.string().min(10).max(500),
    description: z.string().max(2000).optional(),
    deadline: z.string().refine(
      (val) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'predictions.routes.ts:14',message:'Deadline refine check',data:{value:val,type:typeof val,hasT:val?.includes('T'),dateRegex:/\d{4}-\d{2}-\d{2}$/.test(val||''),isoRegex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(val||'')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (!val || typeof val !== 'string') return false;
        // Accept both date format (YYYY-MM-DD) and ISO datetime format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
        
        const isDate = dateRegex.test(val);
        const isIso = isoDateTimeRegex.test(val);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'predictions.routes.ts:22',message:'Deadline regex results',data:{isDate,isIso,val},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (isDate || isIso) {
          const date = new Date(isDate ? val + 'T23:59:59' : val);
          const isValid = !isNaN(date.getTime());
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'predictions.routes.ts:28',message:'Date validation result',data:{isValid,dateValue:date.toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          return isValid;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'predictions.routes.ts:35',message:'Deadline validation failed',data:{val},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        return false;
      },
      { message: "Deadline must be a valid date (YYYY-MM-DD) or ISO datetime string" }
    ),
    initial_pot_xp: z.number().min(0).optional(),
    market_image: z.union([
      z.string().url(),
      z.literal(''),
      z.undefined()
    ]).optional(),
    market_video: z.union([
      z.string().url(),
      z.literal(''),
      z.undefined()
    ]).optional(),
    category: z.string().optional(),
  }),
});

const updatePredictionSchema = z.object({
  body: z.object({
    description: z.string().max(2000).optional(),
    market_image: z.string().url().optional().or(z.literal('')),
  }),
});

const resolvePredictionSchema = z.object({
  body: z.object({
    outcome: z.boolean(),
    reason: z.string().optional(),
  }),
});

const proposeResolutionSchema = z.object({
  body: z.object({
    proposed_outcome: z.boolean(),
    evidence: z.string().max(1000).optional(),
  }),
});

// Routes
router.get('/expired', authenticateUser, predictionsController.getExpiredPredictions);
router.get('/pending-resolutions', authenticateUser, predictionsController.getPendingResolutions);
// AI suggestion/improve routes removed (frontend no longer uses them)
// router.get('/ai/suggestions', authenticateUser, predictionsController.getAISuggestions);
// router.post('/ai/improve', authenticateUser, validate(z.object({
//   body: z.object({
//     question: z.string().min(1),
//     description: z.string().optional(),
//   }),
// })), predictionsController.improvePredictionQuestion);
router.post(
  '/',
  authenticateUser,
  validate(createPredictionSchema),
  predictionsController.createPrediction
);
router.get('/', predictionsController.getPredictions);
router.get('/:id', predictionsController.getPrediction);
router.put(
  '/:id',
  authenticateUser,
  validate(updatePredictionSchema),
  predictionsController.updatePrediction
);
router.delete('/:id', authenticateUser, predictionsController.deletePrediction);
router.post(
  '/:id/resolve',
  authenticateUser,
  validate(resolvePredictionSchema),
  predictionsController.resolvePrediction
);
router.post(
  '/:id/propose-resolution',
  authenticateUser,
  validate(proposeResolutionSchema),
  predictionsController.proposeResolution
);

export default router;


