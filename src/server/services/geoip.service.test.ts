import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchGeoipLookup } from "./geoip.service";

test("fetchGeoipLookup skips the network when env is empty", async () => {
  let called = 0;
  const result = await fetchGeoipLookup("8.8.8.8", {
    url: "",
    key: "",
    fetchImpl: async () => {
      called += 1;
      throw new Error("should not fetch");
    },
  });
  assert.equal(result.kind, "disabled");
  assert.equal(called, 0);
});

test("fetchGeoipLookup maps a successful lookup response", async () => {
  const result = await fetchGeoipLookup("90.189.221.79", {
    url: "http://geoip_api:3000",
    key: "test-key",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "http://geoip_api:3000/api/v1/lookup");
      assert.equal(init?.method, "POST");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("X-API-Key"), "test-key");
      return new Response(
        JSON.stringify({
          country: { countryName: "Российская Федерация" },
          city: { cityName: "Новосибирск" },
          asn: { organization: "Rostelecom" },
        }),
        { status: 200 },
      );
    },
  });
  assert.deepEqual(result, {
    kind: "ok",
    geo: {
      countryName: "Российская Федерация",
      cityName: "Новосибирск",
      organization: "Rostelecom",
    },
  });
});

test("fetchGeoipLookup treats empty 200 as empty, not ok", async () => {
  const result = await fetchGeoipLookup("203.0.113.1", {
    url: "http://geoip_api:3000",
    key: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ country: null, city: null, asn: null }), { status: 200 }),
  });
  assert.equal(result.kind, "empty");
});

test("fetchGeoipLookup maps abort to unavailable timeout", async () => {
  const result = await fetchGeoipLookup("203.0.113.1", {
    url: "http://geoip_api:3000",
    key: "test-key",
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });
  assert.deepEqual(result, { kind: "unavailable", reason: "timeout" });
});
