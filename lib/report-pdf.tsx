import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { dbFinancialSummary, dbPurchaseOutstanding, dbPurchaseTotal } from "@/lib/supabase/finance";
import { formatMoney } from "@/lib/format";
import type { DbPurchase, DbServiceJob, DbSupplier, DbWorkItem, DbWorker } from "@/lib/supabase/queries";
import { partTitle, supplierDisplayName, workerDisplayName, workTitle } from "@/lib/supabase/queries";

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 8.5, color: "#111", fontFamily: "Helvetica", lineHeight: 1.35 },
  header: { borderBottom: "1.5px solid #111", paddingBottom: 10, marginBottom: 12 },
  brand: { fontSize: 10, letterSpacing: 1.2, color: "#555", marginBottom: 3 },
  title: { fontSize: 18, fontWeight: 700 },
  meta: { marginTop: 4, color: "#555" },
  sectionLoose: { marginTop: 16 },
  heading: { fontSize: 11.5, fontWeight: 700, marginBottom: 6, paddingBottom: 3, borderBottom: "1px solid #ddd" },
  grid: { flexDirection: "row", gap: 8, marginBottom: 7 },
  box: { flex: 1, border: "1px solid #ddd", borderRadius: 4, padding: 7, minHeight: 34 },
  label: { color: "#666", fontSize: 7.5, marginBottom: 2 },
  value: { fontSize: 10, fontWeight: 700 },
  table: { width: "100%", border: "1px solid #d8d8d8", borderBottom: 0 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f2f2f2", borderBottom: "1px solid #d8d8d8" },
  row: { flexDirection: "row", borderBottom: "1px solid #e3e3e3", minHeight: 20 },
  cell: { padding: 5, borderRight: "1px solid #e7e7e7", flexGrow: 1, flexShrink: 1 },
  th: { fontWeight: 700 },
  w12: { width: "12%" },
  w14: { width: "14%" },
  w16: { width: "16%" },
  w18: { width: "18%" },
  w20: { width: "20%" },
  w24: { width: "24%" },
  w28: { width: "28%" },
  w34: { width: "34%" },
  footer: { position: "absolute", bottom: 16, left: 30, right: 30, color: "#777", fontSize: 7.5, borderTop: "1px solid #ddd", paddingTop: 5 }
});

type ReportProps = {
  scope: string;
  jobs: DbServiceJob[];
  purchases: DbPurchase[];
  workItems: DbWorkItem[];
  workers?: DbWorker[];
  suppliers?: DbSupplier[];
};

export function ReportDocument(props: ReportProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <ReportHeader scope={props.scope} />
        {props.scope === "purchases" ? <PurchasesReport {...props} /> : null}
        {props.scope === "workers" ? <WorkersReport {...props} /> : null}
        {props.scope === "work" ? <WorkReport {...props} /> : null}
        {props.scope === "vehicle" ? <VehicleReport {...props} /> : null}
        {props.scope !== "purchases" && props.scope !== "workers" && props.scope !== "work" && props.scope !== "vehicle" ? <OverviewReport {...props} /> : null}
        <Text style={styles.footer} fixed>PRIME Tuning & Detailing | PRIME Flow report</Text>
      </Page>
    </Document>
  );
}

function ReportHeader({ scope }: { scope: string }) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.brand}>PRIME TUNING & DETAILING</Text>
      <Text style={styles.title}>{labelForScope(scope)}</Text>
      <Text style={styles.meta}>Yaradılma tarixi: {new Date().toLocaleString("az-AZ")} | Valyuta: AZN</Text>
    </View>
  );
}

