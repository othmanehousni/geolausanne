import { expect, test, waitForCity, waitForInteractive } from "./fixtures";

test("search finds community spots and swisstopo places", async ({ page }) => {
  await page.goto("/en");
  await waitForCity(page);
  const box = page.getByRole("combobox", { name: "Search" });
  await box.fill("kebab");
  const listbox = page.getByRole("listbox");
  await expect(listbox.getByRole("group", { name: "Halal spots" })).toBeVisible();
  await expect(listbox.getByRole("option", { name: /Kebab Ouchy/ })).toBeVisible();
  await expect(listbox.getByRole("group", { name: "Streets and places" })).toBeVisible();
  // choose with the keyboard
  await box.press("ArrowDown");
  await box.press("Enter");
  await expect(page.getByRole("dialog", { name: /Kebab/ })).toBeVisible();
});

test("one letter asks for more", async ({ page }) => {
  await page.goto("/en");
  await waitForInteractive(page);
  await page.getByRole("combobox", { name: "Search" }).fill("k");
  await expect(page.getByRole("status").filter({ hasText: "Type at least two letters" })).toBeVisible();
});

test("a place outside the loaded city says so instead of stopping at its edge", async ({ page }) => {
  await page.goto("/en?debug");
  await waitForCity(page);
  const box = page.getByRole("combobox", { name: "Search" });
  await box.fill("EPFL");
  // the demo city covers central Lausanne only: EPFL (Ecublens) is marked in the list
  const option = page.getByRole("listbox").getByRole("option", { name: /EPFL/ });
  await expect(option).toContainText("outside the 3D city");
  await option.click();
  await expect(page.getByText("EPFL is outside the 3D city")).toBeVisible();
  await expect(page.getByText(/Only central Lausanne is loaded here/)).toBeVisible();
  // and the camera was not sent towards it
  const command = await page.evaluate(
    () => (window as unknown as { geolausanne: { world: { getState(): { command: { kind: string } | null } } } }).geolausanne.world.getState().command,
  );
  expect(command?.kind).not.toBe("flyTo");
});
