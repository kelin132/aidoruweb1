import { Database, RefreshCw } from "lucide-react";
import { AuroraField } from "./AuroraField";

export function ConnectionNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <AuroraField />
      <div className="glass-strong relative max-w-lg rounded-3xl p-8 text-center md:p-10">
        <span className="bg-gradient-brand mx-auto grid size-12 place-items-center rounded-full">
          <Database className="size-5" />
        </span>
        <p className="font-mono-ui text-neon-cyan mt-5 text-[10px] tracking-[0.24em] uppercase">
          Connection unavailable
        </p>
        <h1 className="font-display mt-2 text-2xl font-bold">AIDORU cannot reach its data</h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          The connection may be temporarily unavailable. If this screen persists, the deployment
          needs a valid <code>MONGO_URI</code> setting and a service restart.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="connection-retry-button bg-gradient-brand text-foreground mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            <RefreshCw className="size-4" /> Try again
          </button>
        )}
      </div>
    </div>
  );
}
