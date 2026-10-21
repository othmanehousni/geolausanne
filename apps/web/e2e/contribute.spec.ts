import { expect, expectAccessible, signIn, tabTo, test, waitForCity } from "./fixtures";

test("members add a spot from the map centre", async ({ page }) => {
  await page.goto("/en");
  await waitForCity(page);
  await page.getByRole("button", { name: /Add a halal spot|Add spot/ }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to GeoLausanne" })).toBeVisible();
  await expectAccessible(page);
  await signIn(page, "ana@example.ch");

  // the interrupted action continues: choose the location
  await expect(page.getByRole("heading", { name: "Where is it?" })).toBeVisible();
  await page.getByRole("button", { name: "Use map centre" }).click();

  const form = page.getByRole("dialog", { name: "Add a halal spot" });
  await expect(form).toBeVisible();
  await expect(form.getByText("Place de l'Europe 9, 1003 Lausanne")).toBeVisible();
  await expectAccessible(page);

  // validation is announced next to the field
  await form.getByRole("button", { name: "Add spot" }).click();
  await expect(form.getByText("Enter a name of at least 2 characters")).toBeVisible();

  await form.getByRole("textbox", { name: "Name" }).fill("Test Grill du Flon");
  await form.getByRole("radio", { name: /Fast food/ }).check();
  await form.getByRole("radio", { name: "Some dishes" }).check();
  await form.getByRole("button", { name: "Add spot" }).click();

  await expect(page.getByText("Spot added. Thank you!")).toBeVisible();
  const panel = page.getByRole("dialog", { name: "Test Grill du Flon" });
  await expect(panel.getByRole("heading", { name: "Test Grill du Flon" })).toBeVisible();
  await expect(panel.getByText("You added this spot")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Upvote" })).toBeDisabled();
});

test("members vote and review", async ({ page }) => {
  await page.goto("/en?spot=osm-n4634829754");
  const panel = page.getByRole("dialog", { name: "Aldi" });
  await panel.getByRole("button", { name: "Upvote" }).click();
  await signIn(page, "bob@example.ch");
  await expect(panel.getByRole("button", { name: "Upvote" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByText("Score 1")).toBeAttached();

  // on phones the sheet peeks; keyboard focus moving into it expands it
  const write = panel.getByRole("button", { name: "Write a review" });
  await tabTo(page, write);
  await page.keyboard.press("Enter");
  await panel.getByRole("radio", { name: "4 out of 5" }).click();
  await panel.getByRole("textbox", { name: "What should people know?" }).fill("Halal butcher counter at the back.");
  await panel.getByRole("checkbox", { name: "I checked the halal status myself" }).click();
  await panel.getByRole("radio", { name: "Asked the staff" }).check();
  await panel.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText("Review posted")).toBeVisible();
  await expect(panel.getByText("Halal butcher counter at the back.")).toBeVisible();
  await expect(panel.getByText("Confirmed by 1 person", { exact: false })).toBeVisible();
});
