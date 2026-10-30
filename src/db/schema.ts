import {
  pgTable, pgEnum, uuid, text, timestamp, boolean, integer, jsonb, serial, bigserial,
  primaryKey, index, uniqueIndex, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ enums */
export const roleEnum = pgEnum("role", ["member", "reviewer", "moderator", "integrity_admin", "platform_admin"]);
export const postKindEnum = pgEnum("post_kind", ["video", "visual", "thread", "behind_the_paper", "open_question"]);
export const postStatusEnum = pgEnum("post_status", ["visible", "held", "removed"]);
export const reviewTypeEnum = pgEnum("review_type", ["source_fidelity", "methodological", "statistical", "clinical_relevance"]);
export const reviewStatusEnum = pgEnum("review_status", ["in_progress", "completed"]);
export const contributionTypeEnum = pgEnum("contribution_type", ["question", "evidence", "objection", "interpretation", "correction"]);
export const reactionKindEnum = pgEnum("reaction_kind", ["like", "insightful"]);
export const correctionStatusEnum = pgEnum("correction_status", ["none_known", "corrected", "expression_of_concern", "retracted", "unknown"]);
export const studyTypeEnum = pgEnum("study_type", [
  "randomized_trial", "systematic_review", "cohort", "case_control", "cross_sectional", "case_series",
  "animal", "in_vitro", "computational", "qualitative", "other",
]);
export const followTargetEnum = pgEnum("follow_target", ["user", "question", "topic"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "actioned", "dismissed"]);

/* --------------------------------------------------------------- identity */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  orcidId: text("orcid_id"),
  field: text("field").notNull().default(""),
  bio: text("bio").notNull().default(""),
  currentWork: text("current_work").notNull().default(""),
  analyticsConsent: boolean("analytics_consent").notNull().default(false),
  /** scrypt hash ("scrypt$N$r$p$salt$hash"); null for accounts that only use email links. */
  passwordHash: text("password_hash"),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  /** Who can send this person a new message: "everyone" (as a request), "following" (people they follow) or "none". */
  dmPolicy: text("dm_policy").notNull().default("everyone"),
  /** Set by a moderator after abuse in messages: the person can no longer send messages. */
  messagingDisabledAt: timestamp("messaging_disabled_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("users_handle_uq").on(sql`lower(${t.handle})`),
  uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
  uniqueIndex("users_orcid_uq").on(t.orcidId),
]);

