import clsx from "clsx";
import { formatHeroPrice } from "@/lib/money";

interface Props {
  priceCents: number;
  currency?: string;
  size?: "lg" | "md" | "sm";
  className?: string;
}

/**
 * The hero. Price is the reason anyone opens this site, so it gets the largest
 * type on the card and shrinks its own font as the number gets longer rather
 * than wrapping or overflowing ("$1" and "$14.50" both have to look right).
 */
export function PriceBlock({ priceCents, currency = "USD", size = "lg", className }: Props) {
  const text = formatHeroPrice(priceCents, currency);

  const base =
    size === "lg"
      ? text.length <= 2
        ? "text-[2.6rem]"
        : text.length <= 3
          ? "text-[2.3rem]"
          : text.length <= 5
            ? "text-[1.85rem]"
            : "text-[1.5rem]"
      : size === "md"
        ? text.length <= 3
          ? "text-2xl"
          : "text-xl"
        : "text-lg";

  return (
    <span className={clsx("price-hero block text-ink", base, className)}>{text}</span>
  );
}
