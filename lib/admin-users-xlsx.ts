import JSZip from "jszip";

type Report = Awaited<ReturnType<typeof import("./admin-users-report.ts").adminUsersReport>>;

const xml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const columnName = (index: number) => {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

function cell(row: number, column: number, value: unknown, style = 0) {
  const reference = `${columnName(column)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function coefficientLabel(value: Report["grossCoefficient"]) {
  const variants = Number(value.variants || 0);
  if (!variants) return "Нет операций с сохранённым коэффициентом";
  const minimum = Number(value.minimum || 0);
  const maximum = Number(value.maximum || 0);
  if (variants === 1) return `Единый коэффициент ×${minimum.toFixed(4)}`;
  return `Использованы snapshots коэффициента; вариантов: ${variants}, диапазон ×${minimum.toFixed(4)}–×${maximum.toFixed(4)}`;
}

export async function createAdminUsersXlsx(report: Report, tenantName: string) {
  const headers = [
    "User", "Email", "Company", "Tenant", "Access", "Plan", "RD token balance", "Projects in period",
    "Generations in period", "Exact ledger ops in period", "RD tokens spent", "Exact NET$", "Exact GROSS$",
    "Legacy NET estimate$", "Legacy GROSS estimate$", "Provider text input tokens",
    "Provider image input tokens", "Provider image output tokens",
  ];
  const generatedAt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: report.filter.timeZone,
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
  const metadata = [
    ["Отчёт", "Пользователи — AI и финансовая активность"],
    ["Tenant", tenantName],
    ["Период", `${report.filter.fromDate} — ${report.filter.toDate}`],
    ["Часовой пояс", report.filter.timeZone],
    ["Поиск", report.filter.search || "Все пользователи"],
    ["Сформирован", generatedAt],
    ["GROSS", coefficientLabel(report.grossCoefficient)],
  ];
  const headerRow = metadata.length + 3;
  const firstDataRow = headerRow + 1;
  const rows: string[] = [];
  rows.push(`<row r="1" ht="28" customHeight="1">${cell(1, 0, "Пользователи — AI и финансовая активность", 1)}</row>`);
  metadata.forEach(([label, value], index) => {
    const row = index + 3;
    rows.push(`<row r="${row}">${cell(row, 0, label, 2)}${cell(row, 1, value, 0)}</row>`);
  });
  rows.push(`<row r="${headerRow}" ht="30" customHeight="1">${headers.map((value, index) => cell(headerRow, index, value, 3)).join("")}</row>`);
  report.users.forEach((user, index) => {
    const row = firstDataRow + index;
    const memberships = Array.isArray(user.memberships) ? user.memberships as Array<Record<string, unknown>> : [];
    const values = [
      [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени",
      user.email || "",
      user.company_role || "",
      memberships.map((membership) => membership.name).filter(Boolean).join(", ") || "Без tenant membership",
      `${user.global_role || "user"}${memberships.length ? `; ${memberships.map((membership) => `${membership.name}: ${membership.role}`).join("; ")}` : ""}`,
      user.plan_name || "Free",
      Number(user.token_balance || 0),
      Number(user.project_count || 0),
      Number(user.generation_count || 0),
      Number(user.ai_operation_count || 0),
      Number(user.ai_rd_tokens_charged || 0),
      Number(user.ai_net_micro_usd || 0) / 1_000_000,
      Number(user.ai_gross_micro_usd || 0) / 1_000_000,
      Number(user.legacy_net_estimate_micro_usd || 0) / 1_000_000,
      Number(user.legacy_gross_estimate_micro_usd || 0) / 1_000_000,
      Number(user.input_text_tokens || 0),
      Number(user.input_image_tokens || 0),
      Number(user.output_image_tokens || 0),
    ];
    rows.push(`<row r="${row}">${values.map((value, column) => cell(row, column, value, column >= 11 && column <= 14 ? 5 : 0)).join("")}</row>`);
  });
  const totalRow = firstDataRow + report.users.length;
  const totalValues: unknown[] = [
    "ИТОГО", "", "", "", "", "", "",
    report.totals.project_count,
    report.totals.generation_count,
    report.totals.ai_operation_count,
    report.totals.ai_rd_tokens_charged,
    report.totals.ai_net_micro_usd / 1_000_000,
    report.totals.ai_gross_micro_usd / 1_000_000,
    report.totals.legacy_net_estimate_micro_usd / 1_000_000,
    report.totals.legacy_gross_estimate_micro_usd / 1_000_000,
    report.totals.input_text_tokens,
    report.totals.input_image_tokens,
    report.totals.output_image_tokens,
  ];
  rows.push(`<row r="${totalRow}" ht="24" customHeight="1">${totalValues.map((value, column) => cell(totalRow, column, value, column >= 11 && column <= 14 ? 6 : 4)).join("")}</row>`);

  const widths = [24, 30, 24, 24, 32, 14, 17, 18, 20, 21, 18, 14, 14, 20, 22, 24, 25, 26];
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headerRow}" topLeftCell="A${firstDataRow}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>
  <sheetData>${rows.join("")}</sheetData>
  <mergeCells count="1"><mergeCell ref="A1:R1"/></mergeCells>
  <autoFilter ref="A${headerRow}:R${Math.max(headerRow, totalRow - 1)}"/>
</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.000000"/></numFmts>
  <fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF20211D"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF707168"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF252620"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F1EA"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border/><border><bottom style="thin"><color rgb="FFD8D9D2"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Пользователи" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", worksheet);
  zip.file("xl/styles.xml", styles);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Пользователи — AI и финансовая активность</dc:title><dc:creator>Room Design</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Room Design</Application></Properties>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
