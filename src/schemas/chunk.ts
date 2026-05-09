import { z } from "zod";

export const ChunkMetaSchema = z.object({
  name: z.string().min(1),
  keywords: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const CHUNK_FRONT_MATTER_HINT = `---
name: "chunk-name"
keywords: ["k1", "k2"]
createdAt: "YYYY-MM-DD HH:mm:ss"
updatedAt: "YYYY-MM-DD HH:mm:ss"
---
<content>`;

