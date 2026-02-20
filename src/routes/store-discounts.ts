import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import { validateDiscountForOrder } from "../lib/discount-validation.js";

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
  customerEmail: z.string().email().optional().nullable(),
  customerReferralCode: z.string().max(50).optional().nullable(),
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

  const options = {
    customerEmail: parsed.data.customerEmail ?? undefined,
    customerReferralCode: parsed.data.customerReferralCode ?? undefined,
  };
  const result = await validateDiscountForOrder(
    parsed.data.code,
    parsed.data.subtotal,
    parsed.data.items,
    options
  );

  if (result.valid) {
    res.json({
      valid: true,
      discountAmount: result.discountAmount,
      message: `You save $${result.discountAmount.toFixed(2)}`,
    });
  } else {
    res.json({ valid: false, message: result.message });
  }
}

const availableSchema = z.object({
  subtotal: z.number().min(0),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().min(1),
      unitPrice: z.number().min(0),
    })
  ),
  customerEmail: z.string().email().optional().nullable(),
  customerReferralCode: z.string().max(50).optional().nullable(),
});

function buildOfferDescription(
  type: "percentage" | "fixed",
  value: number,
  minOrderAmount: number | null,
  currency: string
): string {
  const sym = currency === "INR" ? "₹" : "$";
  const discount =
    type === "percentage" ? `${value}% off` : `${sym}${value.toFixed(0)} off`;
  if (minOrderAmount != null && minOrderAmount > 0) {
    return `${discount} on orders over ${sym}${minOrderAmount.toFixed(0)}`;
  }
  return discount;
}

