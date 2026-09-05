"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pf-age-ack";

/**
 * A dismissible 21+ line, not a blocking age gate.
 *
 * A hard gate would be friction on every first visit for a site that only
 * lists publicly advertised menu prices. This states the expectation, records
 * the acknowledgement locally, and stays out of the way. If a real legal
 * requirement lands, this component is the single place it goes.
 */
export function AgeNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // Private mode / storage blocked: skip the notice rather than nag forever.
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="border-b border-rule bg-amber-wash">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-4">
        <p className="flex-1 text-xs text-ink-soft">
          <span className="font-bold text-ink">21+.</span> Prices are community-reported and
          change without notice. Please drink responsibly.
        </p>
        <button
          type="button"
          className="pf-button pf-button-quiet shrink-0 px-3 py-1.5 text-xs"
          onClick={() => {
            try {
              window.localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              /* storage blocked; dismissing for this session is enough */
            }
            setVisible(false);
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
