import { Card, CardBody } from "@heroui/card";
import { Skeleton } from "@heroui/skeleton";
import { LucideIcon } from "lucide-react";
import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: "primary" | "success" | "warning" | "danger" | "default";
  sub?: string;
  loading?: boolean;
}

const colorMap = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger:  "bg-danger/10 text-danger",
  default: "bg-default-100 text-default-600",
};

export function StatCard({ label, value, icon: Icon, color = "primary", sub, loading }: StatCardProps) {
  return (
    <Card className="border border-default-200 shadow-sm hover:shadow-md transition-shadow">
      <CardBody className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-default-500 text-sm font-medium">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-24 rounded-lg mt-1" />
            ) : (
              <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            )}
            {sub && !loading && (
              <p className="text-default-400 text-xs mt-1">{sub}</p>
            )}
          </div>
          <div className={clsx("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", colorMap[color])}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
