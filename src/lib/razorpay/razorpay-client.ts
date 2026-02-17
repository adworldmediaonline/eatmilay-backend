/**
 * Razorpay order creation
 */

import Razorpay from "razorpay";

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
};

function getRazorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export async function createRazorpayOrder(
  amount: number,
  receipt: string,
  notes?: Record<string, string>
): Promise<RazorpayOrder> {
  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: Math.round(amount * 100), // Convert to paise
    currency: "INR",
    receipt,
    notes: notes ?? {},
  });
  return order as RazorpayOrder;
}
