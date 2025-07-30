import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Essay {
  id: string;
  title?: string;
  content: string;
  type: 'personal_statement' | 'supplemental' | 'common_app' | 'other';
  college?: string;
  prompt?: string;
  topics: string[];
  structure_analysis?: {
    hook: string;
    exposition: string;
    conflict: string;
    learning: string;
    conclusion: string;
  };
  metadata?: Record<string, any>;
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface EssayStats {
  total_essays: number;
  by_type: Record<string, number>;
  by_topic: Record<string, number>;
}

export class SupabaseService {
  public supabase: SupabaseClient; // Made public for direct access if needed

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_ANON_KEY!;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and Key must be provided in environment variables');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async insertEssay(essay: Omit<Essay, 'id' | 'created_at' | 'updated_at'>): Promise<Essay> {
    const { data, error } = await this.supabase
      .from('essays')
      .insert([{
        ...essay,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert essay: ${error.message}`);
    }

    return data as Essay;
  }

  async updateEssayEmbedding(essayId: string, embedding: number[]): Promise<void> {
    const { error } = await this.supabase
      .from('essays')
      .update({ 
        embedding,
        updated_at: new Date().toISOString()
      })
      .eq('id', essayId);

    if (error) {
      throw new Error(`Failed to update essay embedding: ${error.message}`);
    }
  }

  async searchSimilarEssays(
    queryEmbedding: number[], 
    essayType?: string, 
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<Array<Essay & { similarity: number }>> {
    try {
      let query = this.supabase
        .rpc('match_essays', {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: limit
        });

      if (essayType && essayType !== 'all') {
        query = query.eq('type', essayType);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error searching similar essays:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in searchSimilarEssays:', error);
      return [];
    }
  }

  async getEssaysByTopic(topic: string, essayType?: string, limit: number = 10): Promise<Essay[]> {
    let query = this.supabase
      .from('essays')
      .select('*')
      .contains('topics', [topic])
      .limit(limit);

    if (essayType) {
      query = query.eq('type', essayType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get essays by topic: ${error.message}`);
    }

    return data || [];
  }

  async getEssayStats(): Promise<EssayStats> {
    // Get total count
    const { count: totalCount, error: countError } = await this.supabase
      .from('essays')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Failed to get essay count: ${countError.message}`);
    }

    // Get essays grouped by type
    const { data: typeData, error: typeError } = await this.supabase
      .from('essays')
      .select('type');

    if (typeError) {
      throw new Error(`Failed to get essays by type: ${typeError.message}`);
    }

    // Get all topics
    const { data: topicData, error: topicError } = await this.supabase
      .from('essays')
      .select('topics');

    if (topicError) {
      throw new Error(`Failed to get essay topics: ${topicError.message}`);
    }

    // Process the data
    const byType: Record<string, number> = {};
    typeData?.forEach(essay => {
      byType[essay.type] = (byType[essay.type] || 0) + 1;
    });

    const byTopic: Record<string, number> = {};
    topicData?.forEach(essay => {
      essay.topics?.forEach((topic: string) => {
        byTopic[topic] = (byTopic[topic] || 0) + 1;
      });
    });

    return {
      total_essays: totalCount || 0,
      by_type: byType,
      by_topic: byTopic
    };
  }

  async getEssayById(id: string): Promise<Essay | null> {
    const { data, error } = await this.supabase
      .from('essays')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Essay not found
      }
      throw new Error(`Failed to get essay: ${error.message}`);
    }

    return data as Essay;
  }

  async deleteEssay(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('essays')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete essay: ${error.message}`);
    }
  }

  // Helper method to create the essays table (run this once during setup)
  async createEssaysTable(): Promise<void> {
    const createTableSQL = `
      -- Enable the pgvector extension
      CREATE EXTENSION IF NOT EXISTS vector;

      -- Create essays table with 384-dimensional vectors (matching all-MiniLM-L6-v2)
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
        embedding vector(384), -- Changed to 384 to match your embedding model
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS essays_type_idx ON essays(type);
      CREATE INDEX IF NOT EXISTS essays_topics_idx ON essays USING GIN(topics);
      CREATE INDEX IF NOT EXISTS essays_embedding_idx ON essays USING ivfflat (embedding vector_cosine_ops);

      -- Create the updated match function for 384-dimensional vectors
      CREATE OR REPLACE FUNCTION match_essays(
        query_embedding vector(384),  -- Changed to 384 dimensions
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
        embedding vector(384),  -- Changed to 384 dimensions
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
        WHERE 1 - (essays.embedding <=> query_embedding) > match_threshold
        ORDER BY essays.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$;
    `;

    // Note: You'll need to run this SQL directly in your Supabase SQL editor
    // The RPC approach might not work for DDL statements
    console.log('Please run the following SQL in your Supabase SQL editor:');
    console.log(createTableSQL);
    
    throw new Error('Please run the table creation SQL manually in Supabase SQL editor');
  }

  // Helper method to test database connection
  async testConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('essays')
        .select('count', { count: 'exact', head: true });
      
      return !error;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }
}

export default SupabaseService;