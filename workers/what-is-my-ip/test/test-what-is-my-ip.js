const assert = require("assert");
const fetch = require("node-fetch");
const whatIsMyIp = require("../files/what-is-my-ip.js");

describe("whatIsMyIp", () => {
  describe("plaintext", () => {
    it("returns dev when the IP address header is not set", async () => {
      const req = {};

      const resp = await whatIsMyIp(req);

      assert.equal(resp.body, "dev");
      assert.equal(resp.headers.get("Content-Type"), "text/plain");
    });

    it("returns the IP when the IP address header is set", async () => {
      const req = {
        headers: new fetch.Headers({
          "CF-Connecting-IP": "1.2.3.4",
        })
      };

      const resp = await whatIsMyIp(req);

      assert.equal(resp.body, "1.2.3.4");
      assert.equal(resp.headers.get("Content-Type"), "text/plain");
    });
  });

  describe("json", () => {
    it("returns dev when the IP address header is not set", async () => {
      const req = {
        headers: new fetch.Headers({
          "Accept": "application/json",
        })
      };

      const resp = await whatIsMyIp(req);

      assert.equal(resp.headers.get("Content-Type"), "application/json");
      assert.equal(
        JSON.stringify(JSON.parse(resp.body)),
        JSON.stringify({"ip": "dev"}),
      );
    });

    it("returns the IP when the IP address header is set", async () => {
      const req = {
        headers: new fetch.Headers({
          "Accept": "application/json",
          "CF-Connecting-IP": "1.2.3.4",
        })
      };

      const resp = await whatIsMyIp(req);

      assert.equal(resp.headers.get("Content-Type"), "application/json");
      assert.equal(
        JSON.stringify(JSON.parse(resp.body)),
        JSON.stringify({"ip": "1.2.3.4"}),
      );
    });
  });
});

