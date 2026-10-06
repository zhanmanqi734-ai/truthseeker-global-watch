import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const reports = sqliteTable('reports', {
  date: text('date').primaryKey(),
  generatedAt: text('generated_at').notNull(),
  windowStart: text('window_start').notNull(),
  windowEnd: text('window_end').notNull(),
  complete: integer('complete').notNull().default(0),
  mode: text('mode').notNull(),
  payload: text('payload').notNull(),
});

export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  url: text('url').notNull(),
  publishedAt: text('published_at').notNull(),
  firstSeenAt: text('first_seen_at').notNull(),
  analysis: text('analysis').notNull(),
});

export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({autoIncrement:true}),
  reportDate: text('report_date').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  status: text('status').notNull(),
  articleCount: integer('article_count').notNull().default(0),
  error: text('error'),
});
