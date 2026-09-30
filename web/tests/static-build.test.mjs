import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("produces an installable static VISTA build", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(
    await readFile(new URL("../dist/manifest.webmanifest", import.meta.url), "utf8"),
  );

  assert.match(html, /<title>VISTA — Visites techniques<\/title>/i);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/i);
  assert.match(html, /src="\/assets\/[^"]+\.js"/i);
  assert.equal(manifest.short_name, "VISTA");
  assert.equal(manifest.display, "standalone");
  await access(new URL("../dist/sw.js", import.meta.url));
  await access(new URL("../dist/icon-192.png", import.meta.url));
  await access(new URL("../dist/icon-512.png", import.meta.url));
});
