import fs from 'fs';
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { downloadFileWithFallback } from './dms-storage.js';
import path from 'path';

// Default model; configurable via app_config 'gemini_model'
const DEFAULT_MODEL = 'gemini-2.5-flash';

// Legacy local dir for tender docs (fallback for files not yet migrated to GDrive)
const TENDER_LEGACY_DIR = path.resolve(process.cwd(), '../../uploads/tender-docs');

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

  "preQualification": [
    {
      "id": "pq_1",
      "criterion": "The exact pre-qualification criterion text from the RFP",
      "category": "FINANCIAL or EXPERIENCE or TECHNICAL or LEGAL or CERTIFICATION or OTHER",
      "requirement": "Specific requirement (e.g. 'Rs. 5 Crore average turnover in last 3 FYs')",
      "referenceClause": "Section/clause reference in the RFP (e.g. 'Section 3.2.1')",
      "isMandatory": true
    }
  ],

  "technicalEvaluation": {
    "totalMarks": 100,
    "minimumQualifyingScore": 70,
    "minimumQualifyingPct": 70,
    "sections": [
      {
        "id": "ts_1",
        "sectionName": "Name of the evaluation section",
        "maxMarks": 30,
        "referenceClause": "Section/clause reference",
        "subCriteria": [
          {
            "id": "ts_1_1",
            "description": "Specific evaluation criterion",
            "maxMarks": 15,
            "scoringMethod": "How marks are awarded (e.g. '5 marks per project, max 3')"
          }
        ]
      }
    ]
  },

  "boqItems": [
    {
      "id": "boq_1",
      "description": "Top-level BoQ item description (e.g. 'Supply & Installation of Network Equipment')",
      "unit": "Unit of measurement (LS/Nos/Km/Sqm/Set/Rm/Sqm/etc.) or null",
      "quantity": "Quantity as number or null",
      "unitRate": "Unit rate in Rupees (number) or null",
      "total": "Total amount = quantity x unitRate in Rupees (number) or null",
      "estimatedAmountText": "Estimated amount as text from RFP (e.g. '2.5 Crore') or null — use this if unit rate not available"
    }
  ],

  "paymentTerms": {
    "summary": "Overall payment terms summary (e.g. 'Milestone-based payment with 10% advance, 10% retention')",
    "advancePct": "Advance payment percentage (number or null)",
    "retentionPct": "Retention/security deposit percentage (number or null)",
    "retentionRelease": "When retention is released (e.g. 'After DLP of 12 months')",
    "defectLiabilityPeriodMonths": "DLP duration in months or null",
    "paymentCycleDays": "Payment processing time after invoice submission (number of days or null, e.g. 30, 45, 60, 90)",
    "schedule": [
      {
        "id": "pt_1",
        "milestone": "Payment milestone description (e.g. 'On Mobilization', 'On Completion of Phase 1')",
        "percentageOfContract": "Percentage of contract value (number 0-100)",
        "conditions": "Conditions for payment release (e.g. 'Submission of mobilization plan and PBG')",
        "estimatedMonth": "Estimated month from project start when payment is expected (number or null)"
      }
    ]
  },

  "milestones": [
    {
      "id": "ms_1",
      "name": "Milestone name/description",
      "durationMonths": "Duration from project start to this milestone (number or null)",
      "deadlineText": "Deadline as described in RFP (e.g. 'Within 6 months from date of award')",
      "percentageOfWork": "Percentage of total work scope (number 0-100 or null)",
      "paymentLinked": true,
      "paymentPct": "Payment percentage linked to this milestone (number or null)",
      "deliverables": ["Key deliverables for this milestone"],
      "dependencies": "Any dependencies mentioned (e.g. 'After Site Survey completion')"
    }
  ],

  "specialConditions": ["List of important special conditions, penalties, LDs, SLAs"],

  "risks": ["List of key risks or red flags identified in the document"],

  "recommendation": "GO / NO-GO / NEED_MORE_INFO — your recommendation with brief reasoning",

  "keyPersonnel": ["List of key personnel/team composition required"],

  "deliverables": ["List of major deliverables"],

  "completionPeriod": "Project completion timeline as text",

  "riskFlags": [
    {
      "ruleTitle": "Exact title of the risk rule that was triggered (from the RISK ASSESSMENT RULES below)",
      "category": "Category of the rule (PAYMENT, LEGAL, FINANCIAL, SCOPE, TIMELINE, ELIGIBILITY)",
      "severity": "HIGH or MEDIUM or LOW (from the rule definition)",
      "finding": "What exactly was found in the document that triggered this rule",
      "clause": "Section/clause reference in the RFP where this was found, or null if not traceable to a specific clause",
      "impact": "Brief description of the business impact or risk to the bidder"
    }
  ]
}

