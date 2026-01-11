import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validation.ts:8',message:'Validation middleware entry',data:{body:req.body,path:req.path,method:req.method},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validation.ts:15',message:'Validation passed',data:{path:req.path},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validation.ts:24',message:'ZodError caught',data:{errors:error.errors.map(e=>({path:e.path,message:e.message,code:e.code})),deadlineValue:req.body?.deadline,deadlineType:typeof req.body?.deadline,fullError:JSON.stringify(error.errors)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        const details: Record<string, string[]> = {};
        
        error.errors.forEach((err) => {
          const path = err.path.join('.');
          if (!details[path]) {
            details[path] = [];
          }
          details[path].push(err.message);
        });
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validation.ts:39',message:'Creating ValidationError',data:{details},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        return next(new ValidationError('Validation failed', { fields: details }));
      }
      next(error);
    }
  };
};


