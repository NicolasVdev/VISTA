import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createServer, preview } from "vite";
import { fileURLToPath } from "node:url";

// Optional browser tests: use an installed Playwright package, or the bundled
// Codex runtime via VISTA_PLAYWRIGHT_ROOT. No browser/account profile is reused.
let playwright;
try {
  const require = createRequire(process.env.VISTA_PLAYWRIGHT_ROOT
    ? join(process.env.VISTA_PLAYWRIGHT_ROOT, "package.json") : import.meta.url);
  playwright = require("playwright");
} catch { /* Static build tests remain available without browser tooling. */ }

test("field UX and IndexedDB v2 → v4 regression suite", { skip: !playwright }, async (t) => {
  const server = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  const browser = await playwright.chromium.launch({ headless: true,
    ...(process.env.VISTA_BROWSER_PATH ? { executablePath: process.env.VISTA_BROWSER_PATH } : {}) });
  t.after(async () => { await browser.close(); await server.close(); });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const body = () => page.locator("body").innerText();
  const state = () => page.evaluate(async () => {
    const db = await import("/app/lib/vista-db.ts");
    return db.loadFieldState([{ id: "toiture", label: "Toiture", hint: "" }]);
  });

  await t.test("mobile draft, navigation warning, editing, undo and focus", async () => {
    await page.goto(origin);
    await page.getByRole("button", { name: "Commencer la visite" }).click();
    await page.getByRole("textbox", { name: "Décrire un constat" }).fill("Groom de la porte à régler");
    await page.getByRole("button", { name: /Zone suivante/ }).click();
    assert.match(await body(), /Toiture reste à contrôler/);
    await page.getByRole("button", { name: "Y revenir" }).click();
    assert.equal(await page.getByRole("textbox").inputValue(), "Groom de la porte à régler");
    await page.reload();
    await page.getByRole("button", { name: "Reprendre la visite" }).click();
    assert.equal(await page.getByRole("textbox").inputValue(), "Groom de la porte à régler");
    await page.getByRole("button", { name: "Urgent", exact: true }).click();
    await page.getByRole("button", { name: "Ajouter le constat" }).click();
    await page.getByRole("button", { name: "Modifier le constat" }).waitFor();
    const original = (await state()).observations[0];
    assert.equal(original.severity, "urgent"); assert.equal(original.createAction, true);
    assert.equal(await page.locator(".zone-status.priority-urgent").count(), 1);
    assert.equal(await page.locator(".segment.priority-urgent").count(), 1);
    assert.equal(await page.getByRole("button", { name: "Rien à signaler", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Modifier le constat" }).click();
    await page.getByRole("textbox").fill("Groom défectueux : intervention nécessaire");
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await page.getByRole("button", { name: "Modifier le constat" }).waitFor();
    assert.equal((await state()).observations[0].id, original.id);
    await page.getByRole("button", { name: "Supprimer le constat" }).click();
    await page.getByRole("button", { name: "Annuler", exact: true }).waitFor();
    assert.equal((await state()).zones[0].status, "pending");
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await page.getByRole("button", { name: "Modifier le constat" }).waitFor();
    assert.equal((await state()).observations[0].id, original.id);
    await page.getByRole("button", { name: "Zone 1 sur 9" }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.match(await page.evaluate(() => document.activeElement.textContent), /Zone 1 sur 9/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const smallTargets = await page.locator("button, a[href], .observation-controls label").evaluateAll((elements) => elements.filter((element) => {
      const bounds = element.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0 && (bounds.width < 44 || bounds.height < 44);
    }).map((element) => element.getAttribute("aria-label") || element.textContent));
    assert.deepEqual(smallTargets, []);
  });

  await t.test("closure blockers, optional reason, readonly and idempotent actions", async () => {
    const result = await page.evaluate(async () => {
      const db = await import("/app/lib/vista-db.ts");
      const templates = [{ id: "toiture", label: "Toiture", hint: "" }];
      let state = await db.loadFieldState(templates);
      let blocked = false; try { await db.closeFieldVisit(state.visit.id); } catch { blocked = true; }
      for (const zone of state.zones.filter((zone) => zone.status === "pending")) {
        await db.saveZoneProgress({ ...zone, status: zone.zoneId === "etage-3" ? "inaccessible" : "clear" });
      }
      await db.closeFieldVisit(state.visit.id);
      state = await db.loadFieldState(templates);
      const action = state.actions[0];
      await db.saveAction({ ...action, status: "done", assignee: "Prestataire test", dueDate: "2026-10-10", doneAt: new Date().toISOString() });
      let blockedObservation = false, blockedStatus = false, blockedReopen = false;
      try { await db.saveObservation(state.observations[0]); } catch { blockedObservation = true; }
      try { await db.saveZoneProgress(state.zones[1]); } catch { blockedStatus = true; }
      try { await db.saveVisit({ ...state.visit, status: "in_progress" }); } catch { blockedReopen = true; }
      await db.reopenFieldVisit(state.visit.id);
      await db.closeFieldVisit(state.visit.id);
      state = await db.loadFieldState(templates);
      return { blocked, blockedObservation, blockedStatus, blockedReopen, state };
    });
    assert.equal(result.blocked, true); assert.equal(result.blockedObservation, true);
    assert.equal(result.blockedStatus, true); assert.equal(result.blockedReopen, true);
    assert.equal(result.state.actions.length, 1); assert.equal(result.state.actions[0].status, "done");
    assert.equal(result.state.actions[0].assignee, "Prestataire test");
    await page.reload(); await page.getByRole("button", { name: "Consulter la visite" }).click();
    await page.getByRole("button", { name: /Toiture 1 constat/ }).click();
    assert.equal(await page.getByRole("textbox").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Modifier le constat" }).count(), 0);
    await page.getByRole("button", { name: "Retour à l’accueil" }).click();
    await page.getByRole("button", { name: "Consulter la visite" }).click();
    await page.getByRole("button", { name: "Voir les actions" }).click();
    await page.getByRole("button", { name: /Faites/ }).click();
    assert.match(await body(), /Prestataire test/);
    await page.getByRole("button", { name: "Assigner" }).click();
    await page.getByLabel("Intervenant").fill("Nouvel intervenant");
    await page.getByLabel("Échéance").fill("2026-10-12");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await page.getByRole("button", { name: "Assigner" }).waitFor();
    assert.equal((await state()).actions[0].assignee, "Nouvel intervenant");
    await page.getByRole("button", { name: "Rouvrir", exact: true }).click();
    await page.getByRole("button", { name: /À faire/ }).click();
    await page.getByRole("button", { name: "Marquer faite" }).waitFor();
  });

  await t.test("complete UI flow: pending zone → confirmation → actions → reopening", async () => {
    const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const fresh = await freshContext.newPage();
    await fresh.goto(origin);
    await fresh.getByRole("button", { name: "Commencer la visite" }).click();
    await fresh.getByRole("textbox").fill("Infiltration en toiture");
    await fresh.getByRole("button", { name: "Urgent", exact: true }).click();
    await fresh.getByRole("button", { name: "Ajouter le constat" }).click();
    await fresh.getByRole("button", { name: "Modifier le constat" }).waitFor();
    await fresh.getByRole("button", { name: /Zone suivante/ }).click();
    for (let index = 1; index < 9; index++) {
      if (index === 4) {
        await fresh.getByRole("button", { name: "Non accessible", exact: true }).click();
        await fresh.getByRole("button", { name: "Clé ou badge manquant" }).click();
      } else if (index !== 3) await fresh.getByRole("button", { name: "Rien à signaler", exact: true }).click();
      await fresh.getByRole("button", { name: index === 8 ? /Vérifier la visite/ : /Zone suivante/ }).click();
    }
    await fresh.getByRole("button", { name: /Compléter 4e étage/ }).waitFor();
    assert.equal(await fresh.getByRole("button", { name: "Clôturer la visite" }).isDisabled(), true);
    await fresh.getByRole("button", { name: /Compléter 4e étage/ }).click();
    await fresh.getByRole("button", { name: "Rien à signaler", exact: true }).click();
    await fresh.getByRole("button", { name: "Zone 4 sur 9" }).click();
    await fresh.getByRole("button", { name: /Sous-sol & parking Rien à signaler/ }).click();
    await fresh.getByRole("button", { name: /Vérifier la visite/ }).click();
    await fresh.getByRole("button", { name: "Clôturer la visite" }).click();
    await fresh.getByRole("button", { name: "Oui, clôturer" }).click();
    await fresh.getByRole("button", { name: "Voir les actions" }).click();
    await fresh.getByRole("button", { name: "Marquer faite" }).waitFor();
    assert.match(await fresh.locator("body").innerText(), /Infiltration en toiture/);
    await fresh.getByRole("button", { name: "Accueil", exact: true }).click();
    await fresh.getByRole("button", { name: "Consulter la visite" }).click();
    await fresh.getByRole("button", { name: "Rouvrir", exact: true }).click();
    await fresh.getByRole("textbox", { name: "Décrire un constat" }).waitFor();
    await freshContext.close();
  });

  await t.test("v2 migration defaults and durable media drafts", async () => {
    const migrationContext = await browser.newContext();
    const migrationPage = await migrationContext.newPage();
    await migrationPage.goto(new URL("offline.html", origin).href);
    await migrationPage.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("vista-field-drafts", 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          const visits = db.createObjectStore("visits", { keyPath: "id" });
          const zones = db.createObjectStore("zone-progress", { keyPath: "id" }); zones.createIndex("visitId", "visitId");
          const observations = db.createObjectStore("observations", { keyPath: "id" });
          for (const key of ["visitId", "zoneId", "createdAt"]) observations.createIndex(key, key);
          const captures = db.createObjectStore("captures", { keyPath: "id" });
          captures.createIndex("zoneId", "zoneId"); captures.createIndex("createdAt", "createdAt");
          const now = new Date().toISOString(); const visitId = "residence-parc-2026-09-30";
          visits.put({ id: visitId, propertyName: "Ancienne résidence", address: "Adresse conservée", scheduledAt: now, status: "in_progress", currentZoneId: "toiture", createdAt: now, updatedAt: now });
          observations.put({ id: "old", visitId, zoneId: "toiture", zoneLabel: "Toiture", text: "Ancien constat", photos: [], syncStatus: "local", createdAt: now, updatedAt: now });
        };
        request.onerror = () => reject(request.error); request.onsuccess = () => { request.result.close(); resolve(); };
      });
    });
    const result = await migrationPage.evaluate(async () => {
      const db = await import("/app/lib/vista-db.ts"); const templates = [{ id: "toiture", label: "Toiture", hint: "" }];
      const state = await db.loadFieldState(templates);
      const draft = { id: `${state.visit.id}:toiture`, visitId: state.visit.id, zoneId: "toiture", text: "Brouillon", severity: "planned", photos: [{ id: "photo", blob: new Blob(["image-test"], { type: "image/png" }), mimeType: "image/png", fileName: "test.png", createdAt: new Date().toISOString() }], audio: { id: "audio", blob: new Blob(["audio-test"], { type: "audio/webm" }), mimeType: "audio/webm", fileName: "test.webm", createdAt: new Date().toISOString() } };
      await db.saveDraft(draft);
      const loaded = await db.loadFieldState(templates);
      await db.closeFieldVisit(loaded.visit.id);
      return { visit: loaded.visit, observation: loaded.observations[0], text: loaded.drafts[0].text, photo: await loaded.drafts[0].photos[0].blob.text(), audio: await loaded.drafts[0].audio.blob.text() };
    });
    assert.equal(result.visit.propertyName, "Ancienne résidence"); assert.equal(result.observation.id, "old");
    assert.equal(result.observation.severity, "info"); assert.equal(result.observation.createAction, false);
    assert.equal(result.text, "Brouillon"); assert.equal(result.photo, "image-test"); assert.equal(result.audio, "audio-test");
    await migrationContext.close();
  });

  await t.test("property access persists independently of a closed visit", async () => {
    await page.getByRole("button", { name: "Accueil", exact: true }).click();
    assert.match(await page.locator(".property-followup").innerText(), /1 action ouverte/);
    const before = (await state()).visit;
    await page.getByRole("button", { name: "Renseigner les accès" }).click();
    await page.getByLabel("Gardien / contact").fill("Contact fictif de test");
    await page.getByLabel("Téléphone du gardien").fill("+33 0 00 00 00 00");
    await page.getByLabel("Codes d’accès").fill("Portail : CODE-FICTIF-TEST\nParking : BADGE-FICTIF");
    await page.getByLabel("Informations utiles").fill("Consigne de test : récupérer le badge avant la visite");
    await page.getByRole("button", { name: "Enregistrer les accès" }).click();
    await page.getByRole("button", { name: "Modifier les accès" }).waitFor();
    await page.reload(); await page.getByRole("button", { name: "Modifier les accès" }).waitFor();
    assert.match(await page.locator(".property-access").innerText(), /Contact fictif de test/);
    assert.equal(await page.locator(".guardian-phone").getAttribute("href"), "tel:+33000000000");
    const loaded = await state();
    assert.equal(loaded.visit.status, "completed"); assert.equal(loaded.visit.completedAt, before.completedAt);
    assert.match(loaded.property.accessCodes, /CODE-FICTIF-TEST/);
    const independent = await page.evaluate(async () => {
      const db = await import("/app/lib/vista-db.ts");
      await db.saveProperty({ id: "another-property", name: "Autre copropriété fictive", address: "Adresse test", guardianName: "Autre contact fictif", updatedAt: new Date().toISOString() });
      return (await db.loadFieldState([{ id: "toiture", label: "Toiture", hint: "" }])).property.guardianName;
    });
    assert.equal(independent, "Contact fictif de test");
    await page.getByRole("button", { name: "Modifier les accès" }).click();
    for (const label of ["Gardien / contact", "Téléphone du gardien", "Codes d’accès", "Informations utiles"]) await page.getByLabel(label).fill("");
    await page.getByRole("button", { name: "Enregistrer les accès" }).click();
    await page.getByRole("button", { name: "Renseigner les accès" }).waitFor();
    assert.equal((await state()).property.guardianName, undefined);
  });

  await t.test("severity colors follow the highest severity, never the last added", async () => {
    const severityContext = await browser.newContext(); const severityPage = await severityContext.newPage();
    await severityPage.goto(origin);
    await severityPage.getByRole("button", { name: "Commencer la visite" }).click();
    await severityPage.getByRole("textbox").fill("Constat informatif fictif");
    await severityPage.getByRole("button", { name: "Pour info", exact: true }).click();
    await severityPage.getByRole("button", { name: "Ajouter le constat" }).click();
    await severityPage.getByRole("button", { name: "Modifier le constat" }).waitFor();
    assert.equal(await severityPage.locator(".zone-status.priority-info").count(), 1);
    await severityPage.getByRole("button", { name: "Modifier le constat" }).click();
    await severityPage.getByRole("button", { name: "À planifier", exact: true }).click();
    await severityPage.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await severityPage.locator(".zone-status.priority-planned").waitFor();
    await severityPage.getByRole("textbox").fill("Constat urgent fictif");
    await severityPage.getByRole("button", { name: "Urgent", exact: true }).click();
    await severityPage.getByRole("button", { name: "Ajouter le constat" }).click();
    await severityPage.locator(".zone-status.priority-urgent").waitFor();
    assert.equal(await severityPage.locator(".segment.priority-urgent").count(), 1);
    await severityPage.getByRole("textbox").fill("Autre information fictive");
    await severityPage.getByRole("button", { name: "Pour info", exact: true }).click();
    await severityPage.getByRole("button", { name: "Ajouter le constat" }).click();
    await severityPage.getByRole("button", { name: "Supprimer le constat" }).nth(2).waitFor();
    assert.equal(await severityPage.locator(".zone-status.priority-urgent").count(), 1);
    await severityPage.getByRole("button", { name: "Supprimer le constat" }).nth(1).click();
    await severityPage.locator(".zone-status.priority-planned").waitFor();
    await severityContext.close();
  });

  await t.test("desktop alignment and install advice persistence", async () => {
    await page.getByRole("button", { name: "Accueil", exact: true }).click();
    await page.getByRole("button", { name: "Masquer ce conseil" }).click();
    await page.reload(); await page.getByRole("button", { name: "Consulter la visite" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Masquer ce conseil" }).count(), 0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const dimensions = await page.locator(".vista-shell").boundingBox();
    assert.equal(dimensions.width, 560); assert.equal(dimensions.x, 440);
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
    await page.screenshot({ path: fileURLToPath(new URL("../artifacts/refonte-home.png", import.meta.url)) });
  });

  await t.test("production bundles are precached and open offline", async () => {
    const production = await preview({ preview: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
    const offlineContext = await browser.newContext();
    try {
      const offlinePage = await offlineContext.newPage();
      await offlinePage.goto(production.resolvedUrls.local[0]);
      await offlinePage.getByRole("button", { name: "Commencer la visite" }).waitFor();
      await offlinePage.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
      });
      const keys = await offlinePage.evaluate(async () => (await (await caches.open("vista-shell-v3")).keys()).map((request) => new URL(request.url).pathname));
      assert.equal(keys.some((key) => /\/assets\/.+\.js$/.test(key)), true);
      assert.equal(keys.some((key) => /\/assets\/.+\.css$/.test(key)), true);
      assert.equal(keys.includes("/fonts/figtree-latin-wght-normal.woff2"), true);
      await offlineContext.setOffline(true);
      await offlinePage.reload();
      await offlinePage.getByRole("button", { name: "Commencer la visite" }).waitFor();
      assert.match(await offlinePage.locator("body").innerText(), /Hors connexion/);
      await offlinePage.evaluate(() => document.fonts.ready);
      assert.equal(await offlinePage.evaluate(() => document.fonts.check('800 36px Figtree')), true);
    } finally {
      await offlineContext.close();
      await new Promise((resolve) => production.httpServer.close(resolve));
    }
  });
});
