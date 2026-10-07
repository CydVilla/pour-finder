/**
 * Where timed drink discounts are actually legal.
 *
 * Pour Finder has a "happy hour" filter and a happy-hour section in the submit
 * form, but in several states a happy hour cannot legally exist — so in those
 * states the filter matches nothing real and the form invites people to record
 * a discount no bar is allowed to run. Massachusetts, the launch state, is one
 * of them: the ban dates to 1984 and is still in force.
 *
 * What people actually find in those states is an *everyday* low price, which
 * is legal and is exactly what this app is for. So the rule here doesn't hide
 * anything — it explains, in the one place the user is about to be misled.
 *
 * Keep this as plain data. It is the kind of thing that changes by statute
 * (Indiana's ban ran from 1985 until it was repealed effective 2024-07-01),
 * and a single table is far easier to correct than scattered copy.
 *
 * Sources: Axios Boston 2025-07-08; Indiana HB 1086 (2024); Money.com
 * state-by-state roundup. Re-check before trusting for a new launch state.
 */

export type HappyHourLaw = "banned" | "restricted";

interface LawEntry {
  readonly law: HappyHourLaw;
  /** Shown verbatim to the user. One sentence, no hedging, no legal advice. */
  readonly note: string;
}

const STATE_LAW: Readonly<Record<string, LawEntry>> = {
  AK: {
    law: "banned",
    note: "Alaska bans timed drink discounts, so what you'll find here is everyday low prices.",
  },
  MA: {
    law: "banned",
    note: "Massachusetts has banned happy hour since 1984, so what you'll find here is everyday low prices.",
  },
  NC: {
    law: "banned",
    note: "North Carolina bans timed drink discounts, so what you'll find here is everyday low prices.",
  },
  RI: {
    law: "banned",
    note: "Rhode Island bans timed drink discounts, so what you'll find here is everyday low prices.",
  },
  UT: {
    law: "banned",
    note: "Utah bans timed drink discounts, so what you'll find here is everyday low prices.",
  },
  VT: {
    law: "banned",
    note: "Vermont bans timed drink discounts, so what you'll find here is everyday low prices.",
  },
  IN: {
    law: "restricted",
    note: "Indiana allows happy hour again, but only up to 4 hours a day, 15 a week, and never past 9pm.",
  },
  OK: {
    law: "restricted",
    note: "Oklahoma only allows drink specials in limited windows, so most cheap beer here is an everyday price.",
  },
};

/** Null when the state has no special rule, or when no state is in play. */
export function happyHourLaw(state: string | null | undefined): LawEntry | null {
  if (!state) return null;
  return STATE_LAW[state.trim().toUpperCase()] ?? null;
}

/** True only for a full ban — the case where the filter can never match. */
export function bansHappyHour(state: string | null | undefined): boolean {
  return happyHourLaw(state)?.law === "banned";
}
