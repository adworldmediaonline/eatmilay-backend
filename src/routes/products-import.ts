import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";
import { slugify } from "../utils/slugify.js";

const COLLECTION = "product";

const importSchema = z.object({
  content: z.string().min(1, "CSV content is required"),
});

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (inQuotes) {
      current += c;
    } else if (c === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(content: string): string[][] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  return lines.map((l) => parseCsvLine(l));
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");
}

function parseRow(headers: string[], values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  const normalized = headers.map(normalizeHeader);
  for (let i = 0; i < values.length; i++) {
    const key = normalized[i] ?? `col${i}`;
    row[key] = values[i]?.trim() ?? "";
  }
  return row;
}

function parseNumber(val: string): number | null {
  const cleaned = val.replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export async function importProducts(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    res.status(400).json({
      error: (firstIssue?.message as string | undefined) ?? "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const rows = parseCsv(parsed.data.content);
  if (rows.length < 2) {
    res.status(400).json({
      error: "CSV must have a header row and at least one data row",
    });
    return;
  }

  const headers: string[] = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const db = getDb();

  const categoryCache = new Map<string, string>();
  const categories = await db
    .collection("product_category")
    .find({})
    .toArray();
  for (const c of categories) {
    const id = c._id.toString();
    const name = (c.name as string)?.toLowerCase().trim();
    const slug = (c.slug as string)?.toLowerCase().trim();
    if (name) categoryCache.set(name, id);
    if (slug) categoryCache.set(slug, id);
  }

  const slugSet = new Set<string>();
  const existingSlugs = await db
    .collection(COLLECTION)
    .find({}, { projection: { slug: 1 } })
    .toArray();
  for (const p of existingSlugs) {
    slugSet.add((p.slug as string) ?? "");
  }

  const errors: Array<{ row: number; message: string }> = [];
  let created = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2;
    const row = parseRow(headers, dataRows[i] ?? []);

    const name = row.name ?? row.productname ?? "";
    if (!name.trim()) {
      errors.push({ row: rowNum, message: "Name is required" });
      continue;
    }

    const priceVal = parseNumber(row.price ?? row.productprice ?? "0");
    if (priceVal == null || priceVal < 0) {
      errors.push({ row: rowNum, message: "Valid price is required" });
      continue;
    }

    let slug = (row.slug ?? "").trim() || slugify(name);
    if (!/^[a-z0-9-_]+$/.test(slug)) {
      slug = slugify(name);
    }
    if (slugSet.has(slug)) {
      let suffix = 1;
      while (slugSet.has(`${slug}-${suffix}`)) suffix++;
      slug = `${slug}-${suffix}`;
    }
    slugSet.add(slug);

    let categoryId: string | null = null;
    const catId = (row.categoryid ?? "").trim();
    const catName = (row.categoryname ?? "").trim();
    if (catId && ObjectId.isValid(catId)) {
      categoryId = catId;
    } else if (catName) {
      categoryId = categoryCache.get(catName.toLowerCase()) ?? null;
    }

    const status = (row.status ?? "draft").toLowerCase();
    const statusVal =
      status === "published" ? "published" : "draft";

    const tagsStr = (row.tags ?? "").trim();
    const tags = tagsStr
      ? tagsStr.split(/[,;]/).map((t) => t.trim()).filter(Boolean).slice(0, 20)
      : [];

    const compareAtPriceVal = parseNumber(row.compareatprice ?? "");
    const stockVal = parseNumber(row.stockquantity ?? "");

    const doc = {
      name: name.trim(),
      slug,
      description: (row.description ?? "").trim() || "",
      nutrients: "",
      benefits: "",
      shortDescription: (row.shortdescription ?? "").trim().slice(0, 500) || "",
      categoryId,
      price: priceVal,
      compareAtPrice: compareAtPriceVal != null && compareAtPriceVal >= 0 ? compareAtPriceVal : null,
      status: statusVal,
      images: [],
      sku: (row.sku ?? "").trim().slice(0, 100) || null,
      tags,
      metaTitle: null,
      metaDescription: null,
      metaKeywords: null,
      currency: (row.currency ?? "USD").trim().slice(0, 5) || "USD",
      vendor: (row.vendor ?? "").trim().slice(0, 100) || null,
      productType: "simple" as const,
      options: [],
      variants: [],
      bundleItems: [],
      bundlePricing: null,
      bundlePrice: null,
      bundleDiscountPercent: null,
      volumeTiers: [],
      trackInventory: true,
      stockQuantity: stockVal != null && stockVal >= 0 ? Math.floor(stockVal) : 0,
      lowStockThreshold: null,
      allowBackorder: false,
      relatedProductIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      await db.collection(COLLECTION).insertOne(doc);
      created++;
    } catch (err) {
      errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : "Failed to create product",
      });
    }
  }

  res.json({
    created,
    failed: dataRows.length - created,
    total: dataRows.length,
    errors: errors.slice(0, 100),
  });
}
