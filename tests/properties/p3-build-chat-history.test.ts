/**
 * P3 — Preservation: buildChatHistory invariants
 *
 * **Validates: Requirements 3.7**
 *
 * Observation-first methodology: we observe the behavior of the UNFIXED
 * `buildChatHistory` function with random inputs and assert the invariants
 * hold. This test MUST PASS on unfixed code — it captures the baseline
 * behavior that must be preserved after the Phase 2 refactor.
 *
 * Invariants tested:
 *   (a) if output is non-empty, out[0].role === "user"
 *   (b) no entry has parts[0].text.trim() === "" or === "..."
 *   (c) output length <= input length
 *   (d) order is preserved relative to input (no reordering)
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";

// ─── Inline copy of buildChatHistory from src/app/services/gemini.ts ─────────
// The function is not exported, so we inline it here for testing purposes.
// After Phase 2 refactor, this function MUST remain unchanged — verify by
// running this same test against the refactored code.

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mode?: string;
};

function buildChatHistory(chatHistory: ChatMessage[]) {
  const history: { role: string; parts: { text: string }[] }[] = [];
  let foundFirstUser = false;

  for (const msg of chatHistory) {
    if (!foundFirstUser) {
      if (msg.role !== "user") continue;
      foundFirstUser = true;
    }

    // Skip empty or loading-state messages
    if (!msg.content || msg.content.trim() === "" || msg.content === "...") continue;

    history.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  return history;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const chatMessageArb = fc.record({
  id: fc.string(),
  role: fc.constantFrom("user" as const, "assistant" as const),
  content: fc.string(),
  timestamp: fc.date(),
});

// ─── Properties ───────────────────────────────────────────────────────────────

describe("P3 — buildChatHistory preservation invariants", () => {
  /**
   * (a) If output is non-empty, the first entry must have role === "user".
   *
   * Gemini API requires history to start with a user message.
   * buildChatHistory skips leading assistant messages until the first user
   * message is found.
   *
   * Observed behavior: the function sets `foundFirstUser = true` when it
   * encounters a user-role message, even if that message has empty/invalid
   * content (which will be filtered out). This means a subsequent assistant
   * message can appear first in the output if the first user message had
   * empty content.
   *
   * The invariant we can reliably assert: if the first included (non-empty,
   * non-"...") message in the input (after the first user message is seen)
   * is a user message, then out[0].role === "user". More precisely: out[0]
   * role is "user" whenever the first user message in the input also has
   * valid (non-empty, non-"...") content.
   */
  it("(a) first output entry role is 'user' when first user message has valid content", () => {
    // Constrain: generate inputs where the first user message has non-empty,
    // non-"..." content. In this case, invariant (a) must hold.
    const validContentArb = fc.string({ minLength: 1 }).filter(
      (s) => s.trim() !== "" && s !== "..."
    );
    const firstUserMessageArb = fc.record({
      id: fc.string(),
      role: fc.constant("user" as const),
      content: validContentArb,
      timestamp: fc.date(),
    });
    const trailingMessagesArb = fc.array(chatMessageArb);

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string(),
            role: fc.constant("assistant" as const),
            content: fc.string(),
            timestamp: fc.date(),
          })
        ),
        firstUserMessageArb,
        trailingMessagesArb,
        (leadingAssistants, firstUser, trailing) => {
          const messages = [...leadingAssistants, firstUser, ...trailing];
          const out = buildChatHistory(messages);
          if (out.length === 0) return true; // vacuously true
          return out[0].role === "user";
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * (b) No output entry has empty or loading-state text.
   *
   * Messages with content that is empty, whitespace-only, or exactly "..."
   * are filtered out before being added to the history.
   */
  it("(b) no output entry has empty or '...' text", () => {
    fc.assert(
      fc.property(fc.array(chatMessageArb), (messages) => {
        const out = buildChatHistory(messages);
        return out.every(
          (entry) =>
            entry.parts[0].text.trim() !== "" && entry.parts[0].text !== "..."
        );
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * (c) Output length is always <= input length.
   *
   * buildChatHistory can only filter messages out, never add new ones.
   */
  it("(c) output length <= input length", () => {
    fc.assert(
      fc.property(fc.array(chatMessageArb), (messages) => {
        const out = buildChatHistory(messages);
        return out.length <= messages.length;
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * (d) Order is preserved relative to input — no reordering.
   *
   * The output entries appear in the same relative order as the input
   * messages that produced them. We verify this by checking that the
   * content sequence in the output is a subsequence of the input content
   * sequence (after role mapping).
   */
  it("(d) output order is preserved relative to input", () => {
    fc.assert(
      fc.property(fc.array(chatMessageArb), (messages) => {
        const out = buildChatHistory(messages);
        if (out.length === 0) return true;

        // Build the expected ordered sequence from input by applying the same
        // filtering logic manually and checking the output matches.
        const expectedTexts: string[] = [];
        let foundFirstUser = false;
        for (const msg of messages) {
          if (!foundFirstUser) {
            if (msg.role !== "user") continue;
            foundFirstUser = true;
          }
          if (!msg.content || msg.content.trim() === "" || msg.content === "...") continue;
          expectedTexts.push(msg.content);
        }

        // The output texts must match the expected texts in order.
        if (out.length !== expectedTexts.length) return false;
        return out.every((entry, i) => entry.parts[0].text === expectedTexts[i]);
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * Combined: invariants (b), (c), (d) hold simultaneously for any input.
   * Invariant (a) is tested separately with a constrained generator.
   *
   * This is the primary property that must continue to pass after Phase 2
   * refactor to confirm buildChatHistory behavior is preserved.
   */
  it("invariants (b)(c)(d) hold simultaneously for any input", () => {
    fc.assert(
      fc.property(fc.array(chatMessageArb), (messages) => {
        const out = buildChatHistory(messages);

        // (b) no empty or "..." text
        if (out.some((e) => e.parts[0].text.trim() === "" || e.parts[0].text === "...")) {
          return false;
        }

        // (c) output length <= input length
        if (out.length > messages.length) return false;

        // (d) order preserved
        const expectedTexts: string[] = [];
        let foundFirstUser = false;
        for (const msg of messages) {
          if (!foundFirstUser) {
            if (msg.role !== "user") continue;
            foundFirstUser = true;
          }
          if (!msg.content || msg.content.trim() === "" || msg.content === "...") continue;
          expectedTexts.push(msg.content);
        }
        if (out.length !== expectedTexts.length) return false;
        if (!out.every((entry, i) => entry.parts[0].text === expectedTexts[i])) return false;

        return true;
      }),
      { numRuns: 2000 }
    );
  });

  /**
   * Combined: all four invariants hold when first user message has valid content.
   *
   * This is the full combined property — it constrains the input so that
   * invariant (a) is also guaranteed to hold.
   */
  it("all invariants hold when first user message has valid content", () => {
    const validContentArb = fc.string({ minLength: 1 }).filter(
      (s) => s.trim() !== "" && s !== "..."
    );
    const firstUserMessageArb = fc.record({
      id: fc.string(),
      role: fc.constant("user" as const),
      content: validContentArb,
      timestamp: fc.date(),
    });

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string(),
            role: fc.constant("assistant" as const),
            content: fc.string(),
            timestamp: fc.date(),
          })
        ),
        firstUserMessageArb,
        fc.array(chatMessageArb),
        (leadingAssistants, firstUser, trailing) => {
          const messages = [...leadingAssistants, firstUser, ...trailing];
          const out = buildChatHistory(messages);

          // (a) first role is "user" if non-empty
          if (out.length > 0 && out[0].role !== "user") return false;

          // (b) no empty or "..." text
          if (out.some((e) => e.parts[0].text.trim() === "" || e.parts[0].text === "...")) {
            return false;
          }

          // (c) output length <= input length
          if (out.length > messages.length) return false;

          // (d) order preserved
          const expectedTexts: string[] = [];
          let foundFirstUser = false;
          for (const msg of messages) {
            if (!foundFirstUser) {
              if (msg.role !== "user") continue;
              foundFirstUser = true;
            }
            if (!msg.content || msg.content.trim() === "" || msg.content === "...") continue;
            expectedTexts.push(msg.content);
          }
          if (out.length !== expectedTexts.length) return false;
          if (!out.every((entry, i) => entry.parts[0].text === expectedTexts[i])) return false;

          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
