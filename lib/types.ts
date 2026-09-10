export type Stamp = "CONSIDER" | "PASS" | "RECOMMEND";

export type RobotWorkflow =
  | "summarize"
  | "generate-chapters"
  | "find-key-moments";

export type JobStatus = "pending" | "completed" | "errored";

export type CoverageMeta = {
  emailId: string;
  from: string;
  subject: string;
  replyTo: string;
  messageId?: string;
};

export type SummarizeOutputs = {
  title?: string;
  description?: string;
  tags?: string[];
};

export type Chapter = {
  start_time: number;
  title: string;
};

export type ChaptersOutputs = {
  chapters?: Chapter[];
};

export type KeyMoment = {
  start_ms: number;
  end_ms: number;
  overall_score?: number;
  title?: string;
  audible_narrative?: string;
  visual_narrative?: string;
  notable_audible_concepts?: string[];
};

export type MomentsOutputs = {
  moments?: KeyMoment[];
};

export type JobResult<T> = {
  status: JobStatus;
  outputs?: T;
};

export type CoverageJobs = {
  summarize?: JobResult<SummarizeOutputs>;
  "generate-chapters"?: JobResult<ChaptersOutputs>;
  "find-key-moments"?: JobResult<MomentsOutputs>;
};

export type CoverageRecord = CoverageMeta & {
  assetId: string;
  playbackId?: string;
  sourceUrl: string;
  jobs: CoverageJobs;
};

export type ReceivedAttachment = {
  id?: string;
  filename?: string | null;
  content_type?: string | null;
  download_url?: string | null;
};

export function assertNever(value: never, label: string): never {
  throw new Error(`Unhandled ${label}: ${String(value)}`);
}