function OverviewReport({ jobs, purchases, workItems }: ReportProps) {
  const totals = jobs.reduce(
    (acc, job) => {
      const jobPurchases = purchases.filter((purchase) => purchase.service_job_id === job.id);
      const jobWork = workItems.filter((item) => item.service_job_id === job.id);
      const financial = dbFinancialSummary(job.agreed_budget, jobPurchases, jobWork);
      acc.budget += job.agreed_budget;
      acc.cost += financial.totalCost;
      acc.outstanding += financial.unpaidSupplierAmount;
      acc.profit += financial.estimatedGrossProfit;
      return acc;
    },
    { budget: 0, cost: 0, outstanding: 0, profit: 0 }
  );
  return (
    <>
      <SummaryGrid items={[["Aktiv kartlar", String(jobs.length)], ["Ümumi büdcə", formatMoney(totals.budget)], ["Ümumi xərc", formatMoney(totals.cost)], ["Təxmini mənfəət", formatMoney(totals.profit)]]} />
      <Section title="Aktiv servis kartları">
        <Table
          headers={["Nömrə", "Avtomobil", "Status", "Büdcə", "Xərc", "Borc"]}
          widths={[styles.w14, styles.w24, styles.w16, styles.w14, styles.w16, styles.w16]}
          rows={jobs.map((job) => {
            const financial = dbFinancialSummary(job.agreed_budget, purchases.filter((purchase) => purchase.service_job_id === job.id), workItems.filter((item) => item.service_job_id === job.id));
            return [job.vehicles?.plate ?? "-", `${job.vehicles?.make ?? ""} ${job.vehicles?.model ?? ""}`, job.status, formatMoney(job.agreed_budget), formatMoney(financial.totalCost), formatMoney(financial.unpaidSupplierAmount)];
          })}
        />
      </Section>
    </>
  );
}

function PurchasesReport({ jobs, purchases }: ReportProps) {
  const total = purchases.reduce((sum, purchase) => sum + dbPurchaseTotal(purchase), 0);
  const paid = purchases.reduce((sum, purchase) => sum + purchase.paid_amount, 0);
  const outstanding = purchases.reduce((sum, purchase) => sum + dbPurchaseOutstanding(purchase), 0);
  return (
    <>
      <SummaryGrid items={[["Alış sayı", String(purchases.length)], ["Cəm alış", formatMoney(total)], ["Ödənib", formatMoney(paid)], ["Təchizatçı borcu", formatMoney(outstanding)]]} />
      <Section title="Satınalma siyahısı">
        <Table
          headers={["Tarix", "Nömrə", "Detal", "Mənbə", "Cəm", "Ödənib", "Qalıq"]}
          widths={[styles.w12, styles.w12, styles.w24, styles.w20, styles.w12, styles.w12, styles.w12]}
          rows={purchases.map((purchase) => {
            const job = jobs.find((item) => item.id === purchase.service_job_id);
            const source = purchase.source_type === "SUPPLIER" ? supplierDisplayName(purchase.suppliers) : purchase.source_type === "INTERNAL_STOCK" ? "Servis daxili ehtiyat" : "Müştərinin təqdim etdiyi detal";
            return [purchase.purchase_date, job?.vehicles?.plate ?? "-", partTitle(purchase), source, formatMoney(dbPurchaseTotal(purchase)), formatMoney(purchase.paid_amount), formatMoney(dbPurchaseOutstanding(purchase))];
          })}
        />
      </Section>
    </>
  );
}

function WorkersReport({ workers = [], workItems, jobs }: ReportProps) {
  return (
    <Section title="İşçi məhsuldarlığı">
      <Table
        headers={["İşçi", "Rol", "Aktiv iş", "Tamamlanan", "Əmək dəyəri", "Son avtomobil"]}
        widths={[styles.w20, styles.w24, styles.w12, styles.w12, styles.w14, styles.w18]}
        rows={workers.map((worker) => {
          const items = workItems.filter((item) => item.assigned_worker_id === worker.id);
          const active = items.filter((item) => item.status !== "DONE" && item.status !== "CANCELLED").length;
          const done = items.filter((item) => item.status === "DONE");
          const value = done.reduce((sum, item) => sum + item.labor_cost, 0);
          const lastJob = jobs.find((job) => job.id === items[0]?.service_job_id);
          return [workerDisplayName(worker), worker.worker_roles?.name ?? "-", String(active), String(done.length), formatMoney(value), lastJob?.vehicles?.plate ?? "-"];
        })}
      />
    </Section>
  );
}

