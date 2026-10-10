import { configDefaults } from "vitest/config";
import { packageConfig } from "../../vitest.shared.ts";

/** The round trip of every library release has a task of its own (vitest.roundtrip.config.ts). */
export default packageConfig({ environment: "happy-dom", test: { exclude: [...configDefaults.exclude, "src/**/*.roundtrip.test.ts"] } });
