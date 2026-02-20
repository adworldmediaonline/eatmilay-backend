import type { Response } from "express";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

const COLLECTION = "store_settings";
const COUPON_DOC_ID = "coupon";
const SHIPPING_DOC_ID = "shipping";

const couponSettingsSchema = z.object({
  autoApply: z.boolean(),
  autoApplyStrategy: z.enum([
    "best_savings",
    "first_created",
    "highest_percentage",
    "customer_choice",
  ]),
  showToastOnApply: z.boolean(),
});

export async function getAdminCouponSettings(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db = getDb();
  const doc = await db.collection(COLLECTION).findOne({
    key: COUPON_DOC_ID,
  } as Record<string, unknown>);

  const settings = doc
    ? {
        autoApply: (doc.autoApply as boolean) ?? false,
        autoApplyStrategy:
          (doc.autoApplyStrategy as string) ?? "best_savings",
        showToastOnApply: (doc.showToastOnApply as boolean) ?? true,
      }
    : {
        autoApply: false,
        autoApplyStrategy: "best_savings" as const,
        showToastOnApply: true,
      };

  res.json(settings);
}

export async function updateAdminCouponSettings(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const parsed = couponSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const db = getDb();
  await db.collection(COLLECTION).updateOne(
    { key: COUPON_DOC_ID } as Record<string, unknown>,
    {
      $set: {
        ...parsed.data,
        key: COUPON_DOC_ID,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  res.json(parsed.data);
}

const shippingSettingsSchema = z.object({
  freeShippingThreshold: z.number().min(0).nullable(),
});

export async function getAdminShippingSettings(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db = getDb();
  const doc = await db.collection(COLLECTION).findOne({
    key: SHIPPING_DOC_ID,
  } as Record<string, unknown>);

  const freeShippingThreshold =
    doc?.freeShippingThreshold != null
      ? (doc.freeShippingThreshold as number)
      : null;

  res.json({ freeShippingThreshold });
}

export async function updateAdminShippingSettings(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const parsed = shippingSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const db = getDb();
  await db.collection(COLLECTION).updateOne(
    { key: SHIPPING_DOC_ID } as Record<string, unknown>,
    {
      $set: {
        freeShippingThreshold: parsed.data.freeShippingThreshold,
        key: SHIPPING_DOC_ID,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  res.json(parsed.data);
}
