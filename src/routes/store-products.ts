import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import {
  sanitizeProductImages,
  type ProductDoc,
} from "../utils/cloudinary-validate.js";
import { storeProductQuerySchema } from "../lib/validations/product-query.js";

const COLLECTION = "product";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapProduct(r: ProductDoc, categoryMap: Record<string, string>) {
  return {
    id: r._id.toString(),
    name: r.name,
    slug: r.slug,
    description: r.description ?? "",
    shortDescription: r.shortDescription ?? "",
    categoryId: r.categoryId ?? null,
    categoryName: r.categoryId ? categoryMap[r.categoryId] : null,
    price: r.price,
    compareAtPrice: r.compareAtPrice ?? null,
    images: r.images ?? [],
    sku: r.sku ?? null,
    tags: r.tags ?? [],
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
  };
}

export async function listStoreProducts(
  req: Request,
  res: Response
): Promise<void> {
  const parsed = storeProductQuerySchema.safeParse(req.query);
  const params = parsed.success ? parsed.data : storeProductQuerySchema.parse({});

  const db = getDb();
  const filter: Record<string, unknown> = { status: "published" };

  if (params.categoryId && ObjectId.isValid(params.categoryId)) {
    filter.categoryId = params.categoryId;
  }

  if (params.collectionId && ObjectId.isValid(params.collectionId)) {
    const collection = await db.collection("product_collection").findOne({
      _id: new ObjectId(params.collectionId),
    });
    const productIds = (collection?.productIds as string[] | undefined) ?? [];
    const validIds = productIds.filter((id) => ObjectId.isValid(id));
    if (validIds.length > 0) {
      filter._id = { $in: validIds.map((id) => new ObjectId(id)) };
    } else {
      filter._id = { $in: [] };
    }
  }

  const search = params.search?.trim();
  if (search && search.length >= 2) {
    const escaped = escapeRegex(search);
    const regex = new RegExp(escaped, "i");
    filter.$or = [
      { name: regex },
      { slug: regex },
      ...(search.length <= 50 ? [{ sku: regex }] : []),
    ];
  }

  const minPrice =
    params.minPrice != null && params.minPrice >= 0 ? params.minPrice : null;
  const maxPrice =
    params.maxPrice != null && params.maxPrice >= 0 ? params.maxPrice : null;

  if (minPrice != null || maxPrice != null) {
    const effectiveMin = minPrice ?? 0;
    const effectiveMax =
      minPrice != null && maxPrice != null && maxPrice < minPrice
        ? minPrice
        : maxPrice ?? Number.MAX_SAFE_INTEGER;
    filter.$and = filter.$and ?? [];
    (filter.$and as unknown[]).push({
      $or: [
        { price: { $gte: effectiveMin, $lte: effectiveMax } },
        { "variants.price": { $gte: effectiveMin, $lte: effectiveMax } },
        { bundlePrice: { $gte: effectiveMin, $lte: effectiveMax } },
      ],
    });
  }

  if (params.tags?.trim()) {
    const tags = params.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= 50);
    if (tags.length > 0) {
      filter.tags = { $in: tags };
    }
  }

  if (params.vendor?.trim()) {
    filter.vendor = params.vendor.trim();
  }

  if (params.productType) {
    filter.productType = params.productType;
  }

  if (params.inStock === true) {
    filter.$and = filter.$and ?? [];
    (filter.$and as unknown[]).push({
      $or: [
        { trackInventory: { $ne: true } },
        { stockQuantity: { $gt: 0 } },
        { allowBackorder: true },
        { "variants.stockQuantity": { $gt: 0 } },
        { "variants.allowBackorder": true },
      ],
    });
  }

  const sortField =
    params.sortBy === "newest" ? "updatedAt" : params.sortBy ?? "updatedAt";
  const sortOrder = params.sortOrder === "asc" ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

  const [total, rawItems] = await Promise.all([
    db.collection(COLLECTION).countDocuments(filter),
    db
      .collection(COLLECTION)
      .find(filter)
      .sort(sort)
      .skip(params.offset)
      .limit(params.limit)
      .toArray(),
  ]);

  const items = rawItems as ProductDoc[];

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

  res.json({
    items: items.map((r) => mapProduct(r, categoryMap)),
    total,
  });
}

export async function getStoreProductFacets(
  _req: Request,
  res: Response
): Promise<void> {
  const db = getDb();
  const baseFilter = { status: "published" };

  const [tagsResult, vendorsResult] = await Promise.all([
    db
      .collection(COLLECTION)
      .aggregate<{ _id: string }>([
        { $match: baseFilter },
        { $unwind: { path: "$tags", preserveNullAndEmptyArrays: false } },
        { $group: { _id: "$tags" } },
        { $sort: { _id: 1 } },
        { $limit: 100 },
      ])
      .toArray(),
    db
      .collection(COLLECTION)
      .distinct("vendor", {
        ...baseFilter,
        vendor: { $exists: true, $nin: [null, ""] },
      }),
  ]);

  const tags = tagsResult.map((t) => t._id).filter((t): t is string => typeof t === "string");
  const vendors = (vendorsResult as string[]).filter(Boolean).sort();

  res.json({ tags, vendors });
}

export async function getStoreProductBySlug(
  req: Request,
  res: Response
): Promise<void> {
  const slug = req.params.slug;
  if (!slug?.trim()) {
    res.status(400).json({ error: "Slug is required" });
    return;
  }

  const db = getDb();
  const rawItem = await db.collection(COLLECTION).findOne({
    slug: slug.trim(),
    status: "published",
  });
  if (!rawItem) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const item = await sanitizeProductImages(db, rawItem as ProductDoc);

  let categoryName: string | null = null;
  let categorySlug: string | null = null;
  if (item.categoryId) {
    const cat = await db.collection("product_category").findOne({
      _id: new ObjectId(item.categoryId),
    });
    categoryName = cat?.name ?? null;
    categorySlug = cat?.slug ?? null;
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

  let relatedProducts: Array<{ id: string; slug: string; name: string; price: number; image: { url: string } | null }> = [];
  const relatedIds = item.relatedProductIds ?? [];
  if (relatedIds.length > 0) {
    const validIds = relatedIds.filter((id) => ObjectId.isValid(id));
    if (validIds.length > 0) {
      const products = await db
        .collection(COLLECTION)
        .find({
          _id: { $in: validIds.map((id) => new ObjectId(id)) },
          status: "published",
        })
        .toArray();
      relatedProducts = products.map((p) => ({
        id: p._id.toString(),
        slug: (p.slug as string) ?? p._id.toString(),
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
    categorySlug,
    price: item.price,
    compareAtPrice: item.compareAtPrice ?? null,
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
  });
}
