"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Shuffle, ListOrdered, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Money } from "@/components/money";
import { activateDraftAction, createGuestAction, deleteDraftAction, saveDraftAction } from "@/app/actions/admin";
import { formatMoney, parseMoneyInput, toDecimalString, multiply } from "@/lib/engine/money";
import { generateSchedule, sequentialTurns } from "@/lib/engine/schedule";
import { validateAll, type ValidationIssue } from "@/lib/engine/validate";
import type { Frequency, Gam3yaConfig, ShareHolding } from "@/lib/engine/types";
import { formatCivilDate } from "@/lib/format";
import { useErrorText } from "@/lib/use-error-text";
import { cn } from "@/lib/utils";

export interface WizardUser {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  /** Added by name only — no account. */
  isGuest?: boolean;
}

interface ShareSlot {
  a: string;
  split: boolean;
  b: string;
}

export interface WizardInitial {
  id: string | null;
  name: string;
  description: string;
  organizerId: string;
  contribution: string;
  totalShares: number;
  frequency: Frequency;
  startDate: string;
  dueDay: number;
  allowSelfReport: boolean;
  shares: ShareSlot[];
  /** order[i] = share number receiving cycle i+1 */
  order: number[];
}


function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function IssueList({ issues, filter }: { issues: ValidationIssue[]; filter?: (i: ValidationIssue) => boolean }) {
  const t = useTranslations();
  const list = filter ? issues.filter(filter) : issues;
  if (!list.length) return null;
  return (
    <Alert variant="warning">
      <AlertTriangle />
      <ul className="list-inside list-disc">
        {list.slice(0, 8).map((i, k) => (
          <li key={k}>{t(`issues.${i.code}` as "issues.SHARE_UNASSIGNED", i as unknown as Record<string, string>)}</li>
        ))}
      </ul>
    </Alert>
  );
}

/**
 * Whole-number field that lets people type freely (including clearing it and
 * typing "12") — the value is only clamped to [min, max] when it is valid or
 * when the field loses focus.
 */
function IntInput({ id, value, min, max, onCommit }: { id: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // The value changed from outside (e.g. reset) — show it.
    setLastValue(value);
    setText(String(value));
  }
  const toInt = (raw: string) => {
    const western = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    return western === "" ? null : Number.parseInt(western, 10);
  };
  return (
    <Input
      id={id}
      inputMode="numeric"
      dir="ltr"
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9٠-٩]/g, "").slice(0, 3);
        setText(raw);
        const n = toInt(raw);
        if (n !== null && n >= min && n <= max) {
          setLastValue(n);
          onCommit(n);
        }
      }}
      onBlur={() => {
        const n = toInt(text);
        const clamped = Math.max(min, Math.min(max, n ?? value));
        setText(String(clamped));
        setLastValue(clamped);
        if (clamped !== value) onCommit(clamped);
      }}
    />
  );
}

const STEPS = ["basics", "financials", "participants", "turns", "review", "activate"] as const;

