export type ReportScope = "overview" | "purchases" | "workers" | "work" | "vehicle";

export type ReportSummaryItem = {
  label: string;
  value: string;
};

export type ReportField = {
  label: string;
  value: string;
};

export type ReportTableColumn = {
  key: string;
  label: string;
  width?: number;
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
  title: string;
  summary?: ReportSummaryItem[];
  fields?: ReportField[];
  table?: ReportTable;
};

export type PrimeReport = {
  scope: ReportScope;
  title: string;
  generatedAt: string;
  orientation?: "portrait" | "landscape";
  summary: ReportSummaryItem[];
  sections: ReportSection[];
};
