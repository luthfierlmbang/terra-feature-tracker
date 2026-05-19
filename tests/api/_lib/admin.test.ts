// tests/api/_lib/admin.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We use vi.resetModules() + dynamic import in each test so the module-level
// `_app` singleton is reset between test cases.

describe("api/_lib/admin", () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear env vars before each test so tests are isolated.
    delete process.env.FIREBASE_ADMIN_PROJECT_ID;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  });

  describe("getAdminApp()", () => {
    it("returns an App instance when all env vars are present", async () => {
      // Arrange: set required env vars.
      process.env.FIREBASE_ADMIN_PROJECT_ID = "test-project";
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
      process.env.FIREBASE_ADMIN_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\\nfakekey\\n-----END RSA PRIVATE KEY-----";

      // Mock firebase-admin modules before importing the module under test.
      const mockApp = { name: "[DEFAULT]" };
      vi.doMock("firebase-admin/app", () => ({
        getApps: vi.fn(() => []),
        cert: vi.fn((creds) => creds),
        initializeApp: vi.fn(() => mockApp),
      }));
      vi.doMock("firebase-admin/auth", () => ({
        getAuth: vi.fn(() => ({ verifyIdToken: vi.fn() })),
      }));
      vi.doMock("firebase-admin/firestore", () => ({
        getFirestore: vi.fn(() => ({ collection: vi.fn() })),
      }));

      // Act: import the module fresh (after mocks are set up).
      const { getAdminApp } = await import("../../../api/_lib/admin");
      const app = getAdminApp();

      // Assert: returns the mock app object.
      expect(app).toBe(mockApp);
    });

    it("reuses an existing Firebase app if one is already initialized", async () => {
      // Arrange: set env vars (not strictly needed since getApps returns existing).
      process.env.FIREBASE_ADMIN_PROJECT_ID = "test-project";
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
      process.env.FIREBASE_ADMIN_PRIVATE_KEY = "fakekey";

      const existingApp = { name: "[DEFAULT]" };
      const initializeApp = vi.fn(() => ({ name: "new-app" }));
      vi.doMock("firebase-admin/app", () => ({
        getApps: vi.fn(() => [existingApp]),
        cert: vi.fn((creds) => creds),
        initializeApp,
      }));
      vi.doMock("firebase-admin/auth", () => ({
        getAuth: vi.fn(() => ({})),
      }));
      vi.doMock("firebase-admin/firestore", () => ({
        getFirestore: vi.fn(() => ({})),
      }));

      const { getAdminApp } = await import("../../../api/_lib/admin");
      const app = getAdminApp();

      // Should return the existing app, not call initializeApp.
      expect(app).toBe(existingApp);
      expect(initializeApp).not.toHaveBeenCalled();
    });

    it("throws when FIREBASE_ADMIN_PROJECT_ID is missing", async () => {
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
      process.env.FIREBASE_ADMIN_PRIVATE_KEY = "fakekey";
      // PROJECT_ID intentionally not set.

      vi.doMock("firebase-admin/app", () => ({
        getApps: vi.fn(() => []),
        cert: vi.fn((creds) => creds),
        initializeApp: vi.fn(),
      }));
      vi.doMock("firebase-admin/auth", () => ({ getAuth: vi.fn() }));
      vi.doMock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));

      const { getAdminApp } = await import("../../../api/_lib/admin");

      expect(() => getAdminApp()).toThrow(
        "Missing FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY env vars."
      );
    });

    it("throws when FIREBASE_ADMIN_CLIENT_EMAIL is missing", async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "test-project";
      process.env.FIREBASE_ADMIN_PRIVATE_KEY = "fakekey";
      // CLIENT_EMAIL intentionally not set.

      vi.doMock("firebase-admin/app", () => ({
        getApps: vi.fn(() => []),
        cert: vi.fn((creds) => creds),
        initializeApp: vi.fn(),
      }));
      vi.doMock("firebase-admin/auth", () => ({ getAuth: vi.fn() }));
      vi.doMock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));

      const { getAdminApp } = await import("../../../api/_lib/admin");

      expect(() => getAdminApp()).toThrow(
        "Missing FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY env vars."
      );
    });

    it("throws when FIREBASE_ADMIN_PRIVATE_KEY is missing", async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "test-project";
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
      // PRIVATE_KEY intentionally not set.

      vi.doMock("firebase-admin/app", () => ({
        getApps: vi.fn(() => []),
        cert: vi.fn((creds) => creds),
        initializeApp: vi.fn(),
      }));
      vi.doMock("firebase-admin/auth", () => ({ getAuth: vi.fn() }));
      vi.doMock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));

      const { getAdminApp } = await import("../../../api/_lib/admin");

      expect(() => getAdminApp()).toThrow(
        "Missing FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY env vars."
      );
    });

    it("converts literal \\n in PRIVATE_KEY to real newlines", async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "test-project";
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
      process.env.FIREBASE_ADMIN_PRIVATE_KEY = "line1\\nline2\\nline3";

      const certSpy = vi.fn((creds) => creds);
      const mockApp = { name: "[DEFAULT]" };
      vi.doMock("firebase-admin/app", () => ({
        getApps: vi.fn(() => []),
        cert: certSpy,
        initializeApp: vi.fn(() => mockApp),
      }));
      vi.doMock("firebase-admin/auth", () => ({ getAuth: vi.fn(() => ({})) }));
      vi.doMock("firebase-admin/firestore", () => ({ getFirestore: vi.fn(() => ({})) }));

      const { getAdminApp } = await import("../../../api/_lib/admin");
      getAdminApp();

      // cert() should have been called with the key containing real newlines.
      expect(certSpy).toHaveBeenCalledWith(
        expect.objectContaining({ privateKey: "line1\nline2\nline3" })
      );
    });
  });

  describe("adminAuth()", () => {
    it("returns an Auth instance", async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "test-project";
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
      process.env.FIREBASE_ADMIN_PRIVATE_KEY = "fakekey";

      const mockAuth = { verifyIdToken: vi.fn(), createUser: vi.fn() };
      vi.doMock("firebase-admin/app", () => ({
        getApps: vi.fn(() => []),
        cert: vi.fn((c) => c),
        initializeApp: vi.fn(() => ({ name: "[DEFAULT]" })),
      }));
      vi.doMock("firebase-admin/auth", () => ({
        getAuth: vi.fn(() => mockAuth),
      }));
      vi.doMock("firebase-admin/firestore", () => ({
        getFirestore: vi.fn(() => ({})),
      }));

      const { adminAuth } = await import("../../../api/_lib/admin");
      const auth = adminAuth();

      expect(auth).toBe(mockAuth);
    });
  });

  describe("adminDb()", () => {
    it("returns a Firestore instance", async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "test-project";
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
      process.env.FIREBASE_ADMIN_PRIVATE_KEY = "fakekey";

      const mockDb = { collection: vi.fn(), doc: vi.fn() };
      vi.doMock("firebase-admin/app", () => ({
        getApps: vi.fn(() => []),
        cert: vi.fn((c) => c),
        initializeApp: vi.fn(() => ({ name: "[DEFAULT]" })),
      }));
      vi.doMock("firebase-admin/auth", () => ({
        getAuth: vi.fn(() => ({})),
      }));
      vi.doMock("firebase-admin/firestore", () => ({
        getFirestore: vi.fn(() => mockDb),
      }));

      const { adminDb } = await import("../../../api/_lib/admin");
      const db = adminDb();

      expect(db).toBe(mockDb);
    });
  });
});
