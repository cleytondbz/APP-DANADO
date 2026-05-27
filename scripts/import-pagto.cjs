const fs = require("fs");

const csvPath = "C:/Users/cleyt/Downloads/aruqivos joão/PAGTO.csv";
const dataPath = "C:/Users/cleyt/Documents/Codex/2026-05-23/tenho-um-arquivo-em-zip-um/appdanado/data.json";
const onlyMonth = "2026-05";

function toIso(s) {
  if (!s) return null;
  const value = String(s).trim();
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function toNum(s) {
  if (!s) return 0;
  const clean = String(s)
    .trim()
    .replace(/[^0-9,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function norm(s) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
data.settings = data.settings || {};
data.settings.purchaseEntries = data.settings.purchaseEntries || {};
data.settings.purchaseOptions = data.settings.purchaseOptions || {
  groups: [],
  suppliers: [],
  institutions: [],
};
data.settings.purchaseOptions.groups = data.settings.purchaseOptions.groups || [];
data.settings.purchaseOptions.suppliers = data.settings.purchaseOptions.suppliers || [];
data.settings.purchaseOptions.institutions = data.settings.purchaseOptions.institutions || [];

const signatures = new Set();
for (const entries of Object.values(data.settings.purchaseEntries)) {
  for (const e of entries || []) {
    signatures.add(
      [
        norm(e.dueDate),
        norm(e.group),
        norm(e.supplier),
        norm(e.documentNumber),
        norm(e.issueDate),
        norm(e.installments),
        String(e.amount ?? 0),
        norm(e.paidDate),
        norm(e.financialInstitution),
      ].join("|")
    );
  }
}

const lines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/);
let imported = 0;
let skippedDup = 0;
const changedMonths = new Set();

for (const line of lines) {
  if (!line || !line.trim()) continue;
  const cols = line.split(";");
  if (cols.length < 8) continue;

  const dueDate = toIso(cols[0]);
  if (!dueDate) continue;
  if (!dueDate.startsWith(`${onlyMonth}-`)) continue;

  let group = (cols[1] || "").trim();
  if (!group) group = "M";

  const supplier = (cols[2] || "").trim();
  const documentNumber = (cols[3] || "").trim();
  const issueDate = toIso(cols[4]);
  let installments = (cols[5] || "").trim();
  if (!installments) installments = "01/01";
  const amount = toNum(cols[6]);
  const paidDate = toIso(cols[7]);
  const financialInstitution = (cols[8] || "").trim();

  const sig = [
    norm(dueDate),
    norm(group),
    norm(supplier),
    norm(documentNumber),
    norm(issueDate),
    norm(installments),
    String(amount),
    norm(paidDate),
    norm(financialInstitution),
  ].join("|");

  if (signatures.has(sig)) {
    skippedDup++;
    continue;
  }

  const monthKey = dueDate.slice(0, 7);
  if (!Array.isArray(data.settings.purchaseEntries[monthKey])) {
    data.settings.purchaseEntries[monthKey] = [];
  }

  data.settings.purchaseEntries[monthKey].push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dueDate,
    group,
    supplier,
    documentNumber,
    issueDate,
    installments,
    amount,
    paidDate,
    financialInstitution,
  });

  if (group && !data.settings.purchaseOptions.groups.includes(group)) {
    data.settings.purchaseOptions.groups.push(group);
  }
  if (supplier && !data.settings.purchaseOptions.suppliers.includes(supplier)) {
    data.settings.purchaseOptions.suppliers.push(supplier);
  }
  if (financialInstitution && !data.settings.purchaseOptions.institutions.includes(financialInstitution)) {
    data.settings.purchaseOptions.institutions.push(financialInstitution);
  }

  signatures.add(sig);
  imported++;
  changedMonths.add(monthKey);
}

for (const month of changedMonths) {
  data.settings.purchaseEntries[month].sort(
    (a, b) =>
      (a.dueDate || "").localeCompare(b.dueDate || "") ||
      (a.supplier || "").localeCompare(b.supplier || "") ||
      (a.documentNumber || "").localeCompare(b.documentNumber || "")
  );
}

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

console.log(`IMPORTED=${imported}`);
console.log(`SKIPPED_DUP=${skippedDup}`);
console.log(`MONTHS=${Array.from(changedMonths).sort().join(",")}`);
