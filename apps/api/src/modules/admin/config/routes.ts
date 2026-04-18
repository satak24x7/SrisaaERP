import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { prisma, newId } from '../../../lib/prisma.js';

const UpdateConfigBody = z.object({
  key: z.string().min(1).max(64),
  value: z.string(),
});

const BulkUpdateBody = z.object({
  items: z.array(UpdateConfigBody),
});

export const configRouter: ExpressRouter = Router();
configRouter.use(requireAuth);

/* GET / — get all config entries */
configRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.appConfig.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json({ data: map });
  }),
);

/* PUT / — bulk upsert config entries */
configRouter.put(
  '/',
  validate({ body: BulkUpdateBody }),
  asyncHandler(async (req, res) => {
    const { items } = req.body as z.infer<typeof BulkUpdateBody>;
    for (const item of items) {
      const existing = await prisma.appConfig.findUnique({ where: { key: item.key } });
      if (existing) {
        await prisma.appConfig.update({ where: { key: item.key }, data: { value: item.value } });
      } else {
        await prisma.appConfig.create({ data: { id: newId(), key: item.key, value: item.value } });
      }
    }
    // Return updated map
    const rows = await prisma.appConfig.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json({ data: map });
  }),
);
