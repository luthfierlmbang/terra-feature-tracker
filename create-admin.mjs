// create-admin.mjs — Run once to create the first admin user in Firebase Auth
// Usage: node create-admin.mjs
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBR_mAkiAEyxlloTZk_BufxunkD-j2udWc",
  authDomain: "feature-tracker-terra.firebaseapp.com",
  projectId: "feature-tracker-terra",
  storageBucket: "feature-tracker-terra.firebasestorage.app",
  messagingSenderId: "127660777502",
  appId: "1:127660777502:web:accb3854db35d1785a8e0f",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ─── Change these before running ─────────────────────────────────────────────
const ADMIN_EMAIL = "admin@tepat.com";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NAME = "Admin";
// ─────────────────────────────────────────────────────────────────────────────

try {
  const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  await updateProfile(cred.user, { displayName: ADMIN_NAME });
  console.log(`✅ User created: ${ADMIN_EMAIL} (password: ${ADMIN_PASSWORD})`);
  console.log(`   UID: ${cred.user.uid}`);
  console.log(`\nYou can now log in to the app with those credentials.`);
  console.log(`To add more users, go to Settings → User Management in the app.`);
  process.exit(0);
} catch (err) {
  if (err.code === "auth/email-already-in-use") {
    console.log(`ℹ️  User ${ADMIN_EMAIL} already exists. You can log in directly.`);
  } else {
    console.error("❌ Error:", err.message);
  }
  process.exit(0);
}
