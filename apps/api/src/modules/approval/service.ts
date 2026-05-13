import { prisma, newId } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { notify } from '../notification/service.js';

// ---------------------------------------------------------------------------
// Approval Engine — generic multi-step approval service
// ---------------------------------------------------------------------------

export interface SubmitForApprovalInput {
  entityType: string;   // MATERIAL_REQUEST, PURCHASE_ORDER, etc.
  entityId: string;
  valuePaise: bigint;
  requestedByUserId: string;
  title?: string;       // display title for approval inbox
}

export interface ApprovalResult {
  requestId: string;
  status: string;
  currentStepOrder: number;
  nextApproverInfo?: string; // role name or user id for the current step
}

/**
 * Submit an entity for approval. Finds the matching active workflow,
 * determines applicable steps based on value, and creates the request.
 * Returns null if no workflow is configured (caller should handle fallback).
 */
export async function submitForApproval(
  input: SubmitForApprovalInput,
): Promise<ApprovalResult | null> {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { entityType: input.entityType, isActive: true, deletedAt: null },
    include: {
      steps: { orderBy: { stepOrder: 'asc' } },
    },
  });

  if (!workflow || workflow.steps.length === 0) {
    return null; // no workflow configured — caller decides fallback
  }

  // Filter steps that apply for this value
  const applicableSteps = workflow.steps.filter((s) => {
    if (s.minValuePaise !== null && input.valuePaise < s.minValuePaise) return false;
    if (s.maxValuePaise !== null && input.valuePaise > s.maxValuePaise) return false;
    return true;
  });

  if (applicableSteps.length === 0) {
    return null; // no steps match this value range
  }

  const firstStep = applicableSteps[0]!;

  const request = await prisma.approvalRequest.create({
    data: {
      id: newId(),
      workflowId: workflow.id,
      entityType: input.entityType,
      entityId: input.entityId,
      requestedByUserId: input.requestedByUserId,
      currentStepOrder: firstStep.stepOrder,
      status: 'PENDING',
      valuePaise: input.valuePaise,
      title: input.title ?? null,
    },
  });

  // Notify potential approvers
  await notifyStepApprovers(request.id, firstStep, input.title ?? input.entityType);

  return {
    requestId: request.id,
    status: 'PENDING',
    currentStepOrder: firstStep.stepOrder,
    nextApproverInfo: firstStep.approverRoleName ?? firstStep.specificUserId ?? undefined,
  };
}

/**
 * Handle an approval action (APPROVE, REJECT, RETURN).
 * Validates: actor matches step role/user, self-approval prevention,
 * consecutive-step same-actor prevention.
 */
