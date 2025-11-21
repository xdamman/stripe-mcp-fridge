/**
 * Simple Express server for Stripe MCP Chat
 * 
 * Provides streaming chat API with Stripe MCP tool integration
 */

// Load environment variables from .env file if available
try {
    require('dotenv').config();
    console.log('[Config] dotenv loaded');
} catch (e) {
    console.warn('[Config] dotenv not available:', e.message);
}

// Log environment variable status (without exposing values)
console.log('[Config] Environment check:', {
    hasDat1Key: !!process.env.DAT1_API_KEY,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    dat1KeyLength: process.env.DAT1_API_KEY ? process.env.DAT1_API_KEY.length : 0,
    stripeKeyLength: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.length : 0,
    stripeKeyPrefix: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) : 'missing'
});

const path = require('path');
const express = require('express');
const cors = require('cors');
const { getStripeTools } = require('./lib/mcp/tools');
const { callStripeMCPTool } = require('./lib/mcp/stripe-mcp');

// ============================================================================
// CONSTANTS
// ============================================================================

const DAT1_API_URL = 'https://api.dat1.co/api/v1/collection/gpt-120-oss/invoke-chat';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 5000;
const PORT = process.env.PORT || 3000;

// ============================================================================
// SERVER SETUP
// ============================================================================

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parses SSE chunk and extracts JSON data
 */
function parseSSEChunk(chunk) {
    const lines = chunk.split('\n');
    
    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
                return null;
            }

            try {
                return JSON.parse(data);
            } catch (e) {
                continue;
            }
        }
    }

    return null;
}

/**
 * Executes a tool call via Stripe MCP
 */
async function executeToolCall(toolName, toolArguments) {
    console.log(`[ToolCall] Executing ${toolName}`, {
        argumentsLength: toolArguments ? toolArguments.length : 0
    });
    const startTime = Date.now();
    try {
        let parsedArgs = {};
        
        if (toolArguments) {
            try {
                parsedArgs = JSON.parse(toolArguments);
                console.log(`[ToolCall] Parsed arguments for ${toolName}`);
            } catch (parseError) {
                console.error(`[ToolCall] Failed to parse arguments for ${toolName}:`, parseError.message);
                throw new Error(`Invalid tool arguments JSON: ${parseError.message}`);
            }
        }

        const result = await callStripeMCPTool(toolName, parsedArgs);
        const elapsed = Date.now() - startTime;
        console.log(`[ToolCall] ${toolName} returned result (${elapsed}ms)`);
        
        // MCP returns result in content array format
        if (result?.content && Array.isArray(result.content)) {
            const textContent = result.content.find((item) => item.type === 'text');
            if (textContent?.text) {
                console.log(`[ToolCall] Extracted text content from ${toolName} result`);
                return textContent.text;
            }
        }

        // Fallback: stringify the entire result
        console.log(`[ToolCall] Returning stringified result for ${toolName}`);
        return JSON.stringify(result);
    } catch (error) {
        const elapsed = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[ToolCall] ${toolName} failed (${elapsed}ms):`, errorMessage);
        return JSON.stringify({ error: errorMessage });
    }
}

/**
 * Makes a streaming request to dat1 API with tool support
 */
async function makeDat1Request(messages, tools, temperature, maxTokens) {
    console.log('[dat1] Making request:', {
        messageCount: messages.length,
        toolCount: tools.length,
        temperature,
        maxTokens
    });
    
    if (!process.env.DAT1_API_KEY) {
        console.error('[dat1] ERROR: DAT1_API_KEY is not configured');
        throw new Error('DAT1_API_KEY is not configured');
    }

    const requestBody = {
        messages,
        temperature,
        stream: true,
        max_tokens: maxTokens,
    };

    // Only include tools if we have any
    if (tools.length > 0) {
        requestBody.tools = tools;
        console.log(`[dat1] Including ${tools.length} tool(s) in request`);
    }

    const startTime = Date.now();
    try {
        const response = await fetch(DAT1_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.DAT1_API_KEY,
            },
            body: JSON.stringify(requestBody),
        });
        const elapsed = Date.now() - startTime;
        console.log(`[dat1] Request completed (${elapsed}ms):`, response.status);
        return response;
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[dat1] Request failed (${elapsed}ms):`, error.message);
        throw error;
    }
}

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * POST /api/chat-stream
 * Streaming chat endpoint with Stripe MCP tool support
 */
