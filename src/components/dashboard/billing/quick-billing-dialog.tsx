"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, Receipt, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { quickBillAppointment } from "@/services/billing";

interface QuickBillingDialogProps {
  appointmentId: string;
  /** Pre-fill from the appointment's service (e.g. "General Checkup") */
  serviceDescription?: string;
  /** Pre-fill price hint from the service (e.g. price_from) */
  suggestedAmount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
] as const;

type PaymentMethod = (typeof METHODS)[number]["value"];

const VAT_RATE = 0.12;

export function QuickBillingDialog({
  appointmentId,
  serviceDescription = "",
  suggestedAmount = 0,
  open,
  onOpenChange,
}: QuickBillingDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ invoiceId: string; receiptNumber: string } | null>(null);

  // Form state
  const [description, setDescription] = useState(serviceDescription);
  const [baseAmount, setBaseAmount] = useState(suggestedAmount.toFixed(2));
  const [isVatable, setIsVatable] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [referenceNumber, setReferenceNumber] = useState("");

  // Live totals preview
  const base = parseFloat(baseAmount) || 0;
  const vatAmount = isVatable ? base * VAT_RATE : 0;
  const totalAmount = base + vatAmount;

  const fmt = (n: number) =>
    n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });

  function handleSubmit() {
    setError(null);

    if (!description.trim()) {
      setError("Service description is required.");
      return;
    }
    if (base <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await quickBillAppointment({
          appointmentId,
          serviceDescription: description,
          amount: base,
          isVatable,
          method,
          referenceNumber: referenceNumber.trim() || undefined,
        });
        setDone(result);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to process billing.");
      }
    });
  }

  function handleClose() {
    setDone(null);
    setError(null);
    onOpenChange(false);
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  const showRefField = method !== "cash";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-billing-title"
    >
      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Top decorative line matching UI pattern */}
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500/60 via-emerald-500 to-emerald-500/60" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-500" strokeWidth={1.5} />
            </div>
            <h2 id="quick-billing-title" className="text-base font-semibold text-foreground leading-tight">
              {done ? "Payment Confirmed" : "Charge & Mark Paid"}
            </h2>
          </div>
          {!done && (
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:bg-muted hover:text-foreground transition-colors p-2 rounded-full"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Done state */}
        {done ? (
          <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={1.5} />
            <div>
              <p className="text-foreground font-semibold text-base">Appointment marked as Paid</p>
              <p className="text-sm text-muted-foreground mt-1">
                Invoice and receipt have been created.
              </p>
              {done.receiptNumber && (
                <p className="text-xs font-mono text-muted-foreground mt-3 bg-muted px-3 py-1.5 rounded-md inline-block">
                  Receipt: {done.receiptNumber}
                </p>
              )}
            </div>
            <div className="flex gap-2 mt-4 w-full">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 min-h-[44px]"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  handleClose();
                  router.push(`/dashboard/billing/${done.invoiceId}`);
                }}
                className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                View Invoice
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Service description */}
              <div className="space-y-2">
                <label htmlFor="qb-description" className="text-sm font-medium text-foreground">
                  Service / Description <span className="text-destructive">*</span>
                </label>
                <Input
                  id="qb-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. General Checkup"
                  className="min-h-[44px] rounded-xl"
                />
              </div>

              {/* Base amount */}
              <div className="space-y-2">
                <label htmlFor="qb-amount" className="text-sm font-medium text-foreground">
                  Base Amount (₱) <span className="text-destructive">*</span>
                </label>
                <Input
                  id="qb-amount"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  className="min-h-[44px] rounded-xl"
                />
              </div>

              {/* VATable toggle */}
              <div className="flex items-center gap-3">
                <input
                  id="qb-vatable"
                  type="checkbox"
                  checked={isVatable}
                  onChange={(e) => setIsVatable(e.target.checked)}
                  className="h-5 w-5 rounded border-border text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                />
                <label htmlFor="qb-vatable" className="text-sm font-medium text-foreground cursor-pointer">
                  Subject to VAT (12%)
                </label>
              </div>

              {/* Totals preview */}
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-2 text-sm">
                {isVatable && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>VATable Sales</span>
                      <span>{fmt(base)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>VAT (12%)</span>
                      <span>{fmt(vatAmount)}</span>
                    </div>
                  </>
                )}
                {!isVatable && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>VAT Exempt</span>
                    <span>{fmt(base)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-foreground border-t border-border/60 pt-2 mt-2">
                  <span>Total to collect</span>
                  <span className="text-emerald-600 dark:text-emerald-500">{fmt(totalAmount)}</span>
                </div>
              </div>

              {/* Payment method */}
              <div className="space-y-2">
                <label htmlFor="qb-method" className="text-sm font-medium text-foreground">
                  Payment Method <span className="text-destructive">*</span>
                </label>
                <select
                  id="qb-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="flex min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference number */}
              {showRefField && (
                <div className="space-y-2">
                  <label htmlFor="qb-ref" className="text-sm font-medium text-foreground">
                    Reference Number{" "}
                    <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <Input
                    id="qb-ref"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder={method === "gcash" ? "GCash reference #" : "Transaction reference"}
                    className="min-h-[44px] rounded-xl"
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3">
                  <p className="text-sm text-destructive font-medium" role="alert">
                    {error}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse sm:flex-row gap-2 px-6 py-5 border-t border-border/60 bg-muted/10">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isPending}
                className="flex-1 min-h-[44px] rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Receipt className="h-4 w-4 mr-2" />
                )}
                {isPending ? "Processing..." : `Mark Paid (${fmt(totalAmount)})`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
