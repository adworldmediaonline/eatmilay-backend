import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongodb.js";
import {
  sanitizeProductImages,
  type ProductDoc,
} from "../utils/cloudinary-validate.js";

const COLLECTION = "product";

export async function listStoreProducts(
  req: Request,
  res: Response
): Promise<void> {
  const db = getDb();
  const categoryId = req.query.categoryId as string | undefined;
  const collectionId = req.query.collectionId as string | undefined;
  const limit = Math.min(
    Math.max(parseInt(req.query.limit as string, 10) || 50, 1),
    100
  );
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

  const filter: Record<string, unknown> = { status: "published" };

  if (categoryId && ObjectId.isValid(categoryId)) {
    filter.categoryId = categoryId;
  }

  if (collectionId && ObjectId.isValid(collectionId)) {
    const collection = await db.collection("product_collection").findOne({
      _id: new ObjectId(collectionId),
    });
    const productIds = (collection?.productIds as string[] | undefined) ?? [];
    const validIds = productIds.filter((id) => ObjectId.isValid(id));
    if (validIds.length > 0) {
      filter._id = { $in: validIds.map((id) => new ObjectId(id)) };
    } else {
      filter._id = { $in: [] };
    }
  }

  const rawItems = await db
    .collection(COLLECTION)
    .find(filter)
    .sort({ updatedAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

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
    }))
  );
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
