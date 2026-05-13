import { prisma, newId } from '../../lib/prisma.js';

/**
 * Atomic auto-number generator.
 * Uses appConfig table with keys like "seq_PO_2026".
 * Returns formatted string like "PO-2026-0001".
 */
export async function nextSequenceNo(prefix: string): Promise<string> {
  const now = new Date();
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Indian FY: Apr-Mar
  const key = `seq_${prefix}_${fy}`;

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.appConfig.findUnique({ where: { key } });
    const next = row ? parseInt(row.value, 10) + 1 : 1;
    if (row) {
      await tx.appConfig.update({ where: { key }, data: { value: String(next) } });
    } else {
      await tx.appConfig.create({ data: { id: newId(), key, value: String(next) } });
    }
    return next;
  });

  return `${prefix}-${fy}-${String(result).padStart(4, '0')}`;
}

/**
 * GST computation — same logic as expense-sheet.
 * BPS = basis points: 1800 = 18%.
 * INTRA = 50/50 CGST+SGST, INTER = 100% IGST, EXEMPT = zero.
 */
export function computeGst(
  amountPaise: bigint,
  gstRateBps: number,
  supplyType: string,
): { cgst: bigint; sgst: bigint; igst: bigint; total: bigint } {
  if (supplyType === 'EXEMPT' || gstRateBps === 0) {
    return { cgst: BigInt(0), sgst: BigInt(0), igst: BigInt(0), total: BigInt(0) };
  }
  const totalGst = (amountPaise * BigInt(gstRateBps)) / BigInt(10000);
  if (supplyType === 'INTER') {
    return { cgst: BigInt(0), sgst: BigInt(0), igst: totalGst, total: totalGst };
  }
  // INTRA: split 50/50 CGST + SGST
  const half = totalGst / BigInt(2);
  const remainder = totalGst - half * BigInt(2);
  return { cgst: half, sgst: half + remainder, igst: BigInt(0), total: totalGst };
}

/**
 * Compute a full line total: (qty × rate) - discount% + GST.
 * Returns all computed fields.
 */
export function computeLineTotal(
  qty: number,
  ratePaise: bigint,
  discountPct: number,
  gstRateBps: number,
  supplyType: string,
): {
  lineTotalPaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  igstPaise: bigint;
} {
  const gross = BigInt(Math.round(qty * Number(ratePaise)));
  const discountAmount = discountPct > 0
    ? (gross * BigInt(Math.round(discountPct * 100))) / BigInt(10000)
    : BigInt(0);
  const taxable = gross - discountAmount;
  const gst = computeGst(taxable, gstRateBps, supplyType);
  return {
    lineTotalPaise: taxable + gst.total,
    cgstPaise: gst.cgst,
    sgstPaise: gst.sgst,
    igstPaise: gst.igst,
  };
}

/**
 * Extract actor user ID from request, truncated to 26 chars for ULID columns.
 */
export function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

/**
 * Convert BigInt to Number for JSON serialization.
 */
export function bn(v: bigint | null | undefined): number {
  return Number(v ?? 0);
}