export async function getAvailableOffers(
  req: Request,
  res: Response
): Promise<void> {
  const parsed = availableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { subtotal, items, customerEmail, customerReferralCode } = parsed.data;
  const db = getDb();
  const now = new Date();

  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  let itemCategoryIds: Record<string, string | null> = {};
  if (productIds.length > 0) {
    const objectIds = productIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    if (objectIds.length > 0) {
      const products = await db
        .collection("product")
        .find({ _id: { $in: objectIds } })
        .project({ _id: 1, categoryId: 1 })
        .toArray();
      for (const p of products) {
        itemCategoryIds[p._id.toString()] = (p.categoryId as string) ?? null;
      }
    }
  }

  const discounts = await db
    .collection(COLLECTION)
    .find({
      $and: [
        { $or: [{ status: "active" }, { status: "scheduled" }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      ],
    })
    .toArray();

  const offers: Array<{
    code: string;
    type: "percentage" | "fixed";
    value: number;
    minOrderAmount: number | null;
    discountAmount: number;
    description: string;
    allowAutoApply: boolean;
    createdAt?: string | null;
    locked?: boolean;
    gapAmount?: number;
    expiresAt?: string | null;
    usesLeft?: number | null;
  }> = [];

  const currency = "INR";

  for (const discount of discounts) {
    const status = discount.status ?? "active";
    const startsAt = discount.startsAt as Date | null | undefined;
    const expiresAt = discount.expiresAt as Date | null | undefined;
    const maxUsage = discount.maxUsage as number | null | undefined;
    const usedCount = (discount.usedCount as number) ?? 0;
    const minOrderAmount = discount.minOrderAmount as number | null | undefined;
    const discountProductIds = (discount.productIds as string[] | undefined) ?? [];
    const categoryIds = (discount.categoryIds as string[] | undefined) ?? [];
    const referralCode = (discount.referralCode as string | null | undefined)?.trim();
    const discountType = discount.type as "percentage" | "fixed";
    const value = (discount.value as number) ?? 0;

    if (status === "disabled") continue;
    if (startsAt && new Date(startsAt) > now) continue;
    if (expiresAt && new Date(expiresAt) < now) continue;
    if (maxUsage != null && usedCount >= maxUsage) continue;

    if (referralCode) {
      const customerRef = customerReferralCode?.trim();
      if (!customerRef || customerRef.toUpperCase() !== referralCode.toUpperCase()) {
        continue;
      }
    }

    let applicableSubtotal = subtotal;
    if (discountProductIds.length > 0) {
      applicableSubtotal = items
        .filter((item) => discountProductIds.includes(item.productId))
        .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    } else if (categoryIds.length > 0) {
      applicableSubtotal = items
        .filter((item) => {
          const catId = itemCategoryIds[item.productId];
          return catId && categoryIds.includes(catId);
        })
        .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    }
    if (applicableSubtotal <= 0) continue;

    const isLocked =
      minOrderAmount != null &&
      minOrderAmount > 0 &&
      subtotal < minOrderAmount;
    const gapAmount = isLocked ? minOrderAmount - subtotal : undefined;

    let discountAmount: number;
    if (discountType === "percentage") {
      discountAmount = isLocked
        ? Math.round((minOrderAmount * (value / 100)) * 100) / 100
        : Math.round((applicableSubtotal * (value / 100)) * 100) / 100;
    } else {
      discountAmount = isLocked
        ? Math.min(value, minOrderAmount)
        : Math.min(value, applicableSubtotal);
    }

    const expiresAtStr =
      expiresAt != null ? new Date(expiresAt).toISOString() : null;
    const usesLeftVal =
      maxUsage != null ? Math.max(0, maxUsage - usedCount) : null;

    const customDesc = (discount.description as string | undefined)?.trim();
    const description =
      customDesc ||
      buildOfferDescription(
        discountType,
        value,
        minOrderAmount ?? null,
        currency
      );

    const allowAutoApply = (discount.allowAutoApply as boolean | undefined) ?? true;
    const createdAtStr =
      discount.createdAt != null ? new Date(discount.createdAt).toISOString() : null;

    offers.push({
      code: (discount.code as string).trim().toUpperCase(),
      type: discountType,
      value,
      minOrderAmount: minOrderAmount ?? null,
      discountAmount,
      description,
      allowAutoApply,
      createdAt: createdAtStr,
      ...(isLocked && gapAmount != null
        ? { locked: true, gapAmount }
        : {}),
      expiresAt: expiresAtStr,
      usesLeft: usesLeftVal,
    });
  }

  res.json(offers);
}

export async function getFeaturedOffer(
  _req: Request,
  res: Response
): Promise<void> {
  const db = getDb();
  const now = new Date();

  const discounts = await db
    .collection(COLLECTION)
    .find({
      $and: [
        { $or: [{ status: "active" }, { status: "scheduled" }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        {
          $or: [
            { productIds: { $exists: false } },
            { productIds: null },
            { productIds: [] },
          ],
        },
        { $or: [{ minOrderAmount: null }, { minOrderAmount: 0 }] },
      ],
    })
    .sort({ value: -1 })
    .limit(1)
    .toArray();

  const discount = discounts[0];
  if (!discount) {
    res.json(null);
    return;
  }

  const maxUsage = discount.maxUsage as number | null | undefined;
  const usedCount = (discount.usedCount as number) ?? 0;
  if (maxUsage != null && usedCount >= maxUsage) {
    res.json(null);
    return;
  }

  const discountType = discount.type as "percentage" | "fixed";
  const value = (discount.value as number) ?? 0;
  const currency = "INR";
  const sym = currency === "INR" ? "₹" : "$";
  const customDesc = (discount.description as string | undefined)?.trim();
  const description =
    customDesc ||
    (discountType === "percentage"
      ? `${value}% off`
      : `${sym}${value.toFixed(0)} off`);

  res.json({
    code: (discount.code as string).trim().toUpperCase(),
    description,
  });
}

const forProductsSchema = z.object({
  productIds: z.array(z.string()).min(1).max(100),
});

export async function getDiscountsForProducts(
  req: Request,
  res: Response
): Promise<void> {
  const parsed = forProductsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const productIds = parsed.data.productIds;
  const db = getDb();
  const now = new Date();

  const productCategoryMap: Record<string, string | null> = {};
  const objectIds = productIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (objectIds.length > 0) {
    const products = await db
      .collection("product")
      .find({ _id: { $in: objectIds } })
      .project({ _id: 1, categoryId: 1 })
      .toArray();
    for (const p of products) {
      productCategoryMap[p._id.toString()] = (p.categoryId as string) ?? null;
    }
  }

  const discounts = await db
    .collection(COLLECTION)
    .find({
      $and: [
        { $or: [{ status: "active" }, { status: "scheduled" }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      ],
    })
    .toArray();

  const currency = "INR";
  const sym = currency === "INR" ? "₹" : "$";
  const result: Record<
    string,
    { code: string; value: number; type: "percentage" | "fixed"; description: string }
  > = {};

  for (const productId of productIds) {
    let best: {
      code: string;
      value: number;
      type: "percentage" | "fixed";
      description: string;
      discountAmount: number;
    } | null = null;

    for (const discount of discounts) {
      const status = discount.status ?? "active";
      const startsAt = discount.startsAt as Date | null | undefined;
      const expiresAt = discount.expiresAt as Date | null | undefined;
      const maxUsage = discount.maxUsage as number | null | undefined;
      const usedCount = (discount.usedCount as number) ?? 0;
      const discountProductIds = (discount.productIds as string[] | undefined) ?? [];

      if (status === "disabled") continue;
      if (startsAt && new Date(startsAt) > now) continue;
      if (expiresAt && new Date(expiresAt) < now) continue;
      if (maxUsage != null && usedCount >= maxUsage) continue;
      const categoryIds = (discount.categoryIds as string[] | undefined) ?? [];
      const productCategoryId = productCategoryMap[productId] ?? null;

      const appliesByProduct =
        discountProductIds.length === 0 || discountProductIds.includes(productId);
      const appliesByCategory =
        categoryIds.length > 0 &&
        productCategoryId != null &&
        categoryIds.includes(productCategoryId);

      if (!appliesByProduct && !appliesByCategory) continue;

      const discountType = discount.type as "percentage" | "fixed";
      const value = (discount.value as number) ?? 0;
      const customDesc = (discount.description as string | undefined)?.trim();
      const description =
        customDesc ||
        (discountType === "percentage"
          ? `${value}% off`
          : `${sym}${value.toFixed(0)} off`);

      const isBetter =
        !best ||
        (discountType === "percentage" && value > best.value) ||
        (discountType === "fixed" && best.type === "percentage");

      if (isBetter) {
        best = {
          code: (discount.code as string).trim().toUpperCase(),
          value,
          type: discountType,
          description,
          discountAmount: value,
        };
      }
    }

    if (best) {
      result[productId] = {
        code: best.code,
        value: best.value,
        type: best.type,
        description: best.description,
      };
    }
  }

  res.json(result);
}
