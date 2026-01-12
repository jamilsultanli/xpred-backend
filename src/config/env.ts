import dotenv from 'dotenv';
import path from 'path';

// Load .env from server directory
// Try explicit path first (server/.env), then fallback to default
const serverEnvPath = path.resolve(process.cwd(), '.env');
const result = dotenv.config({ path: serverEnvPath });

// If that fails, try default location
if (result.error) {
  dotenv.config();
}

// #region agent log
fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'env.ts:14',message:'dotenv config result',data:{envPath:serverEnvPath,loaded:!result.error,error:result.error?.message,hasGoogleKey:!!process.env.GOOGLE_API_KEY,currentDir:process.cwd()},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'I'})}).catch(()=>{});
// #endregion

if (result.error) {
  console.warn('[Config] .env file not found or error loading:', result.error.message);
  console.warn('[Config] Looking for .env at:', serverEnvPath);
  console.warn('[Config] Current working directory:', process.cwd());
  console.warn('[Config] Please create a .env file in the server directory with GOOGLE_API_KEY');
}

interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  API_BASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
  GOOGLE_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  BLUE_TICK_PRICE_ID?: string;
  STORAGE_PROVIDER: 'supabase' | 's3';
  CORS_ORIGIN: string;
  PLATFORM_FEE_RATE: number;
  MIN_BET_AMOUNT_XP: number;
  MAX_BET_AMOUNT_XP: number;
  MIN_BET_AMOUNT_XC: number;
  MAX_BET_AMOUNT_XC: number;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    // In Vercel, log the error but don't crash immediately
    const errorMsg = `Missing required environment variable: ${key}`;
    console.error(`[Config Error] ${errorMsg}`);
    // Only throw in non-production or if it's a critical variable
    if (process.env.NODE_ENV !== 'production' || ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'].includes(key)) {
      throw new Error(errorMsg);
    }
    return ''; // Return empty string for non-critical vars in production
  }
  return value;
}

export const config: EnvConfig = {
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  PORT: parseInt(getEnvVar('PORT', '3001'), 10),
  API_BASE_URL: getEnvVar('API_BASE_URL', 'http://localhost:3001'),
  SUPABASE_URL: getEnvVar('SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnvVar('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
  JWT_SECRET: getEnvVar('JWT_SECRET'),
  JWT_EXPIRES_IN: getEnvVar('JWT_EXPIRES_IN', '24h'),
  REFRESH_TOKEN_EXPIRES_IN: getEnvVar('REFRESH_TOKEN_EXPIRES_IN', '7d'),
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STORAGE_PROVIDER: (getEnvVar('STORAGE_PROVIDER', 'supabase') as 'supabase' | 's3'),
  CORS_ORIGIN: getEnvVar('CORS_ORIGIN', 'http://localhost:3000'),
  PLATFORM_FEE_RATE: parseFloat(process.env.PLATFORM_FEE_RATE || '0.05'),
  MIN_BET_AMOUNT_XP: parseFloat(process.env.MIN_BET_AMOUNT_XP || '1'),
  MAX_BET_AMOUNT_XP: parseFloat(process.env.MAX_BET_AMOUNT_XP || '100000'),
  MIN_BET_AMOUNT_XC: parseFloat(process.env.MIN_BET_AMOUNT_XC || '1'),
  MAX_BET_AMOUNT_XC: parseFloat(process.env.MAX_BET_AMOUNT_XC || '100000'),
};

// Log AI configuration status (only in development)
if (config.NODE_ENV === 'development') {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'env.ts:47',message:'Environment config loaded',data:{hasGoogleApiKey:!!config.GOOGLE_API_KEY,googleApiKeyLength:config.GOOGLE_API_KEY?.length||0,googleApiKeyPrefix:config.GOOGLE_API_KEY?.substring(0,10)||'none',rawEnvValue:process.env.GOOGLE_API_KEY?process.env.GOOGLE_API_KEY.substring(0,10)+'...':'not set'},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'H'})}).catch(()=>{});
  // #endregion
  console.log('[AI Config] GOOGLE_API_KEY:', config.GOOGLE_API_KEY ? `${config.GOOGLE_API_KEY.substring(0, 10)}...` : 'NOT SET');
}

export default config;


