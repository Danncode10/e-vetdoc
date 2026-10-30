"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isPending?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  /**
   * Permanent, irreversible actions: show a red warning and keep the confirm button disabled
   * until the user types this word (e.g. "DELETE").
   */
  requireTypedConfirmation?: string;
};

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  isPending = false,
  onConfirm,
  onOpenChange,
  requireTypedConfirmation,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const isDanger = Boolean(requireTypedConfirmation);
  const typedOk = !requireTypedConfirmation || typed.trim() === requireTypedConfirmation;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setTyped("");
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-describedby="confirmation-dialog-description"
      aria-labelledby="confirmation-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-foreground/20"
      onCancel={(event) => {
        event.preventDefault();
        if (!isPending) onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) onOpenChange(false);
      }}
    >
      <div className="space-y-6 p-6">
        <div className="space-y-2">
          {isDanger && (
            <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
          )}
          <h2 id="confirmation-dialog-title" className="text-lg font-semibold text-foreground">
            {title}
          </h2>
          <p id="confirmation-dialog-description" className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {isDanger && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium text-destructive">
              This is permanent and cannot be undone.
            </p>
          )}
        </div>
        {requireTypedConfirmation && (
          <div className="space-y-2">
            <label htmlFor="confirmation-dialog-typed" className="block text-sm font-medium text-foreground">
              Type <span className="font-mono font-bold">{requireTypedConfirmation}</span> to confirm
            </label>
            <input
              id="confirmation-dialog-typed"
              data-testid="confirm-typed-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              disabled={isPending}
              className="min-h-12 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 sm:justify-end">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            Cancel
          </Button>
          <Button
            type="button"
            variant={isDanger ? "destructive" : "default"}
            disabled={isPending || !typedOk}
            onClick={onConfirm}
          >
            {isPending ? "Saving..." : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
