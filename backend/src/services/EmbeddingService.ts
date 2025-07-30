import { pipeline, Pipeline } from '@xenova/transformers';

export class EmbeddingService {
  private model: any = null;
  private modelName: string = 'Xenova/all-MiniLM-L6-v2'; // 384-dimensional embeddings
  private isLoading: boolean = false;

  constructor(modelName?: string) {
    if (modelName) {
      this.modelName = modelName;
    }
  }

  async initializeModel(): Promise<void> {
    if (this.model || this.isLoading) {
      return;
    }

    try {
      this.isLoading = true;
      console.log(`Loading embedding model: ${this.modelName}`);
      
      this.model = await pipeline('feature-extraction', this.modelName);
      
      console.log('Embedding model loaded successfully');
    } catch (error) {
      console.error('Error loading embedding model:', error);
      throw new Error(`Failed to load embedding model: ${error}`);
    } finally {
      this.isLoading = false;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.model) {
      await this.initializeModel();
    }

    if (!this.model) {
      throw new Error('Embedding model not initialized');
    }

    try {
      // Clean and preprocess text
      const cleanText = this.preprocessText(text);
      
      // Generate embedding
      const result = await this.model(cleanText, {
        pooling: 'mean',
        normalize: true
      });

      // Convert to regular array
      const embedding = Array.from(result.data) as number[];
      
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.model) {
      await this.initializeModel();
    }

    if (!this.model) {
      throw new Error('Embedding model not initialized');
    }

    try {
      const embeddings: number[][] = [];
      
      // Process in batches to avoid memory issues
      const batchSize = 10;
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchPromises = batch.map(text => this.generateEmbedding(text));
        const batchEmbeddings = await Promise.all(batchPromises);
        embeddings.push(...batchEmbeddings);
        
        // Small delay to prevent overwhelming the system
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      return embeddings;
    } catch (error) {
      console.error('Error generating batch embeddings:', error);
      throw new Error(`Failed to generate batch embeddings: ${error}`);
    }
  }

  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  async findMostSimilar(
    queryEmbedding: number[], 
    candidateEmbeddings: { embedding: number[], metadata: any }[],
    topK: number = 5
  ): Promise<{ similarity: number, metadata: any }[]> {
    const similarities = await Promise.all(
      candidateEmbeddings.map(async (candidate) => ({
        similarity: await this.calculateSimilarity(queryEmbedding, candidate.embedding),
        metadata: candidate.metadata
      }))
    );

    // Sort by similarity (descending) and take top K
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private preprocessText(text: string): string {
    // Clean and normalize text for better embeddings
    return text
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s.,!?;:()\-'"]/g, '') // Remove special characters except basic punctuation
      .toLowerCase();
  }

  async getModelInfo(): Promise<{ name: string, dimension: number, isLoaded: boolean }> {
    return {
      name: this.modelName,
      dimension: 384, // all-MiniLM-L6-v2 produces 384-dimensional embeddings
      isLoaded: this.model !== null
    };
  }

  async warmUp(): Promise<void> {
    // Generate a dummy embedding to warm up the model
    console.log('Warming up embedding model...');
    await this.generateEmbedding('This is a test sentence for warming up the model.');
    console.log('Embedding model warmed up successfully');
  }
}

export default EmbeddingService;