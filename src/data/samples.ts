/**
 * Synthetic sample intake packages. All names, IDs and amounts are fictional.
 * `json` is the exact text sent to the audit endpoint, so the malformed case can be represented too.
 */

export type SampleCase = {
  id: string;
  label: string;
  summary: string;
  expectedOutcome: string;
  json: string;
};

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

export const alexMorgan = {
  client: {
    clientId: "CL-1001",
    name: "Alex Morgan",
    taxYear: 2025,
    filingStatus: "single",
    reportedIncomeSources: ["wages", "interest"],
  },
  questionnaire: {
    reportedWages: "85000.00",
    reportedInterestIncome: "450.00",
    reportedContractorIncome: "0.00",
    indicators: { hadW2Employment: true, receivedInterestIncome: true, performedContractWork: false },
  },
  documents: [
    {
      documentId: "DOC-AM-W2-01",
      documentType: "W-2",
      taxYear: 2025,
      amount: "92000.00",
      sourceFile: "alex_morgan_w2_northwind_2025.pdf",
      payerName: "Northwind Logistics (synthetic)",
    },
  ],
};

export const jamieRivera = {
  client: {
    clientId: "CL-1002",
    name: "Jamie Rivera",
    taxYear: 2025,
    filingStatus: "married_filing_jointly",
    reportedIncomeSources: ["wages", "interest"],
  },
  questionnaire: {
    reportedWages: "64250.00",
    reportedInterestIncome: "182.37",
    reportedContractorIncome: "0.00",
    indicators: { hadW2Employment: true, receivedInterestIncome: true, performedContractWork: false },
  },
  documents: [
    {
      documentId: "DOC-JR-W2-01",
      documentType: "W-2",
      taxYear: 2025,
      amount: "64250.00",
      sourceFile: "jamie_rivera_w2_brightpath_2025.pdf",
      payerName: "BrightPath Clinics (synthetic)",
    },
    {
      documentId: "DOC-JR-INT-01",
      documentType: "1099-INT",
      taxYear: 2025,
      amount: "182.37",
      sourceFile: "jamie_rivera_1099int_harborcu_2025.pdf",
      payerName: "Harbor Credit Union (synthetic)",
    },
  ],
};

export const samPatelInvalid = {
  client: {
    clientId: "CL-1003",
    name: "Sam Patel",
    taxYear: 2031,
    filingStatus: "single",
    reportedIncomeSources: ["wages"],
  },
  questionnaire: {
    reportedWages: "71,500.00",
    reportedInterestIncome: "0.00",
    reportedContractorIncome: "0.00",
    indicators: { hadW2Employment: true, receivedInterestIncome: false, performedContractWork: false },
  },
  documents: [
    { documentId: "DOC-SP-001", documentType: "W-2", taxYear: 2025, amount: "71500.00", sourceFile: "sam_patel_w2_a.pdf" },
    { documentId: "DOC-SP-001", documentType: "W-2", taxYear: 2025, amount: "12OO.00", sourceFile: "sam_patel_w2_b.pdf" },
  ],
};

export const jordanLee = {
  client: {
    clientId: "CL-1004",
    name: "Jordan Lee",
    taxYear: 2025,
    filingStatus: "head_of_household",
    reportedIncomeSources: ["wages", "contractor"],
  },
  questionnaire: {
    reportedWages: "79500.50",
    reportedInterestIncome: "0.00",
    reportedContractorIncome: "12000.00",
    indicators: { hadW2Employment: true, receivedInterestIncome: false, performedContractWork: true },
  },
  documents: [
    { documentId: "DOC-JL-W2-01", documentType: "W-2", taxYear: 2025, amount: "48000.00", sourceFile: "jordan_lee_w2_cedar_2025.pdf" },
    { documentId: "DOC-JL-W2-02", documentType: "W-2", taxYear: 2025, amount: "31500.50", sourceFile: "jordan_lee_w2_lumen_2025.pdf" },
    { documentId: "DOC-JL-NEC-01", documentType: "1099-NEC", taxYear: 2025, amount: "9800.00", sourceFile: "jordan_lee_1099nec_studio_2025.pdf" },
    { documentId: "DOC-JL-NEC-02", documentType: "1099-NEC", taxYear: 2024, amount: "2200.00", sourceFile: "jordan_lee_1099nec_studio_2024.pdf" },
    { documentId: "DOC-JL-DIV-01", documentType: "1099-DIV", taxYear: 2025, amount: "340.12", sourceFile: "jordan_lee_1099div_2025.pdf" },
  ],
};

export const caseyNguyenIncomplete = {
  client: {
    clientId: "CL-1005",
    name: "Casey Nguyen",
    taxYear: 2025,
    reportedIncomeSources: ["wages"],
  },
  questionnaire: {
    reportedWages: "58000.00",
    indicators: { hadW2Employment: true },
  },
  documents: [],
};

export const MALFORMED_JSON_TEXT = `{
  "client": {
    "clientId": "CL-1006",
    "name": "Riley Brooks",
    "taxYear": 2025,
  },
  "questionnaire": { "reportedWages": "40000.00"
`;

export const SAMPLE_CASES: SampleCase[] = [
  {
    id: "alex-morgan",
    label: "Case 1 — Alex Morgan (discrepancies)",
    summary: "Wages reported as $85,000; W-2 Box 1 shows $92,000. Interest reported but no 1099-INT.",
    expectedOutcome: "$7,000.00 wage discrepancy (high) and a possible missing 1099-INT (medium).",
    json: pretty(alexMorgan),
  },
  {
    id: "jamie-rivera",
    label: "Case 2 — Jamie Rivera (clean)",
    summary: "Questionnaire matches the W-2 and the 1099-INT to the cent.",
    expectedOutcome: "Audit completes with no findings.",
    json: pretty(jamieRivera),
  },
  {
    id: "sam-patel-invalid",
    label: "Case 3 — Sam Patel (invalid input)",
    summary: "Future tax year, a comma-formatted amount, a letter-O typo in an amount, and a duplicate document ID.",
    expectedOutcome: "Audit is blocked with specific validation errors; no findings or totals are produced.",
    json: pretty(samPatelInvalid),
  },
  {
    id: "jordan-lee",
    label: "Case 4 — Jordan Lee (multiple documents)",
    summary: "Two W-2s, two 1099-NECs (one for 2024), and an unsupported 1099-DIV.",
    expectedOutcome:
      "W-2s aggregate cleanly to $79,500.50. The 2024 1099-NEC is excluded and reported, leaving a $2,200.00 contractor discrepancy. The 1099-DIV is excluded and reported.",
    json: pretty(jordanLee),
  },
  {
    id: "casey-nguyen-incomplete",
    label: "Case 5 — Casey Nguyen (incomplete intake)",
    summary: "No filing status, interest and contractor questions unanswered, no documents yet.",
    expectedOutcome: "Audit still runs: possible missing W-2 (high) plus low-severity incomplete-intake findings.",
    json: pretty(caseyNguyenIncomplete),
  },
  {
    id: "malformed-json",
    label: "Case 6 — Malformed JSON",
    summary: "Truncated JSON with a trailing comma.",
    expectedOutcome: "Audit is blocked with a malformed-JSON error.",
    json: MALFORMED_JSON_TEXT,
  },
];
