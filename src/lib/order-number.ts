import type { Db } from "mongodb";

const COLLECTION = "order";

/**
 * Generates a unique, professional order number.
 * Format: EM-YYYYMMDD-NNNNNN
 * - EM = Eat Milay brand prefix
 * - YYYYMMDD = order date for readability and grouping
 * - NNNNNN = 6-digit zero-padded sequential number (global count)
 *
 * Examples: EM-20260218-000012, EM-20260218-001234
 */
export async function getNextOrderNumber(db: Db): Promise<string> {
  const count = await db.collection(COLLECTION).countDocuments();
  const num = count + 1;
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const dateStr = `${year}${month}${day}`;
  const seq = num.toString().padStart(6, "0");
  return `EM-${dateStr}-${seq}`;
}