IMPORTANT:
- Extract dates in Indian format and convert to ISO format
- Amounts should include the unit (Lakhs/Crores)
- Be precise — don't guess. Use null if information is genuinely not found
- Focus on information critical for a Go/No-Go decision
- For preQualification: extract EVERY pre-qualification/eligibility criterion mentioned in the RFP. Number them sequentially (pq_1, pq_2, ...). Include ALL mandatory and optional criteria.
- For technicalEvaluation: extract the COMPLETE technical evaluation marking scheme with all sections and sub-criteria. Use the exact marks mentioned in the RFP. Number sections (ts_1, ts_2, ...) and sub-criteria (ts_1_1, ts_1_2, ...).
- If the RFP does not have a structured technical evaluation marking scheme, set technicalEvaluation to null.
- If the RFP does not have pre-qualification criteria, set preQualification to an empty array [].
- For boqItems: extract top-level BoQ items representing major cost heads. Number them (boq_1, boq_2, ...). If no BoQ is found, set to empty array [].
  IMPORTANT BoQ rules:
  - Break down recurring/annual charges into SEPARATE year-wise line items. E.g. if O&M is 20% at 5% per year for 4 years, create 4 items: "O&M Year 1 (5%)", "O&M Year 2 (5%)", "O&M Year 3 (5%)", "O&M Year 4 (5%)".
  - Similarly, AMC charges spread over years must be separate line items per year.
  - Be PRECISE with arithmetic. If O&M is 20% of total bid, then Capex/Project Cost = 80% (not 75%). Always verify: all percentages must add up to 100%.
  - For lump-sum (LS) items where unit rate = total amount, set quantity=1 and unitRate=the total amount.
  - If the RFP gives a percentage breakdown but not absolute amounts, still extract items with quantity=1, unitRate=null, and note the percentage in the description.
- For paymentTerms: extract the complete payment schedule including advance, milestone payments, retention, DLP, and payment cycle (how many days after invoice submission does payment come). If not found, set to null.
  IMPORTANT Payment Terms rules:
  - The summary must be arithmetically accurate. If O&M is 20% and project cost is paid in milestones, then milestone payments = 80%, not 75%. Always cross-check totals.
  - Include each O&M/AMC yearly payment as a SEPARATE schedule item (e.g. "O&M Year 1 - 5%", "O&M Year 2 - 5%", etc.)
  - Clearly distinguish between Capex milestones (project delivery) and Opex recurring (O&M/AMC) in the schedule.
  - If no advance is allowed, set advancePct to 0 (not null).
- For milestones: extract project milestones with their timelines. Number them (ms_1, ms_2, ...). If not found, set to empty array [].
  IMPORTANT Milestone rules:
  - durationMonths is the DURATION of that milestone's work, NOT the cumulative time from project start. E.g. if Milestone 1 is T+4 weeks and Milestone 2 is T+12 weeks, then Milestone 1 duration = 4 weeks (1 month) and Milestone 2 duration = 8 weeks (2 months), because it starts after Milestone 1 ends.
  - Use deadlineText for the original RFP text (e.g. "T+12 weeks from LOI").
  - Convert weeks to months approximately (4 weeks ≈ 1 month) for durationMonths.
  - O&M year milestones should also be listed separately (O&M Year 1, O&M Year 2, etc.) with duration = 12 months each.
