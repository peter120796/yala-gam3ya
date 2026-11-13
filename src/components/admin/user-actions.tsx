"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { inviteUserAction, setUserActiveAction, setUserRoleAction } from "@/app/actions/admin";
import { useErrorText } from "@/lib/use-error-text";

type Role = "member" | "organizer" | "super_admin";

export function InviteUserDialog() {
  const t = useTranslations();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", displayName: "", role: "member" as Role, locale: "ar" as "ar" | "en" });
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await inviteUserAction(form);
      if (res.ok) {
        toast.success(t("admin.inviteSent"));
        setOpen(false);
        setForm({ email: "", displayName: "", role: "member", locale: "ar" });
      } else toast.error(errorText(res));
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus /> {t("admin.inviteUser")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("admin.inviteUser")}</DialogTitle>
          <DialogDescription>{t("admin.inviteHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-name">{t("settings.displayName")}</Label>
            <Input id="inv-name" required maxLength={80} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-email">{t("auth.email")}</Label>
            <Input id="inv-email" type="email" required dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-role">{t("admin.role")}</Label>
              <NativeSelect id="inv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="member">{t("admin.roles.member")}</option>
                <option value="organizer">{t("admin.roles.organizer")}</option>
                <option value="super_admin">{t("admin.roles.super_admin")}</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-lang">{t("common.language")}</Label>
              <NativeSelect id="inv-lang" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value as "ar" | "en" })}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={pending}>{t("admin.inviteUser")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UserRowActions({ userId, role, isActive, isGuest = false }: { userId: string; role: Role; isActive: boolean; isGuest?: boolean }) {
  const t = useTranslations();
  const errorText = useErrorText();
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");

  const changeRole = (r: Role) =>
    start(async () => {
      const res = await setUserRoleAction({ userId, role: r });
      if (res.ok) toast.success(t("settings.saved"));
      else toast.error(errorText(res));
    });
  const toggleActive = () =>
    start(async () => {
      const res = await setUserActiveAction({ userId, active: !isActive, reason });
      if (res.ok) {
        toast.success(t("settings.saved"));
        setConfirmOpen(false);
        setReason("");
      } else toast.error(errorText(res));
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={pending} aria-label={t("common.actions")}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isGuest && (
            <>
              <DropdownMenuLabel>{t("admin.role")}</DropdownMenuLabel>
              {(["member", "organizer", "super_admin"] as Role[]).map((r) => (
                <DropdownMenuItem key={r} disabled={r === role} onSelect={() => changeRole(r)}>
                  {t(`admin.roles.${r}`)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => setConfirmOpen(true)} className={isActive ? "text-destructive" : undefined}>
            {isActive ? t("admin.deactivate") : t("admin.reactivate")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{isActive ? t("admin.deactivate") : t("admin.reactivate")}</DialogTitle>
            <DialogDescription>{t("admin.deactivateConfirm")}</DialogDescription>
          </DialogHeader>
          <Label htmlFor="deact-reason">{t("common.reason")}</Label>
          <Textarea id="deact-reason" className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button>
            <Button variant={isActive ? "destructive" : "default"} disabled={pending || reason.trim().length < 3} onClick={toggleActive}>
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
