"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);

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

    const sync = () => setAvailableHeight(vv.height);
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      setAvailableHeight(null);
    };
  }, [open]);

  /** Keep the focused control above the keyboard as the user tabs through. */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // Wait for the keyboard animation before measuring.
      window.setTimeout(() => target.scrollIntoView({ block: "nearest" }), 300);
    };

    panel.addEventListener("focusin", onFocusIn);
    return () => panel.removeEventListener("focusin", onFocusIn);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    // Focus the panel itself, not the first control: announcing the dialog
    // title beats dumping the user into a text input.
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
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
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 flex",
        placement === "bottom" ? "items-end sm:items-center" : "items-center",
        "justify-center",
      )}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
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
          "pf-sheet-in relative flex w-full flex-col bg-paper shadow-lift outline-none",
          "rounded-t-2xl sm:rounded-2xl",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
        style={{
          // 92% of whatever is genuinely visible, keyboard included.
          maxHeight: availableHeight ? `${Math.round(availableHeight * 0.92)}px` : "92dvh",
        }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-5">
          <h2 id={titleId} className={clsx("wordmark text-lg", hideTitle && "sr-only")}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="pf-button pf-button-quiet -mr-1 size-9 shrink-0 text-lg"
            aria-label="Close"
          >
            <span aria-hidden>×</span>
          </button>
        </header>

        {/*
          `basis-0` with a minimum keeps the content area from being squeezed
          to a few pixels by the header and footer when the viewport is short —
          which is exactly what a keyboard does.
        */}
        <div className="pf-scroll min-h-[8rem] flex-1 basis-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer && (
          <footer className="border-t border-rule bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
