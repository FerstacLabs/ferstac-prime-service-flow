import type { PartCatalogItem, Purchase, ServiceJob, Supplier, Vehicle, WorkCatalogItem, Worker, WorkItem } from "@/lib/types";

export const workerRoles = [
  "Armaturçu / söküb-yığma ustası",
  "Kuzov ustası / dəmirçi",
  "Rəngsaz",
  "Boya hazırlıq ustası",
  "PDR ustası",
  "Plastik ustası",
  "Qaynaqçı",
  "Mexanik",
  "Avtoelektrik-diaqnost",
  "Tuning / retrofit ustası",
  "Detailing ustası",
  "Cilalama ustası",
  "PPF / vinil ustası",
  "Şüşə ustası",
  "Təkər və disk ustası",
  "Kondisioner ustası",
  "Universal usta",
  "Usta köməkçisi",
  "Keyfiyyətə nəzarət üzrə məsul şəxs"
];

export const workCatalog: WorkCatalogItem[] = [
  ["initial-inspection", "Qəbul və ilkin yoxlama", "İlkin baxış və defektasiya"],
  ["photo-intake", "Qəbul və ilkin yoxlama", "Foto-fiksasiya / qəbul vəziyyətinin qeydə alınması"],
  ["diagnostics", "Qəbul və ilkin yoxlama", "Kompyuter diaqnostikası"],
  ["front-bumper", "Sökülmə və quraşdırma", "Ön bamperin sökülməsi/quraşdırılması"],
  ["bodykit", "Sökülmə və quraşdırma", "Body-kit və tuning detallarının yığılması/quraşdırılması"],
  ["dent-repair", "Kuzov və dəmirçi işləri", "Əzik və deformasiya düzəltmə"],
  ["welding", "Kuzov və dəmirçi işləri", "Qaynaq işi"],
  ["paint-prep", "Rəngsaz və boya hazırlığı", "Səthin təmizlənməsi və boya hazırlığı"],
  ["paint", "Rəngsaz və boya hazırlığı", "Detalın rənglənməsi"],
  ["polish", "Rəngsaz və boya hazırlığı", "Boya sonrası cilalama"],
  ["plastic-repair", "Plastik və kompozit bərpa", "Plastik bamper təmiri"],
  ["oil-filter", "Mexaniki işlər", "Yağ və filtr dəyişimi"],
  ["electric-diagnostics", "Elektrik və elektronika", "Avtoelektrik diaqnostikası"],
  ["pdc", "Elektrik və elektronika", "PDC park sensoru quraşdırılması və təmiri"],
  ["headlight", "Şüşə və optika", "Faranın cilalanması / bərpası"],
  ["m-style", "Tuning və retrofit", "M-style / G80-style kuzov çevrilməsi"],
  ["carplay", "Tuning və retrofit", "Multimedia / CarPlay retrofit"],
  ["ceramic", "Detailing və qoruyucu işlər", "Keramik qoruyucu örtük"],
  ["ppf", "Detailing və qoruyucu işlər", "PPF qoruyucu plyonka"],
  ["wheel-align", "Təkər və disk", "Razval-sxojdeniye / təkər bucaqlarının sazlanması"],
  ["quality", "Yekun nəzarət və təhvil", "Yekun texniki yoxlama"]
].map(([id, category, name], index) => ({
  id,
  code: id.toUpperCase(),
  category,
  name,
  active: true,
  sortOrder: index + 1
}));

export const partCatalog: PartCatalogItem[] = [
  "Ön bamper", "Arxa bamper", "Radiator barmaqlığı/böyrək", "Ön lip/splitter", "Arxa diffuser",
  "Yan ətək/side skirt", "Kapot", "Yan güzgü", "Klips/bərkidici", "Ön fara", "Arxa fənər/stop",
  "Fara modulu", "Radiator paneli/televizor", "Mühərrik radiatoru", "İnterkuler", "Hava filtri",
  "Yağ filtri", "Turbo", "Amortizator", "Stabilizator linki", "Əyləc diski", "Əyləc bəndi/pad",
  "PDC sensoru", "Arxa kamera", "Multimedia ekranı", "Sükan", "Ön şüşə", "Egzoz ucluğu",
  "Disk", "Təkər", "Body-kit komplekti", "M paket/M-style detalı", "PPF plyonka", "Keramik örtük",
  "Polish pastası", "Mühərrik yağı", "Antifriz", "Boya", "Lak", "Astar/primer"
].map((name, index) => ({
  id: `part-${index + 1}`,
  category: index < 9 ? "Kuzov və eksteryer" : index < 15 ? "İşıq və optika" : "Sərf materialları",
  name,
  active: true,
  sortOrder: index + 1
}));

