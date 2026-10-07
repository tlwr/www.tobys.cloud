const LOGBOOK = "https://log.concept2.com";
const ACCEPT = "application/vnd.c2logbook.v1+json";

const MACHINE_TYPES = new Set([
  "rower",
  "skierg",
  "bike",
  "dynamic",
  "slides",
  "paddle",
  "water",
  "snow",
  "rollerski",
  "multierg",
]);

const PACE_SPLIT: Record<string, { metres: number; label: string }> = {
  rower: { metres: 500, label: "/500m" },
  skierg: { metres: 500, label: "/500m" },
  dynamic: { metres: 500, label: "/500m" },
  slides: { metres: 500, label: "/500m" },
  paddle: { metres: 500, label: "/500m" },
  bike: { metres: 1000, label: "/1000m" },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class LogbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogbookError";
  }
}

type Heart = {
  average?: number;
  min?: number;
  max?: number;
  ending?: number;
  recovery?: number;
};

type PieceView = {
  distance_m: number;
  time: string;
  pace: string | null;
  stroke_rate: number | null;
};

export type WorkoutView = {
  id: number;
  date: string;
  type: string;
  distance_m: number;
  time: string;
  time_tenths: number;
  pace: string | null;
  workout_type: string | null;
  stroke_rate: number | null;
  heart_rate: Heart | null;
  calories: number | null;
  drag_factor: number | null;
  comments: string | null;
  verified: boolean;
  splits?: PieceView[];
  intervals?: PieceView[];
  metadata?: Record<string, string | number>;
};

export type ListQuery = {
  from?: string;
  to?: string;
  type?: string;
  page?: number;
  perPage?: number;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function formatTenths(tenths: number): string {
  const abs = Math.abs(Math.round(tenths));
  const minutes = Math.floor(abs / 600);
  const seconds = Math.floor((abs % 600) / 10);
  const tenth = abs % 10;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenth}`;
}

export function paceText(
  type: string,
  timeTenths: number,
  distance: number,
): string | null {
  const split = PACE_SPLIT[type];
  if (!split || distance <= 0 || timeTenths <= 0) {
    return null;
  }
  const tenths = Math.round((timeTenths * split.metres) / distance);
  return `${formatTenths(tenths)}${split.label}`;
}

function heart(value: unknown): Heart | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const out: Heart = {};
  for (const key of ["average", "min", "max", "ending", "recovery"] as const) {
    const n = num(row[key]);
    if (n !== null) {
      out[key] = n;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function pieces(value: unknown, type: string): PieceView[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: PieceView[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const distance = num(row.distance);
    const time = num(row.time);
    if (distance === null || time === null) {
      continue;
    }
    out.push({
      distance_m: distance,
      time: formatTenths(time),
      pace: paceText(type, time, distance),
      stroke_rate: num(row.stroke_rate),
    });
  }
  return out;
}

function metadata(value: unknown): Record<string, string | number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const out: Record<string, string | number> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" || typeof item === "number") {
      out[key] = item;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function viewResult(raw: unknown, detailed: boolean): WorkoutView | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const id = num(row.id);
  const distance = num(row.distance);
  const time = num(row.time);
  const type = str(row.type);
  if (id === null || distance === null || time === null || type === null) {
    return null;
  }
  const view: WorkoutView = {
    id,
    date: (str(row.date) ?? "").slice(0, 10),
    type,
    distance_m: distance,
    time: str(row.time_formatted) ?? formatTenths(time),
    time_tenths: time,
    pace: paceText(type, time, distance),
    workout_type: str(row.workout_type),
    stroke_rate: num(row.stroke_rate),
    heart_rate: heart(row.heart_rate),
    calories: num(row.calories_total),
    drag_factor: num(row.drag_factor),
    comments: typeof row.comments === "string" ? row.comments : null,
    verified: row.verified === true,
  };
  if (!detailed) {
    return view;
  }
  if (row.workout && typeof row.workout === "object") {
    const workout = row.workout as Record<string, unknown>;
    const splits = pieces(workout.splits, type);
    const intervals = pieces(workout.intervals, type);
    if (splits.length > 0) {
      view.splits = splits;
    }
    if (intervals.length > 0) {
      view.intervals = intervals;
    }
  }
  const meta = metadata(row.metadata);
  if (meta) {
    view.metadata = meta;
  }
  return view;
}

export function resultLine(view: WorkoutView): string {
  const pace = view.pace ? ` ${view.pace}` : "";
  const kind = view.workout_type ? ` ${view.workout_type}` : "";
  return `#${view.id} ${view.date} ${view.type} ${view.distance_m}m ${view.time}${pace}${kind}`;
}

