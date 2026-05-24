import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRef, type RefObject } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useFontsReady } from "../hooks/use-fonts-ready";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function defer<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setFontsReady(promise: Promise<unknown>) {
  // jsdom does not implement FontFaceSet; install a writable stub.
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: promise },
  });
}

function clearFontsReady() {
  // Remove the stub so other tests start from a clean slate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (document as any).fonts;
}

describe("useFontsReady", () => {
  beforeEach(() => {
    clearFontsReady();
  });

  afterEach(() => {
    clearFontsReady();
    vi.useRealTimers();
  });

  it("returns false on first render before fonts settle", () => {
    setFontsReady(new Promise<void>(() => {})); // never resolves

    const ref: RefObject<HTMLElement | null> = { current: null };
    const { result } = renderHook(() => useFontsReady(ref));

    expect(result.current).toBe(false);
  });

  it("returns true once fonts.ready resolves and image decodes complete", async () => {
    const fontsDeferred = defer<void>();
    setFontsReady(fontsDeferred.promise);

    // Component that owns a ref pointing at a container with two <img>
    // children whose decode() we control via spies.
    const decodeDeferred1 = defer<void>();
    const decodeDeferred2 = defer<void>();

    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      const ready = useFontsReady(ref);
      return (
        <div ref={ref} data-testid="root">
          <span data-testid="ready">{String(ready)}</span>
          <img data-testid="img-1" />
          <img data-testid="img-2" />
        </div>
      );
    }

    const { getByTestId } = render(<Harness />);

    const img1 = getByTestId("img-1") as HTMLImageElement;
    const img2 = getByTestId("img-2") as HTMLImageElement;
    img1.decode = vi.fn(() => decodeDeferred1.promise);
    img2.decode = vi.fn(() => decodeDeferred2.promise);

    expect(getByTestId("ready").textContent).toBe("false");

    // Resolve fonts — hook now waits for image decodes.
    await act(async () => {
      fontsDeferred.resolve();
    });
    expect(getByTestId("ready").textContent).toBe("false");

    await act(async () => {
      decodeDeferred1.resolve();
      decodeDeferred2.resolve();
    });

    await waitFor(() => {
      expect(getByTestId("ready").textContent).toBe("true");
    });
  });

  it("treats a rejected decode() as terminal and still resolves to true", async () => {
    const fontsDeferred = defer<void>();
    setFontsReady(fontsDeferred.promise);

    const decodeDeferred = defer<void>();

    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      const ready = useFontsReady(ref);
      return (
        <div ref={ref}>
          <span data-testid="ready">{String(ready)}</span>
          <img data-testid="img" />
        </div>
      );
    }

    const { getByTestId } = render(<Harness />);

    const img = getByTestId("img") as HTMLImageElement;
    img.decode = vi.fn(() => decodeDeferred.promise);

    await act(async () => {
      fontsDeferred.resolve();
    });

    await act(async () => {
      decodeDeferred.reject(new Error("decode failed"));
    });

    await waitFor(() => {
      expect(getByTestId("ready").textContent).toBe("true");
    });
  });

  it("flips to true via the 2-second timeout when fonts.ready never resolves", async () => {
    vi.useFakeTimers();

    // A pending promise that will never settle on its own.
    setFontsReady(new Promise<void>(() => {}));

    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      const ready = useFontsReady(ref);
      return <span data-testid="ready">{String(ready)}</span>;
    }

    const { getByTestId } = render(<Harness />);

    expect(getByTestId("ready").textContent).toBe("false");

    // Advance just under 2s — still not ready.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(getByTestId("ready").textContent).toBe("false");

    // Cross the 2s threshold — timeout fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    // Drain microtasks so any queued .then() callbacks run.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(getByTestId("ready").textContent).toBe("true");
  });
});
