import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cacheIsFresh,
  GEOIP_FAILURE_TTL_MS,
  GEOIP_SUCCESS_TTL_MS,
  classifyParsedGeo,
  geoipLookupUrl,
  hasUsefulGeo,
  isGeoipConfigured,
  isLookupableIp,
  parseLookupResponse,
} from "./geoip";

test("isGeoipConfigured requires both url and key", () => {
  assert.equal(isGeoipConfigured("", ""), false);
  assert.equal(isGeoipConfigured("https://geoip.example.com", ""), false);
  assert.equal(isGeoipConfigured("", "secret"), false);
  assert.equal(isGeoipConfigured("https://geoip.example.com", "secret"), true);
  assert.equal(isGeoipConfigured("  https://geoip.example.com  ", "  secret  "), true);
});

test("geoipLookupUrl accepts origin, /api/v1, full lookup path, and docker host", () => {
  assert.equal(geoipLookupUrl("https://geoip.example.com"), "https://geoip.example.com/api/v1/lookup");
  assert.equal(geoipLookupUrl("https://geoip.example.com/"), "https://geoip.example.com/api/v1/lookup");
  assert.equal(geoipLookupUrl("https://geoip.example.com/api/v1"), "https://geoip.example.com/api/v1/lookup");
  assert.equal(geoipLookupUrl("https://geoip.example.com/api/v1/"), "https://geoip.example.com/api/v1/lookup");
  assert.equal(geoipLookupUrl("https://geoip.example.com/api/v1/lookup"), "https://geoip.example.com/api/v1/lookup");
  assert.equal(geoipLookupUrl("http://geoip_api:3000"), "http://geoip_api:3000/api/v1/lookup");
  assert.equal(geoipLookupUrl("http://geoip_api:3000/"), "http://geoip_api:3000/api/v1/lookup");
});

test("isLookupableIp skips private, loopback, link-local and ULA", () => {
  assert.equal(isLookupableIp("90.189.221.79"), true);
  assert.equal(isLookupableIp("8.8.8.8"), true);
  assert.equal(isLookupableIp("10.8.1.2"), false);
  assert.equal(isLookupableIp("192.168.1.1"), false);
  assert.equal(isLookupableIp("172.16.0.1"), false);
  assert.equal(isLookupableIp("127.0.0.1"), false);
  assert.equal(isLookupableIp("169.254.1.1"), false);
  assert.equal(isLookupableIp("0.0.0.0"), false);
  assert.equal(isLookupableIp("256.1.1.1"), false);
  assert.equal(isLookupableIp("::1"), false);
  assert.equal(isLookupableIp("fe80::1"), false);
  assert.equal(isLookupableIp("fd12:3456::1"), false);
  assert.equal(isLookupableIp("2001:db8::1"), true);
  assert.equal(isLookupableIp("not-an-ip"), false);
});

test("parseLookupResponse reads countryName, cityName, organization", () => {
  assert.deepEqual(
    parseLookupResponse({
      country: { countryName: "Российская Федерация" },
      city: { cityName: "Новосибирск" },
      asn: { organization: "Rostelecom" },
    }),
    {
      countryName: "Российская Федерация",
      cityName: "Новосибирск",
      organization: "Rostelecom",
    },
  );
  assert.deepEqual(parseLookupResponse({ country: null, city: null, asn: null }), {
    countryName: null,
    cityName: null,
    organization: null,
  });
  assert.equal(parseLookupResponse(null), null);
  assert.equal(parseLookupResponse("nope"), null);
  assert.deepEqual(
    parseLookupResponse({
      country: null,
      city: { countryName: "Российская Федерация", cityName: "Новосибирск" },
      asn: { organization: "Rostelecom" },
    }),
    {
      countryName: "Российская Федерация",
      cityName: "Новосибирск",
      organization: "Rostelecom",
    },
  );
});

test("classifyParsedGeo does not treat an empty 200 body as success", () => {
  assert.deepEqual(classifyParsedGeo({ countryName: null, cityName: null, organization: null }), { kind: "empty" });
  assert.equal(hasUsefulGeo({ countryName: null, cityName: null, organization: null }), false);
  assert.equal(hasUsefulGeo({ countryName: "X", cityName: null, organization: null }), true);
  assert.equal(classifyParsedGeo(null).kind, "unavailable");
});

test("cacheIsFresh uses success and failure TTLs", () => {
  const now = new Date("2026-09-06T12:00:00.000Z");
  assert.equal(cacheIsFresh({ ok: true, lookedUpAt: new Date(now.getTime() - GEOIP_SUCCESS_TTL_MS + 1) }, now), true);
  assert.equal(cacheIsFresh({ ok: true, lookedUpAt: new Date(now.getTime() - GEOIP_SUCCESS_TTL_MS) }, now), false);
  assert.equal(cacheIsFresh({ ok: false, lookedUpAt: new Date(now.getTime() - GEOIP_FAILURE_TTL_MS + 1) }, now), true);
  assert.equal(cacheIsFresh({ ok: false, lookedUpAt: new Date(now.getTime() - GEOIP_FAILURE_TTL_MS) }, now), false);
});
