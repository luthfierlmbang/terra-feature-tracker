import { useEffect, useRef, useState, type RefObject } from "react";

const FONTS_READY_TIMEOUT_MS = 2000;

export function useFontsReady(ref: RefObject<HTMLElement | null>): boolean {
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    // Try to wait for fonts, but cap at 2s. In production the offscreen
    // stage uses flushSync so the DOM is already committed — we just need
    // to give fonts a brief window to load before capturing.
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

    Promise.race([
      fontsReady.then(() => undefined, () => undefined),
      fontsTimeout,
    ]).then(() => {
      if (cancelled) return;
      const root = ref.current;
      const imgs: HTMLImageElement[] = root
        ? Array.from(root.querySelectorAll("img"))
        : [];
      const decodes = imgs.map((img) => {
        try {
          return img.decode().then(() => undefined, () => undefined);
        } catch {
          return Promise.resolve();
        }
      });
      return Promise.all(decodes);
    }).then(() => {
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
