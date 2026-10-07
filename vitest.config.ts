import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/*
  Node environment only, and no database.

  Every bug this project has actually shipped lived in a pure function —
  `formatServingSize` preferring ounces over a stated label, the haversine
  Earth-radius binding as an integer, `??` not catching an empty env string.
  Those need no DOM and no Postgres, so the suite stays fast enough to run on
  every save and has nothing to flake on.
*/
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts"],
    },
  },
});
