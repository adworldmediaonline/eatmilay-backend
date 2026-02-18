import { getDb } from "./mongodb.js";

/**
 * Ensure product collection has indexes for fast list/search/sort queries.
 * Safe to run on every startup (createIndex is idempotent).
 */
export async function ensureProductIndexes(): Promise<void> {
  const db = getDb();
  const coll = db.collection("product");

  await Promise.all([
    coll.createIndex({ status: 1 }),
    coll.createIndex({ categoryId: 1 }),
    coll.createIndex({ updatedAt: -1 }),
    coll.createIndex({ name: 1 }),
    coll.createIndex({ price: 1 }),
    coll.createIndex({ stockQuantity: 1 }),
    coll.createIndex({ slug: 1 }, { unique: true }),
    coll.createIndex({ sku: 1 }),
    coll.createIndex({ status: 1, updatedAt: -1 }),
    coll.createIndex({ status: 1, categoryId: 1, updatedAt: -1 }),
  ]);
}
