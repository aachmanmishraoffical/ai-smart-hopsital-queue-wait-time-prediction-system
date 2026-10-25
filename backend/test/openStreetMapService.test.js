const test = require("node:test");
const assert = require("node:assert/strict");
const {
  geocodeLocation,
  getHospitalByOsmId,
  getNearbyHospitals,
  isValidCoordinates,
  normalizeOverpassElements,
} = require("../services/openStreetMapService");

test("coordinate validation and distance filtering reject invalid or distant places", () => {
  assert.equal(isValidCoordinates(91, 0), false);
  assert.equal(isValidCoordinates(12.9, 77.6), true);

  const hospitals = normalizeOverpassElements(
    [
      {
        type: "node",
        id: 101,
        lat: 12.9,
        lon: 77.6,
        tags: { amenity: "hospital", name: "City Hospital" },
      },
      {
        type: "node",
        id: 102,
        lat: 13.5,
        lon: 77.6,
        tags: { amenity: "hospital", name: "Distant Hospital" },
      },
      {
        type: "node",
        id: 103,
        lat: 12.9,
        lon: 77.6,
        tags: { amenity: "pharmacy", name: "Not a hospital" },
      },
      {
        type: "node",
        id: 104,
        lat: 12.9,
        lon: 77.6,
        tags: { amenity: "hospital" },
      },
    ],
    { latitude: 12.9, longitude: 77.6 },
    5000,
  );

  assert.equal(hospitals.length, 1);
  assert.equal(hospitals[0].hospitalName, "City Hospital");
  assert.equal(hospitals[0].participating, false);
  assert.equal(hospitals[0].source.verificationStatus, "source_listed");
  assert.equal(hospitals[0].address, "Address not provided by OpenStreetMap.");
});

test("Overpass normalization rejects malformed payloads and deduplicates objects", () => {
  assert.throws(
    () =>
      normalizeOverpassElements(
        { elements: [] },
        { latitude: 12.9, longitude: 77.6 },
        5000,
      ),
    /invalid response/,
  );
  const hospital = {
    type: "node",
    id: 7101,
    lat: 12.9,
    lon: 77.6,
    tags: { amenity: "hospital", name: "Attributed Hospital" },
  };
  const normalized = normalizeOverpassElements(
    [hospital, { ...hospital }],
    { latitude: 12.9, longitude: 77.6 },
    5000,
  );

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].source.name, "OpenStreetMap");
  assert.equal(normalized[0].source.verificationStatus, "source_listed");
  assert.equal(normalized[0].participating, false);
  assert.equal(normalized[0].hospitalId, "osm-node-7101");
});

test("manual location lookup validates input and returns a confirmed geocoder result", async () => {
  await assert.rejects(
    geocodeLocation("x", async () => {
      throw new Error("Should not call provider");
    }),
    { status: 400 },
  );

  let requestedUrl;
  const location = await geocodeLocation(
    "Unit test locality 773514",
    async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        json: async () => [
          {
            lat: "12.9",
            lon: "77.6",
            display_name: "Unit test locality, India",
          },
          { lat: "91", lon: "0", display_name: "Invalid result" },
        ],
      };
    },
  );

  assert.equal(requestedUrl.searchParams.get("countrycodes"), "in");
  assert.equal(requestedUrl.searchParams.get("limit"), "1");
  assert.deepEqual(location, {
    label: "Unit test locality, India",
    latitude: 12.9,
    longitude: 77.6,
    source: "OpenStreetMap",
  });
});

test("nearby provider parses only hospital features and reports provider failures", async () => {
  const response = await getNearbyHospitals(
    33.12345,
    73.12345,
    2500,
    async (requestUrl, options) => {
      const query = new URL(requestUrl).searchParams.get("data");
      assert.equal(options.method || "GET", "GET");
      assert.match(query, /\[timeout:15\]/);
      assert.match(
        query,
        /nwr\["amenity"="hospital"\]\(around:2500,33\.12345,73\.12345\)/,
      );
      return {
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "way",
              id: 999,
              center: { lat: 33.12345, lon: 73.12345 },
              tags: { healthcare: "hospital", name: "Source Hospital" },
            },
          ],
        }),
      };
    },
  );

  assert.equal(response.length, 1);
  assert.equal(response[0].source.name, "OpenStreetMap");
  assert.equal(response[0].source.recordId, "way/999");

  let attempts = 0;
  await assert.rejects(
    getNearbyHospitals(40.12345, 73.12345, 2500, async () => {
      attempts += 1;
      throw new Error("provider unavailable");
    }),
    /OpenStreetMap provider request failed/,
  );
  assert.equal(attempts, 4);
});

