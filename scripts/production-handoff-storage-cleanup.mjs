// One-time operator CLI. Does not load .env files. Dry run is the default.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

export const bucket = "prime-reconciliations";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export function validateOrg(org) {
  if (!new RegExp(`^${uuid}$`).test(org ?? "")) throw new Error("Canonical organization UUID required");
}
export function businessPath(org, name) {
  validateOrg(org);
  return new RegExp(`^${org}/reconciliations/${uuid}/${uuid}\\.pdf$`).test(name);
}
export function digest(manifest) {
  return createHash("sha256").update(JSON.stringify({
    version: manifest.version, origin: manifest.origin, organization: manifest.organization,
    bucket: manifest.bucket, objects: manifest.objects,
  })).digest("hex");
}
export async function inventory(client, org, origin) {
  validateOrg(org);
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw new Error("Unable to inventory buckets");
  const target = buckets.find((b) => b.id === bucket);
  if (!target || target.public) throw new Error("Required private reconciliation bucket missing or public");
  const objects = [], unclassified = [];
  async function walk(prefix, depth = 0) {
    if (depth > 6) throw new Error("Unexpected Storage depth: manual review required");
    for (let offset = 0; ; offset += 100) {
      const { data, error: listError } = await client.storage.from(bucket).list(prefix, {
        limit: 100, offset, sortBy: { column: "name", order: "asc" },
      });
      if (listError || !data) throw new Error("Unable to list Storage objects");
      for (const item of data) {
        if (item.name.includes("/") || [".", ".."].includes(item.name)) throw new Error("Unexpected Storage name");
        const name = `${prefix}/${item.name}`;
        if (!item.id) await walk(name, depth + 1);
        else if (!businessPath(org, name)) unclassified.push(name);
        else objects.push({ name, id: item.id, updated_at: item.updated_at, size: item.metadata?.size ?? null });
      }
      if (data.length < 100) break;
    }
  }
  await walk(org);
  objects.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return { version: 1, origin, organization: org, bucket, objects, unclassified,
    preservedBuckets: buckets.map((b) => ({ id: b.id, public: b.public })) };
}
export async function executeCleanup(client, approved, current, confirmation) {
  if (current.unclassified.length || approved.unclassified?.length)
    throw new Error("Unclassified paths require manual review; nothing deleted");
  if (approved.version !== 1 || approved.bucket !== bucket || digest(approved) !== confirmation)
    throw new Error("Invalid reviewed manifest confirmation");
  if (digest(current) !== digest(approved)) throw new Error("Storage changed since dry run; nothing deleted");
  if (!approved.objects.every((o) => businessPath(current.organization, o.name)))
    throw new Error("Unsafe object path");
  // Storage is not transactional: keep writes frozen, retain backup, and verify after every batch.
  for (let start = 0; start < approved.objects.length; start += 100) {
    const names = approved.objects.slice(start, start + 100).map((o) => o.name);
    const { error } = await client.storage.from(bucket).remove(names);
    if (error) throw new Error("Storage batch failed; keep writes stopped, re-inventory remaining objects");
  }
  const after = await inventory(client, current.organization, current.origin);
  if (after.objects.length || after.unclassified.length) throw new Error("Storage verification failed");
  if (JSON.stringify(after.preservedBuckets) !== JSON.stringify(current.preservedBuckets))
    throw new Error("Bucket configuration changed; keep writes stopped");
  return after;
}
async function main() {
  const { values } = parseArgs({ options: {
    org: { type: "string" }, manifest: { type: "string" }, execute: { type: "boolean", default: false },
    confirm: { type: "string" }, "allow-remote": { type: "boolean", default: false },
  } });
  validateOrg(values.org);
  if (!values.manifest) throw new Error("--manifest outside the repository is required");
  const url = new URL(process.env.HANDOFF_SUPABASE_URL ?? "");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Origin URL only");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && (!values["allow-remote"] || url.protocol !== "https:")) throw new Error("Remote access requires explicit --allow-remote and HTTPS");
  if (!process.env.HANDOFF_SERVICE_ROLE_KEY) throw new Error("HANDOFF_SERVICE_ROLE_KEY required (never pass in CLI arguments)");
  const client = createClient(url.origin, process.env.HANDOFF_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error" }) },
  });
  const current = await inventory(client, values.org, url.origin);
  if (!values.execute) {
    await writeFile(values.manifest, JSON.stringify(current, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ mode: "DRY RUN", objects: current.objects, unclassified: current.unclassified,
      preservedBuckets: current.preservedBuckets, confirmation: digest(current) }, null, 2));
    if (current.unclassified.length) process.exitCode = 1;
    return;
  }
  if (process.env.HANDOFF_APPROVAL !== `RESET BUSINESS DATA ${values.org}` ||
    process.env.HANDOFF_BACKUP_VERIFIED !== "yes" || process.env.HANDOFF_WRITES_STOPPED !== "yes")
    throw new Error("Separate approval, verified Storage backup and write freeze required");
  const approved = JSON.parse(await readFile(values.manifest, "utf8"));
  await executeCleanup(client, approved, current, values.confirm);
  console.log(JSON.stringify({ mode: "VERIFIED", deleted: current.objects.length, remaining: 0, bucketsPreserved: true }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Provider errors may contain connection details. Deliberately do not print raw errors.
    console.error("Handoff Storage cleanup failed. Keep writes stopped; check inputs, approval and private manifest. No secrets logged.");
    process.exitCode = 1;
  });
}
