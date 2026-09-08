import { ImageResponse } from "next/og";

/**
 * Share card. Generated at request time by next/og rather than shipped as a
 * binary, so it needs no design tooling and stays in sync with the palette.
 *
 * Only system fonts are used — loading a webfont here would add a network
 * fetch to every crawl and can fail the build offline.
 */
export const runtime = "nodejs";
export const alt = "Pour Finder — cheap beer near you";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#faf6ef",
          padding: "64px 72px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#17130f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
            }}
          >
            🍺
          </div>
          {/* Satori requires an explicit display on any node with >1 child. */}
          <div
            style={{
              display: "flex",
              fontSize: 34,
              fontWeight: 800,
              color: "#17130f",
              letterSpacing: -1,
            }}
          >
            <span>Pour</span>
            <span style={{ color: "#b97400" }}>Finder</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              color: "#17130f",
              letterSpacing: -3.5,
              lineHeight: 1.02,
            }}
          >
            Where can I get a
          </div>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              color: "#17130f",
              letterSpacing: -3.5,
              lineHeight: 1.02,
            }}
          >
            cheap beer near me?
          </div>
          <div style={{ fontSize: 30, color: "#57504a", marginTop: 22 }}>
            Community-reported prices, with the date each one was last confirmed.
          </div>
        </div>

        {/* Sample price pills — the product's whole visual identity in one row. */}
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {[
            { price: "$1", beer: "Bud draft", accent: true },
            { price: "$4", beer: "Narragansett tallboy", accent: false },
            { price: "$5.95", beer: "16 oz draft", accent: false },
          ].map((item) => (
            <div
              key={item.price}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                background: item.accent ? "#f0a202" : "#ffffff",
                border: "3px solid #17130f",
                borderRadius: 999,
                padding: "12px 26px",
              }}
            >
              <span style={{ fontSize: 38, fontWeight: 800, color: "#17130f", letterSpacing: -1.5 }}>
                {item.price}
              </span>
              <span style={{ fontSize: 22, color: "#17130f" }}>{item.beer}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
