// src/app/services/admin-api.ts
import { auth } from "../data/firebase";

async function authedFetch(path: string, body: unknown): Promise<Response> {
  if (!auth?.currentUser) throw new Error("Not signed in.");
  const token = await auth.currentUser.getIdToken();
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  let msg = `Request failed (${res.status}).`;
  try { msg = (await res.json()).error || msg; } catch {}
  // Tag friendly category for UI mapping.
  if (res.status === 401) throw new Error(`AUTH_EXPIRED: ${msg}`);
  if (res.status === 409) throw new Error(`CONFLICT: ${msg}`);
  if (res.status === 400) throw new Error(`VALIDATION: ${msg}`);
  throw new Error(`SERVER: ${msg}`);
}

export type CreateUserInput = { name: string; email: string; password: string };
export type UpdateUserInput = { uid: string; name?: string; email?: string; password?: string };

export async function createUserViaApi(input: CreateUserInput): Promise<{ uid: string }> {
  return jsonOrThrow(await authedFetch("/api/admin/create-user", input));
}
export async function updateUserViaApi(input: UpdateUserInput): Promise<{ ok: true }> {
  return jsonOrThrow(await authedFetch("/api/admin/update-user", input));
}
export async function deleteUserViaApi(uid: string): Promise<{ ok: true }> {
  return jsonOrThrow(await authedFetch("/api/admin/delete-user", { uid }));
}
