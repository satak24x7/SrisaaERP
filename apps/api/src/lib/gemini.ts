import fs from 'fs';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

// Try gemini-2.0-flash first; also configurable via app_config 'gemini_model'
const DEFAULT_MODEL = 'gemini-2.0-flash';

const ANALYSIS_PROMPT = `You are an expert in Indian government tenders and procurement. Analyze the attached RFP/Tender document(s) and extract a structured summary for bid decision-making.

Return a JSON object with exactly these fields (use null if information is not found):

{
  "summary": "A 3-5 sentence executive summary of what this tender is about",
  "scope": "Detailed scope of work description (2-4 sentences)",
  "projectLocation": "Location/state where the work will be executed",
  "estimatedValueCr": "Estimated project value in Crores (number or null)",

  "keyDates": {
    "publishDate": "YYYY-MM-DD or null",
    "preBidMeetingDate": "YYYY-MM-DD HH:mm or null",
    "clarificationDeadline": "YYYY-MM-DD HH:mm or null",
    "submissionDeadlineOnline": "YYYY-MM-DD HH:mm or null",
    "submissionDeadlinePhysical": "YYYY-MM-DD HH:mm or null",
    "technicalOpeningDate": "YYYY-MM-DD HH:mm or null",
    "financialOpeningDate": "YYYY-MM-DD HH:mm or null"
  },

  "financial": {
    "emdAmount": "EMD amount as text (e.g. '5 Lakhs' or '1% of estimated cost')",
    "emdMode": "BG/DD/FDR/Online/Exempted or null",
    "tenderFee": "Tender fee amount as text or null",
    "documentCost": "Document cost as text or null",
    "bidValidity": "Bid validity period as text (e.g. '180 days')",
    "performanceGuarantee": "PBG details as text or null"
  },

  "eligibility": {
    "turnoverRequirement": "Minimum annual turnover requirement as text",
    "experienceRequirement": "Minimum experience requirement as text",
    "similarWorkRequirement": "Similar work experience requirement as text",
    "technicalCapability": "Key technical requirements",
    "certifications": "Required certifications (ISO, CMMI, etc.)",
    "consortiumAllowed": "Yes/No/null — whether consortium/JV bids are allowed",
    "mseExemption": "MSE exemption details or null"
  },

  "evaluation": {
    "method": "QCBS/L1/L1-Technical/etc.",
    "technicalWeightPct": "Technical evaluation weight % or null",
    "financialWeightPct": "Financial evaluation weight % or null",
    "minimumTechnicalScore": "Minimum qualifying technical score or null",
    "evaluationCriteria": ["List of key evaluation parameters"]
  },

  "specialConditions": ["List of important special conditions, penalties, LDs, SLAs"],

  "risks": ["List of key risks or red flags identified in the document"],

  "recommendation": "GO / NO-GO / NEED_MORE_INFO — your recommendation with brief reasoning",

  "keyPersonnel": ["List of key personnel/team composition required"],

  "deliverables": ["List of major deliverables"],

  "completionPeriod": "Project completion timeline as text"
}

IMPORTANT:
- Extract dates in Indian format and convert to ISO format
- Amounts should include the unit (Lakhs/Crores)
- Be precise — don't guess. Use null if information is genuinely not found
- Focus on information critical for a Go/No-Go decision
- Return ONLY valid JSON, no markdown or explanation`;

export interface RfpAnalysis {
  summary: string;
  scope: string;
  projectLocation: string | null;
  estimatedValueCr: number | null;
  keyDates: Record<string, string | null>;
  financial: Record<string, string | null>;
  eligibility: Record<string, string | null>;
  evaluation: {
    method: string | null;
    technicalWeightPct: number | null;
    financialWeightPct: number | null;
    minimumTechnicalScore: number | null;
    evaluationCriteria: string[];
  };
  specialConditions: string[];
  risks: string[];
  recommendation: string;
  keyPersonnel: string[];
  deliverables: string[];
  completionPeriod: string | null;
}

/**
 * Analyze RFP document(s) using Gemini 2.0 Flash.
 * Accepts an array of file paths (PDFs, images, docs).
 */
export async function analyzeRfp(filePaths: Array<{ path: string; mimeType: string }>): Promise<RfpAnalysis> {
  // Read API key and model from app_config table (set via System → Configuration)
  const [keyRow, modelRow] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: 'gemini_api_key' } }),
    prisma.appConfig.findUnique({ where: { key: 'gemini_model' } }),
  ]);
  const apiKey = keyRow?.value;
  if (!apiKey) throw new Error('Gemini API Key is not configured. Go to System → Configuration to set it.');
  const model = modelRow?.value || DEFAULT_MODEL;
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Build the parts array: files as inline_data + the prompt
  const parts: unknown[] = [];

  for (const file of filePaths) {
    const data = fs.readFileSync(file.path);
    const base64 = data.toString('base64');
    parts.push({
      inline_data: {
        mime_type: file.mimeType,
        data: base64,
      },
    });
  }

  parts.push({ text: ANALYSIS_PROMPT });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };

  logger.info({ fileCount: filePaths.length }, 'Sending RFP to Gemini for analysis');

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error({ status: res.status, err: errText }, 'Gemini API error');
    if (res.status === 429) {
      throw new Error('Gemini API rate limit exceeded. Please wait a minute and try again, or switch to a different model in Configuration (e.g. gemini-2.0-flash-lite).');
    }
    if (res.status === 400) {
      throw new Error('Gemini could not process the document. The file may be too large or in an unsupported format.');
    }
    if (res.status === 403) {
      throw new Error('Gemini API key is invalid or does not have access. Check your key in System → Configuration.');
    }
    throw new Error(`Gemini API error (${res.status}). Check API key and quota.`);
  }

  const result = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');

  // Parse the JSON response
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const analysis = JSON.parse(cleaned) as RfpAnalysis;

  logger.info({ recommendation: analysis.recommendation }, 'RFP analysis complete');
  return analysis;
}
