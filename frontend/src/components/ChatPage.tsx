import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import './ChatPage.css';

// Define the socket type directly
type SocketType = ReturnType<typeof io>;

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  timestamp: string;
  isStreaming?: boolean;
}

const ChatPage: React.FC = () => {
  const [socket, setSocket] = useState<SocketType | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAgentTyping]);

  useEffect(() => {
    // Initialize socket connection
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
    const newSocket = io(backendUrl);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    interface AgentMessageData {
      message: string;
      timestamp: string;
    }

    newSocket.on('agent_message', (data: AgentMessageData) => {
      const { message, timestamp } = data;
      setMessages(prev => [...prev, {
        id: uuidv4(),
        content: message,
        sender: 'agent',
        timestamp
      }]);
      setIsAgentTyping(false);
    });

    newSocket.on('agent_typing', (typing: boolean) => {
      setIsAgentTyping(typing);
    });

    interface SocketError {
      message: string;
      [key: string]: any;
    }

    newSocket.on('error', (error: SocketError) => {
      console.error('Socket error:', error);
      setMessages(prev => [...prev, {
        id: uuidv4(),
        content: 'Sorry, there was an error processing your request.',
        sender: 'agent',
        timestamp: new Date().toISOString()
      }]);
      setIsAgentTyping(false);
    });

    setSocket(newSocket);

    // Add welcome message
    setMessages([{
      id: uuidv4(),
      content: `# Welcome to WritingSpecialist! 📝

I'm here to help you with your college essays. I can:

- **Analyze your essays** for structure, content, and style
- **Provide detailed feedback** on personal statements and supplemental essays  
- **Search similar successful essays** from my database
- **Suggest improvements** based on proven techniques
- **Help with brainstorming** essay topics and approaches

Feel free to paste your essay for analysis, or ask me any questions about college writing!`,
      sender: 'agent',
      timestamp: new Date().toISOString()
    }]);

    return () => {
      newSocket.close();
    };
  }, []);

  const sendMessage = () => {
    if (!inputMessage.trim() || !socket || !isConnected) return;

    const userMessage: Message = {
      id: uuidv4(),
      content: inputMessage,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    
    socket.emit('user_message', {
      message: inputMessage,
      sessionId
    });

    setInputMessage('');
    setIsAgentTyping(true);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="header-content">
          <h1>WritingSpecialist</h1>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </header>

      <div className="chat-container">
        <div className="messages-container">
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.sender}`}>
              <div className="message-content">
                {message.sender === 'agent' ? (
                  <div className="markdown-content">
                    <ReactMarkdown
                      components={{
                        // Custom components for better styling
                        h1: ({ children }) => <h1 className="markdown-h1">{children}</h1>,
                        h2: ({ children }) => <h2 className="markdown-h2">{children}</h2>,
                        h3: ({ children }) => <h3 className="markdown-h3">{children}</h3>,
                        p: ({ children }) => <p className="markdown-p">{children}</p>,
                        ul: ({ children }) => <ul className="markdown-ul">{children}</ul>,
                        ol: ({ children }) => <ol className="markdown-ol">{children}</ol>,
                        li: ({ children }) => <li className="markdown-li">{children}</li>,
                        strong: ({ children }) => <strong className="markdown-strong">{children}</strong>,
                        code: ({ children }) => <code className="markdown-code">{children}</code>,
                        pre: ({ children }) => <pre className="markdown-pre">{children}</pre>
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="user-message-text">{message.content}</div>
                )}
              </div>
              <div className="message-timestamp">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
          
          {isAgentTyping && (
            <div className="message agent typing">
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <div className="input-wrapper">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here... (Shift+Enter for new line)"
              className="message-input"
              disabled={!isConnected}
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || !isConnected || isAgentTyping}
              className="send-button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22,2 15,22 11,13 2,9"></polygon>
              </svg>
            </button>
          </div>
          
          <div className="input-footer">
            <small>
              💡 Try: "Analyze my essay", "Show me examples about identity", or "Help me improve my conclusion"
            </small>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;