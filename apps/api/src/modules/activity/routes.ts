import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { notify } from '../notification/service.js';

const ACTIVITY_TYPES = ['EVENT', 'TASK'] as const;
const TASK_STATUSES = ['OPEN', 'OVERDUE', 'CLOSED'] as const;
const ENTITY_TYPES = ['OPPORTUNITY', 'LEAD', 'ACCOUNT', 'CONTACT', 'INFLUENCER', 'PROJECT'] as const;

const IdParams = z.object({ id: z.string().min(1).max(26) });

const AssociationInput = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1).max(26),
});

const CreateActivityInput = z.object({
  activityType: z.enum(ACTIVITY_TYPES),
  subject: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  categoryCode: z.string().min(1).max(64),
  userId: z.string().min(1).max(26),

  // Event fields
  startDateTime: z.string().nullable().optional(),
  endDateTime: z.string().nullable().optional(),
  isAllDay: z.boolean().default(false),

  // Task fields
  dueDateTime: z.string().nullable().optional(),
  taskStatus: z.enum(TASK_STATUSES).nullable().optional().default('OPEN'),

  // Relations
  associations: z.array(AssociationInput).optional(),
  contactIds: z.array(z.string().min(1).max(26)).optional(),
});

const UpdateActivityInput = z.object({
  activityType: z.enum(ACTIVITY_TYPES).optional(),
  subject: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  categoryCode: z.string().min(1).max(64).optional(),
  userId: z.string().min(1).max(26).optional(),

  startDateTime: z.string().nullable().optional(),
  endDateTime: z.string().nullable().optional(),
  isAllDay: z.boolean().optional(),

  dueDateTime: z.string().nullable().optional(),
  taskStatus: z.enum(TASK_STATUSES).nullable().optional(),

  associations: z.array(AssociationInput).optional(),
  contactIds: z.array(z.string().min(1).max(26)).optional(),
});

