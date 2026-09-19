import type { WorkshopData } from "@/lib/supabase/workshop";
import type {
  DbServiceJob,
  DbWorkItem,
  DbWorker,
  DbPurchase,
} from "@/lib/supabase/queries";
import type { CashTransaction, RequiredPart } from "@/lib/workshop";

export function workerCashFixture(): WorkshopData {
  const payment = (
    id: string,
    allocation_type: CashTransaction["allocation_type"],
    amount: number,
    work_item_id: string | null = null,
  ): CashTransaction => ({
    id,
    service_job_id: "job",
    allocation_type,
    amount,
    work_item_id,
    purchase_id: allocation_type === "SUPPLIER_PURCHASE" ? "purchase" : null,
    required_part_id: allocation_type === "CUSTOMER_PART" ? "part" : null,
    direction: allocation_type.startsWith("CUSTOMER") ? "IN" : "OUT",
    transaction_date: "2026-09-19",
    notes: "Sınaq ödənişi",
    voided_at: null,
    void_reason: null,
  });
  return {
    jobs: [
      {
        id: "job",
        job_no: "PR-1",
        has_line_quotes: true,
        agreed_budget: 800,
        status: "READY",
        archived_at: null,
        received_at: "2026-09-19T08:00:00Z",
        funding_source: "CUSTOMER_FUNDED",
        vehicles: { plate: "77-ZZ-777", make: "BMW", model: "E60" },
      },
      {
        id: "older",
        job_no: "PR-2",
        has_line_quotes: true,
        agreed_budget: 130,
        status: "DELIVERED",
        archived_at: "2026-08-31",
        received_at: "2026-08-01T08:00:00Z",
        funding_source: "CUSTOMER_FUNDED",
        vehicles: { plate: "10-AA-100", make: "BMW", model: "F30" },
      },
    ] as DbServiceJob[],
    workers: [
      {
        id: "worker",
        first_name: "Emre",
        last_name: "Altin",
        active: true,
        worker_roles: { id: "role", name: "Qaynaqçı" },
      },
      {
        id: "other",
        first_name: "Əli",
        last_name: "Əliyev",
        active: true,
        worker_roles: { id: "role", name: "Qaynaqçı" },
      },
    ] as DbWorker[],
    work: [
      {
        id: "work",
        service_job_id: "job",
        assigned_worker_id: "worker",
        custom_title: "Ön bamperin sökülməsi/quraşdırılması",
        quoted_price: 500,
        labor_cost: 250,
        labor_cost_known: true,
        status: "DONE",
        planned_at: "2026-09-18T09:00:00Z",
        completed_at: "2026-09-19T09:00:00Z",
      },
      {
        id: "old-work",
        service_job_id: "older",
        assigned_worker_id: "other",
        custom_title: "Qanad təmiri",
        quoted_price: 130,
        labor_cost: 80,
        labor_cost_known: true,
        status: "DONE",
        planned_at: "2026-08-01T09:00:00Z",
        completed_at: "2026-08-05T09:00:00Z",
      },
    ] as DbWorkItem[],
    parts: [
      {
        id: "part",
        service_job_id: "job",
        part_catalog_id: "catalog",
        quoted_price: 300,
        notes: null,
        display_order: 0,
        part_catalog: { name: "Ön bamper" },
      },
    ] as RequiredPart[],
    purchases: [
      {
        id: "purchase",
        service_job_id: "job",
        required_part_id: "part",
        custom_item_name: "Ön bamper",
        source_type: "SUPPLIER",
        quantity: 1,
        unit_price: 120,
        total_price: 120,
        paid_amount: 120,
        payment_status: "PAID",
        purchase_date: "2026-09-19",
      },
    ] as DbPurchase[],
    cash: [
      payment("customer", "CUSTOMER_WORK", 200, "work"),
      payment("supplier", "SUPPLIER_PURCHASE", 120),
      payment("worker-first", "WORKER_WORK_ITEM", 100, "work"),
      {
        ...payment("other-payment", "WORKER_WORK_ITEM", 20, "old-work"),
        service_job_id: "older",
        transaction_date: "2026-08-05",
      },
    ],
    suppliers: [],
  };
}
