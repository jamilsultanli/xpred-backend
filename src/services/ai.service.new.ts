import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env';
import { ValidationError } from '../utils/errors';

const VALID_CATEGORIES = [
  'Politics',
  'Sports',
  'E-Gaming',
  'Crypto',
  'Finance',
  'Geopolitics',
  'Tech',
  'Startups',
  'Culture',
  'World',
  'Music',
  'Economy',
];

interface AIAnalysis {
  safe: boolean;
  category: string;
  reason: string;
  isReal?: boolean;
  grammarFixed?: string;
  descriptionFixed?: string;
  warnings?: string[];
  violations?: string[];
}

export class AIService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    console.log('🤖 Initializing AI Service...');
    console.log('📋 GOOGLE_API_KEY status:', config.GOOGLE_API_KEY ? `SET (${config.GOOGLE_API_KEY.substring(0, 10)}...)` : 'NOT SET');
    
    if (config.GOOGLE_API_KEY) {
      try {
        this.genAI = new GoogleGenerativeAI(config.GOOGLE_API_KEY);
        console.log('✅ Gemini AI initialized successfully');
      } catch (error: any) {
        console.error('❌ Failed to initialize Gemini AI:', error.message);
      }
    } else {
      console.warn('⚠️  GOOGLE_API_KEY not found in environment variables');
      console.warn('⚠️  Grammar fixing and AI categorization will be disabled');
    }
  }

  private categorizeByKeywords(question: string, description?: string): string {
    const text = `${question} ${description || ''}`.toLowerCase();
    
    const cryptoKeywords = ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency', 'blockchain', 'defi', 'nft'];
    if (cryptoKeywords.some(keyword => text.includes(keyword))) return 'Crypto';
    
    const financeKeywords = ['stock', 'market', 'dow', 'nasdaq', 's&p', 'trading', 'invest'];
    if (financeKeywords.some(keyword => text.includes(keyword))) return 'Finance';
    
    const techKeywords = ['apple', 'google', 'microsoft', 'amazon', 'ai', 'tech', 'software'];
    if (techKeywords.some(keyword => text.includes(keyword))) return 'Tech';
    
    const sportsKeywords = ['nfl', 'nba', 'mlb', 'soccer', 'football', 'basketball', 'championship'];
    if (sportsKeywords.some(keyword => text.includes(keyword))) return 'Sports';
    
    const politicsKeywords = ['president', 'election', 'senate', 'congress', 'democrat', 'republican', 'vote'];
    if (politicsKeywords.some(keyword => text.includes(keyword))) return 'Politics';
    
    return 'World';
  }

  async moderateContent(
    question: string,
    description?: string,
    mediaUrl?: string
  ): Promise<AIAnalysis> {
    console.log('\n🔍 === AI MODERATION START ===');
    console.log('📝 Question:', question.substring(0, 80));
    console.log('📝 Description:', description?.substring(0, 80) || 'none');

    const fullText = `${question} ${description || ''}`.trim();
    const warnings: string[] = [];
    const violations: string[] = [];

    // Pattern matching for violations
    const violationPatterns = [
      { pattern: /(false|fake|scam|fraud)/i, violation: 'Misleading content', severity: 'high' },
      { pattern: /(harass|abuse|hate)/i, violation: 'Harmful content', severity: 'high' },
      { pattern: /(illegal|unlawful)/i, violation: 'Illegal content', severity: 'high' },
    ];

    violationPatterns.forEach(({ pattern, violation, severity }) => {
      if (pattern.test(fullText)) {
        if (severity === 'high') violations.push(violation);
        else warnings.push(violation);
      }
    });

    if (!this.genAI) {
      console.warn('⚠️  AI not configured - using fallback');
      return {
        safe: violations.length === 0,
        category: this.categorizeByKeywords(question, description),
        reason: 'AI not configured',
        isReal: true,
        grammarFixed: question,
        descriptionFixed: description || '',
        warnings: warnings.length > 0 ? warnings : undefined,
        violations: violations.length > 0 ? violations : undefined,
      };
    }

    try {
      console.log('🚀 Calling Gemini 2.0 Flash...');
      
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 1024,
        },
      });

      const prompt = `You are a professional editor for a prediction platform.

INPUTS:
Question: "${question}"
Description: "${description || 'none'}"

TASKS:
1. Fix ALL grammar/spelling errors in both question and description
2. Select BEST category from: ${VALID_CATEGORIES.join(', ')}

RULES:
- ALWAYS return corrected text
- Keep original meaning
- Make professional

Return ONLY valid JSON (no markdown):
{
  "correctedQuestion": "fixed question",
  "correctedDescription": "fixed description or empty",
  "category": "one from list"
}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      console.log('✅ Gemini Response:', {
        questionFixed: parsed.correctedQuestion?.substring(0, 60),
        descriptionFixed: parsed.correctedDescription?.substring(0, 60),
        category: parsed.category
      });

      const finalCategory = VALID_CATEGORIES.includes(parsed.category) 
        ? parsed.category 
        : this.categorizeByKeywords(question, description);

      console.log('🏷️  Final Category:', finalCategory);
      console.log('📊 Question Changed:', parsed.correctedQuestion !== question);
      console.log('📊 Description Changed:', parsed.correctedDescription !== (description || ''));
      console.log('🔍 === AI MODERATION COMPLETE ===\n');

      return {
        safe: violations.length === 0,
        category: finalCategory,
        reason: violations.length > 0 ? `Flagged: ${violations.join(', ')}` : 'Content approved',
        isReal: true,
        grammarFixed: parsed.correctedQuestion || question,
        descriptionFixed: parsed.correctedDescription || description || '',
        warnings: warnings.length > 0 ? warnings : undefined,
        violations: violations.length > 0 ? violations : undefined,
      };
    } catch (error: any) {
      console.error('❌ Gemini Error:', error.message);
      return {
        safe: violations.length === 0,
        category: this.categorizeByKeywords(question, description),
        reason: `AI error: ${error.message}`,
        isReal: true,
        grammarFixed: question,
        descriptionFixed: description || '',
        warnings: warnings.length > 0 ? warnings : undefined,
        violations: violations.length > 0 ? violations : undefined,
      };
    }
  }

  getValidCategories(): string[] {
    return VALID_CATEGORIES;
  }
}

export const aiService = new AIService();

