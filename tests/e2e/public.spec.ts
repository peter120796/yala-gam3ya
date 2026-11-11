import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("login defaults to Arabic RTL and switches to English LTR (scenario 16)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.getByRole("heading", { name: "أهلاً بيك تاني" })).toBeVisible();
    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("theme switch applies dark mode (scenario 17)", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /المظهر|Theme/ }).click();
    await page.getByRole("menuitem", { name: /داكن|Dark/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("protected pages redirect to login", async ({ page }) => {
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login\?next=%2Foverview/);
  });

  test("legal pages render with the review notice", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.getByRole("heading", { name: "الشروط والأحكام" })).toBeVisible();
    await expect(page.getByText("مسودة قابلة للمراجعة القانونية")).toBeVisible();
  });

  test("export API refuses anonymous requests", async ({ request }) => {
    const res = await request.get("/api/export?scope=member", { maxRedirects: 0 });
    expect([302, 307, 401]).toContain(res.status());
  });

  test("cron endpoint requires the secret", async ({ request }) => {
    const res = await request.get("/api/cron/daily");
    expect(res.status()).toBe(401);
  });
});
