import { Spinner } from "@heroui/spinner";
import { Zap } from "lucide-react";

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[400px] gap-4">
      <div className="relative">
        <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/40">
          <Zap className="w-8 h-8 text-white" strokeWidth={2.5} />
        </div>
        <div className="absolute -inset-2">
          <Spinner size="lg" color="primary" />
        </div>
      </div>
      <p className="text-default-500 text-sm animate-pulse">{label}</p>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center p-3 rounded-xl bg-default-100 animate-pulse">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-4 rounded-full bg-default-200"
              style={{ width: `${60 + ((i + j) * 17) % 40}%`, flex: j === 0 ? "0 0 auto" : "1" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
