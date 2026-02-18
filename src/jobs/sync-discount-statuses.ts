import { getDb } from "../db/mongodb.js";

export async function syncDiscountStatuses(): Promise<void> {
  const now = new Date();
  const db = getDb();

  await db.collection("discount").updateMany(
    { status: "active", expiresAt: { $lt: now, $ne: null } },
    { $set: { status: "disabled", updatedAt: now } }
  );

  await db.collection("discount").updateMany(
    {
      status: "scheduled",
      $or: [{ startsAt: null }, { startsAt: { $lte: now } }],
    },
    { $set: { status: "active", updatedAt: now } }
  );
}