export const vehicles: Vehicle[] = [
  { id: "v1", plate: "10-PR-030", make: "BMW", model: "F30 328i", manufacturer: "BMW", productionYear: 2014, color: "Sarı", vinBodyNumber: "WBA3A5C50EF000001", registeredOwnerFullName: "Namiq Əliyev" },
  { id: "v2", plate: "90-AA-772", make: "Mercedes-Benz", model: "C200", productionYear: 2018, color: "Qara", registeredOwnerFullName: "Fərid Məmmədov" },
  { id: "v3", plate: "77-RT-515", make: "Toyota", model: "Camry", productionYear: 2021, color: "Ağ", registeredOwnerFullName: "Leyla Qasımova" },
  { id: "v4", plate: "99-XX-999", make: "Range Rover", model: "Sport", productionYear: 2020, color: "Boz", registeredOwnerFullName: "Murad Hüseynli" }
];

export const serviceJobs: ServiceJob[] = [
  { id: "j1", vehicleId: "v1", jobNo: "PR-2026-0001", customerName: "Namiq Əliyev", customerPhone: "+994501112233", fundingSource: "CUSTOMER_FUNDED", agreedBudget: 8200, status: "IN_PROGRESS", receivedAt: "2026-08-24", targetDeliveryDate: "2026-09-12", notes: "F30 transformasiya və detailing paketi." },
  { id: "j2", vehicleId: "v2", jobNo: "PR-2026-0002", customerName: "Fərid Məmmədov", fundingSource: "INSURANCE_CLAIM", insuranceCompany: "Prime Sığorta", insuranceClaimNo: "PS-44821", insuranceApprovedAmount: 3900, agreedBudget: 4300, status: "WAITING_PARTS", receivedAt: "2026-08-29" },
  { id: "j3", vehicleId: "v3", jobNo: "PR-2026-0003", customerName: "Leyla Qasımova", fundingSource: "CUSTOMER_FUNDED", agreedBudget: 1250, status: "READY", receivedAt: "2026-09-01", targetDeliveryDate: "2026-09-08" },
  { id: "j4", vehicleId: "v4", jobNo: "PR-2026-0004", customerName: "Murad Hüseynli", fundingSource: "INSURANCE_CLAIM", insuranceCompany: "Xəzər Sığorta", insuranceClaimNo: "XS-9013", insuranceApprovedAmount: 6100, agreedBudget: 6500, status: "RECEIVED", receivedAt: "2026-09-05" }
];

export const workers: Worker[] = [
  { id: "w1", firstName: "Rəşad", lastName: "Həsənov", role: "Kuzov ustası / dəmirçi", active: true, hireDate: "2023-03-14" },
  { id: "w2", firstName: "Elvin", lastName: "Rzayev", role: "Rəngsaz", active: true, hireDate: "2022-10-04" },
  { id: "w3", firstName: "Tural", lastName: "Əliyev", role: "Tuning / retrofit ustası", active: true, hireDate: "2024-01-15" },
  { id: "w4", firstName: "Orxan", lastName: "Səfərov", role: "Avtoelektrik-diaqnost", active: true, hireDate: "2021-06-01" },
  { id: "w5", firstName: "Samir", lastName: "Quliyev", role: "Detailing ustası", active: true, hireDate: "2024-06-10" },
  { id: "w6", firstName: "Kamran", lastName: "Nəcəfli", role: "Armaturçu / söküb-yığma ustası", active: true, hireDate: "2025-02-22" }
];

export const suppliers: Supplier[] = [
  { id: "s1", entityType: "LEGAL_ENTITY", companyName: "AutoLine Parts MMC", shopName: "AutoLine", taxIdVoen: "1503207781", phone: "+994124440101", active: true },
  { id: "s2", entityType: "LEGAL_ENTITY", companyName: "Baku Paint Supply", shopName: "BPS", taxIdVoen: "1702205533", phone: "+994553330202", active: true },
  { id: "s3", entityType: "INDIVIDUAL", firstName: "Vüqar", lastName: "Əhmədov", phone: "+994507770303", active: true },
  { id: "s4", entityType: "LEGAL_ENTITY", companyName: "Retrofit Garage", shopName: "RG Parts", taxIdVoen: "1309912244", phone: "+994704450404", active: true },
  { id: "s5", entityType: "LEGAL_ENTITY", companyName: "Detail Pro Market", shopName: "DPM", taxIdVoen: "1008815577", phone: "+994552220505", active: true }
];

