import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";
import { slugify } from "../utils/slugify.js";
import {
  sanitizeProductImages,
  type ProductDoc,
} from "../utils/cloudinary-validate.js";

const COLLECTION = "product";

const imageSchema = z.object({
  url: z.string().url(),
  publicId: z.string(),
  filename: z.string().optional(),
  title: z.string().optional(),
  alt: z.string().optional(),
});

const optionSchema = z.object({
  name: z.string().min(1).max(50),
  values: z.array(z.string().min(1).max(50)).min(1),
});

const volumeTierSchema = z.object({
  minQuantity: z.number().int().min(1),
  maxQuantity: z.number().int().min(1).optional().nullable(),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).optional().nullable(),
  label: z.enum(["most_popular", "best_seller", "super_saver"]).optional().nullable(),
});

const variantSchema = z.object({
  optionValues: z.array(z.string()),
  sku: z.string().max(100).optional(),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).optional().nullable(),
  label: z.enum(["most_popular"]).optional().nullable(),
  volumeTiers: z.array(volumeTierSchema).optional(),
  stockQuantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).optional().nullable(),
  allowBackorder: z.boolean().default(false),
});

const bundleItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  priceOverride: z.number().min(0).optional().nullable(),
});

const productBaseSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-_]+$/).optional(),
  description: z.string().optional(),
  nutrients: z.string().optional(),
  benefits: z.string().optional(),
  shortDescription: z.string().max(500).optional(),
  categoryId: z.string().optional(),
  price: z.number().min(0).optional(),
  compareAtPrice: z.number().min(0).optional().nullable(),
  status: z.enum(["draft", "published"]).default("draft"),
  images: z.array(imageSchema).default([]),
  sku: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  metaKeywords: z.string().max(500).optional(),
  currency: z.string().max(5).optional(),
  vendor: z.string().max(100).optional(),
  productType: z.enum(["simple", "variable", "bundle"]).default("simple"),
  options: z.array(optionSchema).optional(),
  variants: z.array(variantSchema).optional(),
  bundleItems: z.array(bundleItemSchema).optional(),
  bundlePricing: z.enum(["fixed", "sum", "discounted"]).optional(),
  bundlePrice: z.number().min(0).optional(),
  bundleDiscountPercent: z.number().min(0).max(100).optional(),
  volumeTiers: z.array(volumeTierSchema).optional(),
  trackInventory: z.boolean().default(true),
  stockQuantity: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional().nullable(),
  allowBackorder: z.boolean().optional(),
  relatedProductIds: z.array(z.string()).optional(),
});

const createSchema = productBaseSchema.refine(
  (data) => {
    if (data.productType === "simple") return data.price != null && data.price >= 0;
    if (data.productType === "variable")
      return (data.variants?.length ?? 0) > 0 && data.variants?.every((v) => v.price >= 0);
    if (data.productType === "bundle")
      return (
        (data.bundleItems?.length ?? 0) > 0 &&
        (data.bundlePricing === "fixed" ? data.bundlePrice != null : true)
      );
    return true;
  },
  { message: "Invalid pricing for product type", path: ["price"] }
);

const updateSchema = productBaseSchema.partial();

