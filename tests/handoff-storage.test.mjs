// @vitest-environment node
import { expect, it, vi } from "vitest";
import { businessPath, digest, executeCleanup, inventory } from "../scripts/production-handoff-storage-cleanup.mjs";
const org = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const path = `${org}/reconciliations/${id}/${id}.pdf`;
function fixture() {
  let present = true;
  const remove = vi.fn(async () => { present = false; return { error: null }; });
  const client = { storage: {
    listBuckets: async () => ({ data: [{ id: "prime-reconciliations", public: false }], error: null }),
    from: () => ({ remove, list: async (prefix) => ({ data: !present ? [] : prefix === org ? [{ name: "reconciliations" }]
      : prefix.endsWith("reconciliations") ? [{ name: id }] : [{ name: `${id}.pdf`, id, updated_at: "2026-10-12", metadata: { size: 100 } }], error: null }) }),
  } };
  return { client, remove };
}
it("accepts only exact branded business document paths, not logos or traversal", () => {
  expect(businessPath(org, path)).toBe(true);
  for (const value of [`${org}/logo.pdf`, `${org}/reconciliations/../logo.pdf`, path.replace(org, id), "logo.png"]) expect(businessPath(org, value)).toBe(false);
});
it("dry run inventories without deletions", async () => {
  const { client, remove } = fixture();
  const result = await inventory(client, org, "http://127.0.0.1:15431");
  expect(result.objects.map((o) => o.name)).toEqual([path]);
  expect(remove).not.toHaveBeenCalled();
});
it("refuses changed manifest and invalid approval", async () => {
  const { client, remove } = fixture();
  const approved = await inventory(client, org, "http://127.0.0.1:15431");
  await expect(executeCleanup(client, approved, approved, "wrong")).rejects.toThrow();
  await expect(executeCleanup(client, approved, { ...approved, objects: [] }, digest(approved))).rejects.toThrow(/changed/);
  expect(remove).not.toHaveBeenCalled();
});
it("removes only reviewed paths and verifies private bucket survives", async () => {
  const { client, remove } = fixture();
  const approved = await inventory(client, org, "http://127.0.0.1:15431");
  const after = await executeCleanup(client, approved, approved, digest(approved));
  expect(remove).toHaveBeenCalledWith([path]);
  expect(after.objects).toHaveLength(0);
  expect(after.preservedBuckets).toEqual(approved.preservedBuckets);
});
it("refuses unclassified target-prefix assets without deleting reviewed PDFs", async () => {
  const { client, remove } = fixture();
  const approved = await inventory(client, org, "http://127.0.0.1:15431");
  const unknown = { ...approved, unclassified: [`${org}/logo.png`] };
  await expect(executeCleanup(client, unknown, unknown, digest(unknown))).rejects.toThrow(/Unclassified/);
  expect(remove).not.toHaveBeenCalled();
});
it("refuses a public bucket and a changed remote origin", async () => {
  const { client, remove } = fixture();
  const approved = await inventory(client, org, "http://127.0.0.1:15431");
  await expect(executeCleanup(client, approved, { ...approved, origin: "https://different.invalid" }, digest(approved))).rejects.toThrow(/changed/);
  client.storage.listBuckets = async () => ({ data: [{ id: "prime-reconciliations", public: true }], error: null });
  await expect(inventory(client, org, approved.origin)).rejects.toThrow(/public/);
  expect(remove).not.toHaveBeenCalled();
});
