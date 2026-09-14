// 知乎开放平台响应类型（依据 2026-09-14 实测响应形状定义）

export interface ZhihuEnvelope<T> {
  Code: number;
  Message: string;
  Data: T;
}

export interface QuotaItem {
  APIID: string;
  APIName: string;
  TotalQuota: number;
  TotalUsed: number;
  RemainingQuota: number;
}

export interface SearchItem {
  Title: string;
  ContentType: string;
  ContentID: string;
  AuthorSignature: string;
  ContentText: string;
  Url: string;
  CommentCount: number;
  VoteUpCount: number;
  AuthorName: string;
  AuthorAvatar: string;
  AuthorBadge: string;
  AuthorBadgeText: string;
  EditTime: number;
  CommentInfoList?: Array<{ Content: string }>;
  AuthorityLevel?: string;
  RankingScore?: number;
}

export interface SearchResult {
  HasMore: boolean;
  SearchHashId: string;
  Items: SearchItem[];
}

export interface HotItem {
  Title: string;
  Url: string;
  ThumbnailUrl?: string;
  /** 实测字段名为 Summary，不是 Excerpt。 */
  Summary?: string;
  HotScore?: number;
  [k: string]: unknown;
}

export interface HotListResult {
  Total: number;
  Items: HotItem[];
}

export interface AnswerSummary {
  ContentType: string;
  ContentToken: string;
  Url: string;
  Summary: string;
  AuthorName?: string;
  VoteUpCount?: number;
  [k: string]: unknown;
}

export interface QuestionAnswersResult {
  Items: AnswerSummary[];
  Paging: { IsEnd: boolean; Totals?: number; NextOffset?: number | string };
}

export interface QuestionRecommendation {
  Title: string;
  Url: string;
  [k: string]: unknown;
}

export interface ZhidaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ZhidaChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string;
}

export interface ZhidaCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ZhidaChoice[];
}

export interface HackathonWork {
  work_id: string;
  title: string;
  artwork: string;
  tab_artwork: string;
  description: string;
  [k: string]: unknown;
}
