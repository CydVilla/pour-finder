"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually hides the title but keeps it for screen readers. */
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** Mobile-first bottom sheet; "center" for short confirmations. */
  placement?: "bottom" | "center";
  size?: "md" | "lg";
}

/**
 * One dialog primitive for every overlay: filters, add-deal, report.
 *
 * Handles the accessibility work once - focus trap, focus restore, Escape,
 * scroll lock, aria-modal, and a labelled heading - so no individual overlay
 * has to remember it.
 */
export function Sheet({
  open,
  onClose,
  title,
  hideTitle = false,
  children,
  footer,
  placement = "bottom",
  size = "md",
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [visibleViewport, setVisibleViewport] = useState<{ top: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  /**
   * Size to the *visual* viewport, not `dvh`.
   *
   * `dvh` accounts for browser chrome but not the on-screen keyboard. On a
   * phone, focusing an input shrinks the visible area by roughly half while a
   * `max-h-[92dvh]` panel keeps its full height — so the footer, and with it
   * the submit button, ends up below the keyboard where it cannot be reached.
   * visualViewport is the only thing that reports the real space.
   */
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      // Respect pinch-zoom instead of laying the dialog out again at every scale.
      setVisibleViewport(vv.scale === 1 ? { top: vv.offsetTop, height: vv.height } : null);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      setVisibleViewport(null);
    };
  }, [open]);

  /** Keep the focused control above the keyboard as the user tabs through. */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    let scrollTimer: number;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // Wait for the keyboard animation before measuring.
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => target.scrollIntoView({ block: "nearest" }), 300);
    };

    panel.addEventListener("focusin", onFocusIn);
    return () => {
      panel.removeEventListener("focusin", onFocusIn);
      window.clearTimeout(scrollTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    // Focus the panel itself, not the first control: announcing the dialog
    // title beats dumping the user into a text input.
    const focusTimer = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(focusTimer);
      body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={clsx(
        "pf-sheet-viewport fixed inset-x-0 top-0 z-50 flex h-dvh",
        placement === "bottom" ? "items-end sm:items-center" : "items-center",
        "justify-center spread:items-start spread:justify-end",
      )}
      style={visibleViewport ?? undefined}
    >
      <div
        aria-hidden="true"
        className="pf-fade-in absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          "pf-sheet-in relative flex max-h-full w-full flex-col bg-paper shadow-lift outline-none",
          "rounded-t-2xl sm:rounded-2xl",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
          /*
            On a spread (an unfolded Duo) a centred dialog sits on the crease,
            with its title and primary button split down the middle. Dock it
            to the right half as a full-height side sheet instead: it covers
            the map, and the list on the left stays visible and updates live
            as filters change.
          */
          "spread:h-full spread:w-1/2 spread:max-w-none spread:rounded-none spread:rounded-l-2xl",
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-2 sm:px-5">
          <h2 id={titleId} className={clsx("wordmark text-lg", hideTitle && "sr-only")}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="pf-button pf-button-quiet -mr-1 size-touch shrink-0"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="pf-scroll min-h-0 flex-auto overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer && (
          <footer className="shrink-0 border-t border-rule bg-paper px-4 py-2 sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
