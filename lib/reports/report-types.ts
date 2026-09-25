export type ReportScope =
  | "finance"
  | "audit"
  | "overview"
  | "purchases"
  | "workers"
  | "work"
  | "vehicle"
  | "quotation"
  | "handover"
  | "kassa";

export type ReportSummaryItem = {
  label: string;
  value: string;
};

export type ReportField = {
  label: string;
  value: string;
  fullWidth?: boolean;
};

export type ReportTableColumn = {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right";
};

export type ReportTableRow = {
  id: string;
  cells: Record<string, string>;
  details?: ReportField[];
};

export type ReportTable = {
  columns: ReportTableColumn[];
  rows: ReportTableRow[];
};

export type ReportSection = {
  keepTogether?: boolean;
  paragraphs?: string[];
  bullets?: string[];
  signatures?: string[];
  title: string;
  summary?: ReportSummaryItem[];
  fields?: ReportField[];
  table?: ReportTable;
};

export type PrimeReport = {
  filters?: string;
  subtitle?: string;
  scope: ReportScope;
  title: string;
  generatedAt: string;
  orientation?: "portrait" | "landscape";
  summary: ReportSummaryItem[];
  sections: ReportSection[];
};
