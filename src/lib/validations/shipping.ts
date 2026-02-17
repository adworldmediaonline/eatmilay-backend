import { z } from "zod";

export const shippingAddressSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  addressLine1: z.string().min(5).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  postalCode: z.string().regex(/^\d{6}$/, "Postal code must be 6 digits"),
  country: z.string().min(2).max(100).default("India"),
});

export type ShippingAddressData = z.infer<typeof shippingAddressSchema>;
