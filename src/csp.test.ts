import { execFileSync } from "node:child_process";
import { it, expect } from "vitest";
it("validates under a runtime that prohibits dynamic string code generation", () => {
  const moduleUrl = new URL("./workspace-validator.js", import.meta.url).href;
  const demoUrl = new URL("../examples/demo.olw.json", import.meta.url).href;
  const script = `import validate from ${JSON.stringify(moduleUrl)};import {readFileSync} from 'node:fs';const w=JSON.parse(readFileSync(new URL(${JSON.stringify(demoUrl)}),'utf8'));if(!validate(w))throw Error('demo rejected');w.schemaVersion=2;if(validate(w))throw Error('invalid accepted');console.log('static validator passed');`;
  expect(
    execFileSync(
      process.execPath,
      [
        "--disallow-code-generation-from-strings",
        "--input-type=module",
        "-e",
        script,
      ],
      { encoding: "utf8" },
    ),
  ).toContain("static validator passed");
});
