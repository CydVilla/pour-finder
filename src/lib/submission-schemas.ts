/**
 * Submission payload contracts. Shared by the client form and the route
 * handler so validation rules exist in exactly one place.
 *
 * Required fields are kept to the absolute minimum: a venue and a price. Every
 * other field is optional because forcing people to know the serving size is
 * how you end up with invented serving sizes.
 */
import { z } from "zod";
import { servingTypeEnum, sourceTypeEnum, venueTypeEnum } from "@/db/schema";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v === "" ? undefined : v))
  .refine(
    (v) => v === undefined || /^https?:\/\/\S+$/i.test(v),
    "Must be a full http(s) URL",
  );

/** A venue the submitter is creating inline because we don't have it yet. */
export const newVenueSchema = z.object({
  name: z.string().trim().min(2, "Venue name is required").max(120),
  address1: optionalText(160),
  city: z.string().trim().min(1, "City is required").max(80),
  state: z
    .string()
    .trim()
    .length(2, "Use the two-letter state code")
    .transform((v) => v.toUpperCase()),
  postalCode: optionalText(12),
  neighborhood: optionalText(80),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  venueType: z.enum(venueTypeEnum.enumValues).default("bar"),
  website: optionalUrl,
  phone: optionalText(32),
});

export type NewVenueInput = z.infer<typeof newVenueSchema>;

const dayOfWeek = z.coerce.number().int().min(0).max(6);
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const dealScheduleSchema = z.object({
  days: z.array(dayOfWeek).max(7).default([]),
  startTime: timeString,
  endTime: timeString,
});

export const dealDetailsSchema = z
  .object({
    beerName: z.string().trim().min(1, "What beer is it?").max(120),
    brand: optionalText(80),
    beerStyle: optionalText(60),

    /** Integer cents. 0 is allowed - free beer is a real promotion. */
    priceCents: z.coerce
      .number()
      .int("Price must be a whole number of cents")
      .min(0, "Price can't be negative")
      .max(1_000_000, "That price looks like a typo"),

    servingType: z.enum(servingTypeEnum.enumValues).default("other"),
    /** Leave blank when unknown. We store unknown, we never guess. */
    servingSizeOz: z.coerce.number().positive().max(999).optional(),
    servingSizeLabel: optionalText(40),
    quantity: z.coerce.number().int().min(1).max(60).default(1),
    individualServingSizeOz: z.coerce.number().positive().max(999).optional(),

    description: optionalText(280),
    restrictions: optionalText(280),
    ruleDescription: optionalText(280),

    isHappyHour: z.boolean().default(false),
    isConditional: z.boolean().default(false),
    schedule: z.array(dealScheduleSchema).max(7).default([]),

    expiresAt: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(v) : undefined))
      .refine((v) => v === undefined || !Number.isNaN(v.getTime()), "Invalid date"),

    sourceType: z.enum(sourceTypeEnum.enumValues).default("community_submission"),
    sourceUrl: optionalUrl,
    sourceSnapshot: optionalText(500),
  })
  .refine(
    (deal) => deal.quantity === 1 || deal.servingSizeOz === undefined,
    {
      message:
        "For multi-item deals (buckets, buckets of cans) use size per item, not total size",
      path: ["servingSizeOz"],
    },
  );

export type DealDetailsInput = z.infer<typeof dealDetailsSchema>;

/** The one endpoint every community write goes through. */
export const submissionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("new_deal"),
    venueId: z.string().uuid().optional(),
    newVenue: newVenueSchema.optional(),
    deal: dealDetailsSchema,
  }),
  z.object({
    type: z.literal("update_deal"),
    dealId: z.string().uuid(),
    priceCents: z.coerce.number().int().min(0).max(1_000_000).optional(),
    servingSizeOz: z.coerce.number().positive().max(999).optional(),
    servingSizeLabel: optionalText(40),
    note: optionalText(280),
    sourceType: z.enum(sourceTypeEnum.enumValues).default("community_submission"),
    sourceUrl: optionalUrl,
  }),
  z.object({
    type: z.literal("deal_ended"),
    dealId: z.string().uuid(),
    note: optionalText(280),
  }),
  z.object({
    type: z.literal("venue_closed"),
    venueId: z.string().uuid(),
    permanent: z.boolean().default(true),
    note: optionalText(280),
  }),
  z.object({
    type: z.literal("venue_correction"),
    venueId: z.string().uuid(),
    fields: z
      .object({
        name: optionalText(120),
        address1: optionalText(160),
        website: optionalUrl,
        phone: optionalText(32),
      })
      .refine((f) => Object.values(f).some((v) => v !== undefined), "Nothing to correct"),
    note: optionalText(280),
  }),
]);

export type SubmissionInput = z.infer<typeof submissionSchema>;

/** A new_deal submission must target an existing venue or create one. */
export function validateDealTarget(input: SubmissionInput): string | null {
  if (input.type !== "new_deal") return null;
  if (!input.venueId && !input.newVenue) return "Pick a venue or add a new one";
  return null;
}

export const verificationSchema = z.object({
  result: z.enum(["still_available", "no_longer_available", "price_changed"]),
  reportedPriceCents: z.coerce.number().int().min(0).max(1_000_000).optional(),
  note: optionalText(280),
});

export const reportSchema = z.object({
  reason: z.enum([
    "price_wrong",
    "no_longer_available",
    "never_existed",
    "wrong_venue",
    "venue_closed",
    "duplicate",
    "spam_or_joke",
    "offensive",
    "other",
  ]),
  note: optionalText(500),
});

/**
 * A venue comment. The `signal` is an explicit choice rather than something we
 * try to infer from the text - see src/server/comments.ts for why.
 */
export const commentSchema = z.object({
  venueId: z.string().uuid(),
  dealId: z.string().uuid().optional(),
  body: z.string().trim().min(2, "Say a little more than that").max(1000),
  signal: z
    .enum(["none", "still_good", "price_changed", "no_longer_available", "venue_closed"])
    .default("none"),
  reportedPriceCents: z.coerce.number().int().min(0).max(1_000_000).optional(),
  displayName: optionalText(40),
});

export type CommentInput = z.infer<typeof commentSchema>;

/** Requesting a presigned upload. Size and type are re-checked server-side. */
export const uploadTicketSchema = z.object({
  venueId: z.string().uuid(),
  dealId: z.string().uuid().optional(),
  purpose: z.enum(["price_evidence", "menu", "pour", "venue"]).default("pour"),
  mimeType: z.string().min(3).max(100),
  sizeBytes: z.coerce.number().int().positive().max(64 * 1024 * 1024),
  caption: optionalText(200),
  assertedPriceCents: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export type UploadTicketInput = z.infer<typeof uploadTicketSchema>;
