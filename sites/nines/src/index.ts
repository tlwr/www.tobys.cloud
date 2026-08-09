export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\//, "");

    if (path === "") {
      url.pathname = "/99.9";
      return Response.redirect(url.toString(), 302);
    }

    const reliability = parseFloat(path);

    if (Number.isNaN(reliability) || reliability < 0 || reliability > 100) {
      return Response.json(
        { error: "reliability should be between 0 and 100" },
        { status: 400 },
      );
    }

    const downtime: Record<string, number> = {
      seconds_1d: 86400.0 * (1 - reliability / 100.0),
    };

    for (const days of [7, 30, 90, 365]) {
      downtime[`seconds_${days}d`] = downtime.seconds_1d * days;
    }

    for (const key of Object.keys(downtime)) {
      const mKey = key.replace("seconds", "minutes");
      const hKey = key.replace("seconds", "hours");
      downtime[mKey] = downtime[key] / 60.0;
      downtime[hKey] = downtime[key] / (60 * 60.0);
    }

    for (const key of Object.keys(downtime)) {
      downtime[key] = Math.round(downtime[key]);
    }

    const sorted = Object.keys(downtime)
      .sort((a, b) => {
        const [aTime, aDuration] = a.split("_", 2);
        const [bTime, bDuration] = b.split("_", 2);

        const aTimeC = aTime.charCodeAt(0);
        const bTimeC = bTime.charCodeAt(0);
        if (aTimeC - bTimeC !== 0) {
          return aTimeC - bTimeC;
        }

        return (
          parseInt(aDuration.replace(/[a-z]/g, ""), 10) -
          parseInt(bDuration.replace(/[a-z]/g, ""), 10)
        );
      })
      .reduce<Record<string, number>>((acc, key) => {
        acc[key] = downtime[key];
        return acc;
      }, {});

    return new Response(JSON.stringify(sorted, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};
