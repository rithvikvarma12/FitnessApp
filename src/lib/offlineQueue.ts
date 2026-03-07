import { db } from "../db/db";
import { supabase } from "./supabase";

export type SyncOperation = "upsert" | "delete";

export type SyncQueueItem = {
  id: string;
  table: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function queueOperation(
  table: string,
  operation: SyncOperation,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      table,
      operation,
      payload,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("offlineQueue: failed to queue operation:", err);
  }
}

async function retryItem(item: SyncQueueItem): Promise<boolean> {
  try {
    if (item.operation === "upsert") {
      const { error } = await supabase.from(item.table).upsert(item.payload);
      if (error) { console.error("offlineQueue: upsert failed:", error); return false; }
    } else if (item.operation === "delete") {
      const id = item.payload["id"];
      if (!id) return true;
      const { error } = await supabase.from(item.table).delete().eq("id", id as string);
      if (error) { console.error("offlineQueue: delete failed:", error); return false; }
    }
    return true;
  } catch {
    return false;
  }
}

export async function processQueue(): Promise<void> {
  const items = await db.syncQueue.orderBy("createdAt").toArray();
  if (items.length === 0) return;

  for (const item of items) {
    const ok = await retryItem(item);
    if (ok) {
      await db.syncQueue.delete(item.id);
    }
  }
}

// Register online listener once
window.addEventListener("online", () => {
  void processQueue();
});
