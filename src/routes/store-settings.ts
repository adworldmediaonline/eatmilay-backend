import type { Request, Response } from "express";
import { getDb } from "../db/mongodb.js";

const COLLECTION = "store_settings";
const COUPON_DOC_ID = "coupon";

export type CouponBehaviorSettings = {
  autoApply: boolean;
  autoApplyStrategy: "best_savings" | "first_created" | "highest_percentage" | "customer_choice";
  showToastOnApply: boolean;
};

const DEFAULT_COUPON_SETTINGS: CouponBehaviorSettings = {
  autoApply: false,
  autoApplyStrategy: "best_savings",
  showToastOnApply: true,
};

export async function getCouponSettings(
  _req: Request,
  res: Response
): Promise<void> {
  const db = getDb();
  const doc = await db.collection(COLLECTION).findOne({
    key: COUPON_DOC_ID,
  } as Record<string, unknown>);

  const settings: CouponBehaviorSettings = doc
    ? {
        autoApply: (doc.autoApply as boolean) ?? DEFAULT_COUPON_SETTINGS.autoApply,
        autoApplyStrategy:
          (doc.autoApplyStrategy as CouponBehaviorSettings["autoApplyStrategy"]) ??
          DEFAULT_COUPON_SETTINGS.autoApplyStrategy,
        showToastOnApply:
          (doc.showToastOnApply as boolean) ?? DEFAULT_COUPON_SETTINGS.showToastOnApply,
      }
    : { ...DEFAULT_COUPON_SETTINGS };

  res.json(settings);
}
