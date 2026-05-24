import { useEffect, useState, type RefObject } from "react";

/**
 * Defense-in-depth backstop matching design §6.4: if `document.fonts.ready`
 * never settles (e.g. because the host page suppressed font loads), the hook
 * still flips to `true` so the pipeline can proceed with whatever font is
 * currently active.
 */
const FONTS_READY_TIMEOUT_MS = 2000;

/**
 * Resolves to true once `document.fonts.ready` settles AND every <img>
 * descendant of `ref.current` has fired its `decode()` resolve/reject.
 *
 * Used by every slide component to fire `onReady` exactly once, so the
 * pipeline never captures a slide whose font is still falling back to
 * the user-agent default.
 *
 * Both `document.fonts.ready` rejections and `<img>.decode()` rejections
 * are treated as terminal — readiness signals "no longer waiting", not
 * "succeeded". The 2-second timeout (design §6.4) bounds the wait when
 * `document.fonts.ready` never settles at all.
 */
export function useFontsReady(ref: RefObject<HTMLElement | null>): boolean {
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    // Resolve immediately on environments that don't expose document.fonts
    // (older jsdom builds, server-side rendering pre-pass, etc.).
    const fontsReady: Promise<unknown> =
      typeof document !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).fonts?.ready instanceof Promise
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (document as any).fonts.ready
        : Promise.resolve();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const fontsTimeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, FONTS_READY_TIMEOUT_MS);
    });

    // Use Promise.race so we never block longer than the timeout, and
    // swallow rejection of the fonts promise — it's still terminal.
    const fontsSettled = Promise.race([
      fontsReady.then(
        () => undefined,
        () => undefined,
      ),
      fontsTimeout,
    ]);

    fontsSettled
      .then(() => {
        if (cancelled) return undefined;
        const root = ref.current;
        const imgs: HTMLImageElement[] = root
          ? Array.from(root.querySelectorAll("img"))
          : [];
        const decodes = imgs.map((img) => {
          // Treat both resolve and reject as terminal.
          try {
            return img.decode().then(
              () => undefined,
              () => undefined,
            );
          } catch {
            return Promise.resolve();
          }
        });
        return Promise.all(decodes).then(() => undefined);
      })
      .then(() => {
        if (cancelled) return;
        setReady(true);
      });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [ref]);

  return ready;
}
