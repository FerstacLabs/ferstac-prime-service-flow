import { Inbox } from "lucide-react";

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <Inbox size={22} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
