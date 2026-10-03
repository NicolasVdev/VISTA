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

test("field UX and IndexedDB v2 → v6 regression suite", { skip: !playwright }, async (t) => {
  const server = await createServer({ server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/artifacts/**"] } }, logLevel: "error" });
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
      const keys = await offlinePage.evaluate(async () => (await (await caches.open("vista-shell-v5")).keys()).map((request) => new URL(request.url).pathname));
      assert.equal(keys.some((key) => /\/assets\/.+\.js$/.test(key)), true);
      assert.equal(keys.some((key) => /\/assets\/.+\.css$/.test(key)), true);
      assert.equal(keys.includes("/fonts/figtree-latin-wght-normal.woff2"), true);
      assert.equal(keys.includes("/vendor/pdf-lib.min.js"), true);
      assert.equal(keys.includes("/vendor/jszip.min.js"), true);
      await offlineContext.setOffline(true);
      await offlinePage.reload();
      await offlinePage.getByRole("button", { name: "Commencer la visite" }).waitFor();
      assert.match(await offlinePage.locator("body").innerText(), /Hors connexion/);
      await offlinePage.evaluate(() => document.fonts.ready);
      assert.equal(await offlinePage.evaluate(() => document.fonts.check('800 36px Figtree')), true);
      await offlinePage.evaluate(async () => {
        const database = await new Promise((resolve, reject) => { const request = indexedDB.open("vista-field-drafts"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const transaction = database.transaction(["visits", "zone-progress"], "readwrite");
        const visits = transaction.objectStore("visits"); const zones = transaction.objectStore("zone-progress");
        visits.getAll().onsuccess = (event) => event.target.result.forEach((visit) => visits.put({ ...visit, status: "completed", completedAt: new Date().toISOString() }));
        zones.getAll().onsuccess = (event) => event.target.result.forEach((zone) => zones.put({ ...zone, status: "clear" }));
        await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); database.close();
      });
      await offlinePage.reload(); await offlinePage.getByRole("button", { name: "Consulter la visite", exact: true }).click();
      await offlinePage.getByRole("button", { name: "Compte rendu et sauvegarde", exact: true }).click();
      await offlinePage.getByRole("checkbox").check(); await offlinePage.getByRole("button", { name: "Préparer le PDF", exact: true }).click();
      await offlinePage.getByRole("link", { name: "Télécharger le PDF", exact: true }).waitFor();
      await offlinePage.getByRole("button", { name: "Préparer la sauvegarde", exact: true }).click();
      await offlinePage.getByRole("link", { name: "Télécharger la sauvegarde", exact: true }).waitFor();
    } finally {
      await offlineContext.close();
      await new Promise((resolve) => production.httpServer.close(resolve));
    }
  });

  await t.test("custom routes preserve identities, media and previous visits", async () => {
    const customContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const custom = await customContext.newPage();
    await custom.goto(origin);
    await custom.getByRole("button", { name: /Nouvelle visite/ }).first().click();
    await custom.getByLabel("Résidence", { exact: true }).fill("Résidence pilote fictive");
    await custom.getByLabel("Adresse", { exact: true }).fill("12 rue de test");
    await custom.getByLabel("Gestionnaire", { exact: true }).fill("Gestionnaire de test");
    await custom.getByLabel("Nom de la zone 1", { exact: true }).fill("10e étage");
    await custom.getByRole("button", { name: "Retirer la zone 9", exact: true }).click();
    await custom.getByRole("button", { name: "Ajouter une zone", exact: true }).click();
    await custom.getByLabel("Nom de la zone 9", { exact: true }).fill("Chaufferie");
    await custom.getByRole("button", { name: "Créer la visite", exact: true }).click();
    await custom.getByRole("button", { name: "Commencer la visite", exact: true }).waitFor();
    const result = await custom.evaluate(async () => {
      const db = await import("/app/lib/vista-db.ts"); const templates = [{ id: "toiture", label: "Toiture", hint: "" }];
      let state = await db.loadFieldState(templates); const firstId = state.visit.id; const zoneId = state.zones[0].zoneId;
      const now = new Date().toISOString();
      await db.saveObservation({ id: "pilot-constat", visitId: firstId, zoneId, zoneLabel: "10e étage", text: "Fuite fictive", severity: "urgent", createAction: true, photos: [], syncStatus: "local", createdAt: now, updatedAt: now });
      let deletionBlocked = false; try { await db.saveVisitRoute(firstId, state.zones.slice(1).map((zone) => ({ id: zone.zoneId, label: zone.zoneLabel, hint: zone.hint || "" }))); } catch { deletionBlocked = true; }
      const route = state.zones.map((zone) => ({ id: zone.zoneId, label: zone.zoneId === zoneId ? "Terrasse technique" : zone.zoneLabel, hint: zone.hint || "" }));
      await db.saveVisitRoute(firstId, [...route.slice(1), route[0]]);
      state = await db.loadFieldState(templates);
      const renamed = state.observations[0];
      for (const zone of state.zones.filter((zone) => zone.status === "pending")) await db.saveZoneProgress({ ...zone, status: "clear" });
      await db.closeFieldVisit(firstId);
      let closedBlocked = false; try { await db.saveVisitRoute(firstId, route); } catch { closedBlocked = true; }
      const secondId = await db.createFieldVisit({ propertyName: state.visit.propertyName, address: state.visit.address, managerName: "Autre gestionnaire", scheduledAt: now }, [{ id: "second-zone", label: "Hall", hint: "Portes" }]);
      const second = await db.loadFieldState(templates);
      await db.selectFieldVisit(firstId); const first = await db.loadFieldState(templates);
      await db.resetFieldState(templates); const preserved = await db.loadFieldState(templates, firstId);
      return { firstId, secondId, deletionBlocked, closedBlocked, renamed, second, first, preserved };
    });
    assert.equal(result.deletionBlocked, true); assert.equal(result.closedBlocked, true);
    assert.equal(result.renamed.zoneLabel, "Terrasse technique"); assert.equal(result.renamed.id, "pilot-constat");
    assert.equal(result.first.zones.at(-1).zoneLabel, "Terrasse technique");
    assert.equal(result.first.zones.some((zone) => zone.zoneLabel === "Sous-sol & parking"), false);
    assert.equal(result.second.property.id, result.first.property.id);
    assert.equal(result.second.zones.length, 1); assert.equal(result.second.observations.length, 0);
    assert.equal(result.preserved.visits.length, 2); assert.equal(result.preserved.observations.length, 1);
    await custom.reload(); await custom.getByRole("button", { name: "Consulter la visite", exact: true }).waitFor();
    assert.equal(await custom.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await customContext.close();
  });

  await t.test("PDF with photos and full archive exclude private access information", async () => {
    const exportContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const exportPage = await exportContext.newPage(); await exportPage.goto(origin);
    const result = await exportPage.evaluate(async () => {
      const db = await import("/app/lib/vista-db.ts"); const exporter = await import("/app/lib/vista-export.ts");
      const templates = [{ id: "toiture", label: "Toiture", hint: "" }];
      const visitId = await db.createFieldVisit({ propertyName: "Résidence pilote fictive", address: "12 rue de test", managerName: "Gestionnaire de test", scheduledAt: "2026-10-06T08:00:00.000Z" }, [{ id: "terrasse", label: "Terrasse technique", hint: "Étanchéité" }, { id: "chaufferie", label: "Chaufferie", hint: "Accès" }]);
      let state = await db.loadFieldState(templates); const now = new Date().toISOString();
      await db.saveVisit({ ...state.visit, accessNotes: "PRIVATE-CODE-DO-NOT-EXPORT" });
      await db.saveProperty({ ...state.property, accessCodes: "PRIVATE-CODE-DO-NOT-EXPORT", guardianName: "PRIVATE-GUARDIAN", guardianPhone: "PRIVATE-PHONE" });
      const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 500; const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#dfece5"; ctx.fillRect(0, 0, 800, 500); ctx.fillStyle = "#19392b"; ctx.font = "30px sans-serif"; ctx.fillText("PHOTO FICTIVE - TEST VISTA", 50, 100);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const audio = { id: "qa-audio", blob: new Blob(["original-audio"], { type: "audio/webm" }), mimeType: "audio/webm", fileName: "test.webm", createdAt: now };
      await db.saveObservation({ id: "qa-observation", visitId, zoneId: "terrasse", zoneLabel: "Terrasse technique", text: "Infiltration fictive : étanchéité dégradée, intervention à prévoir. ".repeat(20), severity: "urgent", createAction: true, photos: [{ id: "qa-photo", blob, mimeType: "image/png", fileName: "test.png", createdAt: now }], audio, syncStatus: "local", createdAt: now, updatedAt: now });
      await db.saveDraft({ id: `${visitId}:chaufferie`, visitId, zoneId: "chaufferie", text: "Brouillon à conserver", severity: "info", photos: [], audio });
      state = await db.loadFieldState(templates); await db.saveZoneProgress({ ...state.zones[1], status: "inaccessible", inaccessibleReason: "missing_key" });
      await db.closeFieldVisit(visitId); state = await db.loadFieldState(templates);
      await db.splitAction(state.actions.find((item) => item.visitId === visitId).id, [{ text: "Réparer l’étanchéité", assignee: "Entreprise toiture", dueDate: "2026-10-07", severity: "urgent" }, { text: "Contrôler la peinture", assignee: "Entreprise peinture", dueDate: "2026-10-21", severity: "planned" }]);
      state = await db.loadFieldState(templates);
      const pdf = await exporter.generateVisitPdf(state); const archive = await exporter.generateVisitArchive(state);
      const zip = await new window.JSZip().loadAsync(archive); const json = await zip.file("visite.json").async("string");
      const media = await zip.file("medias/qa-audio.webm").async("string");
      window.qaPdfUrl = URL.createObjectURL(pdf);
      const link = document.createElement("a"); link.href = window.qaPdfUrl; link.download = "beta-qa.pdf"; link.textContent = "QA PDF"; document.body.append(link);
      return { json, media, size: pdf.size, blockers: exporter.reportBlockers({ ...state, observations: state.observations.map((item) => ({ ...item, text: "" })) }) };
    });
    assert.equal(result.json.includes("PRIVATE-"), false); assert.equal(result.media, "original-audio");
    assert.equal(JSON.parse(result.json).drafts[0].text, "Brouillon à conserver");
    assert.equal(JSON.parse(result.json).observations[0].photos[0].path, "medias/qa-photo.png");
    assert.ok(result.size > 5000); assert.equal(result.blockers.length, 1);
    await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
    const downloadPromise = exportPage.waitForEvent("download"); await exportPage.getByRole("link", { name: "QA PDF", exact: true }).click();
    await (await downloadPromise).saveAs(fileURLToPath(new URL("../artifacts/beta-qa.pdf", import.meta.url)));
    await exportPage.reload(); await exportPage.getByRole("button", { name: "Consulter la visite", exact: true }).click();
    await exportPage.getByRole("button", { name: "Compte rendu et sauvegarde", exact: true }).click();
    await exportPage.getByRole("checkbox").check(); await exportPage.getByRole("button", { name: "Préparer le PDF", exact: true }).click();
    await exportPage.getByRole("link", { name: "Télécharger le PDF", exact: true }).waitFor();
    await exportPage.getByRole("button", { name: "Consulter la version 1", exact: true }).waitFor();
    await exportPage.getByRole("button", { name: "Fermer", exact: true }).click();
    await exportPage.reload(); await exportPage.getByRole("button", { name: "Consulter la visite", exact: true }).click();
    await exportPage.getByRole("button", { name: "Compte rendu et sauvegarde", exact: true }).click();
    await exportPage.getByRole("button", { name: "Consulter la version 1", exact: true }).click();
    await exportPage.getByRole("link", { name: "Ouvrir le PDF", exact: true }).waitFor();
    const storedReports = await exportPage.evaluate(async () => { const db = await import("/app/lib/vista-db.ts"); const state = await db.loadFieldState([{ id: "toiture", label: "Toiture", hint: "" }]); const exp = await import("/app/lib/vista-export.ts"); const archive = await exp.generateVisitArchive(state); const zip = await new window.JSZip().loadAsync(archive); return { count: state.reports.length, size: state.reports[0].blob.size, inBackup: Boolean(zip.file("comptes-rendus/v1.pdf")) }; });
    assert.equal(storedReports.count, 1); assert.ok(storedReports.size > 5000); assert.equal(storedReports.inBackup, true);
    await exportPage.screenshot({ path: fileURLToPath(new URL("../artifacts/beta-export-mobile.png", import.meta.url)) });
    assert.equal(await exportPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await exportPage.evaluate(async () => { const db = await import("/app/lib/vista-db.ts"); const state = await db.loadFieldState([{ id: "toiture", label: "Toiture", hint: "" }]); await db.saveAction({ ...state.actions.find((item) => item.visitId === state.visit.id), assignee: "Entreprise modifiée", updatedAt: new Date().toISOString() }); });
    await exportPage.reload(); await exportPage.getByRole("button", { name: "Consulter la visite", exact: true }).click();
    await exportPage.getByRole("button", { name: "Compte rendu et sauvegarde", exact: true }).click();
    await exportPage.getByText("Version antérieure : la visite ou les actions ont changé depuis ce PDF.", { exact: true }).waitFor();
    await exportPage.getByRole("checkbox").check(); await exportPage.getByRole("button", { name: "Préparer le PDF", exact: true }).click();
    await exportPage.getByRole("button", { name: "Consulter la version 2", exact: true }).waitFor();
    await exportContext.close();
  });

  await t.test("PDF paginates long actions and preserves full identities and photo context", async () => {
    const pdfPage = await context.newPage(); await pdfPage.goto(origin);
    const result = await pdfPage.evaluate(async () => {
      const db = await import("/app/lib/vista-db.ts"); const exporter = await import("/app/lib/vista-export.ts");
      const state = await db.loadFieldState([{ id: "hall", label: "Hall", hint: "" }]);
      const now = new Date().toISOString();
      const zone = { ...state.zones[0], zoneId: "long", zoneLabel: "Terrasse et équipements techniques du bâtiment principal", status: "observed" };
      const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 300;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#1e6b4f"; ctx.fillRect(0, 0, 200, 300);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const field = { ...state, visit: { ...state.visit, status: "completed", managerName: "Jean-Baptiste de la Tour du Pin Gestionnaire intégral", propertyName: "Résidence des Grands Jardins de la Plaine Saint-Denis - Bâtiments A, B et C" }, zones: [zone], observations: [{ id: "obs-long", zoneId: zone.zoneId, zoneLabel: zone.zoneLabel, text: "Observation complète.", severity: "urgent", photos: [{ id: "photo", blob, fileName: "test.png", createdAt: now }], createAction: true }], actions: [{ id: "long-action", visitId: state.visit.id, zoneId: zone.zoneId, zoneLabel: zone.zoneLabel, text: "Intervention longue à conserver intégralement. ".repeat(200) + "FIN-ACTION-INTÉGRALE", assignee: "Société Générale des Interventions Techniques Nom complet", dueDate: "2026-10-31", severity: "urgent", status: "open" }] };
      await exporter.generateVisitPdf({ ...field, actions: [] }); // Load the real vendor bundle.
      const factory = window.PDFLib.PDFDocument.create;
      const draws = []; const documents = [];
      window.PDFLib.PDFDocument.create = async () => {
        const doc = await factory(); documents.push(doc); const add = doc.addPage.bind(doc);
        doc.addPage = (...args) => {
          const page = add(...args); const draw = page.drawText.bind(page);
          page.drawText = (text, options) => { draws.push({ text, x: options.x, y: options.y, right: options.x + options.font.widthOfTextAtSize(text, options.size) }); return draw(text, options); };
          return page;
        };
        return doc;
      };
      let pdf, emptyPdf;
      try {
        pdf = await exporter.generateVisitPdf(field);
        emptyPdf = await exporter.generateVisitPdf({ ...field, visit: { ...field.visit, propertyName: "Visite sans constat", managerName: "Gestionnaire test" }, zones: [{ ...zone, zoneLabel: "Hall", status: "clear" }], observations: [], actions: [] });
      } finally { window.PDFLib.PDFDocument.create = factory; }
      const link = document.createElement("a"); link.href = URL.createObjectURL(pdf); link.download = "pdf-long-actions.pdf"; link.textContent = "Long PDF"; document.body.append(link);
      const emptyLink = document.createElement("a"); emptyLink.href = URL.createObjectURL(emptyPdf); emptyLink.download = "pdf-empty.pdf"; emptyLink.textContent = "Empty PDF"; document.body.append(emptyLink);
      return { draws, size: pdf.size, emptyPages: documents[1].getPageCount() };
    });
    const text = result.draws.map((item) => item.text).join(" ");
    assert.match(text, /Jean-Baptiste de la Tour du Pin Gestionnaire intégral/);
    const treatmentText = result.draws.filter((item) => Math.abs(item.x - 420) < 0.1).map((item) => item.text).join(" ");
    assert.match(treatmentText, /Société Générale des Interventions Techniques Nom complet/);
    assert.match(text, /FIN-ACTION-INTÉGRALE/);
    assert.match(text, /constat 1 - photo 1/);
    assert.match(text, /\(suite\)/);
    assert.equal(result.emptyPages, 1);
    assert.deepEqual(result.draws.filter((item) => item.y < 40 || item.right > 549 || item.x < 48), []);
    const download = pdfPage.waitForEvent("download"); await pdfPage.getByRole("link", { name: "Long PDF" }).click();
    await (await download).saveAs(fileURLToPath(new URL("../artifacts/pdf-long-actions.pdf", import.meta.url)));
    const emptyDownload = pdfPage.waitForEvent("download"); await pdfPage.getByRole("link", { name: "Empty PDF" }).click();
    await (await emptyDownload).saveAs(fileURLToPath(new URL("../artifacts/pdf-empty.pdf", import.meta.url)));
    await pdfPage.close();
  });

  await t.test("dialogs center on desktop and scroll to their last control on short mobile", async () => {
    const modalContext = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const modal = await modalContext.newPage();
    await modal.goto(origin); await modal.getByRole("button", { name: "Nouvelle visite", exact: true }).click();
    const bounds = await modal.getByRole("dialog").boundingBox();
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - 720) < 2);
    assert.ok(Math.abs(bounds.y + bounds.height / 2 - 450) < 2);
    const scrollable = await modal.locator(".sheet-body").evaluate((element) => element.scrollHeight > element.clientHeight);
    assert.equal(scrollable, true);
    await modal.getByRole("button", { name: "Créer la visite", exact: true }).scrollIntoViewIfNeeded();
    assert.ok((await modal.getByRole("button", { name: "Créer la visite", exact: true }).boundingBox()).y < 900);
    await modal.screenshot({ path: fileURLToPath(new URL("../artifacts/modal-desktop.png", import.meta.url)) });
    await modal.setViewportSize({ width: 360, height: 480 });
    await modal.getByLabel("Gestionnaire", { exact: true }).focus();
    await modal.getByRole("button", { name: "Créer la visite", exact: true }).scrollIntoViewIfNeeded();
    const mobileBounds = await modal.getByRole("dialog").boundingBox();
    assert.ok(mobileBounds.y >= 0); assert.ok(mobileBounds.y + mobileBounds.height <= 480);
    const lastControl = await modal.getByRole("button", { name: "Créer la visite", exact: true }).boundingBox();
    assert.ok(lastControl.y + lastControl.height <= 480);
    assert.equal(await modal.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await modal.screenshot({ path: fileURLToPath(new URL("../artifacts/modal-short-mobile.png", import.meta.url)) });
    await modalContext.close();
  });

  await t.test("overview exposes all planned visits and asks for each author", async () => {
    const overviewContext = await browser.newContext(); const overview = await overviewContext.newPage(); await overview.goto(origin);
    await overview.evaluate(async () => { const db = await import("/app/lib/vista-db.ts"); for (const day of [9, 7, 8]) await db.createFieldVisit({ propertyName: `Visite du ${day}`, address: "Adresse fictive", managerName: "Alice", scheduledAt: `2026-10-0${day}T08:00:00Z` }, [{ id: `zone-${day}`, label: "Hall", hint: "" }]); });
    await overview.reload(); const cards = overview.locator(".overview-visit"); await cards.first().waitFor();
    assert.equal(await cards.count(), 4);
    const names = await cards.allTextContents(); assert.ok(names.findIndex((item) => item.includes("Visite du 7")) < names.findIndex((item) => item.includes("Visite du 8")));
    for (const width of [1440, 360]) {
      await overview.setViewportSize({ width, height: 900 });
      const layouts = await cards.evaluateAll((elements) => elements.map((element) => {
        const card = element.getBoundingClientRect(), title = element.querySelector("strong").getBoundingClientRect(), details = element.querySelector("small").getBoundingClientRect(), icon = element.querySelector("svg").getBoundingClientRect();
        return { separateLines: details.top >= title.bottom, iconAtRight: card.right - icon.right < 24, fits: element.scrollWidth <= element.clientWidth };
      }));
      assert.ok(layouts.every((item) => item.separateLines && item.iconAtRight && item.fits));
      await overview.screenshot({ path: fileURLToPath(new URL(`../artifacts/overview-cards-${width}.png`, import.meta.url)) });
    }
    await cards.filter({ hasText: "Visite du 7" }).click();
    await overview.locator(".visit-card h2").filter({ hasText: "Visite du 7" }).waitFor();
    await overview.getByRole("button", { name: "Nouvelle visite", exact: true }).click();
    assert.equal(await overview.getByLabel("Gestionnaire", { exact: true }).inputValue(), "");
    await overview.getByRole("button", { name: "Fermer", exact: true }).click();
    await overview.locator(".install-card-main").click(); await overview.getByRole("dialog", { name: "Installer VISTA" }).waitFor();
    await overviewContext.close();
  });

  await t.test("split actions retain independent assignments through reopening and undo", async () => {
    const splitContext = await browser.newContext(); const split = await splitContext.newPage(); await split.goto(origin);
    await split.evaluate(async () => { const db = await import("/app/lib/vista-db.ts"); const templates = [{ id: "hall", label: "Hall", hint: "" }]; const now = new Date().toISOString(); const id = await db.createFieldVisit({ propertyName: "Copro test", address: "Adresse test", managerName: "Bob", scheduledAt: now }, templates); await db.saveObservation({ id: "multi", visitId: id, zoneId: "hall", zoneLabel: "Hall", text: "Réparer la porte et repeindre le palier", photos: [], severity: "urgent", createAction: true, createdAt: now, updatedAt: now, syncStatus: "local" }); await db.closeFieldVisit(id); });
    await split.reload(); await split.getByRole("button", { name: "Actions", exact: true }).click();
    await split.getByRole("button", { name: "Scinder en plusieurs actions", exact: true }).click();
    await split.getByLabel("Description de l’action 1", { exact: true }).fill("Réparer la porte");
    await split.getByLabel("Entreprise / intervenant 1", { exact: true }).fill("Serrurier");
    await split.getByLabel("Échéance de l’action 1", { exact: true }).fill("2026-10-07");
    await split.getByLabel("Description de l’action 2", { exact: true }).fill("Repeindre le palier");
    await split.getByLabel("Entreprise / intervenant 2", { exact: true }).fill("Peintre");
    await split.getByLabel("Échéance de l’action 2", { exact: true }).fill("2026-10-20");
    await split.getByLabel("Urgence de l’action 2", { exact: true }).selectOption("planned");
    await split.getByRole("button", { name: "Enregistrer les actions séparées", exact: true }).click();
    await split.getByRole("dialog").waitFor({ state: "hidden" }); assert.equal(await split.locator(".action-card").count(), 2);
    const result = await split.evaluate(async () => { const db = await import("/app/lib/vista-db.ts"); const templates = [{ id: "hall", label: "Hall", hint: "" }]; let state = await db.loadFieldState(templates); await db.reopenFieldVisit(state.visit.id); await db.closeFieldVisit(state.visit.id); state = await db.loadFieldState(templates); const actions = state.actions; await db.reopenFieldVisit(state.visit.id); const removed = await db.deleteObservation(state.observations[0]); const empty = await db.loadFieldState(templates); await db.restoreObservation(state.observations[0], removed); const restored = await db.loadFieldState(templates); return { actions, remaining: empty.actions.length, restored: restored.actions.length, source: restored.observations[0].text }; });
    assert.equal(result.actions.length, 2); assert.deepEqual(result.actions.map((item) => item.assignee).sort(), ["Peintre", "Serrurier"]);
    assert.deepEqual(result.actions.map((item) => item.dueDate).sort(), ["2026-10-07", "2026-10-20"]);
    assert.equal(result.remaining, 0); assert.equal(result.restored, 2); assert.equal(result.source, "Réparer la porte et repeindre le palier");
    await splitContext.close();
  });

  await t.test("integration ports fail closed and calendar payload excludes private access", async () => {
    const result = await page.evaluate(async () => { const integration = await import("/app/lib/integrations.ts"); const db = await import("/app/lib/vista-db.ts"); const state = await db.loadFieldState([{ id: "toiture", label: "Toiture", hint: "" }]); let disconnected = false; try { integration.integrationWithCapability([], "google-workspace", "calendar"); } catch { disconnected = true; } return { disconnected, event: integration.calendarEventForVisit({ ...state.visit, accessNotes: "SECRET" }, 60, [30, 30, 60]) }; });
    assert.equal(result.disconnected, true); assert.deepEqual(result.event.reminderMinutes, [30, 60]); assert.equal(JSON.stringify(result.event).includes("SECRET"), false);
  });
});
