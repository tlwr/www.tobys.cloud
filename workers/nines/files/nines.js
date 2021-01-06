if (typeof Response === "undefined") {
  const fetch = require("node-fetch");
  Response = fetch.Response;
}

async function handle(req) {
  let path = req.url;
  path = path.replace(/http(s)?:[/]{2}/, "");
  path = path.split("/").slice(1).join("/")

  let reliability = parseFloat(path, 10);

  if (isNaN(reliability) || reliability < 0 || reliability > 100) {
    return new Response(
      JSON.stringify({
        error: "reliability should be between 0 and 100",
      }, null, 2),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  let downtime = {
    seconds_1d: 86400.0 * (1 - (reliability / 100.0)),
  };

  [7, 30, 90, 365].forEach(s => {
    let key = `seconds_${s}d`;
    downtime[key] = downtime.seconds_1d * s;
  });

  Object.keys(downtime).forEach(key => {
    let mKey = key.replace("seconds", "minutes");
    let hKey = key.replace("seconds", "hours");
    let dKey = key.replace("seconds", "days");

    downtime[mKey] = downtime[key] / 60.0;
    downtime[hKey] = downtime[key] / (60 * 60.0);
  });

  Object.keys(downtime).forEach(key => {
    downtime[key] = Math.round(downtime[key], 2);
  });

  // sort keys
  downtime = Object
    .keys(downtime)
    .sort((a, b) => {
      let [aTime, aDuration] = a.split("_", 2);
      let [bTime, bDuration] = b.split("_", 2);

      let aTimeC = aTime.charCodeAt(0);
      let bTimeC = bTime.charCodeAt(0);

      if (aTimeC - bTimeC != 0) {
        return aTimeC - bTimeC;
      }

      aDuration = parseInt(aDuration.replace(/[a-z]/, ""));
      bDuration = parseInt(bDuration.replace(/[a-z]/, ""));
      return aDuration - bDuration;
    })
    .reduce(
      (r, k) => (r[k] = downtime[k], r),
      {},
    )
  ;

  return new Response(
    JSON.stringify(downtime, null, 2),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

if (typeof addEventListener !== "undefined") {
  addEventListener("fetch", event => event.respondWith(handle(event.request)));
}

if (typeof module !== "undefined") {
  module.exports = handle;
}
