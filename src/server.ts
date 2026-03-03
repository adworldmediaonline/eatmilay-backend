import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { connectMongo } from "./db/mongodb.js";
import {
  ensureProductIndexes,
  ensureOrderIndexes,
  ensureCategoryIndexes,
  ensureCollectionIndexes,
  ensureDiscountIndexes,
  ensureCartIndexes,
  ensureReviewIndexes,
  ensureUserSchema,
} from "./db/init-indexes.js";
import { auth } from "./auth/auth.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.js";
import { registerRoutes } from "./routes/index.js";
import { configureCloudinary } from "./routes/upload.js";
import { syncDiscountStatuses } from "./jobs/sync-discount-statuses.js";
import { startAgenda, stopAgenda } from "./jobs/agenda.js";

const app = express();
const port = env.PORT;

const allowedOrigins = [
  env.FRONTEND_URL,
  ...(env.FRONTEND_USER_URL ? [env.FRONTEND_USER_URL] : []),
  ...(env.TRUSTED_ORIGINS
    ? env.TRUSTED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : []),
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    credentials: true,
  })
);

app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

registerRoutes(app);

app.use(errorHandler);

async function start(): Promise<void> {
  await connectMongo();
  await Promise.all([
    ensureProductIndexes(),
    ensureOrderIndexes(),
    ensureCategoryIndexes(),
    ensureCollectionIndexes(),
    ensureDiscountIndexes(),
    ensureCartIndexes(),
    ensureReviewIndexes(),
  ]);
  await ensureUserSchema();
  configureCloudinary();
  await syncDiscountStatuses();
  await startAgenda();
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Auth endpoint: http://localhost:${port}/api/auth/ok`);
  });
}

const shutdown = async () => {
  await stopAgenda();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
