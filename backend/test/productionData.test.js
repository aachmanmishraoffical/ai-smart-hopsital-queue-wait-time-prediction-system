const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeRecords,
  parseCsv,
  parseRetrievedAt,
} = require("../scripts/importHospitalDirectory");

test("CSV parser handles quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsv('name,address\n"General, City","12 ""Main"" Road"\n'), [
    ["name", "address"],
    ["General, City", '12 "Main" Road'],
  ]);
});

test("directory import records provenance and does not infer participation", () => {
  const importedAt = new Date("2026-10-21T10:00:00.000Z");
  const { records, duplicateLocations } = normalizeRecords(
    [
      "sourceRecordId,hospitalName,latitude,longitude,address,departments",
      'rec-1,"City Hospital",28.6,77.2,"Main Road","Cardiology|Surgery"',
      'rec-2," City   Hospital ",28.60001,77.20001,"Main Road",',
    ].join("\n"),
    importedAt,
  );

  assert.equal(records.length, 1);
  assert.equal(duplicateLocations, 1);
  assert.equal(records[0].participating, false);
  assert.equal(records[0].source.verificationStatus, "source_listed");
  assert.equal(records[0].source.retrievedAt, importedAt);
  assert.deepEqual(records[0].departments, ["Cardiology", "Surgery"]);
});

test("directory import rejects invalid coordinates and repeated source IDs", () => {
  const retrievedAt = new Date("2026-10-21T10:00:00.000Z");
  const header =
    "sourceRecordId,hospitalName,latitude,longitude,address,departments\n";
  assert.throws(
    () =>
      normalizeRecords(
        `${header}rec-1,Hospital,91,77,Address,`,
        retrievedAt,
      ),
    /invalid required data/,
  );
  assert.throws(
    () =>
      normalizeRecords(
        `${header}rec-1,Hospital,28,77,Address,\nrec-1,Hospital Two,28.1,77.1,Address Two,`,
        retrievedAt,
      ),
    /Duplicate sourceRecordId/,
  );
});

test("source retrieval timestamp must be explicit and valid", () => {
  assert.throws(() => parseRetrievedAt(), /retrieval timestamp/);
  assert.throws(() => parseRetrievedAt("not-a-date"), /retrieval timestamp/);
});
