import type { Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";

const COLLECTION = "discount";

const validateSchema = z.object({
  code: z.string().min(1).max(50),
  subtotal: z.number().min(0),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().min(1),
      unitPrice: z.number().min(0),
    })
  ),
});

export async function validateStoreDiscount(
  req: Request,
  res: Response
): Promise<void> {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      valid: false,
      message: "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const db = getDb();
  const code = parsed.data.code.trim().toUpperCase();

  const discount = await db.collection(COLLECTION).findOne({
    code: { $regex: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  if (!discount) {
    res.json({ valid: false, message: "Invalid or expired coupon code" });
    return;
  }

  const status = discount.status ?? "active";
  const startsAt = discount.startsAt as Date | null | undefined;
  const now = new Date();

  if (status === "disabled") {
    res.json({ valid: false, message: "This coupon is no longer active" });
    return;
  }

  if (status === "scheduled") {
    if (startsAt && new Date(startsAt) > now) {
      res.json({ valid: false, message: "This coupon is not yet active" });
      return;
    }
    // startsAt passed or null — treat as effectively active
  }

  if (startsAt && new Date(startsAt) > now) {
    res.json({ valid: false, message: "This coupon is not yet active" });
    return;
  }

  const expiresAt = discount.expiresAt as Date | null | undefined;
  if (expiresAt && new Date(expiresAt) < now) {
    res.json({ valid: false, message: "This coupon has expired" });
    return;
  }

  const maxUsage = discount.maxUsage as number | null | undefined;
  const usedCount = (discount.usedCount as number) ?? 0;
  if (maxUsage != null && usedCount >= maxUsage) {
    res.json({ valid: false, message: "This coupon has reached its usage limit" });
    return;
  }

  const minOrderAmount = discount.minOrderAmount as number | null | undefined;
  const subtotal = parsed.data.subtotal;
  if (minOrderAmount != null && minOrderAmount > 0 && subtotal < minOrderAmount) {
    res.json({
      valid: false,
      message: `Minimum order amount of $${minOrderAmount.toFixed(2)} required`,
    });
    return;
  }

  const productIds = (discount.productIds as string[] | undefined) ?? [];
  const discountType = discount.type as "percentage" | "fixed";
  const value = (discount.value as number) ?? 0;

  let applicableSubtotal = subtotal;
  if (productIds.length > 0) {
    applicableSubtotal = parsed.data.items
      .filter((item) => productIds.includes(item.productId))
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }

  if (applicableSubtotal <= 0) {
    res.json({
      valid: false,
      message: "This coupon does not apply to any items in your cart",
    });
    return;
  }

  let discountAmount: number;
  if (discountType === "percentage") {
    discountAmount = Math.round((applicableSubtotal * (value / 100)) * 100) / 100;
  } else {
    discountAmount = Math.min(value, applicableSubtotal);
  }

  res.json({
    valid: true,
    discountAmount,
    message: `You save $${discountAmount.toFixed(2)}`,
  });
}
