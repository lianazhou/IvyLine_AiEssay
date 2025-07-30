import { EmbeddingService } from '../services/EmbeddingService';
import { SupabaseService } from '../services/SupabaseService';
import * as fs from 'fs';

interface JsonEssay {
  id?: string;
  title?: string;
  content: string;
  type?: string;
  college?: string;
  prompt?: string;
  topics?: string[];
  // Add other fields based on your JSON structure
}

async function processJsonEssays() {
  const embeddingService = new EmbeddingService();
  const supabaseService = new SupabaseService();

  // Initialize the embedding model
  await embeddingService.initializeModel();

  // Read your JSON file (adjust path as needed)
  // ...existing code...
const jsonPath = "C:\\Users\\liana\\Downloads\\42IvyLeagueCAEssays.json";
// ...existing code...
  const essaysData: JsonEssay[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log(`Processing ${essaysData.length} essays...`);

  for (let i = 0; i < essaysData.length; i++) {
    const essay = essaysData[i];
    
    try {
      // Generate embedding
      const embedding = await embeddingService.generateEmbedding(essay.content);
      
      // Insert into database
      await supabaseService.insertEssay({
        title: essay.title || `Essay ${i + 1}`,
        content: essay.content,
        type: (essay.type as any) || 'personal_statement',
        college: essay.college,
        prompt: essay.prompt,
        topics: essay.topics || [],
        embedding
      });
      
      console.log(`✅ Processed essay ${i + 1}/${essaysData.length}`);
      
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Error processing essay ${i + 1}:`, error);
    }
  }

  console.log('🎉 Finished processing all essays!');
}

// Run the script
processJsonEssays().catch(console.error);