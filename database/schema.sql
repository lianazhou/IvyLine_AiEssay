-- Enable the vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create essays table
CREATE TABLE IF NOT EXISTS essays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal_statement', 'supplemental', 'common_app', 'other')),
  college TEXT,
  prompt TEXT,
  topics TEXT[] DEFAULT '{}',
  structure_analysis JSONB,
  metadata JSONB DEFAULT '{}',
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS essays_type_idx ON essays(type);
CREATE INDEX IF NOT EXISTS essays_topics_idx ON essays USING GIN(topics);
CREATE INDEX IF NOT EXISTS essays_embedding_idx ON essays USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create the similarity search function
CREATE OR REPLACE FUNCTION match_essays(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.78,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  type TEXT,
  college TEXT,
  prompt TEXT,
  topics TEXT[],
  structure_analysis JSONB,
  metadata JSONB,
  embedding vector(384),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    essays.id,
    essays.title,
    essays.content,
    essays.type,
    essays.college,
    essays.prompt,
    essays.topics,
    essays.structure_analysis,
    essays.metadata,
    essays.embedding,
    essays.created_at,
    essays.updated_at,
    1 - (essays.embedding <=> query_embedding) AS similarity
  FROM essays
  WHERE essays.embedding IS NOT NULL
    AND 1 - (essays.embedding <=> query_embedding) > match_threshold
  ORDER BY essays.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create RLS policies
ALTER TABLE essays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON essays
FOR SELECT USING (true);

CREATE POLICY "Allow public insert access" ON essays
FOR INSERT WITH CHECK (true);