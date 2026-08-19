"use client";

import { useEffect } from "react";
import { recordViewAction } from "@/app/actions";

/**
 * Logs "this member opened this prediction" to the view log. A client effect
 * rather than a write in the server render so link prefetches never count as
 * views — only real navigation mounts this.
 */
export function RecordView({ marketId }: { marketId: string }) {
  useEffect(() => {
    void recordViewAction(marketId);
  }, [marketId]);
  return null;
}
