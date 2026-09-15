import type { ReactNode } from "react";
import { Card, CardContent } from "./card";

type StatCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
};

export function StatCard({ label, value, detail, icon }: StatCardProps) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
          {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
        </div>
        <span className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</span>
      </CardContent>
    </Card>
  );
}