- For riskFlags: Apply each RISK ASSESSMENT RULE listed below against the document. For each rule that is triggered (i.e. the condition described in the rule IS found in the document), add an entry to riskFlags with the exact ruleTitle, category, severity from the rule, plus your finding, clause reference, and impact assessment. If a rule is NOT triggered, do NOT include it. If no rules are triggered, set riskFlags to an empty array [].
- Return ONLY valid JSON, no markdown or explanation`;

export interface PQCriterion {
  id: string;
  criterion: string;
  category: 'FINANCIAL' | 'EXPERIENCE' | 'TECHNICAL' | 'LEGAL' | 'CERTIFICATION' | 'OTHER';
  requirement: string;
  referenceClause: string | null;
  isMandatory: boolean;
}

export interface TechSubCriterion {
  id: string;
  description: string;
  maxMarks: number;
  scoringMethod: string | null;
}

export interface TechSection {
  id: string;
  sectionName: string;
  maxMarks: number;
  referenceClause: string | null;
  subCriteria: TechSubCriterion[];
}

export interface TechnicalEvaluation {
  totalMarks: number;
  minimumQualifyingScore: number | null;
  minimumQualifyingPct: number | null;
  sections: TechSection[];
}

export interface BoqItem {
  id: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  unitRate: number | null;
  total: number | null;
  estimatedAmountText: string | null;
}

export interface PaymentScheduleItem {
  id: string;
  milestone: string;
  percentageOfContract: number | null;
  conditions: string | null;
  estimatedMonth: number | null;
}

export interface PaymentTerms {
  summary: string;
  advancePct: number | null;
  retentionPct: number | null;
  retentionRelease: string | null;
  defectLiabilityPeriodMonths: number | null;
  paymentCycleDays: number | null;
  schedule: PaymentScheduleItem[];
}

export interface ProjectMilestone {
  id: string;
  name: string;
  durationMonths: number | null;
  deadlineText: string | null;
  percentageOfWork: number | null;
  paymentLinked: boolean;
  paymentPct: number | null;
  deliverables: string[];
  dependencies: string | null;
}

export interface RiskFlag {
  ruleTitle: string;
  category: string;
  severity: string;
  finding: string;
  clause: string | null;
  impact: string;
}

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
  preQualification: PQCriterion[];
  technicalEvaluation: TechnicalEvaluation | null;
  boqItems: BoqItem[];
  paymentTerms: PaymentTerms | null;
  milestones: ProjectMilestone[];
  specialConditions: string[];
  risks: string[];
  recommendation: string;
  keyPersonnel: string[];
  deliverables: string[];
  completionPeriod: string | null;
  riskFlags: RiskFlag[];
}

// ===== Helpers =====

const MAX_RETRIES = 2;

async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);

    if (res.ok) return res;

    // Only retry on 503 (overloaded) — not 429, which is usually a quota issue that won't resolve with a short wait
    if (res.status === 503 && attempt < MAX_RETRIES) {
      const delay = 15_000 * (attempt + 1); // 15s, 30s
      logger.warn({ status: res.status, attempt: attempt + 1, retryInSec: Math.round(delay / 1000) }, `${label}: waiting ${Math.round(delay / 1000)}s before retry`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    return res; // non-retryable or exhausted retries
  }

  return fetch(url, init);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

/**
 * Upload a file to Gemini File API for use in generation requests.
 * Required for files > 4MB (inline base64 causes 503s on large payloads).
 */
async function uploadToGeminiFileApi(apiKey: string, data: Buffer, mimeType: string): Promise<string> {
  // Step 1: Start resumable upload
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(data.length),
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: data,
    },
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    logger.error({ status: startRes.status, err: errText }, 'Gemini File API upload failed');
    throw new Error(`Failed to upload file to Gemini (${startRes.status}). ${errText}`);
  }

  const result = await startRes.json() as { file?: { uri?: string; name?: string; state?: string } };
  const fileUri = result.file?.uri;
  const fileName = result.file?.name;
  if (!fileUri) throw new Error('Gemini File API did not return a file URI');

  // Step 2: Wait for file to be ACTIVE (processing can take a few seconds)
  for (let i = 0; i < 10; i++) {
    const statusRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
    );
    if (statusRes.ok) {
      const statusData = await statusRes.json() as { state?: string };
      if (statusData.state === 'ACTIVE') {
        logger.info({ fileUri, fileName }, 'File uploaded and ready');
        return fileUri;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // If still not active after 20s, try using it anyway
  logger.warn({ fileUri }, 'File not yet ACTIVE after 20s, proceeding anyway');
  return fileUri;
}

/**
 * Analyze RFP document(s) using Gemini.
 * Accepts storage paths (gdrive:xxx or local filenames).
 */
export async function analyzeRfp(files: Array<{ storagePath: string; mimeType: string }>): Promise<RfpAnalysis> {
  // Read API key and model from app_config table (set via System → Configuration)
  const [keyRow, modelRow] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: 'gemini_api_key' } }),
    prisma.appConfig.findUnique({ where: { key: 'gemini_model' } }),
  ]);
  const apiKey = keyRow?.value;
  if (!apiKey) throw new Error('Gemini API Key is not configured. Go to System → Configuration to set it.');
  const model = modelRow?.value || DEFAULT_MODEL;
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Build the parts array: files + the prompt
  // For files > 4MB, use Gemini File API (upload first, reference by URI)
  // For smaller files, use inline_data (base64)
  const INLINE_LIMIT = 4 * 1024 * 1024; // 4MB
  const parts: unknown[] = [];
  const uploadedFileUris: string[] = []; // track for cleanup

  for (const file of files) {
    let data: Buffer;
    if (file.storagePath.startsWith('gdrive:') || !fs.existsSync(path.join(TENDER_LEGACY_DIR, file.storagePath))) {
      const { stream } = await downloadFileWithFallback(file.storagePath, TENDER_LEGACY_DIR);
      data = await streamToBuffer(stream);
    } else {
      data = fs.readFileSync(path.join(TENDER_LEGACY_DIR, file.storagePath));
    }

    if (data.length > INLINE_LIMIT) {
      // Upload via Gemini File API for large files
      logger.info({ size: data.length, mimeType: file.mimeType }, 'Uploading large file via Gemini File API');
      const fileUri = await uploadToGeminiFileApi(apiKey, data, file.mimeType);
      uploadedFileUris.push(fileUri);
      parts.push({
        file_data: {
          mime_type: file.mimeType,
          file_uri: fileUri,
        },
      });
    } else {
      // Inline small files as base64
      const base64 = data.toString('base64');
      parts.push({
        inline_data: {
          mime_type: file.mimeType,
          data: base64,
        },
      });
    }
  }

  // Fetch enabled AI analysis rules from DB and append to prompt
  const aiRules = await prisma.aiAnalysisRule.findMany({
    where: { enabled: true, deletedAt: null },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
  });

  let fullPrompt = ANALYSIS_PROMPT;
  if (aiRules.length > 0) {
    const rulesBlock = aiRules.map((r) =>
      `- [${r.severity}] [${r.category}] "${r.title}": ${r.ruleText}`
    ).join('\n');
    fullPrompt += `\n\n--- RISK ASSESSMENT RULES ---\nApply each of the following rules against the RFP document. For every rule whose condition IS found in the document, add an entry to the riskFlags array with the exact ruleTitle, category, and severity from the rule below.\n\n${rulesBlock}`;
    logger.info({ ruleCount: aiRules.length }, 'Injected AI analysis rules into prompt');
  }

  parts.push({ text: fullPrompt });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    },
  };

  // Try configured model first, then fallback models on 429/503
  const FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  const modelsToTry = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];

  let res: Response | null = null;
  let lastModel = model;
  let lastError = '';

  for (const tryModel of modelsToTry) {
    const tryUrl = `https://generativelanguage.googleapis.com/v1beta/models/${tryModel}:generateContent`;
    logger.info({ fileCount: files.length, model: tryModel }, 'Sending RFP to Gemini for analysis');

    res = await fetchWithRetry(`${tryUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, `RFP analysis (${tryModel})`);

    lastModel = tryModel;

    if (res.ok) {
      if (tryModel !== model) {
        logger.info({ fallbackModel: tryModel, originalModel: model }, 'Succeeded with fallback model');
      }
      break;
    }

    // Check if retryable — try next model on 429/503
    if (res.status === 429 || res.status === 503) {
      const errText = await res.text();
      lastError = errText;
      logger.warn({ status: res.status, model: tryModel }, `Model ${tryModel} unavailable, trying next fallback`);
      continue;
    }

    // Non-retryable error — stop here
    break;
  }

  if (!res || !res.ok) {
    const errText = lastError || (res ? await res.text() : 'No response');
    const status = res?.status ?? 0;
    logger.error({ status, model: lastModel, err: errText }, 'Gemini API error (all models failed)');

    let detail = '';
    try { detail = JSON.parse(errText)?.error?.message || ''; } catch { /* not JSON */ }

    if (status === 429) {
      const isFreeTier = detail.includes('free_tier') || detail.includes('FreeTier');
      if (isFreeTier) {
        throw new Error(`Gemini free-tier quota exhausted. Your API key may still be on the free tier. Create a new API key in your billing-enabled Google Cloud project.`);
      }
      throw new Error('Gemini API rate limit exceeded on all models. Please wait a few minutes and try again.');
    }
    if (status === 400) {
      throw new Error(`Gemini could not process the request (400). ${detail || 'The file may be too large or in an unsupported format.'}`);
    }
    if (status === 403) {
      throw new Error(`Gemini API access denied (403). ${detail || 'Check your API key in System → Configuration.'}`);
    }
    if (status === 404) {
      throw new Error(`Gemini model "${lastModel}" not found (404). Update the model name in System → Configuration.`);
    }
    if (status === 503) {
      throw new Error('All Gemini models are temporarily overloaded (503). Please try again in a few minutes.');
    }
    throw new Error(`Gemini API error (${status}): ${detail || 'Check API key and quota in System → Configuration.'}`);
  }

  const result = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');

  // Parse the JSON response
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const analysis = JSON.parse(cleaned) as RfpAnalysis;

  // Ensure arrays have defaults
  if (!analysis.preQualification) analysis.preQualification = [];
  if (!analysis.technicalEvaluation) analysis.technicalEvaluation = null as unknown as TechnicalEvaluation;
  if (!analysis.boqItems) analysis.boqItems = [];
  if (!analysis.paymentTerms) analysis.paymentTerms = null as unknown as PaymentTerms;
  if (!analysis.milestones) analysis.milestones = [];
  if (!analysis.riskFlags) analysis.riskFlags = [];

  logger.info({ recommendation: analysis.recommendation, pqCount: analysis.preQualification?.length ?? 0, techSections: analysis.technicalEvaluation?.sections?.length ?? 0, boqItems: analysis.boqItems?.length ?? 0, milestones: analysis.milestones?.length ?? 0, riskFlags: analysis.riskFlags?.length ?? 0 }, 'RFP analysis complete');
  return analysis;
}

// ===== Email AI Functions =====

interface EmailContext {
  subject: string | null;
  body: string;
  from: string;
  to: string[];
  cc?: string[];
}

async function getGeminiConfig() {
  const [keyRow, modelRow] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: 'gemini_api_key' } }),
    prisma.appConfig.findUnique({ where: { key: 'gemini_model' } }),
  ]);
  const apiKey = keyRow?.value;
  if (!apiKey) throw new Error('Gemini API Key is not configured. Go to System → Configuration to set it.');
  const model = modelRow?.value || DEFAULT_MODEL;
  return { apiKey, model };
}

async function callGemini(prompt: string, temperature: number): Promise<string> {
  const { apiKey, model } = await getGeminiConfig();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetchWithRetry(`${url}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: 4096 },
    }),
  }, 'Gemini call');

  if (!res.ok) {
    const errText = await res.text();
    logger.error({ status: res.status, model, err: errText }, 'Gemini API error');
    let detail = '';
    try { detail = JSON.parse(errText)?.error?.message || ''; } catch { /* not JSON */ }
    if (res.status === 429) throw new Error('Gemini API rate limit exceeded. Please wait and try again.');
    if (res.status === 403) throw new Error('Gemini API key is invalid. Check System → Configuration.');
    if (res.status === 404) throw new Error(`Gemini model "${model}" not found. Update the model name in System → Configuration.`);
    throw new Error(`Gemini API error (${res.status}): ${detail || 'Check API key and quota.'}`);
  }

  const result = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text.trim();
}

