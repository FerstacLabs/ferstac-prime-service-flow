export const reportBrand = {
  company: "Prime Performance Service & Detailing",
  address: "18 Abdulla Mirzəyev küçəsi, Bakı 1001",
  logo: "/brand/prime-logo.png",
};

export function numericReportColumn(label: string) {
  return /AZN|Miqdar|qiymət|Məbləğ|mayası|[Mm]aya|[Öö]dənilib|[Qq]alıq|[Aa]vans|[Qq]azanılmış|[Mm]ənfəət/.test(
    label,
  );
}
