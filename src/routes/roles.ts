import type { Response } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db/mongodb.js";
import {
  PERMISSION_RESOURCES,
  type RolePermissions,
} from "../constants/permissions.js";
import type { AuthenticatedRequest } from "../middleware/require-session.js";
import { slugify } from "../utils/slugify.js";

const COLLECTION = "custom_role";

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/).optional(),
  description: z.string().max(500).optional(),
  permissions: z.object({
    user: z.array(z.enum(PERMISSION_RESOURCES.user)),
    session: z.array(z.enum(PERMISSION_RESOURCES.session)),
  }),
});

const updateRoleSchema = createRoleSchema.partial();

export async function listRoles(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db = getDb();
  const roles = await db
    .collection(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  res.json(
    roles.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      slug: r.slug,
      description: r.description,
      permissions: r.permissions,
      createdAt: r.createdAt,
    }))
  );
}

export async function createRole(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const slug = parsed.data.slug ?? slugify(parsed.data.name);
  const existing = await db.collection(COLLECTION).findOne({ slug });
  if (existing) {
    res.status(409).json({ error: "Role with this slug already exists" });
    return;
  }

  const doc = {
    name: parsed.data.name,
    slug,
    description: parsed.data.description ?? "",
    permissions: parsed.data.permissions as RolePermissions,
    createdAt: new Date(),
    createdBy: req.session!.user.id,
  };

  const result = await db.collection(COLLECTION).insertOne(doc);
  res.status(201).json({
    id: result.insertedId.toString(),
    ...doc,
  });
}

export async function getRole(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid role ID" });
    return;
  }

  const db = getDb();
  const role = await db.collection(COLLECTION).findOne({
    _id: new ObjectId(id),
  });
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  res.json({
    id: role._id.toString(),
    name: role.name,
    slug: role.slug,
    description: role.description,
    permissions: role.permissions,
    createdAt: role.createdAt,
  });
}

export async function updateRole(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid role ID" });
    return;
  }

  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const update: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  if (parsed.data.slug && id) {
    const existing = await db.collection(COLLECTION).findOne({
      slug: parsed.data.slug,
      _id: { $ne: new ObjectId(id) },
    });
    if (existing) {
      res.status(409).json({ error: "Role with this slug already exists" });
      return;
    }
  }
  if (parsed.data.name && !parsed.data.slug) {
    update.slug = slugify(parsed.data.name);
  }

  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  res.json({
    id: result._id.toString(),
    name: result.name,
    slug: result.slug,
    description: result.description,
    permissions: result.permissions,
    createdAt: result.createdAt,
  });
}

export async function deleteRole(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const id = req.params.id;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid role ID" });
    return;
  }

  const db = getDb();
  const result = await db.collection(COLLECTION).deleteOne({
    _id: new ObjectId(id),
  });

  if (result.deletedCount === 0) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  res.status(204).send();
}
