// Windows Application Control may reject native SWC. Use the official WASM
// package through Next's explicit WASM path on Windows; Linux keeps native SWC.
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
const environment = { ...process.env };
if (process.platform === "win32") {
  environment.NEXT_TEST_WASM_DIR = dirname(
    require.resolve("@next/swc-wasm-nodejs"),
  );
}
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)],
  { env: environment, stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
