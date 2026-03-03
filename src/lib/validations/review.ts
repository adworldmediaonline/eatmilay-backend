import { z } from "zod";

const objectIdSchema = z.string().refine(
  (val) => /^[a-f\d]{24}$/i.test(val),
  { message: "Invalid ObjectId" }
);

export const productReviewSchema = z.object({
  productId: objectIdSchema,
  orderId: objectIdSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().max(100).optional().nullable(),
  body: z.string().max(2000).optional().nullable(),
});

export const orderReviewSchema = z.object({
  orderId: objectIdSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().max(100).optional().nullable(),
  body: z.string().max(2000).optional().nullable(),
});

export const adminUpdateReviewSchema = z.object({
  status: z.enum(["published", "hidden"]),
});

export type ProductReviewData = z.infer<typeof productReviewSchema>;
export type OrderReviewData = z.infer<typeof orderReviewSchema>;
export type AdminUpdateReviewData = z.infer<typeof adminUpdateReviewSchema>;
