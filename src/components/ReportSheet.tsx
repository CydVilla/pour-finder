"use client";

import { useState } from "react";
import type { DealDTO, VenueDTO } from "@/lib/types";
import { formatCents } from "@/lib/money";
import { Sheet } from "./Sheet";

const REASONS = [
  { id: "price_wrong", label: "The price is wrong" },
  { id: "no_longer_available", label: "This deal is gone" },
  { id: "venue_closed", label: "The bar has closed" },
  { id: "wrong_venue", label: "Wrong bar or location" },
  { id: "never_existed", label: "This was never real" },
  { id: "duplicate", label: "Duplicate of another listing" },
  { id: "spam_or_joke", label: "Spam or a joke" },
  { id: "other", label: "Something else" },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  target: { deal: DealDTO; venue: VenueDTO } | null;
}

/**
 * Reports queue for a human and never change the listing on their own.
 * Auto-acting on reports would give any competitor a three-tap delete button.
 */
export function ReportSheet({ open, onClose, target }: Props) {
  const [reason, setReason] = useState<(typeof REASONS)[number]["id"]>("price_wrong");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const close = () => {
    onClose();
    window.setTimeout(() => {
      setState("idle");
      setNote("");
      setReason("price_wrong");
    }, 250);
  };

  const submit = async () => {
    if (!target) return;
    setState("sending");
    try {
      const response = await fetch(`/api/deals/${target.deal.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note: note.trim() || undefined }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setState("error");
        setMessage(data.error ?? "Couldn't file that report");
        return;
      }
      setState("done");
      setMessage(data.message ?? "Thanks — a moderator will take a look.");
    } catch {
      setState("error");
      setMessage("Couldn't reach the server. Try again?");
    }
  };

  if (!target) return null;

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Report a problem"
      footer={
        state === "done" ? (
          <button type="button" onClick={close} className="pf-button pf-button-primary w-full px-4 py-3">
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={state === "sending"}
            className="pf-button pf-button-primary w-full px-4 py-3"
          >
            {state === "sending" ? "Sending…" : "Send report"}
          </button>
        )
      }
    >
      {state === "done" ? (
        <p className="py-6 text-center text-lg font-semibold">{message}</p>
      ) : (
        <div className="space-y-4">
          <div className="pf-card p-3">
            <p className="font-semibold">{target.venue.name}</p>
            <p className="text-sm text-ink-soft">
              {formatCents(target.deal.priceCents)} · {target.deal.beerName}
            </p>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
              What&apos;s wrong?
            </legend>
            <div className="space-y-1">
              {REASONS.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-paper-sunk"
                >
                  <input
                    type="radio"
                    name="report-reason"
                    className="size-4 accent-ink"
                    checked={reason === option.id}
                    onChange={() => setReason(option.id)}
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="report-note" className="text-xs font-bold uppercase tracking-wide text-ink-faint">
              Anything else? (optional)
            </label>
            <textarea
              id="report-note"
              rows={3}
              className="pf-input resize-none"
              placeholder="It's $4 now, not $2…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {state === "error" && (
            <p role="alert" className="text-sm font-medium text-outdated">
              {message}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
