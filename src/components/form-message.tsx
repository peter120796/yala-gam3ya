import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";

export function FormMessage({ error, message }: { error?: string | null; message?: string | null }) {
  if (!error && !message) return null;
  return (
    <Alert variant={error ? "danger" : "success"} aria-live="polite">
      {error ? <AlertCircle /> : <CheckCircle2 />}
      <span>{error ?? message}</span>
    </Alert>
  );
}
