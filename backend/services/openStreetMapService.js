const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL =
  process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const OVERPASS_URLS = [
  OVERPASS_URL,
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
].filter((url, index, urls) => urls.indexOf(url) === index);
const REQUEST_TIMEOUT_MS = 12000;
const OVERPASS_REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const nearbyCache = new Map();
const nearbyRequests = new Map();
const hospitalCache = new Map();
const geocodeCache = new Map();
let nominatimQueue = Promise.resolve();
let lastNominatimRequest = 0;

const isValidCoordinates = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  Number.isFinite(longitude) &&
  longitude >= -180 &&
  longitude <= 180;

const distanceInMeters = (first, second) => {
  const radians = Math.PI / 180;
  const latitudeDelta = (second.latitude - first.latitude) * radians;
  const longitudeDelta = (second.longitude - first.longitude) * radians;
  const firstLatitude = first.latitude * radians;
  const secondLatitude = second.latitude * radians;
  const haversine = Math.min(
    1,
    Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.sin(longitudeDelta / 2) ** 2,
  );
  return Math.round(
    6371000 *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
};

const getCoordinates = (element) => {
  const latitudeValue = element.lat ?? element.center?.lat;
  const longitudeValue = element.lon ?? element.center?.lon;
  if (
    latitudeValue === undefined ||
    latitudeValue === null ||
    longitudeValue === undefined ||
    longitudeValue === null ||
    latitudeValue === "" ||
    longitudeValue === ""
  ) {
    return null;
  }
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  return isValidCoordinates(latitude, longitude)
    ? { latitude, longitude }
    : null;
};

const addressFromTags = (tags) => {
  if (tags["addr:full"]) return tags["addr:full"];
  const locality = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"] || tags["addr:municipality"],
    tags["addr:state"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return locality.length
    ? locality.join(", ")
    : "Address not provided by OpenStreetMap.";
};

const normalizeHospital = (element, retrievedAt = new Date()) => {
  const tags = element.tags || {};
  const category = tags.amenity || tags.healthcare;
  if (
    !["node", "way", "relation"].includes(element.type) ||
    !/^\d+$/.test(String(element.id)) ||
    category !== "hospital"
  ) {
    return null;
  }
  const coordinates = getCoordinates(element);
  const hospitalName = typeof tags.name === "string" ? tags.name.trim() : "";
  if (!coordinates || !hospitalName) return null;

  const recordId = `${element.type}/${element.id}`;
  const sourceUrl = `https://www.openstreetmap.org/${recordId}`;
  const hospital = {
    hospitalId: `osm-${element.type}-${element.id}`,
    hospitalName,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    address: addressFromTags(tags),
    category,
    source: {
      name: "OpenStreetMap",
      url: sourceUrl,
      recordId,
      retrievedAt,
      verificationStatus: "source_listed",
    },
    participating: false,
  };
  writeCache(hospitalCache, hospital.hospitalId, hospital, CACHE_TTL_MS);
  return hospital;
};

const normalizeOverpassElements = (
  elements,
  origin,
  radiusMeters,
  retrievedAt = new Date(),
) => {
  if (!Array.isArray(elements)) {
    throw new Error("OpenStreetMap returned an invalid response.");
  }
  const seen = new Set();
  return elements
    .map((element) => normalizeHospital(element, retrievedAt))
    .filter((hospital) => {
      if (!hospital || seen.has(hospital.hospitalId)) return false;
      seen.add(hospital.hospitalId);
      const distance = distanceInMeters(origin, {
        latitude: hospital.latitude,
        longitude: hospital.longitude,
      });
      if (distance > radiusMeters) return false;
      hospital.distance = Number((distance / 1000).toFixed(2));
      return true;
    })
    .sort((first, second) => first.distance - second.distance);
};

const trimCache = (cache) => {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now || cache.size > MAX_CACHE_ENTRIES) {
      cache.delete(key);
    }
  }
};

const readCache = (cache, key) => {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
};

const writeCache = (cache, key, value, ttl) => {
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  trimCache(cache);
};

