import type { Response } from "express";
import { getDb } from "../db/mongodb.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

const COLLECTION = "order";
const BATCH_SIZE = 500;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${String(s).replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toRow(
  r: {
    orderNumber: string;
    createdAt: Date;
    customerName?: string | null;
    customerEmail: string;
    items?: Array<{ productName: string; quantity: number; lineTotal: number }>;
    subtotal: number;
    shippingAmount?: number;
    discountAmount?: number;
    total: number;
    currency?: string;
    paymentStatus?: string | null;
    status?: string | null;
    paymentMethod?: string | null;
  },
  currency: string
): string {
  const productsSummary =
    (r.items ?? [])
      .map((i) => `${i.productName} (${i.quantity}x ${currency}${i.lineTotal.toFixed(2)})`)
      .join("; ") || "";
  const qty = (r.items ?? []).reduce((a, i) => a + i.quantity, 0);
  const shipping = r.shippingAmount ?? 0;
  const discount = r.discountAmount ?? 0;

  return [
    escapeCsv(r.orderNumber),
    escapeCsv(formatDateYmd(r.createdAt)),
    escapeCsv(r.customerName ?? ""),
    escapeCsv(r.customerEmail),
    escapeCsv(productsSummary),
    String(qty),
    escapeCsv(`${currency}${r.subtotal.toFixed(2)}`),
    escapeCsv(`${currency}${shipping.toFixed(2)}`),
    escapeCsv(`${currency}${discount.toFixed(2)}`),
    escapeCsv(`${currency}${r.total.toFixed(2)}`),
    escapeCsv(r.paymentStatus ?? ""),
    escapeCsv(r.status ?? ""),
    escapeCsv(r.paymentMethod ?? ""),
  ].join(",");
}

const CSV_HEADER =
  "Order Number,Order Date,Customer Name,Customer Email,Products (summary),Quantity,Subtotal,Shipping Price,Discount,Total Amount,Payment Status,Order Status,Payment Method\n";

export async function exportOrders(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const status = req.query.status as string | undefined;
  const paymentStatus = req.query.paymentStatus as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();
  const format = (req.query.format as string ?? "csv").toLowerCase();

  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate and endDate are required (YYYY-MM-DD)" });
    return;
  }

  const start = new Date(startDate + "T00:00:00.000Z");
  const end = new Date(endDate + "T23:59:59.999Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    return;
  }
  if (start > end) {
    res.status(400).json({ error: "startDate must be before or equal to endDate" });
    return;
  }

  const filter: Record<string, unknown> = {
    createdAt: { $gte: start, $lte: end },
  };
  if (status && ["pending", "paid", "shipped", "cancelled", "confirmed", "processing", "delivered"].includes(status)) {
    filter.status = status;
  }
  if (paymentStatus && ["pending", "completed", "failed"].includes(paymentStatus)) {
    filter.paymentStatus = paymentStatus;
  }
  if (search && search.length > 0) {
    const pattern = escapeRegex(search);
    const regex = { $regex: pattern, $options: "i" };
    filter.$or = [
      { orderNumber: regex },
      { customerEmail: regex },
      { customerName: regex },
    ];
  }

  const db = getDb();
  const cursor = db
    .collection(COLLECTION)
    .find(filter)
    .sort({ createdAt: 1 });

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="orders-export-${startDate}-${endDate}.csv"`
    );
    res.write(CSV_HEADER);

    let count = 0;
    let batch: unknown[] = [];
    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length >= BATCH_SIZE) {
        const currency = (batch[0] as { currency?: string }).currency ?? "USD";
        for (const r of batch as Array<Record<string, unknown>>) {
          res.write(
            toRow(
              {
                orderNumber: r.orderNumber as string,
                createdAt: r.createdAt as Date,
                customerName: r.customerName as string | null,
                customerEmail: r.customerEmail as string,
                items: r.items as Array<{ productName: string; quantity: number; lineTotal: number }>,
                subtotal: r.subtotal as number,
                shippingAmount: r.shippingAmount as number,
                discountAmount: r.discountAmount as number,
                total: r.total as number,
                currency: r.currency as string,
                paymentStatus: r.paymentStatus as string | null,
                status: r.status as string | null,
                paymentMethod: r.paymentMethod as string | null,
              },
              currency
            ) + "\n"
          );
          count++;
        }
        batch = [];
      }
    }
    const currency = batch[0] ? ((batch[0] as { currency?: string }).currency ?? "USD") : "USD";
    for (const r of batch as Array<Record<string, unknown>>) {
      res.write(
        toRow(
          {
            orderNumber: r.orderNumber as string,
            createdAt: r.createdAt as Date,
            customerName: r.customerName as string | null,
            customerEmail: r.customerEmail as string,
            items: r.items as Array<{ productName: string; quantity: number; lineTotal: number }>,
            subtotal: r.subtotal as number,
            shippingAmount: r.shippingAmount as number,
            discountAmount: r.discountAmount as number,
            total: r.total as number,
            currency: r.currency as string,
            paymentStatus: r.paymentStatus as string | null,
            status: r.status as string | null,
            paymentMethod: r.paymentMethod as string | null,
          },
          currency
        ) + "\n"
      );
      count++;
    }

    res.end();
    return;
  }

  if (format === "xlsx") {
    res.status(400).json({ error: "XLSX format not yet supported. Use format=csv" });
    return;
  }

  res.status(400).json({ error: "Invalid format. Use csv or xlsx" });
}