export async function listProducts(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db = getDb();
  const status = req.query.status as string | undefined;
  const categoryId = req.query.categoryId as string | undefined;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (categoryId && ObjectId.isValid(categoryId)) {
    filter.categoryId = categoryId;
  }

  const rawItems = await db
    .collection(COLLECTION)
    .find(filter)
    .sort({ updatedAt: -1 })
    .toArray();

  const items = await Promise.all(
    rawItems.map((r) => sanitizeProductImages(db, r as ProductDoc))
  );

  const categoryIds = [
    ...new Set(
      items
        .map((p: ProductDoc) => p.categoryId)
        .filter((id): id is string => !!id && typeof id === "string" && ObjectId.isValid(id)),
    ),
  ];
  const categories =
    categoryIds.length > 0
      ? await db
          .collection("product_category")
          .find({ _id: { $in: categoryIds.map((id) => new ObjectId(id)) } })
          .toArray()
      : [];
  const categoryMap = Object.fromEntries(
    categories.map((c) => [c._id.toString(), c.name as string])
  );

  res.json(
    items.map((r: ProductDoc) => ({
      id: r._id.toString(),
      name: r.name,
      slug: r.slug,
      description: r.description ?? "",
      shortDescription: r.shortDescription ?? "",
      categoryId: r.categoryId ?? null,
      categoryName: r.categoryId ? categoryMap[r.categoryId] : null,
      price: r.price,
      compareAtPrice: r.compareAtPrice ?? null,
      status: r.status,
      images: r.images ?? [],
      sku: r.sku ?? null,
      tags: r.tags ?? [],
      metaTitle: r.metaTitle ?? null,
      metaDescription: r.metaDescription ?? null,
      metaKeywords: r.metaKeywords ?? null,
      currency: r.currency ?? "USD",
      vendor: r.vendor ?? null,
      productType: r.productType ?? "simple",
      options: r.options ?? [],
      variants: r.variants ?? [],
      bundleItems: r.bundleItems ?? [],
      bundlePricing: r.bundlePricing ?? null,
      bundlePrice: r.bundlePrice ?? null,
      bundleDiscountPercent: r.bundleDiscountPercent ?? null,
      volumeTiers: r.volumeTiers ?? [],
      trackInventory: r.trackInventory ?? true,
      stockQuantity: r.stockQuantity ?? 0,
      lowStockThreshold: r.lowStockThreshold ?? null,
      allowBackorder: r.allowBackorder ?? false,
      relatedProductIds: r.relatedProductIds ?? [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  );
}

export async function createProduct(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const slug = parsed.data.slug ?? slugify(parsed.data.name);

  const existing = await db.collection(COLLECTION).findOne({ slug });
  if (existing) {
    res.status(409).json({ error: "Product with this slug already exists" });
    return;
  }

  if (parsed.data.categoryId && !ObjectId.isValid(parsed.data.categoryId)) {
    res.status(400).json({ error: "Invalid category ID" });
    return;
  }

  let price = parsed.data.price ?? 0;
  if (parsed.data.price == null && parsed.data.productType === "variable" && parsed.data.variants?.length) {
    price = Math.min(...parsed.data.variants.map((v) => v.price));
  } else if (parsed.data.price == null && parsed.data.productType === "bundle" && parsed.data.bundleItems?.length) {
    if (parsed.data.bundlePricing === "fixed" && parsed.data.bundlePrice != null) {
      price = parsed.data.bundlePrice;
    } else {
      const productIds = [...new Set(parsed.data.bundleItems.map((b) => b.productId))];
      const products = await db
        .collection(COLLECTION)
        .find({ _id: { $in: productIds.map((id) => new ObjectId(id)) } })
        .toArray();
      const priceMap = Object.fromEntries(
        products.map((p) => [p._id.toString(), p.price as number])
      );
      let sum = 0;
      for (const item of parsed.data.bundleItems) {
        const unitPrice = item.priceOverride ?? priceMap[item.productId] ?? 0;
        sum += unitPrice * item.quantity;
      }
      if (parsed.data.bundlePricing === "discounted" && parsed.data.bundleDiscountPercent != null) {
        sum *= 1 - parsed.data.bundleDiscountPercent / 100;
      }
      price = sum;
    }
  }

  const doc = {
    name: parsed.data.name,
    slug,
    description: parsed.data.description ?? "",
    nutrients: parsed.data.nutrients ?? "",
    benefits: parsed.data.benefits ?? "",
    shortDescription: parsed.data.shortDescription ?? "",
    categoryId: parsed.data.categoryId ?? null,
    price,
    compareAtPrice: parsed.data.compareAtPrice ?? null,
    status: parsed.data.status ?? "draft",
    images: parsed.data.images ?? [],
    sku: parsed.data.sku ?? null,
    tags: parsed.data.tags ?? [],
    metaTitle: parsed.data.metaTitle ?? null,
    metaDescription: parsed.data.metaDescription ?? null,
    metaKeywords: parsed.data.metaKeywords ?? null,
    currency: parsed.data.currency ?? "USD",
    vendor: parsed.data.vendor ?? null,
    productType: parsed.data.productType ?? "simple",
    options: parsed.data.options ?? [],
    variants: parsed.data.variants ?? [],
    bundleItems: parsed.data.bundleItems ?? [],
    bundlePricing: parsed.data.bundlePricing ?? null,
    bundlePrice: parsed.data.bundlePrice ?? null,
    bundleDiscountPercent: parsed.data.bundleDiscountPercent ?? null,
    volumeTiers: parsed.data.volumeTiers ?? [],
    trackInventory: parsed.data.trackInventory ?? true,
    stockQuantity: parsed.data.stockQuantity ?? 0,
    lowStockThreshold: parsed.data.lowStockThreshold ?? null,
    allowBackorder: parsed.data.allowBackorder ?? false,
    relatedProductIds: parsed.data.relatedProductIds ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  res.status(201).json({
    id: result.insertedId.toString(),
    ...doc,
  });
}

export async function getProduct(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  const db = getDb();
  const rawItem = await db.collection(COLLECTION).findOne({
    _id: new ObjectId(id),
  });
  if (!rawItem) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const item = await sanitizeProductImages(db, rawItem as ProductDoc);

  let categoryName: string | null = null;
  if (item.categoryId) {
    const cat = await db.collection("product_category").findOne({
      _id: new ObjectId(item.categoryId),
    });
    categoryName = cat?.name ?? null;
  }

  let bundleItemsEnriched = item.bundleItems ?? [];
  if (bundleItemsEnriched.length > 0) {
    const productIds = [...new Set(bundleItemsEnriched.map((b) => b.productId))];
    const products = await db
      .collection(COLLECTION)
      .find({ _id: { $in: productIds.map((id) => new ObjectId(id)) } })
      .toArray();
    const productMap = Object.fromEntries(
      products.map((p) => [p._id.toString(), p.name as string])
    );
    bundleItemsEnriched = bundleItemsEnriched.map((b) => ({
      ...b,
      productName: productMap[b.productId] ?? "Unknown",
    }));
  }

  let relatedProducts: Array<{ id: string; name: string; price: number; image: { url: string } | null }> = [];
  const relatedIds = item.relatedProductIds ?? [];
  if (relatedIds.length > 0) {
    const validIds = relatedIds.filter((id) => ObjectId.isValid(id));
    if (validIds.length > 0) {
      const products = await db
        .collection(COLLECTION)
        .find({ _id: { $in: validIds.map((id) => new ObjectId(id)) } })
        .toArray();
      relatedProducts = products.map((p) => ({
        id: p._id.toString(),
        name: (p.name as string) ?? "Unknown",
        price: (p.price as number) ?? 0,
        image: (p.images as Array<{ url: string }>)?.[0] ?? null,
      }));
    }
  }

  res.json({
    id: item._id.toString(),
    name: item.name,
    slug: item.slug,
    description: item.description ?? "",
    nutrients: item.nutrients ?? "",
    benefits: item.benefits ?? "",
    shortDescription: item.shortDescription ?? "",
    categoryId: item.categoryId ?? null,
    categoryName,
    price: item.price,
    compareAtPrice: item.compareAtPrice ?? null,
    status: item.status,
    images: item.images ?? [],
    sku: item.sku ?? null,
    tags: item.tags ?? [],
    metaTitle: item.metaTitle ?? null,
    metaDescription: item.metaDescription ?? null,
    metaKeywords: item.metaKeywords ?? null,
    currency: item.currency ?? "USD",
    vendor: item.vendor ?? null,
    productType: item.productType ?? "simple",
    options: item.options ?? [],
    variants: item.variants ?? [],
    bundleItems: bundleItemsEnriched,
    bundlePricing: item.bundlePricing ?? null,
    bundlePrice: item.bundlePrice ?? null,
    bundleDiscountPercent: item.bundleDiscountPercent ?? null,
    volumeTiers: item.volumeTiers ?? [],
    trackInventory: item.trackInventory ?? true,
    stockQuantity: item.stockQuantity ?? 0,
    lowStockThreshold: item.lowStockThreshold ?? null,
    allowBackorder: item.allowBackorder ?? false,
    relatedProductIds: relatedIds,
    relatedProducts,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}

export async function updateProduct(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const update: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  if (parsed.data.slug) {
    const existing = await db.collection(COLLECTION).findOne({
      slug: parsed.data.slug,
      _id: { $ne: new ObjectId(id) },
    });
    if (existing) {
      res.status(409).json({ error: "Product with this slug already exists" });
      return;
    }
  }

  if (parsed.data.name && !parsed.data.slug) {
    update.slug = slugify(parsed.data.name);
  }

  if (parsed.data.categoryId && !ObjectId.isValid(parsed.data.categoryId)) {
    res.status(400).json({ error: "Invalid category ID" });
    return;
  }

  if (parsed.data.price == null && "variants" in parsed.data) {
    const variants = parsed.data.variants;
    if (variants?.length) {
      update.price = Math.min(...variants.map((v) => v.price));
    }
  }
  if (
    parsed.data.price == null &&
    "bundleItems" in parsed.data &&
    parsed.data.bundleItems?.length
  ) {
    if (parsed.data.bundlePricing === "fixed" && parsed.data.bundlePrice != null) {
      update.price = parsed.data.bundlePrice;
    } else {
      const productIds = [...new Set(parsed.data.bundleItems.map((b) => b.productId))];
      const products = await db
        .collection(COLLECTION)
        .find({ _id: { $in: productIds.map((pid) => new ObjectId(pid)) } })
        .toArray();
      const priceMap = Object.fromEntries(
        products.map((p) => [p._id.toString(), p.price as number])
      );
      let sum = 0;
      for (const item of parsed.data.bundleItems) {
        const unitPrice = item.priceOverride ?? priceMap[item.productId] ?? 0;
        sum += unitPrice * item.quantity;
      }
      if (
        parsed.data.bundlePricing === "discounted" &&
        parsed.data.bundleDiscountPercent != null
      ) {
        sum *= 1 - parsed.data.bundleDiscountPercent / 100;
      }
      update.price = sum;
    }
  }

  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  let categoryName: string | null = null;
  if (result.categoryId) {
    const cat = await db.collection("product_category").findOne({
      _id: new ObjectId(result.categoryId),
    });
    categoryName = cat?.name ?? null;
  }

  res.json({
    id: result._id.toString(),
    name: result.name,
    slug: result.slug,
    description: result.description ?? "",
    nutrients: result.nutrients ?? "",
    benefits: result.benefits ?? "",
    shortDescription: result.shortDescription ?? "",
    categoryId: result.categoryId ?? null,
    categoryName,
    price: result.price,
    compareAtPrice: result.compareAtPrice ?? null,
    status: result.status,
    images: result.images ?? [],
    sku: result.sku ?? null,
    tags: result.tags ?? [],
    metaTitle: result.metaTitle ?? null,
    metaDescription: result.metaDescription ?? null,
    metaKeywords: result.metaKeywords ?? null,
    currency: result.currency ?? "USD",
    vendor: result.vendor ?? null,
    productType: result.productType ?? "simple",
    options: result.options ?? [],
    variants: result.variants ?? [],
    bundleItems: result.bundleItems ?? [],
    bundlePricing: result.bundlePricing ?? null,
    bundlePrice: result.bundlePrice ?? null,
    bundleDiscountPercent: result.bundleDiscountPercent ?? null,
    volumeTiers: result.volumeTiers ?? [],
    trackInventory: result.trackInventory ?? true,
    stockQuantity: result.stockQuantity ?? 0,
    lowStockThreshold: result.lowStockThreshold ?? null,
    allowBackorder: result.allowBackorder ?? false,
    relatedProductIds: result.relatedProductIds ?? [],
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  });
}

export async function checkSlugAvailability(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const slug = req.query.slug as string | undefined;
  const excludeId = req.query.excludeId as string | undefined;

  if (!slug?.trim()) {
    res.status(400).json({ error: "Slug is required" });
    return;
  }

  const normalized = slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
  if (normalized.length === 0) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }

  const db = getDb();
  const filter: Record<string, unknown> = { slug: normalized };
  if (excludeId && ObjectId.isValid(excludeId)) {
    filter._id = { $ne: new ObjectId(excludeId) };
  }

  const existing = await db.collection(COLLECTION).findOne(filter);
  res.json({ available: !existing });
}

export async function duplicateProduct(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  const db = getDb();
  const rawItem = await db.collection(COLLECTION).findOne({
    _id: new ObjectId(id),
  });
  if (!rawItem) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const item = rawItem as ProductDoc & { name: string; slug: string };
  const baseName = item.name;
  let slug = slugify(baseName);
  let suffix = 1;

  while (await db.collection(COLLECTION).findOne({ slug })) {
    slug = `${slugify(baseName)}-${suffix}`;
    suffix += 1;
  }

  const doc = {
    name: `${baseName} (Copy)`,
    slug,
    description: item.description ?? "",
    nutrients: item.nutrients ?? "",
    benefits: item.benefits ?? "",
    shortDescription: item.shortDescription ?? "",
    categoryId: item.categoryId ?? null,
    price: item.price,
    compareAtPrice: item.compareAtPrice ?? null,
    status: "draft" as const,
    images: item.images ?? [],
    sku: item.sku ?? null,
    tags: item.tags ?? [],
    metaTitle: item.metaTitle ?? null,
    metaDescription: item.metaDescription ?? null,
    metaKeywords: item.metaKeywords ?? null,
    currency: item.currency ?? "USD",
    vendor: item.vendor ?? null,
    productType: item.productType ?? "simple",
    options: item.options ?? [],
    variants: item.variants ?? [],
    bundleItems: item.bundleItems ?? [],
    bundlePricing: item.bundlePricing ?? null,
    bundlePrice: item.bundlePrice ?? null,
    bundleDiscountPercent: item.bundleDiscountPercent ?? null,
    volumeTiers: item.volumeTiers ?? [],
    trackInventory: item.trackInventory ?? true,
    stockQuantity: item.stockQuantity ?? 0,
    lowStockThreshold: item.lowStockThreshold ?? null,
    allowBackorder: item.allowBackorder ?? false,
    relatedProductIds: item.relatedProductIds ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  const newItem = await sanitizeProductImages(db, {
    ...doc,
    _id: result.insertedId,
  } as ProductDoc);

  let categoryName: string | null = null;
  if (newItem.categoryId) {
    const cat = await db.collection("product_category").findOne({
      _id: new ObjectId(newItem.categoryId),
    });
    categoryName = cat?.name ?? null;
  }

  res.status(201).json({
    id: newItem._id.toString(),
    name: newItem.name,
    slug: newItem.slug,
    description: newItem.description ?? "",
    nutrients: newItem.nutrients ?? "",
    benefits: newItem.benefits ?? "",
    shortDescription: newItem.shortDescription ?? "",
    categoryId: newItem.categoryId ?? null,
    categoryName,
    price: newItem.price,
    compareAtPrice: newItem.compareAtPrice ?? null,
    status: newItem.status,
    images: newItem.images ?? [],
    sku: newItem.sku ?? null,
    tags: newItem.tags ?? [],
    metaTitle: newItem.metaTitle ?? null,
    metaDescription: newItem.metaDescription ?? null,
    metaKeywords: newItem.metaKeywords ?? null,
    currency: newItem.currency ?? "USD",
    vendor: newItem.vendor ?? null,
    productType: newItem.productType ?? "simple",
    options: newItem.options ?? [],
    variants: newItem.variants ?? [],
    bundleItems: newItem.bundleItems ?? [],
    bundlePricing: newItem.bundlePricing ?? null,
    bundlePrice: newItem.bundlePrice ?? null,
    bundleDiscountPercent: newItem.bundleDiscountPercent ?? null,
    volumeTiers: newItem.volumeTiers ?? [],
    trackInventory: newItem.trackInventory ?? true,
    stockQuantity: newItem.stockQuantity ?? 0,
    lowStockThreshold: newItem.lowStockThreshold ?? null,
    allowBackorder: newItem.allowBackorder ?? false,
    relatedProductIds: newItem.relatedProductIds ?? [],
    createdAt: newItem.createdAt,
    updatedAt: newItem.updatedAt,
  });
}

export async function deleteProduct(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  const db = getDb();
  const result = await db.collection(COLLECTION).deleteOne({
    _id: new ObjectId(id),
  });

  if (result.deletedCount === 0) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.status(204).send();
}
