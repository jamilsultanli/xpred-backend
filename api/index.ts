// Vercel serverless function entry point
// Note: Vercel compiles TypeScript automatically
import app from '../src/app';

// Export the Express app for Vercel
// Vercel automatically handles Express apps when exported as default
export default app;

