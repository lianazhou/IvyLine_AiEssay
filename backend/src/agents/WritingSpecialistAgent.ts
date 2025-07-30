import Anthropic from '@anthropic-ai/sdk';
import EmbeddingService from '../services/EmbeddingService';
import { SupabaseService } from '../services/SupabaseService';

export interface EssayAnalysis {
  type: 'personal_statement' | 'supplemental' | 'common_app' | 'other';
  college?: string;
  prompt?: string;
  structure: {
    hook: string;
    exposition: string;
    conflict: string;
    learning: string;
    conclusion: string;
  };
  topics: string[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export class WritingSpecialistAgent {
  private anthropic: Anthropic;
  private embeddingService: EmbeddingService;
  private supabaseService: SupabaseService;

  // Fixed constructor - accepts the correct types
  constructor(embeddingService: EmbeddingService, supabaseService: SupabaseService) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
    this.embeddingService = embeddingService;
    this.supabaseService = supabaseService;
  }

  async processMessage(message: string, sessionId: string): Promise<string> {
    try {
      const tools: Anthropic.Tool[] = [
        {
          name: "analyze_essay",
          description: "Analyze an essay for structure, content, and provide feedback",
          input_schema: {
            type: "object",
            properties: {
              essay_text: {
                type: "string",
                description: "The essay text to analyze"
              },
              analysis_type: {
                type: "string",
                enum: ["quick_check", "deep_analysis", "structure_analysis"],
                description: "Type of analysis to perform"
              }
            },
            required: ["essay_text", "analysis_type"]
          }
        },
        {
          name: "search_similar_essays",
          description: "Search for similar essays in the database using semantic similarity",
          input_schema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Query to search for similar essays"
              },
              essay_type: {
                type: "string",
                enum: ["personal_statement", "supplemental", "common_app", "all"],
                description: "Type of essays to search"
              },
              limit: {
                type: "number",
                description: "Number of similar essays to return",
                default: 5
              }
            },
            required: ["query"]
          }
        },
        {
          name: "get_essay_examples",
          description: "Get examples of essays by topic or type",
          input_schema: {
            type: "object",
            properties: {
              topic: {
                type: "string",
                description: "Topic to find essay examples for"
              },
              essay_type: {
                type: "string",
                enum: ["personal_statement", "supplemental", "common_app"],
                description: "Type of essay examples to retrieve"
              }
            },
            required: ["topic"]
          }
        }
      ];

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: `You are a WritingSpecialist agent that helps students with college essays. You have access to a database of successful essays and can analyze writing, provide feedback, and suggest improvements.

Current user message: ${message}

Please help the user with their writing needs. If they provide an essay to analyze, use the analyze_essay function. If they want to see examples or find similar essays, use the appropriate search functions.`
          }
        ],
        tools: tools
      });

      // Check if Claude wants to use tools
      const toolUseContent = response.content.find(
        (content): content is Anthropic.ToolUseBlock => content.type === 'tool_use'
      );

      if (toolUseContent) {
        // Handle the tool call
        const toolResult = await this.handleToolCall(toolUseContent.name, toolUseContent.input);
        
        // Continue conversation with tool result
        const followUpResponse = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: message
            },
            {
              role: "assistant",
              content: response.content
            },
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUseContent.id,
                  content: JSON.stringify(toolResult)
                }
              ]
            }
          ],
          tools: tools
        });
        
        // Extract text from follow-up response
        const textContent = followUpResponse.content.find(
          (content): content is Anthropic.TextBlock => content.type === 'text'
        );
        
        return textContent ? textContent.text : 'I processed your request using my tools.';
      }

      // Return regular text response
      const textContent = response.content.find(
        (content): content is Anthropic.TextBlock => content.type === 'text'
      );
      
      return textContent ? textContent.text : 'I apologize, but I could not generate a response.';

    } catch (error) {
      console.error('Error in WritingSpecialist agent:', error);
      return "I apologize, but I encountered an error processing your request. Please try again.";
    }
  }

  private async handleToolCall(toolName: string, input: any): Promise<any> {
    switch (toolName) {
      case 'analyze_essay':
        return await this.analyzeEssay(input.essay_text, input.analysis_type);
      
      case 'search_similar_essays':
        return await this.searchSimilarEssays(input.query, input.essay_type, input.limit);
      
      case 'get_essay_examples':
        return await this.getEssayExamples(input.topic, input.essay_type);
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async analyzeEssay(essayText: string, analysisType: string): Promise<EssayAnalysis> {
    // TODO: Implement essay analysis logic
    // This would use NLP techniques to identify structure, topics, etc.
    
    // For now, return a mock analysis
    return {
      type: 'personal_statement',
      structure: {
        hook: essayText.substring(0, 100) + '...',
        exposition: 'Analysis of exposition section...',
        conflict: 'Analysis of conflict section...',
        learning: 'Analysis of learning/growth section...',
        conclusion: 'Analysis of conclusion...'
      },
      topics: ['identity', 'growth', 'challenges'],
      strengths: ['Strong hook', 'Clear narrative arc', 'Personal voice'],
      weaknesses: ['Could use more specific examples', 'Conclusion could be stronger'],
      suggestions: ['Add more concrete details', 'Strengthen the conclusion with future goals']
    };
  }

  private async searchSimilarEssays(query: string, essayType: string = 'all', limit: number = 5) {
    try {
      // FIXED: Use the correct service for generating embeddings
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // Search in Supabase using cosine similarity
      const similarEssays = await this.supabaseService.searchSimilarEssays(
        queryEmbedding, 
        essayType === 'all' ? undefined : essayType, 
        limit
      );
      
      return similarEssays;
    } catch (error) {
      console.error('Error searching similar essays:', error);
      return [];
    }
  }

  private async getEssayExamples(topic: string, essayType?: string) {
    try {
      const examples = await this.supabaseService.getEssaysByTopic(topic, essayType);
      return examples;
    } catch (error) {
      console.error('Error getting essay examples:', error);
      return [];
    }
  }
}

export default WritingSpecialistAgent;