async function logbookGet(token: string, path: string): Promise<unknown> {
  if (!token) {
    throw new LogbookError("Concept2 access token is not configured.");
  }
  const url = new URL(path, LOGBOOK);
  if (url.origin !== LOGBOOK || !url.pathname.startsWith("/api/")) {
    throw new LogbookError("Refusing to call a non-logbook URL.");
  }
  const response = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: ACCEPT,
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : `Concept2 returned ${response.status}.`;
    throw new LogbookError(message);
  }
  return body;
}

function dataOf(body: unknown): unknown {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: unknown }).data;
  }
  return null;
}

export async function logbookProfile(token: string): Promise<string> {
  const data = dataOf(await logbookGet(token, "/api/users/me"));
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const view = {
    id: num(row.id),
    username: str(row.username),
    first_name: str(row.first_name),
    last_name: str(row.last_name),
    country: str(row.country),
  };
  const name = [view.first_name, view.last_name].filter(Boolean).join(" ");
  const who = name || view.username || "Logbook user";
  return `${who}${view.country ? ` (${view.country})` : ""}\n${JSON.stringify(view)}`;
}

export async function listWorkouts(token: string, query: ListQuery): Promise<string> {
  if (query.from && !DATE.test(query.from)) {
    throw new LogbookError("from must be YYYY-MM-DD.");
  }
  if (query.to && !DATE.test(query.to)) {
    throw new LogbookError("to must be YYYY-MM-DD.");
  }
  if (query.type && !MACHINE_TYPES.has(query.type)) {
    throw new LogbookError(
      "type must be one of rower, skierg, bike, dynamic, slides, paddle, water, snow, rollerski, multierg.",
    );
  }
  const page = clamp(query.page ?? 1, 1, 1000);
  const perPage = clamp(query.perPage ?? 20, 1, 50);
  const params = new URLSearchParams({
    page: String(page),
    number: String(perPage),
  });
  if (query.from) {
    params.set("from", query.from);
  }
  if (query.to) {
    params.set("to", query.to);
  }
  if (query.type) {
    params.set("type", query.type);
  }
  const body = await logbookGet(token, `/api/users/me/results?${params}`);
  const rows = Array.isArray(dataOf(body)) ? (dataOf(body) as unknown[]) : [];
  const workouts = rows
    .map((row) => viewResult(row, false))
    .filter((row): row is WorkoutView => row !== null);
  const meta =
    body && typeof body === "object" && "meta" in body
      ? (body as { meta?: { pagination?: Record<string, unknown> } }).meta?.pagination
      : undefined;
  const total = num(meta?.total);
  const totalPages = num(meta?.total_pages);
  const header =
    workouts.length === 0
      ? "No workouts on this page."
      : `Workouts, page ${page}${totalPages ? ` of ${totalPages}` : ""}${total !== null ? ` (${total} total)` : ""}.`;
  const lines = workouts.map(resultLine);
  return `${header}${lines.length ? `\n${lines.join("\n")}` : ""}\n${JSON.stringify({
    workouts,
    pagination: { page, per_page: perPage, total, total_pages: totalPages },
  })}`;
}

export async function getWorkout(token: string, id: string): Promise<string> {
  if (!/^\d+$/.test(id)) {
    throw new LogbookError("id must be the numeric result id.");
  }
  const body = await logbookGet(
    token,
    `/api/users/me/results/${id}?include=metadata`,
  );
  const view = viewResult(dataOf(body), true);
  if (!view) {
    throw new LogbookError("Concept2 returned an unexpected result.");
  }
  return `${resultLine(view)}\n${JSON.stringify(view)}`;
}