export async function handleApprovalAction(
  requestId: string,
  actorUserId: string,
  actorRoles: readonly string[],
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  comment?: string,
): Promise<{
  success: boolean;
  error?: string;
  newStatus: string;
  currentStepOrder: number;
}> {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    include: {
      workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      actions: { orderBy: { occurredAt: 'desc' }, take: 1 },
    },
  });

  if (!request) {
    return { success: false, error: 'Approval request not found', newStatus: '', currentStepOrder: 0 };
  }
  if (request.status !== 'PENDING') {
    return { success: false, error: `Request is already ${request.status}`, newStatus: request.status, currentStepOrder: request.currentStepOrder };
  }

  // Self-approval prevention: requester cannot approve their own request
  if (actorUserId === request.requestedByUserId) {
    return { success: false, error: 'Cannot approve your own request', newStatus: 'PENDING', currentStepOrder: request.currentStepOrder };
  }

  // Consecutive-step prevention: same actor cannot act on two consecutive steps
  if (request.actions.length > 0 && request.actions[0]!.actorUserId === actorUserId) {
    return { success: false, error: 'Cannot act on consecutive approval steps', newStatus: 'PENDING', currentStepOrder: request.currentStepOrder };
  }

  // Find current step
  const currentStep = request.workflow.steps.find((s) => s.stepOrder === request.currentStepOrder);
  if (!currentStep) {
    return { success: false, error: 'Current step not found in workflow', newStatus: 'PENDING', currentStepOrder: request.currentStepOrder };
  }

  // Validate actor matches step requirements
  if (currentStep.specificUserId) {
    if (actorUserId !== currentStep.specificUserId) {
      return { success: false, error: 'You are not the designated approver for this step', newStatus: 'PENDING', currentStepOrder: request.currentStepOrder };
    }
  } else if (currentStep.approverRoleName) {
    if (!actorRoles.includes(currentStep.approverRoleName)) {
      return { success: false, error: `Requires role: ${currentStep.approverRoleName}`, newStatus: 'PENDING', currentStepOrder: request.currentStepOrder };
    }
  }

  // Record the action
  await prisma.approvalAction.create({
    data: {
      id: newId(),
      requestId: request.id,
      stepOrder: request.currentStepOrder,
      actorUserId,
      action,
      comment: comment ?? null,
    },
  });

  if (action === 'REJECT') {
    await prisma.approvalRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED' },
    });
    // Notify requester
    await notify({
      userId: request.requestedByUserId,
      title: `${request.title ?? request.entityType} rejected`,
      body: comment ? `Reason: ${comment}` : 'Your request was rejected.',
      type: 'WARNING',
      category: 'APPROVAL',
      entityType: request.entityType,
      entityId: request.entityId,
    });
    return { success: true, newStatus: 'REJECTED', currentStepOrder: request.currentStepOrder };
  }

  if (action === 'RETURN') {
    await prisma.approvalRequest.update({
      where: { id: request.id },
      data: { status: 'RETURNED' },
    });
    await notify({
      userId: request.requestedByUserId,
      title: `${request.title ?? request.entityType} returned`,
      body: comment ? `Reason: ${comment}` : 'Your request was returned for revision.',
      type: 'WARNING',
      category: 'APPROVAL',
      entityType: request.entityType,
      entityId: request.entityId,
    });
    return { success: true, newStatus: 'RETURNED', currentStepOrder: request.currentStepOrder };
  }

  // APPROVE — find next applicable step
  const applicableSteps = request.workflow.steps.filter((s) => {
    if (s.minValuePaise !== null && request.valuePaise < s.minValuePaise) return false;
    if (s.maxValuePaise !== null && request.valuePaise > s.maxValuePaise) return false;
    return true;
  });
  const nextStep = applicableSteps.find((s) => s.stepOrder > request.currentStepOrder);

  if (nextStep) {
    // Advance to next step
    await prisma.approvalRequest.update({
      where: { id: request.id },
      data: { currentStepOrder: nextStep.stepOrder },
    });
    await notifyStepApprovers(request.id, nextStep, request.title ?? request.entityType);
    return { success: true, newStatus: 'PENDING', currentStepOrder: nextStep.stepOrder };
  }

  // No more steps — fully approved
  await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status: 'APPROVED' },
  });
  await notify({
    userId: request.requestedByUserId,
    title: `${request.title ?? request.entityType} approved`,
    body: 'Your request has been fully approved.',
    type: 'SUCCESS',
    category: 'APPROVAL',
    entityType: request.entityType,
    entityId: request.entityId,
  });
  return { success: true, newStatus: 'APPROVED', currentStepOrder: request.currentStepOrder };
}

/**
 * Get the current approval status for an entity.
 */
export async function getApprovalStatus(
  entityType: string,
  entityId: string,
): Promise<{ requestId: string; status: string; currentStepOrder: number } | null> {
  const request = await prisma.approvalRequest.findFirst({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, currentStepOrder: true },
  });
  return request ? { requestId: request.id, status: request.status, currentStepOrder: request.currentStepOrder } : null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function notifyStepApprovers(
  requestId: string,
  step: { approverRoleName: string | null; specificUserId: string | null; stepName: string },
  title: string,
): Promise<void> {
  try {
    if (step.specificUserId) {
      await notify({
        userId: step.specificUserId,
        title: `Approval required: ${title}`,
        body: `Step: ${step.stepName}. Please review and act.`,
        type: 'ACTION',
        category: 'APPROVAL',
        entityType: 'APPROVAL_REQUEST',
        entityId: requestId,
        actionUrl: '/approvals',
      });
    } else if (step.approverRoleName) {
      // Find users with this role and notify them
      const roleUsers = await prisma.userRole.findMany({
        where: {
          role: { name: step.approverRoleName },
          user: { status: 'ACTIVE', deletedAt: null },
        },
        select: { userId: true },
      });
      const userIds = roleUsers.map((r) => r.userId);
      if (userIds.length > 0) {
        const { notifyMany } = await import('../notification/service.js');
        await notifyMany(userIds, {
          title: `Approval required: ${title}`,
          body: `Step: ${step.stepName}. Please review and act.`,
          type: 'ACTION',
          category: 'APPROVAL',
          entityType: 'APPROVAL_REQUEST',
          entityId: requestId,
          actionUrl: '/approvals',
        });
      }
    }
  } catch (err) {
    logger.error({ err, requestId, step }, 'Failed to notify step approvers');
  }
}
