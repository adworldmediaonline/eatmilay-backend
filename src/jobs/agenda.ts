import { Agenda } from "agenda";
import { MongoBackend } from "@agendajs/mongo-backend";
import { getDb } from "../db/mongodb.js";
import { env } from "../config/env.js";
import { syncDiscountStatuses } from "./sync-discount-statuses.js";
import { sendAbandonedCartEmails } from "./send-abandoned-cart-emails.js";
import { sendEmail } from "../lib/email/send-email.js";

let agenda: Agenda | null = null;

function getAgenda(): Agenda {
  if (!agenda) {
    agenda = new Agenda({
      backend: new MongoBackend({ mongo: getDb(), collection: "agendaJobs" }),
      processEvery: "1 minute",
    });
    agenda.define("sync-discount-statuses", async () => {
      await syncDiscountStatuses();
    });
    agenda.define("send-abandoned-cart-emails", async (job) => {
      console.log("[AbandonedCart] Job triggered", {
        jobName: job.attrs.name,
        runAt: new Date().toISOString(),
      });
      await sendAbandonedCartEmails();
    });
    agenda.define("send-test-email", async (job) => {
      const to = job.attrs.data?.to as string;
      if (to) {
        await sendEmail({
          to,
          subject: "Eat Milay – Abandoned Cart Test",
          html: "<p>This is a test email to verify abandoned cart delivery works.</p>",
          text: "This is a test email to verify abandoned cart delivery works.",
        });
      }
    });
  }
  return agenda;
}

export async function startAgenda(): Promise<void> {
  const a = getAgenda();
  await a.start();
  await a.every("1 minute", "sync-discount-statuses");
  await a.every(env.ABANDONED_CART_CHECK_INTERVAL, "send-abandoned-cart-emails");
  console.log("[AbandonedCart] Scheduled", {
    interval: env.ABANDONED_CART_CHECK_INTERVAL,
    cutoffMinutes: env.ABANDONED_CART_MINUTES,
  });

  if (env.ABANDONED_CART_TEST_EMAIL) {
    await a.schedule("in 2 minutes", "send-test-email", { to: env.ABANDONED_CART_TEST_EMAIL });
  }
}

export async function stopAgenda(): Promise<void> {
  if (agenda) {
    await agenda.drain(10000);
    agenda = null;
  }
}
