#!/usr/bin/env node
// scripts/strip-password-field.mjs
// One-shot: remove `password` field from all docs in workspaces/default/users.
// Usage: GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/strip-password-field.mjs

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json";

const serviceAccount = JSON.parse(readFileSync(SA_PATH, "utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const usersCol = db.collection("workspaces").doc("default").collection("users");

async function run() {
  const snap = await usersCol.get();
  console.log(`Found ${snap.size} user docs.`);

  let stripped = 0, skipped = 0;
  const writer = db.bulkWriter();

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if ("password" in data) {
      writer.update(docSnap.ref, { password: FieldValue.delete() });
      stripped++;
    } else {
      skipped++;
    }
  });

  await writer.close();
  console.log(`Stripped: ${stripped}, already-clean: ${skipped}.`);

  // Verification pass
  const verify = await usersCol.get();
  const offenders = verify.docs.filter((d) => "password" in d.data());
  if (offenders.length > 0) {
    console.error(`❌ ${offenders.length} doc(s) still have password field:`,
      offenders.map((d) => d.id));
    process.exit(1);
  }
  console.log("✅ Verification passed: no `password` field remains.");
}

run().catch((e) => { console.error(e); process.exit(1); });
