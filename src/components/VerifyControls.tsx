"use client";

import clsx from "clsx";
import { useState, useTransition } from "react";
import type { DealDTO } from "@/lib/types";

interface Props {
  deal: DealDTO;
  onVerified: (patch: Partial<DealDTO>) => void;
  onReport: () => void;
  compact?: boolean;
}

/**
 * The single most valuable interaction on the site: one tap, no account, from
 * someone standing at the bar. Anything heavier than this and the data rots.
 */
export function VerifyControls({ deal, onVerified, onReport, compact = false }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<"still_available" | "no_longer_available" | null>(null);

  const submit = (result: "still_available" | "no_longer_available") => {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/deals/${deal.id}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result }),
        });
        const data = (await response.json()) as
          | {
              ok: true;
              verificationCount: number;
              disputeCount: number;
              lastVerifiedAt: string | null;
              freshness: DealDTO["freshness"];
              message: string;
            }
          | { error: string };

        if (!response.ok || "error" in data) {
          setMessage("error" in data ? data.error : "Something went wrong");
          return;
        }

        setDone(result);
        setMessage(data.message);
        onVerified({
          verificationCount: data.verificationCount,
          disputeCount: data.disputeCount,
          lastVerifiedAt: data.lastVerifiedAt,
          freshness: data.freshness,
          daysSinceVerified: data.lastVerifiedAt ? 0 : deal.daysSinceVerified,
        });
      } catch {
        setMessage("Couldn't reach the server. Try again?");
      }
    });
  };

  return (
    <div className={clsx("flex flex-col gap-2", compact ? "text-xs" : "text-sm")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-faint">Still there?</span>

        <button
          type="button"
          disabled={pending || done !== null}
          onClick={() => submit("still_available")}
          aria-label={`Confirm ${deal.beerName} is still available`}
          className={clsx(
            "pf-button min-h-9 px-3 py-1.5",
            done === "still_available" ? "pf-button-primary" : "pf-button-quiet",
          )}
        >
          <span aria-hidden>👍</span> Yes
        </button>

        <button
          type="button"
          disabled={pending || done !== null}
          onClick={() => submit("no_longer_available")}
          aria-label={`Report that ${deal.beerName} is no longer available`}
          className={clsx(
            "pf-button min-h-9 px-3 py-1.5",
            done === "no_longer_available" ? "pf-button-primary" : "pf-button-quiet",
          )}
        >
          <span aria-hidden>👎</span> Gone
        </button>

        <button
          type="button"
          onClick={onReport}
          className="min-h-9 px-1 text-ink-faint underline underline-offset-2 hover:text-ink"
        >
          Something else wrong?
        </button>
      </div>

      {message && (
        <p role="status" className="text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
