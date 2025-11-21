# Stripe MCP Chat - Simplified

A simplified chat interface demonstrating integration with the dat1 predeployed gpt-oss-120b model and Stripe MCP (Model Context Protocol) server. The AI agent can execute Stripe operations like retrieving balance, creating customers, managing products, and more through natural language conversations.

This is a simplified version using vanilla HTML/JavaScript frontend and a simple Express backend - no frameworks, no build step, just simple files.

## Setup

1. Install dependencies:
```bash
cd backend
npm install
```

2. Copy `backend/.env.example` to `backend/.env` and add your API keys:
```bash
cp backend/.env.example backend/.env
# Then edit backend/.env with your actual keys
```

**Note:** For Stripe MCP, we recommend using a [restricted API key](https://docs.stripe.com/keys#create-restricted-api-secret-key) to limit access to only the functionality your agent requires.

3. Start the server:
```bash
cd backend
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
stripe-agentic-payments-hackathon-mcp-demo/
├── frontend/
│   ├── index.html          # Simple HTML frontend
│   ├── app.js              # Vanilla JavaScript chat interface
│   └── styles.css          # Simple CSS styles
├── backend/
│   ├── server.js           # Express backend with streaming API
│   ├── package.json
│   └── lib/
│       └── mcp/
│           ├── stripe-mcp.js  # Stripe MCP HTTP client
│           └── tools.js        # Tool definitions and conversion
└── README.md
```

## What It Does

- Simple chat interface with real-time streaming responses
- Integrates with Stripe MCP to execute Stripe operations
- Shows performance metrics including prompt time, generation speed, and token count
- No build step required - just run the server and open the HTML file

## How It Works

1. User sends a message through the chat interface
2. Frontend sends request to `/api/chat-stream` endpoint
3. Backend fetches available Stripe MCP tools and includes them in the request
4. Backend streams the response from dat1 API to the frontend
5. If the AI requests a Stripe tool, the backend executes it via MCP
6. Tool results are sent back to the AI for final response
7. Frontend displays the streaming response in real-time

## Model

This app uses the dat1 predeployed gpt-oss-120b model at:
`https://api.dat1.co/api/v1/collection/gpt-120-oss/invoke-chat`

## Example Queries

- "Check my Stripe balance"
- "Create a customer named John Doe with email john@example.com"
- "List my products"
- "What's my account status?"

