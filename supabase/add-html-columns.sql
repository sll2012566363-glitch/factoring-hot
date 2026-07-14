-- Add content_html and cover_image columns to articles table
-- Run this in Supabase SQL Editor

ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_html TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS cover_image TEXT;

COMMENT ON COLUMN articles.content_html IS '清洗后的原文HTML（保留inline style + img标签）';
COMMENT ON COLUMN articles.cover_image IS '封面图URL（og:image或正文第一张图）';