/**
 * Summarize an email thread using Gemini.
 */
export async function summarizeEmail(ctx: EmailContext): Promise<string> {
  const prompt = `Summarize the following email concisely. Highlight key points, action items, decisions, and any deadlines mentioned. Use bullet points for clarity.

Subject: ${ctx.subject ?? '(no subject)'}
From: ${ctx.from}
To: ${ctx.to.join(', ')}${ctx.cc?.length ? `\nCc: ${ctx.cc.join(', ')}` : ''}

--- Email Body ---
${ctx.body}
--- End ---

Provide a clear, concise summary:`;

  logger.info('Summarizing email via Gemini');
  return callGemini(prompt, 0.2);
}

/**
 * Draft a reply to an email using Gemini.
 */
export async function draftEmailReply(ctx: EmailContext, userPrompt?: string): Promise<string> {
  const instruction = userPrompt?.trim()
    ? `The user wants the reply to: ${userPrompt}`
    : 'Draft a professional, helpful reply.';

  const prompt = `Draft a professional email reply to the following email. ${instruction}

Original Email:
Subject: ${ctx.subject ?? '(no subject)'}
From: ${ctx.from}
To: ${ctx.to.join(', ')}${ctx.cc?.length ? `\nCc: ${ctx.cc.join(', ')}` : ''}

--- Email Body ---
${ctx.body}
--- End ---

Write ONLY the reply body (no subject line, no greeting headers like "Subject:" or "To:"). Start with an appropriate greeting and end with a sign-off. Keep it concise and professional. Use HTML formatting (<p>, <br>, <ul>, <li>) for the response.`;

  logger.info('Drafting email reply via Gemini');
  return callGemini(prompt, 0.5);
}
