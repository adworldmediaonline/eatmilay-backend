import { MongoClient } from "mongodb";
import { env } from "../config/env.js";

const client = new MongoClient(env.MONGODB_URI);

export async function connectMongo(): Promise<MongoClient> {
  await client.connect();
  return client;
}

export function getDb() {
  return client.db();
}

export function getMongoClient() {
  return client;
}
