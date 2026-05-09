import { z } from "zod";

export const LOCAL_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
export const LOCAL_TIMESTAMP_MESSAGE = "must match YYYY-MM-DD HH:mm:ss (system local timezone)";
export const LocalTimestampSchema = z.string().regex(LOCAL_TIMESTAMP_RE, LOCAL_TIMESTAMP_MESSAGE);
