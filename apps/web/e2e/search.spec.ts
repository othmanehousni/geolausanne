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