export function Gam3yaWizard({ users, initial }: { users: WizardUser[]; initial: WizardInitial }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const [step, setStep] = useState(0);
  const [id, setId] = useState(initial.id);
  const [s, setS] = useState(initial);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();

  // Everyone who can hold a share — including people added by name only in this session.
  const [people, setPeople] = useState(users);
  const [guestName, setGuestName] = useState("");
  const organizers = people.filter((u) => !u.isGuest && (u.role === "organizer" || u.role === "super_admin"));
  const nameOf = (uid: string) => people.find((u) => u.id === uid)?.displayName ?? t("wizard.unassigned");
  const label = (u: WizardUser) => (u.isGuest ? `${u.displayName} · ${t("wizard.guestTag")}` : u.displayName);

  const resizeShares = (n: number) => {
    const shares = Array.from({ length: n }, (_, i) => s.shares[i] ?? { a: "", split: false, b: "" });
    const kept = s.order.filter((x) => x <= n);
    const missing = Array.from({ length: n }, (_, i) => i + 1).filter((x) => !kept.includes(x));
    setS({ ...s, totalShares: n, shares, order: [...kept, ...missing].slice(0, n) });
  };

  const addGuest = (e: React.FormEvent) => {
    e.preventDefault();
    const name = guestName.trim();
    if (name.length < 2) return;
    start(async () => {
      const res = await createGuestAction({ displayName: name });
      if (!res.ok) return void toast.error(errorText(res));
      const guest: WizardUser = { id: res.data.id, displayName: res.data.displayName, email: null, role: "member", isGuest: true };
      setPeople((list) => [...list, guest].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      // Put them on the first empty share so it is one step.
      const free = s.shares.findIndex((sh) => !sh.a);
      if (free >= 0) {
        const shares = [...s.shares];
        shares[free] = { ...shares[free]!, a: guest.id };
        setS({ ...s, shares });
      }
      setGuestName("");
      toast.success(t("wizard.guestAdded", { name: guest.displayName }));
    });
  };

  const contribution = parseMoneyInput(s.contribution);
  const config: Gam3yaConfig = {
    totalShares: s.totalShares,
    contributionPerShare: contribution ?? 0,
    frequency: s.frequency,
    startDate: s.startDate,
    dueDay: s.frequency === "monthly" ? s.dueDay : null,
    // Payout on the due date; nobody is ever counted late.
    payoutOffsetDays: 0,
    graceDays: 0,
  };
  const holdings: ShareHolding[] = s.shares.flatMap((sh, i) => {
    const n = i + 1;
    if (sh.split) {
      return [
        ...(sh.a ? [{ shareNumber: n, memberId: sh.a, portionBp: 5000 }] : []),
        ...(sh.b ? [{ shareNumber: n, memberId: sh.b, portionBp: 5000 }] : []),
      ];
    }
    return sh.a ? [{ shareNumber: n, memberId: sh.a, portionBp: 10000 }] : [];
  });
  const turns = s.order.map((share, i) => ({ shareNumber: share, cycleNumber: i + 1 }));

  // Validation + preview are cheap pure functions over a few hundred rows; recompute each render.
  const issues: ValidationIssue[] = validateAll(config, holdings, turns);
  const schedule = issues.length ? null : generateSchedule(config, holdings, turns);

  const basicsValid = s.name.trim().length > 0 && s.organizerId !== "";
  const financialsValid = contribution !== null && contribution > 0 && !issues.some((i) => i.code.startsWith("INVALID") || i.code === "DUE_DAY_NOT_ALLOWED_FOR_FREQUENCY");
  const participantsValid = !issues.some((i) => i.code.startsWith("SHARE") || i.code === "DUPLICATE_HOLDER" || i.code === "PORTION_NOT_ALLOWED" || i.code === "SPLIT_NOT_EXACT");
  const canNext = [basicsValid, financialsValid, participantsValid, issues.length === 0, issues.length === 0, false][step];

  const payload = () => ({
    id,
    basics: { name: s.name, description: s.description || null, organizerIds: [s.organizerId] },
    financials: {
      contributionPerShare: contribution ?? 0,
      totalShares: s.totalShares,
      frequency: s.frequency,
      startDate: s.startDate,
      dueDay: s.frequency === "monthly" ? s.dueDay : null,
      payoutOffsetDays: 0,
      graceDays: 0,
      allowSelfReport: s.allowSelfReport,
    },
    holdings: holdings.map((h) => ({ shareNumber: h.shareNumber, userId: h.memberId, portionBp: h.portionBp as 5000 | 10000 })),
    turns,
  });

  const save = (then?: (id: string) => Promise<void>) =>
    start(async () => {
      const res = await saveDraftAction(payload());
      if (!res.ok) return void toast.error(errorText(res));
      setId(res.data.id);
      if (then) await then(res.data.id);
      else toast.success(t("wizard.draftSaved"));
    });

  const activate = () =>
    save(async (draftId) => {
      const res = await activateDraftAction(draftId);
      if (!res.ok) return void toast.error(errorText(res));
      toast.success(t("wizard.activated"));
      router.push(`/gam3yas/${draftId}`);
    });

  const remove = () =>
    start(async () => {
      if (!id) return;
      const res = await deleteDraftAction(id);
      if (!res.ok) return void toast.error(errorText(res));
      router.push("/admin/gam3yas");
    });

  const moveTurn = (index: number, delta: number) => {
    const order = [...s.order];
    const j = index + delta;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j]!, order[index]!];
    setS({ ...s, order });
  };

  const memberMonthly = new Map<string, number>();
  if (schedule) for (const o of schedule.obligations.filter((x) => x.cycleNumber === 1)) memberMonthly.set(o.memberId, o.amount);

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label={t("wizard.step", { n: step + 1, total: STEPS.length })}>
        {STEPS.map((key, i) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-start text-xs font-medium",
                i === step && "border-primary bg-accent text-accent-foreground",
                i < step && "cursor-pointer hover:bg-muted",
                i > step && "opacity-60",
              )}
            >
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]", i < step ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="truncate">{t(`wizard.steps.${key}`)}</span>
            </button>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{t(`wizard.steps.${STEPS[step]}`)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 0 && (
            <>
              <Field id="w-name" label={t("wizard.name")}>
                <Input id="w-name" value={s.name} maxLength={80} onChange={(e) => setS({ ...s, name: e.target.value })} />
              </Field>
              <Field id="w-desc" label={`${t("wizard.description")} (${t("common.optional")})`}>
                <Textarea id="w-desc" value={s.description} maxLength={500} onChange={(e) => setS({ ...s, description: e.target.value })} />
              </Field>
              <Field id="w-org" label={t("wizard.organizers")}>
                <NativeSelect id="w-org" value={s.organizerId} onChange={(e) => setS({ ...s, organizerId: e.target.value })}>
                  <option value="">{t("wizard.selectUser")}</option>
                  {organizers.map((u) => <option key={u.id} value={u.id}>{u.displayName}{u.email ? ` — ${u.email}` : ""}</option>)}
                </NativeSelect>
              </Field>
            </>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="w-amt" label={t("wizard.contribution")}>
                <Input id="w-amt" inputMode="decimal" dir="ltr" value={s.contribution} onChange={(e) => setS({ ...s, contribution: e.target.value })} aria-invalid={contribution === null} />
              </Field>
              <Field id="w-shares" label={t("wizard.shares")}>
                <IntInput id="w-shares" value={s.totalShares} min={2} max={120} onCommit={resizeShares} />
              </Field>
              <Field id="w-freq" label={t("wizard.frequency")}>
                <NativeSelect id="w-freq" value={s.frequency} onChange={(e) => setS({ ...s, frequency: e.target.value as Frequency })}>
                  <option value="monthly">{t("frequency.monthly")}</option>
                  <option value="biweekly">{t("frequency.biweekly")}</option>
                  <option value="weekly">{t("frequency.weekly")}</option>
                </NativeSelect>
              </Field>
              <Field id="w-start" label={t("wizard.startDate")}>
                <Input id="w-start" type="date" value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value })} />
              </Field>
              {s.frequency === "monthly" && (
                <Field id="w-due" label={t("wizard.dueDay")}>
                  <IntInput id="w-due" value={s.dueDay} min={1} max={31} onCommit={(n) => setS({ ...s, dueDay: n })} />
                </Field>
              )}
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3 sm:col-span-2">
                <Label htmlFor="w-self">{t("wizard.allowSelfReport")}</Label>
                <Switch id="w-self" checked={s.allowSelfReport} onCheckedChange={(v) => setS({ ...s, allowSelfReport: v })} />
              </div>
              {contribution !== null && contribution > 0 && (
                <p className="text-sm sm:col-span-2">
                  {t("wizard.payoutPerCycle")}: <strong className="num">{formatMoney(multiply(contribution, s.totalShares), locale)}</strong>
                </p>
              )}
              <div className="sm:col-span-2"><IssueList issues={issues} filter={(i) => i.code.startsWith("INVALID") || i.code === "DUE_DAY_NOT_ALLOWED_FOR_FREQUENCY"} /></div>
            </div>
          )}

          {step === 2 && (
            <>
              <form onSubmit={addGuest} className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
                <Label htmlFor="w-guest">{t("wizard.addGuest")}</Label>
                <div className="flex gap-2">
                  <Input id="w-guest" value={guestName} maxLength={80} placeholder={t("wizard.guestName")} onChange={(e) => setGuestName(e.target.value)} aria-describedby="w-guest-hint" />
                  <Button type="submit" variant="outline" disabled={pending || guestName.trim().length < 2}>
                    <UserPlus /> {t("wizard.addGuestButton")}
                  </Button>
                </div>
                <p id="w-guest-hint" className="text-xs text-muted-foreground">{t("wizard.addGuestHint")}</p>
              </form>
              <ul className="flex flex-col gap-2">
                {s.shares.map((sh, i) => {
                  const update = (patch: Partial<ShareSlot>) => {
                    const shares = [...s.shares];
                    shares[i] = { ...sh, ...patch };
                    setS({ ...s, shares });
                  };
                  return (
                    <li key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[5rem_1fr_auto_1fr] sm:items-center">
                      <span className="text-sm font-semibold">{t("gam3ya.shareN", { n: i + 1 })}</span>
                      <NativeSelect aria-label={`${t("wizard.assignShare")} ${i + 1}`} value={sh.a} onChange={(e) => update({ a: e.target.value })}>
                        <option value="">{t("wizard.unassigned")}</option>
                        {people.map((u) => <option key={u.id} value={u.id}>{label(u)}</option>)}
                      </NativeSelect>
                      <label className="flex items-center gap-2 text-xs">
                        <Switch checked={sh.split} onCheckedChange={(v) => update({ split: v, b: v ? sh.b : "" })} aria-label={t("wizard.splitShare")} />
                        {t("wizard.splitShare")}
                      </label>
                      {sh.split ? (
                        <NativeSelect aria-label={t("wizard.secondHolder")} value={sh.b} onChange={(e) => update({ b: e.target.value })}>
                          <option value="">{t("wizard.secondHolder")}</option>
                          {people.filter((u) => u.id !== sh.a).map((u) => <option key={u.id} value={u.id}>{label(u)}</option>)}
                        </NativeSelect>
                      ) : <span className="hidden sm:block" />}
                    </li>
                  );
                })}
              </ul>
              <IssueList issues={issues} filter={(i) => i.code.startsWith("SHARE") || i.code === "DUPLICATE_HOLDER" || i.code === "PORTION_NOT_ALLOWED" || i.code === "SPLIT_NOT_EXACT"} />
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setS({ ...s, order: sequentialTurns(s.totalShares).map((x) => x.shareNumber) })}>
                  <ListOrdered /> {t("wizard.autoOrder")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const order = [...s.order];
                    for (let i = order.length - 1; i > 0; i--) {
                      const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
                      [order[i], order[j]] = [order[j]!, order[i]!];
                    }
                    setS({ ...s, order });
                  }}
                >
                  <Shuffle /> {t("wizard.randomOrder")}
                </Button>
              </div>
              <ol className="flex flex-col gap-2">
                {s.order.map((share, i) => {
                  const sh = s.shares[share - 1];
                  return (
                    <li key={`${i}-${share}`} className="flex items-center gap-3 rounded-xl border p-3">
                      <span className="w-20 shrink-0 text-sm font-semibold">{t("gam3ya.cycleN", { n: i + 1 })}</span>
                      <span className="flex-1 text-sm">
                        {t("gam3ya.shareN", { n: share })} — {sh?.a ? nameOf(sh.a) : t("wizard.unassigned")}
                        {sh?.split && sh.b ? ` + ${nameOf(sh.b)}` : ""}
                      </span>
                      <Button variant="ghost" size="icon" aria-label="↑" disabled={i === 0} onClick={() => moveTurn(i, -1)}><ArrowUp /></Button>
                      <Button variant="ghost" size="icon" aria-label="↓" disabled={i === s.order.length - 1} onClick={() => moveTurn(i, 1)}><ArrowDown /></Button>
                    </li>
                  );
                })}
              </ol>
              <IssueList issues={issues} filter={(i) => i.code.startsWith("TURN") || i.code === "CYCLE_WITHOUT_RECIPIENT"} />
            </>
          )}

          {(step === 4 || step === 5) && (
            <>
              {issues.length > 0 ? (
                <IssueList issues={issues} />
              ) : (
                <Alert variant="success"><Check /> {t("wizard.noWarnings")}</Alert>
              )}
              {schedule && (
                <>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div><dt className="text-xs text-muted-foreground">{t("wizard.totalCycles")}</dt><dd className="num font-bold">{schedule.totals.cycleCount}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t("gam3ya.contributionPerShare")}</dt><dd className="font-bold"><Money value={config.contributionPerShare} /></dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t("wizard.payoutPerCycle")}</dt><dd className="font-bold"><Money value={schedule.totals.payoutPerCycle} /></dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t("gam3ya.endDate")}</dt><dd className="font-bold">{formatCivilDate(schedule.totals.endDate, locale)}</dd></div>
                  </dl>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">{t("wizard.steps.participants")}</h3>
                    <ul className="grid gap-1 text-sm sm:grid-cols-2">
                      {[...memberMonthly.entries()].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0]))).map(([uid, amt]) => (
                        <li key={uid} className="flex justify-between rounded-lg bg-muted px-3 py-1.5">
                          <span>{nameOf(uid)}</span>
                          <span className="num">{formatMoney(amt, locale)} · {t("wizard.memberContribution")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">{t("wizard.fullSchedule")}</h3>
                    <Table>
                      <THead>
                        <TR>
                          <TH>{t("gam3ya.cycle")}</TH>
                          <TH>{t("gam3ya.nextDeadline")}</TH>
                          <TH>{t("gam3ya.payoutDate")}</TH>
                          <TH>{t("gam3ya.recipients")}</TH>
                          <TH className="text-end">{t("gam3ya.expectedAmount")}</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {schedule.payouts.map((p) => (
                          <TR key={p.cycleNumber}>
                            <TD className="num">{p.cycleNumber}</TD>
                            <TD>{formatCivilDate(schedule.cycles[p.cycleNumber - 1]!.dueDate, locale)}</TD>
                            <TD>{formatCivilDate(p.payoutDate, locale)}</TD>
                            <TD>
                              {p.recipients.map((r) => `${nameOf(r.memberId)}${r.portionBp === 5000 ? " (½)" : ""}`).join(" + ")}
                              <div className="text-xs text-muted-foreground">{t("gam3ya.shareN", { n: p.shareNumber })}</div>
                            </TD>
                            <TD className="num text-end" title={toDecimalString(p.amount)}>{formatMoney(p.amount, locale)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                </>
              )}
              {step === 5 && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm">
                  <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  {t("wizard.confirmActivate")}
                </label>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>{t("common.back")}</Button>}
          {id && (
            <Button variant="ghost" onClick={remove} disabled={pending} className="text-destructive">
              <Trash2 /> {t("wizard.deleteDraft")}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save()} disabled={pending || !basicsValid || contribution === null}>
            {t("wizard.saveDraft")}
          </Button>
          {step < 5 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>{t("common.next")}</Button>
          ) : (
            <Button onClick={activate} disabled={pending || !confirmed || issues.length > 0}>{t("wizard.activate")}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
