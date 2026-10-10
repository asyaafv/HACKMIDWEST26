/** Unit checks verify the independent demo seed's hashes and source-backed links. */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { jsonPointer, stableSourceId } from "../scripts/import.js";

const root = new URL("../data/synthetic/", import.meta.url);
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
describe("SYNTHETIC_DEMO_DATA manifest", () => {
  it("pins source bytes and explicit relationship targets", async () => {
    const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
    expect(manifest.datasetLabel).toBe("SYNTHETIC_DEMO_DATA");
    const files = new Map<string, unknown>();
    for (const file of manifest.files) {
      const bytes = await readFile(new URL(file.path, root));
      expect(digest(bytes)).toBe(file.sha256);
      files.set(file.path, JSON.parse(bytes.toString("utf8")));
    }
    const selectors = new Set(manifest.records.map((record: { domain: string; sourceId: string }) => `${record.domain}:${record.sourceId}`));
    for (const record of manifest.records) {
      const content = jsonPointer(files.get(record.path), record.pointer);
      expect(jsonPointer(content, record.idPointer)).toBe(record.sourceId);
      for (const link of record.links) {
        expect(jsonPointer(content, link.pointer)).toBe(link.sourceId);
        expect(selectors.has(`${link.domain}:${link.sourceId}`)).toBe(true);
      }
    }
    expect(stableSourceId("SYNTHETIC_DEMO_DATA", "pm", "GATE-ISSUE-101")).toBe(stableSourceId("SYNTHETIC_DEMO_DATA", "pm", "GATE-ISSUE-101"));
  });
});
