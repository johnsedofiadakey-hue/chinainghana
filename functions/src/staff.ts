import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { audit, auth, db, FieldValue, parse, REGION, requireAdmin, requireSuper, STAFF_EMAIL_DOMAIN } from "./shared";

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, "Use 3–30 letters, numbers, dots, dashes or underscores.");

const passwordSchema = z.string().min(8, "Password must be at least 8 characters.").max(100);

const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(60),
  username: usernameSchema,
  password: passwordSchema,
  phone: z.string().trim().max(30).optional().default(""),
  branchId: z.string().min(1),
});

/** Admin creates a branch manager account (username + temporary password). */
export const createStaff = onCall({ region: REGION }, async (req) => {
  const caller = requireAdmin(req);
  const input = parse(createStaffSchema, req.data);

  const branch = await db.collection("branches").doc(input.branchId).get();
  if (!branch.exists) throw new HttpsError("not-found", "Branch not found.");

  const email = `${input.username}@${STAFF_EMAIL_DOMAIN}`;
  let user;
  try {
    user = await auth.createUser({ email, password: input.password, displayName: input.name });
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "auth/email-already-exists") throw new HttpsError("already-exists", "That username is already taken.");
    throw new HttpsError("internal", "Could not create the account.");
  }

  await auth.setCustomUserClaims(user.uid, { role: "manager", branchId: input.branchId });
  await db.collection("users").doc(user.uid).set({
    name: input.name,
    username: input.username,
    phone: input.phone,
    role: "manager",
    branchId: input.branchId,
    branchName: branch.get("name"),
    active: true,
    mustChangePassword: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(null, { actorUid: caller.uid, action: "staff.create", target: user.uid, branchId: input.branchId, details: { username: input.username } });

  return { uid: user.uid };
});

const updateStaffSchema = z.object({
  uid: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().max(30).optional(),
  branchId: z.string().min(1).optional(),
  active: z.boolean().optional(),
  newPassword: passwordSchema.optional(),
});

/** Admin edits, suspends/reactivates, reassigns or resets the password of a manager. */
export const updateStaff = onCall({ region: REGION }, async (req) => {
  const caller = requireAdmin(req);
  const input = parse(updateStaffSchema, req.data);

  const ref = db.collection("users").doc(input.uid);
  const snap = await ref.get();
  if (!snap.exists || snap.get("role") !== "manager") throw new HttpsError("not-found", "Manager not found.");

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name) updates.name = input.name;
  if (input.phone !== undefined) updates.phone = input.phone;

  if (input.branchId && input.branchId !== snap.get("branchId")) {
    const branch = await db.collection("branches").doc(input.branchId).get();
    if (!branch.exists) throw new HttpsError("not-found", "Branch not found.");
    await auth.setCustomUserClaims(input.uid, { role: "manager", branchId: input.branchId });
    updates.branchId = input.branchId;
    updates.branchName = branch.get("name");
  }

  const authUpdates: { disabled?: boolean; password?: string; displayName?: string } = {};
  if (input.active !== undefined) {
    authUpdates.disabled = !input.active;
    updates.active = input.active;
  }
  if (input.newPassword) {
    authUpdates.password = input.newPassword;
    updates.mustChangePassword = true;
  }
  if (input.name) authUpdates.displayName = input.name;
  if (Object.keys(authUpdates).length) await auth.updateUser(input.uid, authUpdates);

  // Force re-login so suspensions, branch moves and password resets take effect immediately.
  if (input.active === false || input.branchId || input.newPassword) await auth.revokeRefreshTokens(input.uid);

  await ref.update(updates);
  audit(null, {
    actorUid: caller.uid,
    action: "staff.update",
    target: input.uid,
    branchId: (updates.branchId as string | undefined) ?? (snap.get("branchId") as string),
    details: { ...input, newPassword: input.newPassword ? "••••" : undefined },
  });

  return { ok: true };
});

const setAdminSchema = z.object({
  name: z.string().trim().min(2).max(60),
  username: usernameSchema,
  password: passwordSchema,
});

/**
 * Super Admin only: creates the client's Admin login, or restores it (new
 * temporary password, re-enabled) if the username already exists.
 */
export const setAdminAccount = onCall({ region: REGION }, async (req) => {
  const caller = requireSuper(req);
  const input = parse(setAdminSchema, req.data);
  const email = `${input.username}@${STAFF_EMAIL_DOMAIN}`;

  let uid: string;
  let created = false;
  try {
    const existing = await auth.getUserByEmail(email);
    if ((existing.customClaims?.role as string | undefined) === "superadmin") {
      throw new HttpsError("failed-precondition", "That username belongs to the developer account.");
    }
    uid = existing.uid;
    await auth.updateUser(uid, { password: input.password, displayName: input.name, disabled: false });
    await auth.revokeRefreshTokens(uid);
  } catch (e: unknown) {
    if (e instanceof HttpsError) throw e;
    if ((e as { code?: string }).code !== "auth/user-not-found") throw new HttpsError("internal", "Could not update the account.");
    uid = (await auth.createUser({ email, password: input.password, displayName: input.name })).uid;
    created = true;
  }

  await auth.setCustomUserClaims(uid, { role: "admin" });
  await db.collection("users").doc(uid).set(
    {
      name: input.name,
      username: input.username,
      role: "admin",
      branchId: null,
      branchName: null,
      active: true,
      mustChangePassword: true,
      ...(created ? { createdAt: FieldValue.serverTimestamp(), phone: "" } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  audit(null, { actorUid: caller.uid, action: "admin.set", target: uid, details: { username: input.username, created } });

  return { uid, created };
});