const fetchJson = async (
  url,
  options,
  fetchImpl = fetch,
  {
    timeoutMs = REQUEST_TIMEOUT_MS,
    retryTimeouts = true,
    retryRateLimits = true,
    retryNetworkErrors = true,
  } = {},
) => {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal,
      });
      if (response.ok) return await response.json();
      const error = new Error(
        `External provider returned HTTP ${response.status}.`,
      );
      error.status = response.status;
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
      if (response.status === 429 && !retryRateLimits) break;
    } catch (error) {
      if (error.status && error.status !== 429 && error.status < 500) {
        throw error;
      }
      lastError = error;
      const shouldRetry =
        attempt === 0 &&
        (error.name === "AbortError"
          ? retryTimeouts
          : !error.status && retryNetworkErrors) &&
        (error.status !== 429 || retryRateLimits);
      if (!shouldRetry) break;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
  throw new Error(
    `OpenStreetMap provider request failed: ${
      lastError?.name === "AbortError"
        ? "request timed out"
        : lastError?.message || "network error"
    }`,
  );
};

const serializeNominatim = (request) => {
  const result = nominatimQueue.then(async () => {
    const delay = Math.max(0, 1000 - (Date.now() - lastNominatimRequest));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastNominatimRequest = Date.now();
    return request();
  });
  nominatimQueue = result.catch(() => {});
  return result;
};

const fetchOverpassData = async (
  query,
  fetchImpl = fetch,
  providerUrls = OVERPASS_URLS,
) => {
  let lastError;
  for (const url of providerUrls) {
    try {
      const requestUrl = new URL(url);
      requestUrl.searchParams.set("data", query);
      return await fetchJson(
        requestUrl,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "AI-Smart-Hospital/1.0",
          },
        },
        fetchImpl,
        {
          timeoutMs: OVERPASS_REQUEST_TIMEOUT_MS,
          retryTimeouts: false,
          retryRateLimits: false,
          retryNetworkErrors: false,
        },
      );
    } catch (error) {
      lastError = error;
    }
  }
  const message =
    lastError?.message || "all configured providers are unavailable";
  throw new Error(
    message.startsWith("OpenStreetMap provider request failed:")
      ? message
      : `OpenStreetMap provider request failed: ${message}`,
  );
};

const getNearbyHospitalsFromNominatim = async (
  latitude,
  longitude,
  radiusMeters,
  fetchImpl = fetch,
) => {
  const latitudeDelta = radiusMeters / 111000;
  const longitudeDelta =
    radiusMeters /
    (111000 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("amenity", "hospital");
  url.searchParams.set(
    "viewbox",
    [
      longitude - longitudeDelta,
      latitude + latitudeDelta,
      longitude + longitudeDelta,
      latitude - latitudeDelta,
    ].join(","),
  );
  url.searchParams.set("bounded", "1");
  url.searchParams.set("limit", "40");
  url.searchParams.set("addressdetails", "1");
  const contact = process.env.OSM_CONTACT_EMAIL;
  const headers = {
    Accept: "application/json",
    "User-Agent": `AI-Smart-Hospital/1.0${
      contact ? ` (contact: ${contact})` : ""
    }`,
  };
  const data = await serializeNominatim(() =>
    fetchJson(url, { headers }, fetchImpl, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      retryTimeouts: false,
      retryRateLimits: false,
      retryNetworkErrors: false,
    }),
  );
  if (!Array.isArray(data)) {
    throw new Error("OpenStreetMap geocoder returned an invalid response.");
  }
  return normalizeOverpassElements(
    data
      .filter(
        (item) =>
          item.category === "amenity" &&
          item.type === "hospital" &&
          item.osm_type &&
          item.osm_id,
      )
      .map((item) => {
        const name =
          typeof item.name === "string" && item.name.trim()
            ? item.name.trim()
            : "Hospital listing";
        const displayName =
          typeof item.display_name === "string" ? item.display_name : "";
        const address = displayName.startsWith(`${name}, `)
          ? displayName.slice(name.length + 2)
          : displayName;
        return {
          type: item.osm_type,
          id: item.osm_id,
          lat: item.lat,
          lon: item.lon,
          tags: {
            amenity: "hospital",
            name,
            ...(address && { "addr:full": address }),
          },
        };
      }),
    { latitude, longitude },
    radiusMeters,
  );
};

