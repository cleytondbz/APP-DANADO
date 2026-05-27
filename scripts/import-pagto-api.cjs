const fs = require("fs");

const csvPath = "C:/Users/cleyt/Downloads/aruqivos joão/PAGTO.csv";
const apiUrl = "http://localhost:3000/api/sync/save";
const onlyYear = "2026";

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

async function run() {
  const lines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/);
  const purchaseEntries = {};
  const groups = new Set();
  const suppliers = new Set();
  const institutions = new Set();
  const signatures = new Set();

  let parsed = 0;

  for (const line of lines) {
    if (!line || !line.trim()) continue;
    const cols = line.split(";");
    if (cols.length < 8) continue;

    const dueDate = toIso(cols[0]);
    if (!dueDate || !dueDate.startsWith(`${onlyYear}-`)) continue;

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
    if (signatures.has(sig)) continue;
    signatures.add(sig);

    const monthKey = dueDate.slice(0, 7);
    if (!purchaseEntries[monthKey]) purchaseEntries[monthKey] = [];
    purchaseEntries[monthKey].push({
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
    parsed++;

    if (group) groups.add(group);
    if (supplier) suppliers.add(supplier);
    if (financialInstitution) institutions.add(financialInstitution);
  }

  Object.keys(purchaseEntries).forEach((month) => {
    purchaseEntries[month].sort(
      (a, b) =>
        (a.dueDate || "").localeCompare(b.dueDate || "") ||
        (a.supplier || "").localeCompare(b.supplier || "") ||
        (a.documentNumber || "").localeCompare(b.documentNumber || "")
    );
  });

  const payload = {
    source: "site",
    settings: {
      purchaseEntries,
      purchaseOptions: {
        groups: Array.from(groups),
        suppliers: Array.from(suppliers),
        institutions: Array.from(institutions),
      },
    },
  };

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();

  console.log(`PARSED=${parsed}`);
  console.log(`MONTHS=${Object.keys(purchaseEntries).sort().join(",")}`);
  console.log(`API_OK=${resp.ok}`);
  console.log(`API_RESPONSE=${JSON.stringify(json)}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
