/**
 * Run abandoned cart email job once.
 * Use for manual trigger or external cron: npx tsx src/jobs/run-abandoned-cart-once.ts
 */
import { connectMongo } from "../db/mongodb.js";
import { sendAbandonedCartEmails } from "./send-abandoned-cart-emails.js";

async function main(): Promise<void> {
  await connectMongo();
  await sendAbandonedCartEmails();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
