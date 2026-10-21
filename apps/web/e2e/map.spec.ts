import { expect, expectAccessible, test, waitForCity } from "./fixtures";

test.describe("map page", () => {
  test("renders the city and its controls accessibly", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1, name: "GeoLausanne" })).toBeVisible();
    const map = page.getByRole("application", { name: "3D map of Lausanne with halal food spots" });
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute("aria-roledescription", "interactive 3D map");
    await waitForCity(page);
    await expect(page.getByRole("toolbar", { name: "Map controls" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to the centre" })).toBeVisible();
    await expect(page.getByText("Geodata © swisstopo")).toBeVisible();
    await expectAccessible(page);
  });

  test("the skip link and keyboard shortcuts reach the map and search", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flow");
    await page.goto("/en");
    await waitForCity(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to the map" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("application")).toBeFocused();
    // map shortcuts only act while the map has focus, and say where the view ended up
    await page.keyboard.press("+");
    await expect(page.getByRole("status").filter({ hasText: /^Facing/ })).toHaveText(
      /^Facing (north|south)?-?(east|west)?\. (No spots|\d+ spots?) in view\./,
      { timeout: 20_000 },
    );
    // "/" jumps to search
    await page.keyboard.press("/");
    await expect(page.getByRole("combobox", { name: "Search" })).toBeFocused();
    await page.getByRole("combobox", { name: "Search" }).blur();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("combobox", { name: "Search" })).toBeFocused();
  });

  test("the spots list is the accessible way to open a spot", async ({ page }) => {
    await page.goto("/en");
    await waitForCity(page);
    await page.getByRole("button", { name: /spots? in view/ }).click();
    const list = page.getByRole("dialog", { name: "Spots in view" });
    await expect(list).toBeVisible();
    await expectAccessible(page);
    const first = list.getByRole("listitem").first().getByRole("button");
    const name = (await first.locator("span.truncate").first().innerText()).trim();
    await first.click();
    // the panel is a dialog named after the spot
    await expect(page.getByRole("dialog", { name }).getByRole("heading", { name })).toBeVisible();
    await expect(page).toHaveURL(/\?spot=/);
    await expectAccessible(page);
  });

  test("deep links open the spot", async ({ page }) => {
    await page.goto("/en?spot=osm-n4634829754");
    await expect(page.getByRole("dialog", { name: "Aldi" }).getByRole("heading", { name: "Aldi" })).toBeVisible();
  });

  test("a link to a spot that is gone says so once", async ({ page }) => {
    await page.goto("/en?spot=does-not-exist");
    const panel = page.getByRole("dialog", { name: "Spot not found" });
    await expect(panel.getByRole("heading", { name: "Spot not found" })).toBeVisible();
    await expect(panel.getByText("This spot is no longer on the map.")).toHaveCount(1);
  });

  test("Reduce motion is remembered and applies before the first paint", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: "Account" }).click();
    const item = page.getByRole("menuitemcheckbox", { name: "Reduce motion" });
    await expect(item).toHaveAttribute("aria-checked", "false");
    await item.click();
    await expect(item).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "");
  });
});
