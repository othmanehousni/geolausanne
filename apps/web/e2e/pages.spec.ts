import { expect, expectAccessible, signIn, test } from "./fixtures";

for (const path of ["/en/about", "/fr/about", "/en/privacy", "/fr/terms"]) {
  test(`${path} is accessible`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page);
  });
}

test("unprefixed URLs redirect to a locale", async ({ page }) => {
  await page.goto("/about");
  await expect(page).toHaveURL(/\/(fr|en)\/about$/);
});

test("unknown pages show the localized 404", async ({ page }) => {
  const res = await page.goto("/fr/nulle-part");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Cette page n’est pas sur la carte" })).toBeVisible();
});

test("the language switch keeps the page", async ({ page }) => {
  await page.goto("/fr/about");
  await page.getByRole("navigation", { name: "Langue" }).getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/about$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("moderation needs a moderator account", async ({ page }) => {
  await page.goto("/en/moderation");
  await expect(page.getByText("Sign in with a moderator account to continue.")).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();
  await signIn(page, "member@example.ch");
  await expect(page.getByRole("alert").filter({ hasText: "This page is for moderators." })).toBeVisible();
});

test("moderators see the console", async ({ page }) => {
  await page.goto("/en/moderation");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();
  await signIn(page, "mod@example.ch");
  await expect(page.getByRole("tab", { name: "Reports" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No open reports")).toBeVisible();
  await expectAccessible(page);
});
