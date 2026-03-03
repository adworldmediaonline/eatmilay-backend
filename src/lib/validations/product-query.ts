import { z } from "zod";

const SORT_BY = ["price", "name", "updatedAt", "newest"] as const;
const SORT_ORDER = ["asc", "desc"] as const;
const PRODUCT_TYPES = ["simple", "variable", "bundle"] as const;

export const storeProductQuerySchema = z.object({
  categoryId: z.string().optional(),
  collectionId: z.string().optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(SORT_BY).optional(),
  sortOrder: z.enum(SORT_ORDER).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  tags: z.string().max(500).optional(),
  vendor: z.string().max(100).optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  inStock: z
    .union([z.literal("true"), z.literal("1"), z.boolean()])
    .optional()
    .transform((v) => (v === true || v === "true" || v === "1" ? true : undefined)),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type StoreProductQuery = z.infer<typeof storeProductQuerySchema>;