export const workItems: WorkItem[] = [
  { id: "wi1", serviceJobId: "j1", workCatalogId: "initial-inspection", assignedWorkerId: "w6", status: "DONE", laborCost: 60, plannedAt: "2026-08-24", completedAt: "2026-08-24" },
  { id: "wi2", serviceJobId: "j1", workCatalogId: "m-style", assignedWorkerId: "w3", status: "IN_PROGRESS", laborCost: 650, plannedAt: "2026-08-25", startedAt: "2026-08-26" },
  { id: "wi3", serviceJobId: "j1", workCatalogId: "paint", assignedWorkerId: "w2", status: "TODO", laborCost: 1200, plannedAt: "2026-09-08" },
  { id: "wi4", serviceJobId: "j1", workCatalogId: "ppf", assignedWorkerId: "w5", status: "TODO", laborCost: 750, plannedAt: "2026-09-10" },
  { id: "wi5", serviceJobId: "j2", workCatalogId: "front-bumper", assignedWorkerId: "w6", status: "DONE", laborCost: 180, plannedAt: "2026-08-30", completedAt: "2026-08-30" },
  { id: "wi6", serviceJobId: "j2", workCatalogId: "plastic-repair", assignedWorkerId: "w1", status: "IN_PROGRESS", laborCost: 420, plannedAt: "2026-08-31" },
  { id: "wi7", serviceJobId: "j2", workCatalogId: "paint-prep", assignedWorkerId: "w2", status: "TODO", laborCost: 300, plannedAt: "2026-09-09" },
  { id: "wi8", serviceJobId: "j3", workCatalogId: "oil-filter", assignedWorkerId: "w1", status: "DONE", laborCost: 90, plannedAt: "2026-09-01", completedAt: "2026-09-01" },
  { id: "wi9", serviceJobId: "j3", workCatalogId: "ceramic", assignedWorkerId: "w5", status: "DONE", laborCost: 340, plannedAt: "2026-09-02", completedAt: "2026-09-04" },
  { id: "wi10", serviceJobId: "j3", workCatalogId: "quality", assignedWorkerId: "w6", status: "DONE", laborCost: 45, plannedAt: "2026-09-04", completedAt: "2026-09-04" },
  { id: "wi11", serviceJobId: "j4", workCatalogId: "diagnostics", assignedWorkerId: "w4", status: "TODO", laborCost: 120, plannedAt: "2026-09-06" },
  { id: "wi12", serviceJobId: "j4", workCatalogId: "dent-repair", assignedWorkerId: "w1", status: "TODO", laborCost: 900, plannedAt: "2026-09-07" },
  { id: "wi13", serviceJobId: "j4", workCatalogId: "paint", assignedWorkerId: "w2", status: "TODO", laborCost: 1350, plannedAt: "2026-09-10" }
];

