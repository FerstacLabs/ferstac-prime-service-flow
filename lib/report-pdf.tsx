import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { dbFinancialSummary, dbPurchaseOutstanding, dbPurchaseTotal } from "@/lib/supabase/finance";
import { formatMoney } from "@/lib/format";
import type { DbPurchase, DbServiceJob, DbWorkItem } from "@/lib/supabase/queries";
import { partTitle, workTitle } from "@/lib/supabase/queries";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: "#111", fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 8, fontWeight: 700 },
  muted: { color: "#555", marginBottom: 16 },
  section: { marginTop: 14 },
  heading: { fontSize: 12, marginBottom: 6, fontWeight: 700 },
  row: { flexDirection: "row", borderBottom: "1px solid #ddd", paddingVertical: 5 },
  cell: { flex: 1, paddingRight: 6 },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, color: "#777", fontSize: 8 }
});

export function ReportDocument({
  scope,
  jobs,
  purchases,
  workItems
}: {
  scope: string;
  jobs: DbServiceJob[];
  purchases: DbPurchase[];
  workItems: DbWorkItem[];
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>PRIME Flow - {labelForScope(scope)} hesabatı</Text>
        <Text style={styles.muted}>Yaradılma tarixi: {new Date().toLocaleString("az-AZ")}</Text>
        {jobs.map((job) => {
          const vehicle = job.vehicles!;
          const jobPurchases = purchases.filter((purchase) => purchase.service_job_id === job.id);
          const jobWork = workItems.filter((item) => item.service_job_id === job.id);
          const financial = dbFinancialSummary(job.agreed_budget, jobPurchases, jobWork);
          return (
            <View key={job.id} style={styles.section}>
              <Text style={styles.heading}>{vehicle.plate} - {vehicle.make} {vehicle.model} - {job.job_no}</Text>
              <View style={styles.row}>
                <Text style={styles.cell}>Budce: {formatMoney(job.agreed_budget)}</Text>
                <Text style={styles.cell}>Detal: {formatMoney(financial.partsCost)}</Text>
                <Text style={styles.cell}>Emek: {formatMoney(financial.laborCost)}</Text>
                <Text style={styles.cell}>Borc: {formatMoney(financial.unpaidSupplierAmount)}</Text>
              </View>
              <Text style={styles.heading}>Isler</Text>
              {jobWork.map((item) => (
                <View key={item.id} style={styles.row}>
                  <Text style={styles.cell}>{workTitle(item)}</Text>
                  <Text style={styles.cell}>{item.status}</Text>
                  <Text style={styles.cell}>{formatMoney(item.labor_cost)}</Text>
                </View>
              ))}
              <Text style={styles.heading}>Satinalmalar</Text>
              {jobPurchases.map((purchase) => (
                <View key={purchase.id} style={styles.row}>
                  <Text style={styles.cell}>{partTitle(purchase)}</Text>
                  <Text style={styles.cell}>{formatMoney(dbPurchaseTotal(purchase))}</Text>
                  <Text style={styles.cell}>Odenib: {formatMoney(purchase.paid_amount)}</Text>
                  <Text style={styles.cell}>Qaliq: {formatMoney(dbPurchaseOutstanding(purchase))}</Text>
                </View>
              ))}
            </View>
          );
        })}
        <Text style={styles.footer}>PRIME Tuning & Detailing - fiziki cap ucun ag hesabat formati</Text>
      </Page>
    </Document>
  );
}

function labelForScope(scope: string) {
  if (scope === "purchases") return "Satınalma";
  if (scope === "workers") return "İşçilər";
  if (scope === "work") return "Görüləcək işlər";
  if (scope === "vehicle") return "Servis kartı";
  return "İcmal";
}