function WorkReport({ jobs, workItems }: ReportProps) {
  return (
    <Section title="Görüləcək işlər">
      <Table
        headers={["Nömrə", "Avtomobil", "İş", "Usta", "Status", "Əmək"]}
        widths={[styles.w12, styles.w18, styles.w28, styles.w18, styles.w12, styles.w12]}
        rows={workItems.map((item) => {
          const job = jobs.find((job) => job.id === item.service_job_id);
          return [job?.vehicles?.plate ?? "-", `${job?.vehicles?.make ?? ""} ${job?.vehicles?.model ?? ""}`, workTitle(item), workerDisplayName(item.workers), item.status, formatMoney(item.labor_cost)];
        })}
      />
    </Section>
  );
}

function VehicleReport({ jobs, purchases, workItems }: ReportProps) {
  const job = jobs[0];
  if (!job) return <Text>Servis kartı tapılmadı.</Text>;
  const vehicle = job.vehicles!;
  const financial = dbFinancialSummary(job.agreed_budget, purchases, workItems);
  return (
    <>
      <SummaryGrid items={[["Nömrə", vehicle.plate], ["Avtomobil", `${vehicle.make} ${vehicle.model}`], ["Servis kartı", job.job_no], ["Status", job.status]]} />
      <Section title="Müştəri və qeydiyyat">
        <SummaryGrid items={[["Müştəri", job.customer_name ?? "-"], ["Telefon", job.customer_phone ?? "-"], ["Mənbə", job.funding_source], ["Sığorta", job.insurance_company ?? "-"], ["VIN / ban", vehicle.vin_body_number ?? "-"], ["Rəng", vehicle.color ?? "-"], ["Sahib", vehicle.registered_owner_full_name ?? "-"], ["Ünvan", vehicle.registered_owner_address ?? "-"]]} />
      </Section>
      <Section title="Maliyyə">
        <SummaryGrid items={[["Büdcə", formatMoney(job.agreed_budget)], ["Detal xərci", formatMoney(financial.partsCost)], ["Əmək xərci", formatMoney(financial.laborCost)], ["Qalıq/mənfəət", formatMoney(financial.estimatedGrossProfit)]]} />
      </Section>
      <WorkReport scope="work" jobs={jobs} purchases={purchases} workItems={workItems} />
      <PurchasesReport scope="purchases" jobs={jobs} purchases={purchases} workItems={workItems} />
    </>
  );
}

function SummaryGrid({ items }: { items: Array<[string, string]> }) {
  const rows = [];
  for (let index = 0; index < items.length; index += 4) rows.push(items.slice(index, index + 4));
  return (
    <>
      {rows.map((row, index) => (
        <View key={index} style={styles.grid}>
          {row.map(([label, value]) => <View key={label} style={styles.box}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}
        </View>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.sectionLoose}><Text style={styles.heading}>{title}</Text>{children}</View>;
}

type ColumnWidth = (typeof styles)["w12"];

function Table({ headers, rows, widths }: { headers: string[]; rows: string[][]; widths: ColumnWidth[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader} fixed>
        {headers.map((header, index) => <Text key={header} style={[styles.cell, styles.th, widths[index]]}>{header}</Text>)}
      </View>
      {rows.length === 0 ? <View style={styles.row}><Text style={[styles.cell, styles.w34]}>Məlumat yoxdur.</Text></View> : rows.map((row, rowIndex) => (
        <View key={`${rowIndex}-${row[0]}`} style={styles.row} wrap={false}>
          {row.map((cell, index) => <Text key={`${index}-${cell}`} style={[styles.cell, widths[index]]}>{cell}</Text>)}
        </View>
      ))}
    </View>
  );
}

function labelForScope(scope: string) {
  if (scope === "purchases") return "Satınalma hesabatı";
  if (scope === "workers") return "İşçilər hesabatı";
  if (scope === "work") return "Görüləcək işlər hesabatı";
  if (scope === "vehicle") return "Servis kartı hesabatı";
  return "İcmal hesabatı";
}
