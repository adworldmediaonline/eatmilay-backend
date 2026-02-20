import { getDb } from "../db/mongodb.js";

const COLLECTION = "discount";

export type ValidateDiscountItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type ValidateDiscountResult =
  | { valid: true; discountAmount: number }
  | { valid: false; message: string };

export type ValidateDiscountOptions = {
  customerEmail?: string | null;
  customerReferralCode?: string | null;
  itemCategoryIds?: Record<string, string | null>;
};

export async function validateDiscountForOrder(
  code: string,
  subtotal: number,
  items: ValidateDiscountItem[],
  options?: ValidateDiscountOptions
): Promise<ValidateDiscountResult> {
  const trimmed = code?.trim();
  if (!trimmed) {
    return { valid: false, message: "Invalid or expired coupon code" };
  }

  const normalizedCode = trimmed.toUpperCase();
  const db = getDb();

  const discount = await db.collection(COLLECTION).findOne({
    code: {
      $regex: new RegExp(
        `^${normalizedCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      ),
    },
  });

  if (!discount) {
    return { valid: false, message: "Invalid or expired coupon code" };
  }

  const status = discount.status ?? "active";
  const startsAt = discount.startsAt as Date | null | undefined;
  const now = new Date();

  if (status === "disabled") {
    return { valid: false, message: "This coupon is no longer active" };
  }

  if (status === "scheduled") {
    if (startsAt && new Date(startsAt) > now) {
      return { valid: false, message: "This coupon is not yet active" };
    }
  }

  if (startsAt && new Date(startsAt) > now) {
    return { valid: false, message: "This coupon is not yet active" };
  }

  const expiresAt = discount.expiresAt as Date | null | undefined;
  if (expiresAt && new Date(expiresAt) < now) {
    return { valid: false, message: "This coupon has expired" };
  }

  const maxUsage = discount.maxUsage as number | null | undefined;
  const usedCount = (discount.usedCount as number) ?? 0;
  if (maxUsage != null && usedCount >= maxUsage) {
    return {
      valid: false,
      message: "This coupon has reached its usage limit",
    };
  }

  const firstOrderOnly = (discount.firstOrderOnly as boolean | undefined) ?? false;
  if (firstOrderOnly) {
    const customerEmail = options?.customerEmail?.trim();
    if (!customerEmail) {
      return {
        valid: false,
        message: "Enter your email to use this first-order offer",
      };
    }
    const orderColl = db.collection("order");
    const existingOrder = await orderColl.findOne({
      customerEmail: { $regex: new RegExp(`^${customerEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });
    if (existingOrder) {
      return {
        valid: false,
        message: "This offer is for first-time customers only",
      };
    }
  }

  const referralCode = discount.referralCode as string | null | undefined;
  if (referralCode && referralCode.trim()) {
    const customerRef = options?.customerReferralCode?.trim();
    if (!customerRef || customerRef.toUpperCase() !== referralCode.trim().toUpperCase()) {
      return {
        valid: false,
        message: "This offer requires a referral link",
      };
    }
  }

  const minOrderAmount = discount.minOrderAmount as number | null | undefined;
  if (minOrderAmount != null && minOrderAmount > 0 && subtotal < minOrderAmount) {
    const gap = Math.ceil(minOrderAmount - subtotal);
    return {
      valid: false,
      message: `Min order ₹${minOrderAmount.toFixed(0)} required. Add ₹${gap} more.`,
    };
  }

  const productIds = (discount.productIds as string[] | undefined) ?? [];
  const categoryIds = (discount.categoryIds as string[] | undefined) ?? [];
  const discountType = discount.type as "percentage" | "fixed";
  const value = (discount.value as number) ?? 0;

  let applicableSubtotal = subtotal;
  if (productIds.length > 0) {
    applicableSubtotal = items
      .filter((item) => productIds.includes(item.productId))
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  } else if (categoryIds.length > 0 && options?.itemCategoryIds) {
    applicableSubtotal = items
      .filter((item) => {
        const catId = options.itemCategoryIds?.[item.productId];
        return catId && categoryIds.includes(catId);
      })
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }

  if (applicableSubtotal <= 0) {
    return {
      valid: false,
      message: "This coupon does not apply to any items in your cart",
    };
  }

  let discountAmount: number;
  if (discountType === "percentage") {
    discountAmount =
      Math.round((applicableSubtotal * (value / 100)) * 100) / 100;
  } else {
    discountAmount = Math.min(value, applicableSubtotal);
  }

  return { valid: true, discountAmount };
}
