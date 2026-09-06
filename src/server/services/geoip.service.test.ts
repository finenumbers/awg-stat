import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchGeoipLookup } from "./geoip.service";

test("fetchGeoipLookup skips the network when env is empty", async () => {
  let called = 0;
  const geo = await fetchGeoipLookup("8.8.8.8", {
    url: "",
    key: "",
    fetchImpl: async () => {
      called += 1;
      throw new Error("should not fetch");
    },
  });
  assert.equal(geo, null);
  assert.equal(called, 0);
});

test("fetchGeoipLookup maps a successful lookup response", async () => {
  const geo = await fetchGeoipLookup("90.189.221.79", {
    url: "https://geoip.example.com",
    key: "test-key",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://geoip.example.com/api/v1/lookup");
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
  assert.deepEqual(geo, {
    countryName: "Российская Федерация",
    cityName: "Новосибирск",
    organization: "Rostelecom",
  });
});