export const purchases: Purchase[] = [
  { id: "p1", serviceJobId: "j1", partCatalogId: "part-31", quantity: 1, unitPrice: 1850, sourceType: "SUPPLIER", supplierId: "s4", purchasedByAdmin: true, paymentStatus: "PARTIAL", paidAmount: 1000, purchaseDate: "2026-08-25", brandModel: "M-style kit" },
  { id: "p2", serviceJobId: "j1", partCatalogId: "part-4", quantity: 1, unitPrice: 280, sourceType: "SUPPLIER", supplierId: "s1", purchasedByAdmin: true, paymentStatus: "PAID", paidAmount: 280, purchaseDate: "2026-08-26" },
  { id: "p3", serviceJobId: "j1", partCatalogId: "part-33", quantity: 8, unitPrice: 55, sourceType: "SUPPLIER", supplierId: "s5", purchasedByWorkerId: "w5", purchasedByAdmin: false, paymentStatus: "UNPAID", paidAmount: 0, purchaseDate: "2026-09-01" },
  { id: "p4", serviceJobId: "j1", partCatalogId: "part-38", quantity: 2, unitPrice: 160, sourceType: "SUPPLIER", supplierId: "s2", purchasedByAdmin: true, paymentStatus: "PAID", paidAmount: 320, purchaseDate: "2026-09-02" },
  { id: "p5", serviceJobId: "j2", partCatalogId: "part-1", quantity: 1, unitPrice: 730, sourceType: "SUPPLIER", supplierId: "s1", purchasedByAdmin: true, paymentStatus: "PARTIAL", paidAmount: 300, purchaseDate: "2026-08-30" },
  { id: "p6", serviceJobId: "j2", partCatalogId: "part-9", quantity: 24, unitPrice: 1.8, sourceType: "INTERNAL_STOCK", purchasedByAdmin: true, paymentStatus: "PAID", paidAmount: 43.2, purchaseDate: "2026-08-30" },
  { id: "p7", serviceJobId: "j2", partCatalogId: "part-39", quantity: 1, unitPrice: 210, sourceType: "SUPPLIER", supplierId: "s2", purchasedByWorkerId: "w2", purchasedByAdmin: false, paymentStatus: "UNPAID", paidAmount: 0, purchaseDate: "2026-09-03" },
  { id: "p8", serviceJobId: "j3", partCatalogId: "part-36", quantity: 6, unitPrice: 18, sourceType: "INTERNAL_STOCK", purchasedByAdmin: true, paymentStatus: "PAID", paidAmount: 108, purchaseDate: "2026-09-01" },
  { id: "p9", serviceJobId: "j3", partCatalogId: "part-34", quantity: 1, unitPrice: 190, sourceType: "SUPPLIER", supplierId: "s5", purchasedByAdmin: true, paymentStatus: "PAID", paidAmount: 190, purchaseDate: "2026-09-02" },
  { id: "p10", serviceJobId: "j3", partCatalogId: "part-35", quantity: 1, unitPrice: 75, sourceType: "SUPPLIER", supplierId: "s5", purchasedByAdmin: true, paymentStatus: "PAID", paidAmount: 75, purchaseDate: "2026-09-03" },
  { id: "p11", serviceJobId: "j4", partCatalogId: "part-10", quantity: 1, unitPrice: 1280, sourceType: "SUPPLIER", supplierId: "s3", purchasedByAdmin: true, paymentStatus: "UNPAID", paidAmount: 0, purchaseDate: "2026-09-05" },
  { id: "p12", serviceJobId: "j4", partCatalogId: "part-22", quantity: 1, unitPrice: 260, sourceType: "SUPPLIER", supplierId: "s1", purchasedByWorkerId: "w1", purchasedByAdmin: false, paymentStatus: "PARTIAL", paidAmount: 100, purchaseDate: "2026-09-06" },
  { id: "p13", serviceJobId: "j4", partCatalogId: "part-37", quantity: 2, unitPrice: 32, sourceType: "INTERNAL_STOCK", purchasedByAdmin: true, paymentStatus: "PAID", paidAmount: 64, purchaseDate: "2026-09-06" },
  { id: "p14", serviceJobId: "j1", partCatalogId: "part-29", quantity: 4, unitPrice: 420, sourceType: "SUPPLIER", supplierId: "s1", purchasedByAdmin: true, paymentStatus: "PAID", paidAmount: 1680, purchaseDate: "2026-09-04" },
  { id: "p15", serviceJobId: "j2", customItemName: "Sığorta aktı üzrə əlavə material", quantity: 1, unitPrice: 120, sourceType: "CUSTOMER_PROVIDED", purchasedByAdmin: true, paymentStatus: "PAID", paidAmount: 120, purchaseDate: "2026-09-04" }
];

export function getVehicle(job: ServiceJob) {
  return vehicles.find((vehicle) => vehicle.id === job.vehicleId)!;
}

export function getWorkName(item: WorkItem) {
  return item.customTitle ?? workCatalog.find((work) => work.id === item.workCatalogId)?.name ?? "Digər iş";
}

export function getPartName(purchase: Purchase) {
  return purchase.customItemName ?? partCatalog.find((part) => part.id === purchase.partCatalogId)?.name ?? "Detal / material";
}

export function getSupplierName(id?: string) {
  const supplier = suppliers.find((item) => item.id === id);
  if (!supplier) return "Servis daxili ehtiyat";
  return supplier.companyName || supplier.shopName || [supplier.firstName, supplier.lastName, supplier.fatherName].filter(Boolean).join(" ");
}

export function getWorkerName(id?: string) {
  const worker = workers.find((item) => item.id === id);
  if (!worker) return "Usta seçilməyib";
  return `${worker.firstName} ${worker.lastName}`;
}
