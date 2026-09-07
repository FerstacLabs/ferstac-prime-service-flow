export type FundingSource = "CUSTOMER_FUNDED" | "INSURANCE_CLAIM";
export type JobStatus =
  | "RECEIVED"
  | "WAITING"
  | "IN_PROGRESS"
  | "WAITING_PARTS"
  | "READY"
  | "DELIVERED"
  | "PAUSED";
export type WorkStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL";
export type PurchaseSource = "SUPPLIER" | "INTERNAL_STOCK" | "CUSTOMER_PROVIDED";

export type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  vehicleType?: string;
  bodyType?: string;
  manufacturer?: string;
  productionYear?: number;
  firstRegistrationDate?: string;
  vinBodyNumber?: string;
  chassisNumber?: string;
  engineNumber?: string;
  enginePowerHp?: number;
  enginePowerKw?: number;
  color?: string;
  certificateNo?: string;
  registrationValidUntil?: string;
  maxPermittedMassKg?: number;
  unladenMassKg?: number;
  registeredOwnerFullName?: string;
  registeredOwnerAddress?: string;
};

export type ServiceJob = {
  id: string;
  vehicleId: string;
  jobNo: string;
  customerName?: string;
  customerPhone?: string;
  fundingSource: FundingSource;
  insuranceCompany?: string;
  insuranceClaimNo?: string;
  insuranceApprovedAmount?: number;
  agreedBudget: number;
  status: JobStatus;
  receivedAt: string;
  targetDeliveryDate?: string;
  deliveredAt?: string;
  notes?: string;
};

export type WorkCatalogItem = {
  id: string;
  code: string;
  category: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type Worker = {
  id: string;
  firstName: string;
  lastName: string;
  fatherName?: string;
  phone?: string;
  role: string;
  active: boolean;
  hireDate?: string;
  notes?: string;
};

export type Supplier = {
  id: string;
  entityType: "INDIVIDUAL" | "LEGAL_ENTITY";
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  companyName?: string;
  shopName?: string;
  taxIdVoen?: string;
  phone?: string;
  address?: string;
  active: boolean;
};

export type WorkItem = {
  id: string;
  serviceJobId: string;
  workCatalogId?: string;
  customTitle?: string;
  assignedWorkerId?: string;
  status: WorkStatus;
  laborCost: number;
  plannedAt: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
};

export type PartCatalogItem = {
  id: string;
  category: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type Purchase = {
  id: string;
  serviceJobId: string;
  partCatalogId?: string;
  customItemName?: string;
  quantity: number;
  unitPrice: number;
  sourceType: PurchaseSource;
  supplierId?: string;
  purchasedByWorkerId?: string;
  purchasedByAdmin: boolean;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  partCodeOem?: string;
  brandModel?: string;
  serialNo?: string;
  documentNo?: string;
  purchaseDate: string;
  notes?: string;
};