app.post('/api/chat-stream', async (req, res) => {
    const requestStartTime = Date.now();
    const { messages } = req.body;
    console.log(`[API] POST /api/chat-stream - ${messages.length} messages`);

    if (!process.env.DAT1_API_KEY) {
        console.error('[API] ERROR: DAT1_API_KEY is not configured');
        return res.status(500).json({ error: 'DAT1_API_KEY is not configured' });
    }

    // Get Stripe tools (cached)
    let tools = [];
    const toolsStartTime = Date.now();
    try {
        console.log('[API] Fetching Stripe tools...');
        tools = await getStripeTools();
        const toolsElapsed = Date.now() - toolsStartTime;
        console.log(`[API] Loaded ${tools.length} Stripe tools (${toolsElapsed}ms)`);
    } catch (error) {
        const toolsElapsed = Date.now() - toolsStartTime;
        console.error(`[API] Failed to fetch Stripe tools (${toolsElapsed}ms):`, error.message);
        // Continue without tools if fetch fails
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const temperature = req.body.temperature || DEFAULT_TEMPERATURE;
    const maxTokens = req.body.max_tokens || DEFAULT_MAX_TOKENS;
    let conversationMessages = [...messages];
    let iterationCount = 0;
    const MAX_ITERATIONS = 10; // Prevent infinite loops

    try {
        while (iterationCount < MAX_ITERATIONS) {
            iterationCount++;
            console.log(`[API] Iteration ${iterationCount}/${MAX_ITERATIONS}`);

            // Make request to dat1 API
            console.log(`[API] Making request to dat1 API with ${conversationMessages.length} messages, ${tools.length} tools`);
            const dat1StartTime = Date.now();
            const response = await makeDat1Request(conversationMessages, tools, temperature, maxTokens);
            const dat1Elapsed = Date.now() - dat1StartTime;
            console.log(`[API] dat1 API response received (${dat1Elapsed}ms):`, response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                res.write(`data: ${JSON.stringify({ error: `dat1 API error: ${errorText}` })}\n\n`);
                res.end();
                return;
            }

            // Process streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                res.write(`data: ${JSON.stringify({ error: 'Response body is not readable' })}\n\n`);
                res.end();
                return;
            }

            let accumulatedContent = '';
            let toolCalls = [];
            let finalData = null;
            let hasToolCalls = false;

            // Read streaming chunks
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const parsed = parseSSEChunk(chunk);

                if (!parsed) {
                    // Forward [DONE] marker
                    if (chunk.includes('[DONE]')) {
                        res.write('data: [DONE]\n\n');
                    }
                    continue;
                }

                // Check for tool calls
                const choice = parsed.choices?.[0];
                if (choice) {
                    // Handle delta (streaming)
                    if (choice.delta) {
                        if (choice.delta.content) {
                            accumulatedContent += choice.delta.content;
                            // Forward content chunks
                            res.write(chunk + '\n');
                        }

                        if (choice.delta.tool_calls) {
                            hasToolCalls = true;
                            for (const toolCall of choice.delta.tool_calls) {
                                const index = toolCall.index ?? 0;
                                if (!toolCalls[index]) {
                                    toolCalls[index] = {
                                        id: toolCall.id || `call_${Date.now()}_${index}`,
                                        type: toolCall.type || 'function',
                                        function: {
                                            name: toolCall.function?.name || '',
                                            arguments: toolCall.function?.arguments || '',
                                        },
                                    };
                                } else {
                                    // Append to existing tool call
                                    toolCalls[index].function.arguments += toolCall.function?.arguments || '';
                                    if (toolCall.id) {
                                        toolCalls[index].id = toolCall.id;
                                    }
                                    if (toolCall.function?.name) {
                                        toolCalls[index].function.name = toolCall.function.name;
                                    }
                                }
                            }
                        }
                    }

                    // Handle complete message (non-streaming tool calls)
                    if (choice.message?.tool_calls) {
                        hasToolCalls = true;
                        toolCalls = choice.message.tool_calls;
                    }

                    // Check finish reason
                    if (choice.finish_reason === 'tool_calls') {
                        hasToolCalls = true;
                    }

                    // Capture final data
                    if (parsed.usage || parsed.timings) {
                        finalData = parsed;
                    }
                }
            }

            // If we have tool calls, execute them
            if (hasToolCalls && toolCalls.length > 0) {
                console.log(`[API] Executing ${toolCalls.length} tool call(s):`, 
                    toolCalls.map(tc => tc.function.name).join(', '));
                
                // Add assistant message with tool calls
                conversationMessages.push({
                    role: 'assistant',
                    content: accumulatedContent || null,
                    tool_calls: toolCalls,
                });

                // Execute all tool calls
                const toolExecutionStartTime = Date.now();
                const toolResults = await Promise.all(
                    toolCalls.map(async (toolCall, index) => {
                        const toolStartTime = Date.now();
                        console.log(`[API] Executing tool ${index + 1}/${toolCalls.length}: ${toolCall.function.name}`);
                        try {
                            const result = await executeToolCall(
                                toolCall.function.name,
                                toolCall.function.arguments
                            );
                            const toolElapsed = Date.now() - toolStartTime;
                            console.log(`[API] Tool ${toolCall.function.name} completed (${toolElapsed}ms)`);
                            return {
                                role: 'tool',
                                content: result,
                                tool_call_id: toolCall.id,
                            };
                        } catch (error) {
                            const toolElapsed = Date.now() - toolStartTime;
                            console.error(`[API] Tool ${toolCall.function.name} failed (${toolElapsed}ms):`, error.message);
                            return {
                                role: 'tool',
                                content: JSON.stringify({ error: error.message }),
                                tool_call_id: toolCall.id,
                            };
                        }
                    })
                );
                const toolExecutionElapsed = Date.now() - toolExecutionStartTime;
                console.log(`[API] All ${toolCalls.length} tool(s) executed (${toolExecutionElapsed}ms)`);

                // Add tool results to messages
                conversationMessages.push(...toolResults);

                // Continue loop to get final response
                console.log(`[API] Continuing to next iteration with ${conversationMessages.length} messages`);
                continue;
            }

            // No tool calls, send final data and close
            const totalElapsed = Date.now() - requestStartTime;
            console.log(`[API] Request completed successfully (${totalElapsed}ms, ${iterationCount} iteration(s))`);
            if (finalData) {
                res.write(`data: ${JSON.stringify(finalData)}\n\n`);
            }

            res.write('data: [DONE]\n\n');
            res.end();
            return;
        }

        // Max iterations reached
        const totalElapsed = Date.now() - requestStartTime;
        console.warn(`[API] Maximum iterations reached (${totalElapsed}ms)`);
        res.write(`data: ${JSON.stringify({ error: 'Maximum iterations reached' })}\n\n`);
        res.end();
    } catch (error) {
        const totalElapsed = Date.now() - requestStartTime;
        console.error(`[API] Error in chat-stream (${totalElapsed}ms):`, error);
        console.error('[API] Error stack:', error.stack);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Make sure DAT1_API_KEY and STRIPE_SECRET_KEY are set in your environment`);
});

