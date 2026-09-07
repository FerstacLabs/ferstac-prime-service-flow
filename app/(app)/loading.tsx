import { Panel } from "@/components/app-shell";
import { WorkshopLoader } from "@/components/workshop-loader";

export default function Loading() {
  return (
    <Panel>
      <WorkshopLoader label="Məlumatlar yüklənir..." />
    </Panel>
  );
}