test("nearby provider does not retry timeouts or rate-limit responses", async () => {
  let timeoutAttempts = 0;
  const timeout = new Error("Request timed out");
  timeout.name = "AbortError";
  await assert.rejects(
    getNearbyHospitals(40.23456, 73.23456, 2500, async () => {
      timeoutAttempts += 1;
      throw timeout;
    }),
    /request timed out/,
  );
  assert.equal(timeoutAttempts, 4);

  let rateLimitAttempts = 0;
  await assert.rejects(
    getNearbyHospitals(40.34567, 73.34567, 2500, async () => {
      rateLimitAttempts += 1;
      return { ok: false, status: 429 };
    }),
    /HTTP 429/,
  );
  assert.equal(rateLimitAttempts, 4);
});

test("nearby provider tries Overpass mirrors when its primary endpoint is down", async () => {
  let attempts = 0;
  const hospitals = await getNearbyHospitals(
    40.56789,
    73.56789,
    2500,
    async (requestUrl) => {
      attempts += 1;
      if (attempts < 3) throw new Error("provider unavailable");
      assert.equal(new URL(requestUrl).hostname, "overpass.kumi.systems");
      return {
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 8123,
              lat: 40.56789,
              lon: 73.56789,
              tags: { amenity: "hospital", name: "Fallback Hospital" },
            },
          ],
        }),
      };
    },
  );

  assert.equal(attempts, 3);
  assert.equal(hospitals.length, 1);
  assert.equal(hospitals[0].hospitalName, "Fallback Hospital");
});

test("nearby search uses Nominatim when Overpass mirrors fail", async () => {
  let attempts = 0;
  const hospitals = await getNearbyHospitals(
    40.67891,
    73.67891,
    2500,
    async (requestUrl) => {
      attempts += 1;
      if (attempts === 1) throw new Error("primary provider unavailable");
      const url = new URL(requestUrl);
      assert.equal(url.hostname, "nominatim.openstreetmap.org");
      assert.equal(url.searchParams.get("amenity"), "hospital");
      assert.equal(url.searchParams.get("bounded"), "1");
      assert.equal(url.searchParams.get("limit"), "40");
      return {
        ok: true,
        json: async () => [
          {
            category: "amenity",
            type: "hospital",
            osm_type: "node",
            osm_id: 8124,
            lat: "40.67891",
            lon: "73.67891",
            name: "Nominatim Hospital",
            display_name: "Nominatim Hospital, Example Street",
          },
          {
            category: "amenity",
            type: "hospital",
            osm_type: "node",
            osm_id: 8125,
            lat: "40.9",
            lon: "73.9",
            name: "Outside Search Radius",
            display_name: "Outside Search Radius, Example Street",
          },
        ],
      };
    },
  );

  assert.equal(attempts, 2);
  assert.equal(hospitals.length, 1);
  assert.equal(hospitals[0].hospitalName, "Nominatim Hospital");
  assert.equal(hospitals[0].address, "Example Street");
});

test("nearby provider caches successful results and coalesces concurrent lookups", async () => {
  let attempts = 0;
  let releaseRequest;
  const pendingResponse = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  const fetchStub = async () => {
    attempts += 1;
    return pendingResponse;
  };
  const first = getNearbyHospitals(40.45678, 73.45678, 2500, fetchStub);
  const second = getNearbyHospitals(40.45678, 73.45678, 2500, fetchStub);
  releaseRequest({
    ok: true,
    json: async () => ({ elements: [] }),
  });
  assert.deepEqual(await Promise.all([first, second]), [[], []]);
  assert.deepEqual(
    await getNearbyHospitals(40.45678, 73.45678, 2500, async () => {
      throw new Error("A successful result should be cached");
    }),
    [],
  );
  assert.equal(attempts, 1);
});

test("source detail lookup validates OpenStreetMap ids and preserves record links", async () => {
  const hospital = await getHospitalByOsmId(
    "node",
    "7654321",
    async (requestUrl) => {
      assert.match(
        new URL(requestUrl).searchParams.get("data"),
        /node\(7654321\)/,
      );
      return {
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "node",
              id: 7654321,
              lat: 12.9,
              lon: 77.6,
              tags: { amenity: "hospital", name: "Verified source label" },
            },
          ],
        }),
      };
    },
  );

  assert.equal(hospital.hospitalName, "Verified source label");
  assert.equal(
    hospital.source.url,
    "https://www.openstreetmap.org/node/7654321",
  );
  await assert.rejects(
    getHospitalByOsmId("node", "1);delete", async () => {
      throw new Error("Should not call provider");
    }),
    { status: 400 },
  );
});
