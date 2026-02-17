import type { Request, Response } from "express";
import { z } from "zod";
import { checkServiceability } from "../lib/shiprocket/shiprocket-rates.js";

const ratesQuerySchema = z.object({
  pickup_postcode: z.string().regex(/^\d{6}$/, "Pickup postcode must be 6 digits"),
  delivery_postcode: z.string().regex(/^\d{6}$/, "Delivery postcode must be 6 digits"),
  cod: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  weight: z.string().optional(),
  length: z.coerce.number().min(0).optional(),
  breadth: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
});

export async function getShippingRates(req: Request, res: Response): Promise<void> {
  const parsed = ratesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { pickup_postcode, delivery_postcode, cod, weight, length, breadth, height } = parsed.data;

  try {
    const result = await checkServiceability({
      pickup_postcode,
      delivery_postcode,
      cod: cod ?? false,
      weight: weight ?? "0.5",
      length,
      breadth,
      height,
    });

    const companies = result.data?.available_courier_companies ?? [];
    const recommendedId = result.data?.recommended_courier_company_id ?? companies[0]?.courier_company_id;

    res.json({
      available_courier_companies: companies,
      recommended_courier_company_id: recommendedId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch shipping rates";
    res.status(500).json({ error: message });
  }
}