const geocodeLocation = async (query, fetchImpl = fetch) => {
  if (
    typeof query !== "string" ||
    query.trim().length < 2 ||
    query.trim().length > 120
  ) {
    const error = new Error("Enter a location between 2 and 120 characters.");
    error.status = 400;
    throw error;
  }
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const cacheKey = normalizedQuery.toLowerCase();
  const cached = readCache(geocodeCache, cacheKey);
  if (cached !== undefined) return cached;

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("q", normalizedQuery);
  const contact = process.env.OSM_CONTACT_EMAIL;
  const headers = {
    Accept: "application/json",
    "User-Agent": `AI-Smart-Hospital/1.0${
      contact ? ` (contact: ${contact})` : ""
    }`,
  };
  const data = await serializeNominatim(() =>
    fetchJson(url, { headers }, fetchImpl),
  );
  if (!Array.isArray(data)) {
    throw new Error("OpenStreetMap geocoder returned an invalid response.");
  }
  const first = data.find((item) => {
    if (
      item.lat === undefined ||
      item.lat === null ||
      item.lon === undefined ||
      item.lon === null ||
      item.lat === "" ||
      item.lon === ""
    ) {
      return false;
    }
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    return (
      typeof item.display_name === "string" &&
      item.display_name.trim() &&
      isValidCoordinates(latitude, longitude)
    );
  });
  const result = first
    ? {
        label: first.display_name,
        latitude: Number(first.lat),
        longitude: Number(first.lon),
        source: "OpenStreetMap",
      }
    : null;
  writeCache(geocodeCache, cacheKey, result, GEOCODE_CACHE_TTL_MS);
  return result;
};

const getNearbyHospitals = async (
  latitude,
  longitude,
  radiusMeters,
  fetchImpl = fetch,
) => {
  if (
    !isValidCoordinates(latitude, longitude) ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0 ||
    radiusMeters > 50000
  ) {
    const error = new Error("Valid coordinates and a radius up to 50 km are required.");
    error.status = 400;
    throw error;
  }
  const key = `${latitude.toFixed(6)}:${longitude.toFixed(6)}:${radiusMeters}`;
  const cached = readCache(nearbyCache, key);
  if (cached) return cached;

  const pendingRequest = nearbyRequests.get(key);
  if (pendingRequest) return pendingRequest;

  const request = (async () => {
    const query = `[out:json][timeout:15];(nwr["amenity"="hospital"](around:${radiusMeters},${latitude},${longitude});nwr["healthcare"="hospital"](around:${radiusMeters},${latitude},${longitude}););out center tags;`;
    let hospitals;
    try {
      const data = await fetchOverpassData(query, fetchImpl, OVERPASS_URLS.slice(0, 1));
      hospitals = normalizeOverpassElements(
        data.elements,
        { latitude, longitude },
        radiusMeters,
      );
    } catch (overpassError) {
      let nominatimHospitals;
      let nominatimError;
      try {
        nominatimHospitals = await getNearbyHospitalsFromNominatim(
          latitude,
          longitude,
          radiusMeters,
          fetchImpl,
        );
      } catch (error) {
        nominatimError = error;
      }

      if (nominatimHospitals?.length) {
        hospitals = nominatimHospitals;
      } else {
        try {
          const data = await fetchOverpassData(
            query,
            fetchImpl,
            OVERPASS_URLS.slice(1),
          );
          hospitals = normalizeOverpassElements(
            data.elements,
            { latitude, longitude },
            radiusMeters,
          );
          if (hospitals.length === 0 && nominatimHospitals) {
            hospitals = nominatimHospitals;
          }
        } catch (mirrorError) {
          if (nominatimHospitals) {
            hospitals = nominatimHospitals;
          } else {
            throw new Error(
              `Hospital search providers are unavailable. Overpass: ${overpassError.message}; Nominatim: ${nominatimError.message}; Overpass mirrors: ${mirrorError.message}`,
            );
          }
        }
      }
    }
    writeCache(nearbyCache, key, hospitals, CACHE_TTL_MS);
    return hospitals;
  })();
  nearbyRequests.set(key, request);
  try {
    return await request;
  } finally {
    nearbyRequests.delete(key);
  }
};

const getHospitalByOsmId = async (type, id, fetchImpl = fetch) => {
  if (!["node", "way", "relation"].includes(type) || !/^\d+$/.test(String(id))) {
    const error = new Error("Invalid OpenStreetMap record identifier.");
    error.status = 400;
    throw error;
  }
  const hospitalId = `osm-${type}-${id}`;
  const cached = readCache(hospitalCache, hospitalId);
  if (cached) return cached;
  const query = `[out:json][timeout:10];${type}(${id});out center tags;`;
  const data = await fetchOverpassData(query, fetchImpl);
  const element = Array.isArray(data.elements) ? data.elements[0] : null;
  const hospital = element && normalizeHospital(element);
  if (!hospital) return null;
  return hospital;
};

module.exports = {
  distanceInMeters,
  geocodeLocation,
  getHospitalByOsmId,
  getNearbyHospitals,
  isValidCoordinates,
  normalizeOverpassElements,
};
