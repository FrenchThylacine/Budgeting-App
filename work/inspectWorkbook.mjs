import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:\\Users\\iyadf\\Downloads\\Budget Full.xlsx";
const outputDir = path.resolve("work", "import");

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 16000,
  tableMaxRows: 12,
  tableMaxCols: 16,
  tableMaxCellChars: 100,
});

const formulas = await workbook.inspect({
  kind: "formula",
  maxChars: 12000,
  options: { maxResults: 200 },
});

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "source workbook formula errors",
});

await fs.writeFile(path.join(outputDir, "overview.ndjson"), overview.ndjson, "utf8");
await fs.writeFile(path.join(outputDir, "formulas.ndjson"), formulas.ndjson, "utf8");
await fs.writeFile(path.join(outputDir, "errors.ndjson"), errors.ndjson, "utf8");

console.log(overview.ndjson);
console.log("\\n--- formulas ---");
console.log(formulas.ndjson);
console.log("\\n--- errors ---");
console.log(errors.ndjson);
