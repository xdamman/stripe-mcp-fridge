/**
 * Stripe MCP Client
 *
 * HTTP client for connecting to Stripe's MCP server at https://mcp.stripe.com
 * Uses JSON-RPC 2.0 protocol for communication.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const STRIPE_MCP_URL = 'https://mcp.stripe.com/';

// ============================================================================
// MCP CLIENT
// ============================================================================

/**
 * Calls Stripe MCP server with JSON-RPC 2.0
 * @param {string} method - MCP method name (e.g., 'tools/list', 'tools/call')
 * @param {any} params - Method parameters
 * @returns {Promise<any>} MCP server response
 */
async function callStripeMCP(method, params) {
    const startTime = Date.now();
    console.log(`[MCP] Calling ${method}...`);
    
    if (!process.env.STRIPE_SECRET_KEY) {
        console.error('[MCP] ERROR: STRIPE_SECRET_KEY is not configured');
        console.error('[MCP] Available env vars:', Object.keys(process.env).filter(k => k.includes('STRIPE') || k.includes('DAT1')));
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    
    // Log key format (first few chars only for security)
    const keyPrefix = process.env.STRIPE_SECRET_KEY.substring(0, 7);
    const keyLength = process.env.STRIPE_SECRET_KEY.length;
    console.log(`[MCP] Using Stripe key: ${keyPrefix}... (length: ${keyLength})`);
    
    // Validate key format (Stripe keys typically start with sk_)
    if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
        console.warn('[MCP] WARNING: Stripe key does not start with "sk_" - this might be incorrect');
    }

    const request = {
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now(),
    };

    console.log(`[MCP] Request to ${STRIPE_MCP_URL}:`, {
        method,
        params: params ? JSON.stringify(params).substring(0, 200) : 'none',
        requestId: request.id
    });

    try {
        const response = await fetch(STRIPE_MCP_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            },
            body: JSON.stringify(request),
        });

        const elapsed = Date.now() - startTime;
        console.log(`[MCP] Response received for ${method} (${elapsed}ms):`, {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[MCP] ERROR: Server returned ${response.status}:`, errorText.substring(0, 500));
            throw new Error(`MCP server error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const totalElapsed = Date.now() - startTime;
        console.log(`[MCP] Successfully completed ${method} (${totalElapsed}ms)`);

        if (data.error) {
            console.error(`[MCP] ERROR in response:`, data.error);
            throw new Error(`MCP error: ${data.error.message} (code: ${data.error.code})`);
        }

        return data;
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[MCP] Exception calling ${method} (${elapsed}ms):`, error.message);
        throw error;
    }
}

/**
 * Lists all available tools from Stripe MCP server
 * @returns {Promise<Array>} Array of MCP tool definitions
 */
async function listStripeMCPTools() {
    console.log('[MCP] Listing Stripe MCP tools...');
    const startTime = Date.now();
    try {
        const response = await callStripeMCP('tools/list');
        const tools = response.result?.tools || [];
        const elapsed = Date.now() - startTime;
        console.log(`[MCP] Found ${tools.length} tools (${elapsed}ms)`);
        return tools;
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[MCP] Failed to list tools (${elapsed}ms):`, error.message);
        throw error;
    }
}

/**
 * Calls a specific tool on Stripe MCP server
 * @param {string} name - Tool name (e.g., 'create_customer', 'retrieve_balance')
 * @param {Record<string, any>} arguments_ - Tool arguments
 * @returns {Promise<any>} Tool execution result
 */
async function callStripeMCPTool(name, arguments_) {
    console.log(`[MCP] Calling tool: ${name}`, {
        arguments: arguments_ ? JSON.stringify(arguments_).substring(0, 200) : 'none'
    });
    const startTime = Date.now();
    try {
        const response = await callStripeMCP('tools/call', {
            name,
            arguments: arguments_,
        });
        const elapsed = Date.now() - startTime;
        console.log(`[MCP] Tool ${name} completed (${elapsed}ms)`);
        return response.result;
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[MCP] Tool ${name} failed (${elapsed}ms):`, error.message);
        throw error;
    }
}

module.exports = {
    listStripeMCPTools,
    callStripeMCPTool,
};