const ListQuery = z.object({
  activityType: z.string().optional(),
  categoryCode: z.string().optional(),
  taskStatus: z.string().optional(),
  userId: z.string().optional(),
  mine: z.string().optional(), // "true" to filter by current user
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  tab: z.enum(['open', 'upcoming', 'completed']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CalendarQuery = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  mine: z.string().optional(),
  userId: z.string().optional(),
  categoryCode: z.string().optional(),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

/** Get the current user's DB ID (already resolved by auth middleware) */
function resolveMyUserId(req: import('express').Request): string | null {
  return req.user?.id ?? null;
}

const ACTIVITY_INCLUDE = {
  user: { select: { id: true, fullName: true } },
  associations: true,
  contacts: { include: { contact: { select: { id: true, firstName: true, lastName: true } } } },
} as const;

function activityToDto(row: Record<string, unknown>, entityNames?: Map<string, string>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    startDateTime?: Date | null; endDateTime?: Date | null; dueDateTime?: Date | null;
    user?: { id: string; fullName: string } | null;
    associations?: Array<{ id: string; entityType: string; entityId: string }>;
    contacts?: Array<{ contact: { id: string; firstName: string; lastName: string | null } }>;
  };
  return {
    id: r.id, activityType: r.activityType, subject: r.subject,
    description: r.description ?? null,
    categoryCode: r.categoryCode,
    userId: r.userId, userName: r.user?.fullName ?? null,
    startDateTime: r.startDateTime?.toISOString() ?? null,
    endDateTime: r.endDateTime?.toISOString() ?? null,
    isAllDay: r.isAllDay ?? false,
    dueDateTime: r.dueDateTime?.toISOString() ?? null,
    taskStatus: r.taskStatus ?? null,
    associations: (r.associations ?? []).map((a) => ({
      id: a.id, entityType: a.entityType, entityId: a.entityId,
      entityName: entityNames?.get(`${a.entityType}:${a.entityId}`) ?? null,
    })),
    contacts: (r.contacts ?? []).map((c) => ({
      id: c.contact.id,
      name: `${c.contact.firstName}${c.contact.lastName ? ' ' + c.contact.lastName : ''}`,
    })),
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

/** Resolve display names for all associations in a batch of activities */
async function resolveEntityNames(activities: Array<{ associations?: Array<{ entityType: string; entityId: string }> }>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const byType: Record<string, Set<string>> = {};
  for (const a of activities) {
    for (const assoc of a.associations ?? []) {
      if (!byType[assoc.entityType]) byType[assoc.entityType] = new Set();
      byType[assoc.entityType]!.add(assoc.entityId);
    }
  }

  const lookups: Promise<void>[] = [];
  if (byType['OPPORTUNITY']?.size) {
    lookups.push(prisma.opportunity.findMany({
      where: { id: { in: [...byType['OPPORTUNITY']!] } }, select: { id: true, title: true },
    }).then((rows) => rows.forEach((r) => names.set(`OPPORTUNITY:${r.id}`, r.title))));
  }
  if (byType['LEAD']?.size) {
    lookups.push(prisma.lead.findMany({
      where: { id: { in: [...byType['LEAD']!] } }, select: { id: true, title: true },
    }).then((rows) => rows.forEach((r) => names.set(`LEAD:${r.id}`, r.title))));
  }
  if (byType['ACCOUNT']?.size) {
    lookups.push(prisma.account.findMany({
      where: { id: { in: [...byType['ACCOUNT']!] } }, select: { id: true, name: true },
    }).then((rows) => rows.forEach((r) => names.set(`ACCOUNT:${r.id}`, r.name))));
  }
  if (byType['CONTACT']?.size) {
    lookups.push(prisma.contact.findMany({
      where: { id: { in: [...byType['CONTACT']!] } }, select: { id: true, firstName: true, lastName: true },
    }).then((rows) => rows.forEach((r) => names.set(`CONTACT:${r.id}`, `${r.firstName}${r.lastName ? ' ' + r.lastName : ''}`))));
  }
  if (byType['INFLUENCER']?.size) {
    lookups.push(prisma.influencer.findMany({
      where: { id: { in: [...byType['INFLUENCER']!] } }, select: { id: true, name: true },
    }).then((rows) => rows.forEach((r) => names.set(`INFLUENCER:${r.id}`, r.name))));
  }
  if (byType['PROJECT']?.size) {
    lookups.push(prisma.project.findMany({
      where: { id: { in: [...byType['PROJECT']!] } }, select: { id: true, name: true },
    }).then((rows) => rows.forEach((r) => names.set(`PROJECT:${r.id}`, r.name))));
  }
  await Promise.all(lookups);
  return names;
}

async function syncAssociations(activityId: string, associations: z.infer<typeof AssociationInput>[]): Promise<void> {
  await prisma.activityAssociation.deleteMany({ where: { activityId } });
  if (associations.length > 0) {
    await prisma.activityAssociation.createMany({
      data: associations.map((a) => ({ id: newId(), activityId, entityType: a.entityType, entityId: a.entityId })),
    });
  }
}

async function syncActivityContacts(activityId: string, contactIds: string[]): Promise<void> {
  await prisma.activityContact.deleteMany({ where: { activityId } });
  if (contactIds.length > 0) {
    await prisma.activityContact.createMany({
      data: contactIds.map((contactId) => ({ id: newId(), activityId, contactId })),
    });
  }
}

export const activityRouter: ExpressRouter = Router();
activityRouter.use(requireAuth);

/* GET /calendar — calendar feed for FullCalendar */
activityRouter.get(
  '/calendar',
  validate({ query: CalendarQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof CalendarQuery>;
    const startDate = new Date(q.start);
    const endDate = new Date(q.end);

    const where: Record<string, unknown> = { deletedAt: null };
    if (q.mine === 'true') {
      const myId = await resolveMyUserId(req);
      if (myId) where.userId = myId;
    } else if (q.userId) {
      where.userId = q.userId;
    }
    if (q.categoryCode) where.categoryCode = q.categoryCode;

    // Fetch events in date range (startDateTime overlaps) OR tasks with dueDateTime in range
    where.OR = [
      { activityType: 'EVENT', startDateTime: { lte: endDate }, endDateTime: { gte: startDate } },
      { activityType: 'EVENT', isAllDay: true, startDateTime: { gte: startDate, lte: endDate } },
      { activityType: 'TASK', dueDateTime: { gte: startDate, lte: endDate } },
    ];

    const args = { where, include: ACTIVITY_INCLUDE, orderBy: { createdAt: 'asc' }, take: 500 };
    const rows = await prisma.activity.findMany(args as Parameters<typeof prisma.activity.findMany>[0]);

    const events = rows.map((r) => {
      const dto = activityToDto(r as unknown as Record<string, unknown>);
      // FullCalendar event format
      return {
        id: dto.id,
        title: dto.subject,
        start: dto.activityType === 'EVENT' ? dto.startDateTime : dto.dueDateTime,
        end: dto.activityType === 'EVENT' ? dto.endDateTime : dto.dueDateTime,
        allDay: dto.isAllDay,
        extendedProps: {
          activityType: dto.activityType,
          categoryCode: dto.categoryCode,
          taskStatus: dto.taskStatus,
          userName: dto.userName,
          description: dto.description,
        },
      };
    });

    // Also fetch travel plans in the date range
    const travelWhere: Record<string, unknown> = {
      deletedAt: null,
    };
    if (q.mine === 'true') {
      const myId = await resolveMyUserId(req);
      if (myId) {
        travelWhere.OR = [
          { leadTravellerId: myId },
          { travellers: { some: { userId: myId } } },
        ];
      }
    }
    Object.assign(travelWhere, {
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    });
    const travelPlans = await prisma.travelPlan.findMany({
      where: travelWhere,
      include: { leadTraveller: { select: { fullName: true } } },
      orderBy: { startDate: 'asc' },
      take: 100,
    });

    const travelEvents = travelPlans.map((tp) => {
      // FullCalendar end is exclusive for all-day events — add 1 day to include the end date
      const endPlusOne = new Date(tp.endDate);
      endPlusOne.setDate(endPlusOne.getDate() + 1);
      return {
      id: `travel_${tp.id}`,
      title: `✈ ${tp.title}`,
      start: tp.startDate.toISOString().slice(0, 10),
      end: endPlusOne.toISOString().slice(0, 10),
      allDay: true,
      extendedProps: {
        activityType: 'TRAVEL',
        categoryCode: tp.purpose,
        taskStatus: tp.status,
        userName: (tp.leadTraveller as { fullName: string }).fullName,
        description: `Travel: ${tp.status}`,
        travelPlanId: tp.id,
      },
    };
    });

    res.json({ data: [...events, ...travelEvents] });
  }),
);

/* GET / — list activities */
activityRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.activityType) where.activityType = q.activityType;
    if (q.categoryCode) where.categoryCode = q.categoryCode;
    if (q.taskStatus) where.taskStatus = q.taskStatus;
    if (q.mine === 'true') {
      const myId = await resolveMyUserId(req);
      if (myId) where.userId = myId;
    } else if (q.userId) {
      where.userId = q.userId;
    }

    // Tab-based filtering
    const now = new Date();
    if (q.tab === 'open') {
      // All activities with due date today or earlier (tasks due today/overdue + events starting today or earlier)
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      where.OR = [
        { activityType: 'TASK', taskStatus: { in: ['OPEN', 'OVERDUE'] }, dueDateTime: { lte: endOfToday } },
        { activityType: 'EVENT', startDateTime: { lte: endOfToday }, endDateTime: { gte: now } },
      ];
    } else if (q.tab === 'upcoming') {
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      where.OR = [
        { activityType: 'EVENT', startDateTime: { gte: now, lte: nextWeek } },
        { activityType: 'TASK', dueDateTime: { gte: now, lte: nextWeek }, taskStatus: { in: ['OPEN', 'OVERDUE'] } },
      ];
    } else if (q.tab === 'completed') {
      where.OR = [
        { activityType: 'TASK', taskStatus: 'CLOSED' },
        { activityType: 'EVENT', endDateTime: { lt: now } },
      ];
    }

    // Filter by associated entity
    if (q.entityType && q.entityId) {
      where.associations = { some: { entityType: q.entityType, entityId: q.entityId } };
    }

    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where, orderBy: { createdAt: 'desc' }, take, include: ACTIVITY_INCLUDE,
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.activity.findMany(args as Parameters<typeof prisma.activity.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    const entityNames = await resolveEntityNames(page as unknown as Array<{ associations?: Array<{ entityType: string; entityId: string }> }>);
    res.json({
      data: page.map((r) => activityToDto(r as unknown as Record<string, unknown>, entityNames)),
      meta: { next_cursor: nextCursor, limit: q.limit },
    });
  }),
);

/* GET /:id — single activity */
activityRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.activity.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: ACTIVITY_INCLUDE,
    });
    if (!row) throw errors.notFound('Activity not found');
    const entityNames = await resolveEntityNames([row as unknown as { associations?: Array<{ entityType: string; entityId: string }> }]);
    res.json({ data: activityToDto(row as unknown as Record<string, unknown>, entityNames) });
  }),
);

