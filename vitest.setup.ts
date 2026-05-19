import "@testing-library/jest-dom";

// Set Firebase emulator environment variables when USE_FIREBASE_EMULATOR=1
if (process.env.USE_FIREBASE_EMULATOR === "1") {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
  process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
}