export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  fields: text("fields").array().notNull().default(sql`'{}'::text[]`),
  grantedBy: uuid("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.role] })]);

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

/** One-time email tokens. purpose: "login" (sign-in link), "verify" (confirm a new account), "reset" (new password). */
export const loginTokens = pgTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  purpose: text("purpose").notNull().default("login"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Failed sign-ins and other rate-limited auth requests, keyed by email or IP. Old rows are pruned as new ones arrive. */
export const authAttempts = pgTable("auth_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: text("key").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("auth_attempts_key_idx").on(t.kind, t.key, t.createdAt)]);

/** A person who blocked another: neither sees the other's posts or comments, and the blocked one can't reply or follow. */
export const blocks = pgTable("blocks", {
  blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index("blocks_blocked_idx").on(t.blockedId)]);

/** Push notification tokens from the iOS app. */
export const deviceTokens = pgTable("device_tokens", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().default("ios"),
  /** The session that registered it, so signing out on that phone stops its notifications. */
  sessionHash: text("session_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("device_tokens_user_idx").on(t.userId)]);

/* -------------------------------------------------------- knowledge graph */
export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
});

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  text: text("text").notNull(),
  topicId: integer("topic_id").references(() => topics.id),
  mergedInto: uuid("merged_into").references((): AnyPgColumn => questions.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  doi: text("doi"),
  url: text("url"),
  title: text("title").notNull(),
  authors: jsonb("authors").$type<string[]>().notNull().default([]),
  venue: text("venue"),
  publishedYear: integer("published_year"),
  sourceType: text("source_type"),
  correctionStatus: correctionStatusEnum("correction_status").notNull().default("unknown"),
  provenance: jsonb("provenance").$type<{ provider: string; fetchedAt: string }>().notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  /** Abstract as published in Crossref metadata (plain text), when the publisher deposits one. */
  abstract: text("abstract"),
  /** AI-assisted summary of the abstract. Never used to set review labels. */
  aiSummary: jsonb("ai_summary").$type<{ points: string[]; design: string | null; model: string; generatedAt: string }>(),
  /** Last time a summary was attempted (to avoid repeated calls). */
  aiSummaryAt: timestamp("ai_summary_at", { withTimezone: true }),
}, (t) => [uniqueIndex("sources_doi_uq").on(sql`lower(${t.doi})`)]);

/* ------------------------------------------------------------------ posts */
export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: uuid("author_id").notNull().references(() => users.id),
  kind: postKindEnum("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  mediaUrl: text("media_url"),
  topicId: integer("topic_id").references(() => topics.id),
  questionId: uuid("question_id").references(() => questions.id),
  sourceId: uuid("source_id").references(() => sources.id),
  /** Study design of the cited research, chosen by the author. */
  studyType: studyTypeEnum("study_type"),
  aiAssisted: boolean("ai_assisted").notNull().default(false),
  /** The author's own conflicts of interest ("None declared" when they have none). Null on posts made before it was asked. */
  conflicts: text("conflicts"),
  /** What the study can't show: the author's own statement of limitations and caveats. */
  limitations: text("limitations"),
  /** Who made the video, figure or image, when it isn't the author's own. */
  mediaCredit: text("media_credit"),
  status: postStatusEnum("status").notNull().default("visible"),
  disputedReason: text("disputed_reason"),
  authorResponse: text("author_response"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("posts_created_idx").on(t.createdAt),
  index("posts_question_idx").on(t.questionId),
  index("posts_author_idx").on(t.authorId),
]);

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").notNull().references(() => users.id),
  type: reviewTypeEnum("type").notNull(),
  status: reviewStatusEnum("status").notNull().default("in_progress"),
  recommendation: text("recommendation").notNull().default(""),
  summary: text("summary").notNull().default(""),
  checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull().default({}),
  ratings: jsonb("ratings").$type<{ rigor: string; bias: string; relevance: string; reproducibility: string } | null>(),
  conflicts: text("conflicts").notNull(),
  isSigned: boolean("is_signed").notNull().default(true),
  postVersion: integer("post_version").notNull(),
  orcidPutCode: text("orcid_put_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  /** Right of reply: a completed review stays visible only to the author and reviewer until this time (or the author's response). */
  publicAt: timestamp("public_at", { withTimezone: true }),
  /** The post author's rating of how useful the review was, 1 to 5. */
  helpfulness: integer("helpfulness"),
  /** The author changed the post because of this review. */
  ledToRevision: boolean("led_to_revision").notNull().default(false),
  authorRatedAt: timestamp("author_rated_at", { withTimezone: true }),
  /** How AI tools were used: "none", "language" (wording, translation) or "assist" (finding references, checking calculations). Null on older reviews. */
  aiUse: text("ai_use"),
  /** Mentored review: someone who reviewed alongside the reviewer, often a student or early-career researcher. Credited once they confirm. */
  coReviewerId: uuid("co_reviewer_id").references(() => users.id),
  coReviewerConfirmedAt: timestamp("co_reviewer_confirmed_at", { withTimezone: true }),
}, (t) => [
  index("reviews_post_idx").on(t.postId),
  uniqueIndex("reviews_one_per_type_uq").on(t.postId, t.reviewerId, t.type),
]);

export const contributions = pgTable("contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => contributions.id),
  authorId: uuid("author_id").notNull().references(() => users.id),
  type: contributionTypeEnum("type").notNull(),
  body: text("body").notNull(),
  sourceDoi: text("source_doi"),
  status: postStatusEnum("status").notNull().default("visible"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
}, (t) => [index("contributions_post_idx").on(t.postId, t.createdAt)]);

export const contributionRevisions = pgTable("contribution_revisions", {
  id: serial("id").primaryKey(),
  contributionId: uuid("contribution_id").notNull().references(() => contributions.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  editedBy: uuid("edited_by").notNull().references(() => users.id),
  editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------- social signals (never set rigor) */
export const reactions = pgTable("reactions", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  kind: reactionKindEnum("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.postId, t.kind] }), index("reactions_post_idx").on(t.postId)]);

export const saves = pgTable("saves", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);

export const follows = pgTable("follows", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: followTargetEnum("target_type").notNull(),
  targetId: text("target_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] }), index("follows_target_idx").on(t.targetType, t.targetId)]);

/* -------------------------------------------------------------- integrity */
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  /** Set when the report is about a comment on the post rather than the post itself. */
  contributionId: uuid("contribution_id").references((): AnyPgColumn => contributions.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: reportStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moderationActions = pgTable("moderation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id").references(() => reports.id),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  moderatorId: uuid("moderator_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  rationale: text("rationale").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only. UPDATE and DELETE are blocked by rules in migration 0001. */
export const auditEvents = pgTable("audit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id").references(() => users.id),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_entity_idx").on(t.entityType, t.entityId)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  link: text("link").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notifications_recipient_idx").on(t.recipientId, t.createdAt)]);

/* -------------------------------------------------------------- waitlist */
export const waitlistInterestEnum = pgEnum("waitlist_interest", ["individual", "institutional"]);

/** Beta waitlist sign-ups from the public landing page. One row per email and interest type. */
export const partnerTypeEnum = pgEnum("partner_type", ["university", "institute", "publisher", "other"]);

export const careerStageEnum = pgEnum("career_stage", ["phd_student", "postdoc", "faculty", "clinician", "industry", "other"]);

/** Applications to join the beta as a founding reviewer, from the public landing page. */
export const reviewerApplications = pgTable("reviewer_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  field: text("field").notNull(),
  institution: text("institution").notNull(),
  careerStage: careerStageEnum("career_stage").notNull(),
  orcidId: text("orcid_id"),
  reviewsPerMonth: integer("reviews_per_month").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("reviewer_applications_email_idx").on(sql`lower(${t.email})`)]);

export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  interest: waitlistInterestEnum("interest").notNull(),
  /** Institutional sign-ups only: the organization and what kind it is. */
  organization: text("organization"),
  partnerType: partnerTypeEnum("partner_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("waitlist_email_interest_idx").on(sql`lower(${t.email})`, t.interest)]);

/** Early access: emails the founding team let in. Reviewer grants also give the reviewer role (and the verified seal). */
export const accessGrants = pgTable("access_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  asReviewer: boolean("as_reviewer").notNull().default(false),
  fields: text("fields").array().notNull().default(sql`'{}'::text[]`),
  grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("access_grants_email_idx").on(sql`lower(${t.email})`)]);

/**
 * First-party visit counts, without cookies: no IP address is stored. `visitor` is a hash of
 * IP, browser and day with a server-side salt, so the same person counts once per day and
 * can't be followed across days. Location comes from the hosting provider's IP lookup.
 */
export const pageViews = pgTable("page_views", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  path: text("path").notNull(),
  referrerHost: text("referrer_host"),
  country: text("country"),
  region: text("region"),
  city: text("city"),
  device: text("device").notNull().default("desktop"),
  visitor: text("visitor").notNull(),
}, (t) => [index("page_views_at_idx").on(t.at)]);

/* ------------------------------------------------------- direct messages */
/** A one-to-one conversation. `pairKey` (the two user ids, sorted) keeps it to one conversation per pair. */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  pairKey: text("pair_key").notNull().unique(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
});

/**
 * Each person's side of a conversation. `state`: "active" (in their inbox), "request" (a message
 * request from someone they don't follow, until they accept or reply) or "declined".
 * `clearedAt`: they deleted the chat; earlier messages stay hidden for them.
 */
export const conversationMembers = pgTable("conversation_members", {
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("active"),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conversation_members_user_idx").on(t.userId)]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** The sender deleted it; the text is erased. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  /** A moderator removed it after a report. */
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)]);

/** Reports about a message. `snapshot` keeps the reported text, so deleting the message can't hide it from moderators. */
export const messageReports = pgTable("message_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  snapshot: text("snapshot").notNull(),
  status: reportStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