/* POST / — create activity */
activityRouter.post(
  '/',
  validate({ body: CreateActivityInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateActivityInput>;
    const actor = actorId(req);
    const activityId = newId();

    await prisma.activity.create({
      data: {
        id: activityId,
        activityType: body.activityType,
        subject: body.subject,
        description: body.description ?? null,
        categoryCode: body.categoryCode,
        userId: body.userId,
        startDateTime: body.startDateTime ? new Date(body.startDateTime) : null,
        endDateTime: body.endDateTime ? new Date(body.endDateTime) : null,
        isAllDay: body.isAllDay,
        dueDateTime: body.dueDateTime ? new Date(body.dueDateTime) : null,
        taskStatus: body.activityType === 'TASK' ? (body.taskStatus ?? 'OPEN') : null,
        createdBy: actor, updatedBy: actor,
      },
    });

    if (body.associations && body.associations.length > 0) {
      await syncAssociations(activityId, body.associations);
    }
    if (body.contactIds && body.contactIds.length > 0) {
      await syncActivityContacts(activityId, body.contactIds);
    }

    const row = await prisma.activity.findUniqueOrThrow({ where: { id: activityId }, include: ACTIVITY_INCLUDE });
    await recordAudit(req, { action: 'CREATE', resourceType: 'activity', resourceId: activityId, after: { subject: row.subject, activityType: row.activityType } });

    // Notify assigned user (if different from creator)
    if (body.userId && body.userId !== actor) {
      const actorName = req.user?.fullName ?? 'Someone';
      const typeLabel = body.activityType === 'TASK' ? 'task' : 'event';
      await notify({
        userId: body.userId,
        title: `New ${typeLabel} assigned to you`,
        body: `"${body.subject}" assigned by ${actorName}`,
        type: 'ACTION',
        category: 'ACTIVITY',
        entityType: 'ACTIVITY',
        entityId: activityId,
        actionUrl: `/work-area/activities`,
      });
    }

    res.status(201).json({ data: activityToDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id — update activity */
activityRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateActivityInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.activity.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Activity not found');

    const body = req.body as z.infer<typeof UpdateActivityInput>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    const { associations, contactIds, ...fields } = body;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (k === 'startDateTime' || k === 'endDateTime' || k === 'dueDateTime') {
        data[k] = v ? new Date(v as string) : null;
        continue;
      }
      data[k] = v;
    }

    await prisma.activity.update({ where: { id: existing.id }, data });

    if (associations !== undefined) {
      await syncAssociations(existing.id, associations);
    }
    if (contactIds !== undefined) {
      await syncActivityContacts(existing.id, contactIds);
    }

    const updated = await prisma.activity.findUniqueOrThrow({ where: { id: existing.id }, include: ACTIVITY_INCLUDE });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'activity', resourceId: existing.id });
    res.json({ data: activityToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:id — soft delete */
activityRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.activity.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Activity not found');

    await prisma.activity.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'activity', resourceId: existing.id });
    res.status(204).end();
  }),
);
