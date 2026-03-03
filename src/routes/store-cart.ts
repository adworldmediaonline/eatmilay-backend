import type { Response } from "express";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

const COLLECTION = "cart";

const cartItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productSlug: z.string(),
  variantIndex: z.number().int().min(0).optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  lineTotal: z.number().min(0),
  image: z
    .object({
      url: z.string(),
      publicId: z.string(),
    })
    .optional()
    .nullable(),
});

const putCartSchema = z.object({
  items: z.array(cartItemSchema),
  couponCode: z.string().max(50).optional().nullable(),
  discountAmount: z.number().min(0).optional(),
});

const patchReminderEmailSchema = z.object({
  email: z.string().email(),
});

export async function putCart(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.session?.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = putCartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { items, couponCode, discountAmount } = parsed.data;
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const now = new Date();

  const db = getDb();
  const existing = await db.collection(COLLECTION).findOne({ customerId: userId });

  const itemsEqual =
    existing?.items &&
    Array.isArray(existing.items) &&
    existing.items.length === items.length &&
    items.every((item, i) => {
      const existingItem = (existing.items as typeof items)[i];
      return (
        existingItem?.productId === item.productId &&
        (existingItem?.variantIndex ?? -1) === (item.variantIndex ?? -1) &&
        existingItem?.quantity === item.quantity
      );
    });
  const couponEqual =
    (existing?.couponCode ?? null) === (couponCode ?? null) &&
    (existing?.discountAmount ?? 0) === (discountAmount ?? 0);
  const contentUnchanged = itemsEqual && couponEqual;

  const updateFields: Record<string, unknown> = {
    items,
    subtotal,
    couponCode: couponCode ?? null,
    discountAmount: discountAmount ?? 0,
    updatedAt: now,
  };
  if (!existing || !contentUnchanged) {
    updateFields.lastUpdated = now;
  }

  const setOnInsert: Record<string, unknown> = {
    customerId: userId,
    createdAt: now,
  };

  await db.collection(COLLECTION).updateOne(
    { customerId: userId },
    {
      $set: updateFields,
      $setOnInsert: setOnInsert,
    },
    { upsert: true }
  );

  res.status(200).json({ ok: true });
}

export async function patchReminderEmail(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.session?.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = patchReminderEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const result = await db.collection(COLLECTION).updateOne(
    { customerId: userId },
    { $set: { reminderEmail: parsed.data.email.trim().toLowerCase(), updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    res.status(404).json({ error: "Cart not found" });
    return;
  }

  res.status(200).json({ ok: true });
}
