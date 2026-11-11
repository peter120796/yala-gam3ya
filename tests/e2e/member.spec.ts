import { expect, test } from "@playwright/test";

const email = process.env.E2E_MEMBER_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("member flows (needs a seeded Supabase project)", () => {
  test.skip(!email || !password, "Set E2E_MEMBER_EMAIL and E2E_PASSWORD to run");

  test("sign in, see dashboard KPIs, open a Gam3ya, cannot reach admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/البريد الإلكتروني|Email/).fill(email!);
    await page.getByLabel(/كلمة السر|Password/).fill(password!);
    await page.getByRole("button", { name: /تسجيل الدخول|Sign in/ }).click();
    await expect(page.getByText("خلينا نشوف جمعياتك الشهر ده")).toBeVisible();
    await page.getByRole("link", { name: /جمعية/ }).first().click();
    await expect(page.getByRole("tab", { name: /الأعضاء والأدوار|Members/ })).toBeVisible();
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});
