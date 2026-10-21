import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

/** swisstopo answers used instead of the live API (deterministic, offline). */
const SEARCH = {
  results: [
    {
      id: 131076,
      attrs: { origin: "gazetteer", label: "<i>Partie de quartier</i> <b>Flon</b> (VD) - Lausanne", x: 1152612.375, y: 2537823.75, lon: 6.62835, lat: 46.52192 },
    },
    {
      id: 660965,
      attrs: { origin: "address", label: "Rue Centrale 31 <b>1003 Lausanne</b>", x: 1152510.25, y: 2538405.0, lon: 6.63594, lat: 46.52105 },
    },
  ],
};
const IDENTIFY = {
  results: [{ geometry: { coordinates: [2537900, 1152600] }, properties: { strname_deinr: "Place de l'Europe 9", dplz4: 1003, dplzname: "Lausanne" } }],
};

export const test = base.extend<{ mockGeoAdmin: void }>({
  mockGeoAdmin: [
    async ({ page }, use) => {
      await page.route("https://api3.geo.admin.ch/**", (route) => {
        const url = route.request().url();
        const body = url.includes("SearchServer") ? SEARCH : url.includes("identify") ? IDENTIFY : { results: [] };
        return route.fulfill({ json: body });
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/** Wait until the first view of the city has streamed in. */
export async function waitForCity(page: Page) {
  await expect(page.getByText(/Building Lausanne|Construction de Lausanne/)).toHaveCount(0, { timeout: 60_000 });
}

/** WCAG 2.2 AA scan of the current page state. */
export async function expectAccessible(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, "axe violations").toEqual([]);
}

/** Sign in through the dialog (demo mode signs in immediately). */
export async function signIn(page: Page, email: string) {
  await page.getByLabel(/Email address|Adresse e-mail/i).fill(email);
  const dialog = page.getByRole("dialog", { name: /Sign in to GeoLausanne|Se connecter à GeoLausanne/ });
  await dialog.getByRole("button", { name: /^(Sign in|Se connecter)$/ }).click();
  await expect(dialog).toHaveCount(0);
}

/** Move keyboard focus forward until `target` has it (like a keyboard user). */
export async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("could not reach the element with Tab");
}
