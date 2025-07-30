import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
// Fixed imports - using default exports as your services are set up
import EmbeddingService from './services/EmbeddingService';
import { SupabaseService } from './services/SupabaseService';
// Fixed import path - using default export from agents folder
import WritingSpecialistAgent from './agents/WritingSpecialistAgent';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for essay content

// Initialize services
const embeddingService = new EmbeddingService();
const supabaseService = new SupabaseService();

// Initialize embedding model on startup with proper error handling
let isEmbeddingServiceReady = false;

const initializeServices = async () => {
  try {
    console.log('🔄 Initializing embedding service...');
    await embeddingService.initializeModel();
    await embeddingService.warmUp(); // Warm up the model
    isEmbeddingServiceReady = true;
    console.log('✅ Embedding service initialized and warmed up');
    
    // Test database connection
    const dbConnected = await supabaseService.testConnection();
    console.log(dbConnected ? '✅ Database connected' : '❌ Database connection failed');
    
  } catch (error) {
    console.error('❌ Error initializing services:', error);
    isEmbeddingServiceReady = false;
  }
};

// Initialize services on startup
initializeServices();

const writingAgent = new WritingSpecialistAgent(embeddingService, supabaseService);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Send service status to newly connected client
  socket.emit('service_status', {
    embeddingReady: isEmbeddingServiceReady,
    timestamp: new Date().toISOString()
  });

  socket.on('user_message', async (data) => {
    try {
      const { message, sessionId } = data;
      
      // Check if services are ready
      if (!isEmbeddingServiceReady) {
        socket.emit('error', { 
          message: 'AI services are still initializing. Please wait a moment and try again.' 
        });
        return;
      }
      
      // Send typing indicator
      socket.emit('agent_typing', true);
      
      // Process message with WritingSpecialist agent
      const response = await writingAgent.processMessage(message, sessionId || 'default');
      
      // Stop typing indicator and send response
      socket.emit('agent_typing', false);
      socket.emit('agent_message', {
        message: response,
        timestamp: new Date().toISOString(),
        sessionId: sessionId || 'default'
      });
      
    } catch (error) {
      console.error('❌ Error processing message:', error);
      socket.emit('agent_typing', false);
      socket.emit('error', { 
        message: 'Sorry, I encountered an error processing your request. Please try again.' 
      });
    }
  });

  // Handle essay analysis requests
  socket.on('analyze_essay', async (data) => {
    try {
      const { essayText, analysisType, sessionId } = data;
      
      if (!isEmbeddingServiceReady) {
        socket.emit('error', { 
          message: 'AI services are still initializing. Please wait a moment and try again.' 
        });
        return;
      }
      
      socket.emit('agent_typing', true);
      
      // Create a message that triggers essay analysis
      const analysisMessage = `Please analyze this essay using ${analysisType || 'deep_analysis'}: "${essayText}"`;
      const response = await writingAgent.processMessage(analysisMessage, sessionId || 'default');
      
      socket.emit('agent_typing', false);
      socket.emit('essay_analysis', {
        analysis: response,
        timestamp: new Date().toISOString(),
        sessionId: sessionId || 'default'
      });
      
    } catch (error) {
      console.error('❌ Error analyzing essay:', error);
      socket.emit('agent_typing', false);
      socket.emit('error', { 
        message: 'Sorry, I encountered an error analyzing your essay. Please try again.' 
      });
    }
  });

  // Handle requests for similar essays
  socket.on('find_similar_essays', async (data) => {
    try {
      const { query, essayType, limit, sessionId } = data;
      
      if (!isEmbeddingServiceReady) {
        socket.emit('error', { 
          message: 'AI services are still initializing. Please wait a moment and try again.' 
        });
        return;
      }
      
      socket.emit('agent_typing', true);
      
      const searchMessage = `Find similar essays for: "${query}" of type: ${essayType || 'all'}`;
      const response = await writingAgent.processMessage(searchMessage, sessionId || 'default');
      
      socket.emit('agent_typing', false);
      socket.emit('similar_essays', {
        results: response,
        timestamp: new Date().toISOString(),
        sessionId: sessionId || 'default'
      });
      
    } catch (error) {
      console.error('❌ Error finding similar essays:', error);
      socket.emit('agent_typing', false);
      socket.emit('error', { 
        message: 'Sorry, I encountered an error finding similar essays. Please try again.' 
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// Health check endpoint with detailed status
app.get('/health', async (req, res) => {
  try {
    const modelInfo = await embeddingService.getModelInfo();
    const dbConnected = await supabaseService.testConnection();
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      services: {
        embedding: {
          ready: isEmbeddingServiceReady,
          model: modelInfo
        },
        database: {
          connected: dbConnected
        },
        anthropic: {
          configured: !!process.env.ANTHROPIC_API_KEY
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString() 
    });
  }
});

// API routes
app.get('/api/essays/stats', async (req, res) => {
  try {
    const stats = await supabaseService.getEssayStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error fetching essay stats:', error);
    res.status(500).json({ error: 'Failed to fetch essay stats' });
  }
});

// Add essay endpoint
app.post('/api/essays', async (req, res) => {
  try {
    const essayData = req.body;
    
    // Generate embedding for the essay
    if (isEmbeddingServiceReady) {
      const embedding = await embeddingService.generateEmbedding(essayData.content);
      essayData.embedding = embedding;
    }
    
    const essay = await supabaseService.insertEssay(essayData);
    res.json(essay);
  } catch (error) {
    console.error('❌ Error adding essay:', error);
    res.status(500).json({ error: 'Failed to add essay' });
  }
});

// Get essay by ID
app.get('/api/essays/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const essay = await supabaseService.getEssayById(id);
    
    if (!essay) {
      return res.status(404).json({ error: 'Essay not found' });
    }
    
    res.json(essay);
  } catch (error) {
    console.error('❌ Error fetching essay:', error);
    res.status(500).json({ error: 'Failed to fetch essay' });
  }
});

// Search similar essays endpoint
app.post('/api/essays/search', async (req, res) => {
  try {
    const { query, essayType, limit } = req.body;
    
    if (!isEmbeddingServiceReady) {
      return res.status(503).json({ error: 'Embedding service not ready' });
    }
    
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    const similarEssays = await supabaseService.searchSimilarEssays(
      queryEmbedding,
      essayType,
      limit || 5
    );
    
    res.json(similarEssays);
  } catch (error) {
    console.error('❌ Error searching essays:', error);
    res.status(500).json({ error: 'Failed to search essays' });
  }
});

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`🔌 WebSocket server running on port ${PORT}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`🤖 Using Anthropic API: ${!!process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not configured'}`);
});

export default app;