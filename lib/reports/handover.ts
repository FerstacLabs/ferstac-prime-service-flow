import type { PrimeReport } from "@/lib/reports/report-types";
import {
  formatReportDate,
  formatReportDateTime,
} from "@/lib/reports/report-format";
import { bakuDate } from "@/lib/filters";
// Transcription of the supplied printed form. Handwritten details are deliberately excluded.
export function handoverReport(plate: string): PrimeReport {
  const date = formatReportDate(bakuDate());
  return {
    scope: "handover",
    title: "TƏHVİL-TƏSLİM AKTI",
    subtitle:
      "(avtomobilin servisə təhvil verilməsi və geri götürülməsinə dair)",
    generatedAt: formatReportDateTime(),
    summary: [],
    sections: [
      {
        title: "1.",
        paragraphs: [
          `Tərəflər aşağıda imzalamaqla təsdiq edirlər ki, ${plate} dövlət qeydiyyat nişanlı avtomobil təmir və/və ya texniki baxışın aparılması məqsədilə servisə təhvil verilmişdir:`,
          "a) Təhvil zamanı istənilən şəxsi və qiymətli əşyalar avtomobildən götürülməlidir, əks halda bununla bağlı sonradan yarana biləcək mübahisəyə görə servis məsuliyyət daşımır;",
          "b) Avtomobili digər şəxs geri götürmək istədikdə, hazırkı aktın əsli və avtomobili götürən şəxsin şəxsiyyət vəsiqəsi təqdim edildikdən sonra təhvil həyata keçirilə bilər;",
          "c) Servisin iş saatlarından kənar avtomobilin geri götürülməsi zamanı, qarşılıqlı olaraq təsdiqləməsi üçün hazırkı aktın əsli servisin mühafizə əməkdaşına təhvil verilməli və şəxsiyyət vəsiqəsi təqdim edilməlidir. Bu halda aktın təsdiqlənmiş əsli sonradan (ən geci 1 ay müddətində) iş saatlarında servis əməkdaşından əldə edilə bilər;",
          "d) Avtomobili təhvil verən (müştəri) imzası ilə təsdiqləyərək razılıq verir ki, təmir prosesi yekunlaşdıqdan sonra və ya digər səbəblərdən avtomobilin təmiri mümkün olmadıqda (o cümlədən, təhvil verənin təmirə razılıq verməməsi, təmir üçün zəruri ehtiyat hissələrinin əldə edilməsinin mümkünsüzlüyü, təmirə ehtiyac qalmaması və digər hallarda) servis əməkdaşının yazılı və ya şifahi (zəng, SMS, WhatsApp və s. vasitəsilə) xəbərdarlığından sonra avtomobil 24 saat ərzində servisin ərazisindən götürülməlidir. Müştəri göstərilən müddətdə avtomobili götürmədiyi halda, hər təqvim günü üçün 50 (əlli) manat məbləğində dayanacaq haqqı hesablanır və bu məbləğ müştəri tərəfindən servisə əlavə olaraq ödənilməlidir. Bundan əlavə, servis (təhvil alan) avtomobili servisin ərazisindən çıxarmaq və evakuasiya vasitəsilə istənilən məntəqəyə yerləşdirmək hüququna malikdir. Bu zaman avtomobilə hər hansı zərər dəydiyi təqdirdə servis məsuliyyət daşımır;",
          "e) Avtomobili təhvil verən (müştəri) imzası ilə təsdiqləyərək razılıq verir ki, təmir prosesi yekunlaşdıqdan sonra avtomobili geri götürməzdən əvvəl təmir xərclərini tam şəkildə ödəməlidir. Müştəri tərəfindən təmir xərcləri tam ödənilmədiyi halda, servis (təhvil alan) avtomobili müştəriyə təhvil verməmək hüququna malikdir. Bu hal mülkiyyət hüququnun məhdudlaşdırılması kimi qiymətləndirilə bilməz və yalnız öhdəliyin təmin olunması üsulu hesab edilir.",
          "Akt tərəflərin hər birində 1 nüsxə saxlanılması şərtilə 2 nüsxədə tərtib edilmişdir.",
          "Aktın 1-ci hissəsinin mətni ilə tanış olduq və doğruluğunu imzamızla təsdiq edirik:",
          `Tarix: ${date}`,
        ],
        signatures: ["Təhvil verdi (müştəri)", "Təhvil aldı (servis əməkdaşı)"],
      },
      {
        title: "2.",
        paragraphs: [
          `Tərəflər aşağıda imzalamaqla təsdiq edirlər ki, ${plate} dövlət qeydiyyat nişanlı avtomobil təmir və/və ya texniki baxışın aparılmasından sonra (və ya aparılmadan) müştəriyə qaytarılmışdır və avtomobillə bağlı tərəflər arasında hər hansı mübahisə mövcud deyildir. Əlavə olaraq:`,
          "a) Avtomobili təhvil alan (müştəri) hazırkı aktın 2-ci hissəsini imzalamaqla təsdiq edir ki, avtomobili təhvil alarkən onun vəziyyətini hərtərəfli yoxlamışdır və avtomobillə, habelə təmir edilmişdirsə təmiri ilə bağlı servisə qarşı hər hansı şikayəti, iddia və ya tələbi yoxdur və gələcəkdə də olmayacaqdır;",
          "b) Zəmanət çərçivəsində dəyişdirilən ehtiyat hissələri istisna edilməklə, avtomobildə hər hansı ehtiyat hissəsi yenisi ilə əvəz olunmuşdursa, köhnə ehtiyat hissəsi avtomobili təhvil alana (müştəriyə) təqdim edilmişdir.",
          "Aktın 2-ci hissəsinin mətni ilə tanış olduq və doğruluğunu imzamızla təsdiq edirik:",
          `Tarix: ${date}`,
        ],
        signatures: ["Təhvil aldı (müştəri)", "Təhvil verdi (servis əməkdaşı)"],
      },
    ],
  };
}
