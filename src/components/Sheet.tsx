"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, type ReactNode } from "react";

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
          "pf-sheet-in relative flex max-h-[92dvh] w-full flex-col bg-paper shadow-lift outline-none",
          "rounded-t-2xl sm:rounded-2xl",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
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

        <div className="pf-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer && (
          <footer className="border-t border-rule bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
