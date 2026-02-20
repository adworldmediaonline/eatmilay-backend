import { getDb } from "./mongodb.js";

/**
 * Ensure collections have indexes for fast list/search/sort queries.
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

export async function ensureOrderIndexes(): Promise<void> {
  const db = getDb();
  const coll = db.collection("order");

  await Promise.all([
    coll.createIndex({ status: 1 }),
    coll.createIndex({ paymentStatus: 1 }),
    coll.createIndex({ createdAt: -1 }),
    coll.createIndex({ orderNumber: 1 }),
    coll.createIndex({ customerEmail: 1 }),
    coll.createIndex({ customerName: 1 }),
  ]);
}

export async function ensureCategoryIndexes(): Promise<void> {
  const db = getDb();
  const coll = db.collection("product_category");

  await Promise.all([
    coll.createIndex({ name: 1 }),
    coll.createIndex({ slug: 1 }),
    coll.createIndex({ createdAt: -1 }),
  ]);
}

export async function ensureCollectionIndexes(): Promise<void> {
  const db = getDb();
  const coll = db.collection("product_collection");

  await Promise.all([
    coll.createIndex({ name: 1 }),
    coll.createIndex({ slug: 1 }),
    coll.createIndex({ createdAt: -1 }),
  ]);
}

export async function ensureDiscountIndexes(): Promise<void> {
  const db = getDb();
  const coll = db.collection("discount");

  await Promise.all([
    coll.createIndex({ code: 1 }),
    coll.createIndex({ status: 1 }),
    coll.createIndex({ createdAt: -1 }),
  ]);
}

export async function ensureCartIndexes(): Promise<void> {
  const db = getDb();
  const coll = db.collection("cart");

  await Promise.all([
    coll.createIndex({ customerId: 1 }, { unique: true }),
    coll.createIndex({ lastUpdated: 1, emailSentAt: 1 }),
  ]);
}

export async function ensureReviewIndexes(): Promise<void> {
  const db = getDb();
  const coll = db.collection("review");

  await Promise.all([
    coll.createIndex({ productId: 1, status: 1, createdAt: -1 }),
    coll.createIndex(
      { customerId: 1, productId: 1 },
      { unique: true, partialFilterExpression: { type: "product" } }
    ),
    coll.createIndex(
      { orderId: 1 },
      { unique: true, partialFilterExpression: { type: "order" } }
    ),
    coll.createIndex({ type: 1, status: 1, createdAt: -1 }),
  ]);
}

/**
 * Ensure user collection has isAnonymous field for Better Auth anonymous plugin.
 * Backfill existing users with isAnonymous: false; new anonymous users get true from the plugin.
 */
export async function ensureUserSchema(): Promise<void> {
  const db = getDb();
  const result = await db.collection("user").updateMany(
    { isAnonymous: { $exists: false } },
    { $set: { isAnonymous: false } }
  );
  if (result.modifiedCount > 0) {
    console.log(`[Init] Backfilled isAnonymous for ${result.modifiedCount} user(s)`);
  }
}
