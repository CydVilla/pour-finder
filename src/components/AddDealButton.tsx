"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddDealSheet } from "./AddDealSheet";

interface Props {
  venue: { id: string; name: string; state: string };
  /** True when this venue has no prices yet, which changes the invitation. */
  isFirstPrice?: boolean;
  className?: string;
}

/**
 * The add-a-deal path from a venue page, with the venue already chosen.
 *
 * Shared between the two renders of a venue page — one with deals, one
 * without — because the page with no deals is the one that needs it most and
 * is also the easiest to forget: it used to offer a link back to the home
 * page, which meant searching again for the bar you were already looking at.
 */
export function AddDealButton({ venue, isFirstPrice = false, className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "pf-button pf-button-amber w-full px-4 py-2.5 text-sm"}
      >
        <span aria-hidden>＋</span>
        {isFirstPrice ? `Add the first price for ${venue.name}` : "Know another price here?"}
      </button>

      <AddDealSheet
        open={open}
        onClose={() => setOpen(false)}
        presetVenue={venue}
        /* The venue is already chosen, so there is nothing to sort by distance. */
        userLocation={null}
        onSubmitted={() => router.refresh()}
      />
    </>
  );
}
