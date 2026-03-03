import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import { env } from "../config/env.js";
import { sendEmail } from "../lib/email/send-email.js";
import { renderAbandonedCart } from "../lib/email/templates/abandoned-cart.js";

function isTempEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return true;
  return /^temp[-.]?[^@]*@/i.test(email) || email.includes("temp@");
}

export async function sendAbandonedCartEmails(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const cutoff = new Date(Date.now() - env.ABANDONED_CART_MINUTES * 60 * 1000);
  const storeUrl = env.FRONTEND_USER_URL ?? env.FRONTEND_URL;

  console.log("[AbandonedCart] Run started", {
    now: now.toISOString(),
    cutoff: cutoff.toISOString(),
    cutoffMinutes: env.ABANDONED_CART_MINUTES,
  });

  const carts = await db
    .collection("cart")
    .find({
      lastUpdated: { $lt: cutoff },
      $or: [{ emailSentAt: null }, { emailSentAt: { $exists: false } }],
      $expr: { $gt: [{ $size: { $ifNull: ["$items", []] } }, 0] },
    })
    .toArray();

  console.log("[AbandonedCart] Query result", {
    cartsFound: carts.length,
    cartIds: carts.map((c) => ({ customerId: c.customerId, lastUpdated: c.lastUpdated })),
  });

  for (const cart of carts) {
    const items = (cart.items ?? []) as Array<{
      productName: string;
      productSlug: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;
    if (items.length === 0) continue;

    let toEmail: string | null = null;
    let customerName: string | null = null;

    let skipReason: string | null = null;
    if (cart.reminderEmail && typeof cart.reminderEmail === "string") {
      toEmail = cart.reminderEmail.trim().toLowerCase();
    } else if (cart.customerId) {
      let user =
        ObjectId.isValid(cart.customerId) && String(cart.customerId).length === 24
          ? await db
              .collection("user")
              .findOne({ _id: new ObjectId(cart.customerId) })
          : await db.collection("user").findOne({ _id: cart.customerId });
      if (!user) {
        skipReason = "user_not_found";
      } else if (user.isAnonymous === true) {
        skipReason = "user_anonymous";
      } else if (!user.email || isTempEmail(user.email)) {
        skipReason = "no_real_email";
      } else {
        toEmail = (user.email as string).trim().toLowerCase();
        customerName = (user.name as string) ?? null;
      }
    } else {
      skipReason = "no_customer_id";
    }

    if (!toEmail) {
      console.log("[AbandonedCart] Skip cart", {
        customerId: cart.customerId,
        reminderEmail: cart.reminderEmail ?? null,
        skipReason,
      });
      continue;
    }

    console.log("[AbandonedCart] Sending", {
      to: toEmail,
      customerId: cart.customerId,
      itemCount: items.length,
    });

    const subtotal = cart.subtotal ?? items.reduce((s, i) => s + (i.lineTotal ?? 0), 0);
    const discountAmount = cart.discountAmount ?? 0;

    const { html, text } = renderAbandonedCart({
      customerEmail: toEmail,
      customerName,
      items,
      subtotal,
      discountAmount,
      currency: "INR",
      storeUrl,
    });

    try {
      await sendEmail({
        to: toEmail,
        subject: "Your cart is waiting – Eat Milay",
        html,
        text,
      });
    } catch (err) {
      console.error("[AbandonedCart] Send failed", {
        to: toEmail,
        customerId: cart.customerId,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    await db.collection("cart").updateOne(
      { _id: cart._id },
      { $set: { emailSentAt: new Date(), updatedAt: new Date() } }
    );

    console.log("[AbandonedCart] Sent and marked", {
      to: toEmail,
      customerId: cart.customerId,
    });
  }

  console.log("[AbandonedCart] Run completed");
}
