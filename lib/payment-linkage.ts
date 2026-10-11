// Categories describe new input intent. Persist CUSTOMER_VEHICLE and the job UUID;
// never reinterpret historic GENERAL_IN entries or join money by display text.
export function isCustomerSettlementCategory(name?: string | null) {
  return name === "Müştəri ödənişi" || name === "Müştəri avansı";
}
