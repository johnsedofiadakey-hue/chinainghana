/**
 * Grants a staff role to an existing Firebase Auth user in PRODUCTION.
 *
 *   npx tsx scripts/grant-role.ts <uid> <admin|superadmin> ["Display name"]
 *   npx tsx scripts/grant-role.ts <uid> manager <branchId> ["Display name"]
 *
 * Uses your Google Application Default Credentials:
 *   gcloud auth application-default login
 *
 * Sets the custom claims (what Security Rules and Functions check) and writes
 * the users/{uid} profile. If Firestore isn't enabled yet, the claims are still
 * set — re-run the script after creating the database to write the profile.
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "china-in-ghana";
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT_ID;

type Role = "superadmin" | "admin" | "manager";

async function main() {
  const [uid, role, ...rest] = process.argv.slice(2) as [string, Role, ...string[]];
  if (!uid || !["superadmin", "admin", "manager"].includes(role)) {
    console.error('Usage: npx tsx scripts/grant-role.ts <uid> <admin|superadmin|manager> [branchId] ["Name"]');
    process.exit(1);
  }
  const branchId = role === "manager" ? rest.shift() : undefined;
  if (role === "manager" && !branchId) {
    console.error("Managers need a branchId.");
    process.exit(1);
  }

  const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const user = await auth.getUser(uid);
  const name = rest[0] ?? user.displayName ?? user.email?.split("@")[0] ?? "Admin";
  const username = user.email ? user.email.split("@")[0].toLowerCase() : uid.slice(0, 8);

  await auth.setCustomUserClaims(uid, branchId ? { role, branchId } : { role });
  await auth.revokeRefreshTokens(uid); // forces a fresh token with the new role on next sign-in
  console.log(`✔ ${user.email ?? uid} is now "${role}"${branchId ? ` for ${branchId}` : ""} (custom claims set).`);

  try {
    await db.collection("users").doc(uid).set(
      {
        name,
        username,
        email: user.email ?? null,
        phone: user.phoneNumber ?? "",
        role,
        branchId: branchId ?? null,
        branchName: null,
        active: true,
        mustChangePassword: false,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.log(`✔ Profile users/${uid} written.`);
  } catch (e) {
    console.warn(`⚠ Couldn't write users/${uid} (${(e as Error).message.split("\n")[0]}).`);
    console.warn("  Create the Firestore database, then run this script again.");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
