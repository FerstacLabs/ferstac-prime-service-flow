import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { calculateFinancialSummary, purchaseOutstanding, purchaseTotal } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { getPartName, getVehicle, getWorkName, purchases, serviceJobs, workItems } from "@/lib/demo-data";

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

export function ReportDocument({ scope, vehicleJobId }: { scope: string; vehicleJobId?: string }) {
  const jobs = vehicleJobId ? serviceJobs.filter((job) => job.id === vehicleJobId) : serviceJobs;
  const title = vehicleJobId ? "Servis kartı hesabatı" : `${labelForScope(scope)} hesabatı`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>PRIME Flow - {title}</Text>
        <Text style={styles.muted}>Yaradılma tarixi: {new Date().toLocaleString("az-AZ")}</Text>
        {jobs.map((job) => {
          const vehicle = getVehicle(job);
          const jobPurchases = purchases.filter((purchase) => purchase.serviceJobId === job.id);
          const jobWork = workItems.filter((item) => item.serviceJobId === job.id);
          const financial = calculateFinancialSummary(job.agreedBudget, jobPurchases, jobWork);
          return (
            <View key={job.id} style={styles.section}>
              <Text style={styles.heading}>{vehicle.plate} - {vehicle.make} {vehicle.model} - {job.jobNo}</Text>
              <View style={styles.row}>
                <Text style={styles.cell}>Budce: {formatMoney(job.agreedBudget)}</Text>
                <Text style={styles.cell}>Detal: {formatMoney(financial.partsCost)}</Text>
                <Text style={styles.cell}>Emek: {formatMoney(financial.laborCost)}</Text>
                <Text style={styles.cell}>Borc: {formatMoney(financial.unpaidSupplierAmount)}</Text>
              </View>
              <Text style={styles.heading}>Isler</Text>
              {jobWork.map((item) => (
                <View key={item.id} style={styles.row}>
                  <Text style={styles.cell}>{getWorkName(item)}</Text>
                  <Text style={styles.cell}>{item.status}</Text>
                  <Text style={styles.cell}>{formatMoney(item.laborCost)}</Text>
                </View>
              ))}
              <Text style={styles.heading}>Satinalmalar</Text>
              {jobPurchases.map((purchase) => (
                <View key={purchase.id} style={styles.row}>
                  <Text style={styles.cell}>{getPartName(purchase)}</Text>
                  <Text style={styles.cell}>{formatMoney(purchaseTotal(purchase))}</Text>
                  <Text style={styles.cell}>Odenib: {formatMoney(purchase.paidAmount)}</Text>
                  <Text style={styles.cell}>Qaliq: {formatMoney(purchaseOutstanding(purchase))}</Text>
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
  return "İcmal";
}
