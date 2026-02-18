import { Agenda } from "agenda";
import { MongoBackend } from "@agendajs/mongo-backend";
import { getDb } from "../db/mongodb.js";
import { syncDiscountStatuses } from "./sync-discount-statuses.js";

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
  }
  return agenda;
}

export async function startAgenda(): Promise<void> {
  const a = getAgenda();
  await a.start();
  await a.every("1 minute", "sync-discount-statuses");
}

export async function stopAgenda(): Promise<void> {
  if (agenda) {
    await agenda.drain(10000);
    agenda = null;
  }
}
