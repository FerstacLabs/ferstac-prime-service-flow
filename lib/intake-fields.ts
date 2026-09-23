type Field = {
  name: string;
  label: string;
  type?: "number" | "date";
  required?: boolean;
};
export const vehicleIntakeFields: Field[] = [
  { name: "plate", label: "Dövlət qeydiyyat nişanı", required: true },
  { name: "make", label: "Marka", required: true },
  { name: "model", label: "Model", required: true },
  { name: "vehicle_type", label: "Nəqliyyat vasitəsinin tipi" },
  { name: "body_type", label: "Ban tipi" },
  { name: "manufacturer", label: "İstehsalçı" },
  { name: "production_year", label: "Buraxılış ili", type: "number" },
  { name: "first_registration_date", label: "İlk qeydiyyat", type: "date" },
  { name: "vin_body_number", label: "VIN / ban" },
  { name: "chassis_number", label: "Şassi" },
  { name: "engine_number", label: "Mühərrik nömrəsi" },
  { name: "engine_power_hp", label: "Güc (a.g.)", type: "number" },
  { name: "engine_power_kw", label: "Güc (kW)", type: "number" },
  { name: "color", label: "Rəng" },
  {
    name: "registration_certificate_series_no",
    label: "Qeydiyyat şəhadətnaməsi",
  },
  { name: "registration_valid_until", label: "Etibarlılıq", type: "date" },
  { name: "max_permitted_mass_kg", label: "Maksimum kütlə", type: "number" },
  { name: "unladen_mass_kg", label: "Yüksüz kütlə", type: "number" },
  { name: "registered_owner_full_name", label: "Qeydiyyat sahibi" },
  { name: "registered_owner_address", label: "Sahibin ünvanı" },
];
export const jobIntakeFields: Field[] = [
  { name: "customer_name", label: "Müştəri" },
  { name: "customer_phone", label: "Telefon" },
  { name: "target_delivery_date", label: "Hədəf təhvil", type: "date" },
];
