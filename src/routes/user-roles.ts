import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import { isSystemRole } from "../constants/permissions.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";

const assignRoleSchema = z.object({
  role: z.string().min(1),
});

export async function assignRoleToUser(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.params.id;
  if (!userId) {
    res.status(400).json({ error: "User ID required" });
    return;
  }
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const role = parsed.data.role;
  const db = getDb();

  if (!isSystemRole(role)) {
    const customRole = await db.collection("custom_role").findOne({
      slug: role,
    });
    if (!customRole) {
      res.status(400).json({ error: "Custom role not found" });
      return;
    }
  }

  const userCollection = db.collection("user");
  const userQuery = ObjectId.isValid(userId)
    ? { _id: new ObjectId(userId as string) }
    : { id: userId };
  const result = await userCollection.updateOne(userQuery, { $set: { role } });

  if (result.matchedCount === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ success: true, role });
}
