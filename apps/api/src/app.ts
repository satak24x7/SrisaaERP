import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp, { type Options as PinoHttpOptions } from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { correlationIdMiddleware } from './middleware/correlation-id.js';
import { auditContextMiddleware } from './middleware/audit.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { healthRouter, readyRouter } from './modules/health/routes.js';
import { businessUnitRouter } from './modules/organization/business-unit/routes.js';
import { buMembersRouter } from './modules/organization/business-unit/members.routes.js';
import { companyRouter } from './modules/admin/company/routes.js';
import { companyDocumentRouter } from './modules/admin/company/document.routes.js';
import { bankAccountRouter } from './modules/admin/company/bank-account.routes.js';
import { configRouter } from './modules/admin/config/routes.js';
import { statutoryRouter } from './modules/admin/statutory/routes.js';
import { governmentRouter } from './modules/admin/government/routes.js';
import { lookupRouter } from './modules/admin/lookup/routes.js';
import { accountRouter } from './modules/sales/account/routes.js';
import { contactRouter } from './modules/sales/contact/routes.js';
import { leadRouter } from './modules/sales/lead/routes.js';
import { influencerRouter } from './modules/sales/influencer/routes.js';
import { opportunityRouter } from './modules/sales/opportunity/routes.js';
import { activityRouter } from './modules/activity/routes.js';
import { travelRouter } from './modules/travel/routes.js';
import { passwordRouter } from './modules/password/routes.js';
import { roleRouter } from './modules/admin/role/routes.js';
import { userRouter } from './modules/admin/user/routes.js';
import { projectRouter } from './modules/project/routes.js';
import { appUsageRouter } from './modules/app-usage/routes.js';
import { notificationRouter } from './modules/notification/routes.js';
import { tenderListRouter } from './modules/tender/routes.js';

export function createApp(): Express {
  const app = express();

  // Security
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
      credentials: true,
    })
  );
  app.disable('x-powered-by');

  // Correlation & logging
  app.use(correlationIdMiddleware);
  // pino@9.14 vs. pino-http's bundled pino types drift slightly under
  // exactOptionalPropertyTypes; cast keeps the strict tsconfig intact.
  const pinoOpts = {
    logger,
    customLogLevel: (_req: unknown, res: { statusCode: number }, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error' as const;
      if (res.statusCode >= 400) return 'warn' as const;
      return 'info' as const;
    },
  } as unknown as PinoHttpOptions;
  app.use(pinoHttp(pinoOpts));

  // Body & compression
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(compression());

  // Rate limit (global; tighter limits in auth routes)
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    })
  );

  // Auth + audit context (auth is non-enforcing; per-route requireAuth gates access)
  app.use(authMiddleware);
  app.use(auditContextMiddleware);

  // Public liveness / readiness
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/ready', readyRouter);

  // Module routers
  app.use('/api/v1/company', companyRouter);
  app.use('/api/v1/company-documents', companyDocumentRouter);
  app.use('/api/v1/bank-accounts', bankAccountRouter);
  app.use('/api/v1/config', configRouter);
  app.use('/api/v1/statutory-registrations', statutoryRouter);
  app.use('/api/v1/governments', governmentRouter);
  app.use('/api/v1/lookup-lists', lookupRouter);

  // Sales module
  app.use('/api/v1/accounts', accountRouter);
  app.use('/api/v1/contacts', contactRouter);
  app.use('/api/v1/leads', leadRouter);
  app.use('/api/v1/influencers', influencerRouter);
  app.use('/api/v1/opportunities', opportunityRouter);
  app.use('/api/v1/activities', activityRouter);
  app.use('/api/v1/travel-plans', travelRouter);
  app.use('/api/v1/passwords', passwordRouter);
  app.use('/api/v1/roles', roleRouter);
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1/business-units', businessUnitRouter);
  app.use('/api/v1/business-units/:buId/members', buMembersRouter);

  // Project Execution module
  app.use('/api/v1/projects', projectRouter);

  // App Usage tracking
  app.use('/api/v1/app-usage', appUsageRouter);

  // Notifications
  app.use('/api/v1/notifications', notificationRouter);

  // Bid Management
  app.use('/api/v1/tenders', tenderListRouter);

  // 404 + error handler (last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
