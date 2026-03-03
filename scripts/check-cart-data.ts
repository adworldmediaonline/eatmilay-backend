/**
 * Check cart and user data in the database.
 * Run: npx tsx scripts/check-cart-data.ts
 */
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

async function main(): Promise<void> {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const users = await db.collection("user").find({}).limit(5).toArray();
  console.log("\n=== SAMPLE USERS (full doc) ===\n");
  for (const u of users) {
    console.log(JSON.stringify({ _id: u._id, id: u.id, email: u.email, name: u.name, isAnonymous: u.isAnonymous }, null, 2));
  }

  const carts = await db
    .collection("cart")
    .find({})
    .project({
      customerId: 1,
      lastUpdated: 1,
      emailSentAt: 1,
      reminderEmail: 1,
      items: 1,
      subtotal: 1,
    })
    .toArray();

  console.log("\n=== CARTS ===\n");
  for (const c of carts) {
    let user = null;
    if (c.customerId) {
      user = await db.collection("user").findOne(
        { _id: c.customerId },
        { projection: { email: 1, name: 1, isAnonymous: 1 } }
      );
      if (!user && ObjectId.isValid(c.customerId)) {
        user = await db.collection("user").findOne(
          { _id: new ObjectId(c.customerId) },
          { projection: { email: 1, name: 1, isAnonymous: 1 } }
        );
      }
    }
    console.log(JSON.stringify({
      customerId: c.customerId,
      lastUpdated: c.lastUpdated,
      emailSentAt: c.emailSentAt ?? null,
      reminderEmail: c.reminderEmail ?? null,
      itemCount: Array.isArray((c as { items?: unknown[] }).items) ? (c as { items: unknown[] }).items.length : 0,
      subtotal: c.subtotal,
      user: user
        ? {
            email: user.email,
            name: user.name,
            isAnonymous: user.isAnonymous,
          }
        : null,
    }, null, 2));
    console.log("---");
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  console.log("\n=== ABANDONED CART ELIGIBILITY (24h cutoff) ===");
  console.log("Cutoff:", cutoff.toISOString());
  console.log("Now:", new Date().toISOString());

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
