import { z } from "zod";
import { shippingAddressSchema } from "./shipping.js";

const orderItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  variantIndex: z.number().int().min(0).optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  lineTotal: z.number().min(0),
});

export const createOrderSchema = z.object({
  customerId: z.string().optional().nullable(),
  customerEmail: z.string().email(),
  customerName: z.string().max(200).optional().nullable(),
  items: z.array(orderItemSchema).min(1),
  subtotal: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  total: z.number().min(0),
  currency: z.string().max(5).default("INR"),
  couponCode: z.string().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(["razorpay", "cod"]),
  shippingAmount: z.number().min(0).default(0),
  courierId: z.number().optional(),
  courierName: z.string().optional(),
  estimatedDelivery: z.string().optional(),
});

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export type CreateOrderData = z.infer<typeof createOrderSchema>;
export type VerifyPaymentData = z.infer<typeof verifyPaymentSchema>;
