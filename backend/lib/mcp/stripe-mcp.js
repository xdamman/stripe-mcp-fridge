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
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const request = {
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now(),
    };

    const response = await fetch(STRIPE_MCP_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MCP server error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(`MCP error: ${data.error.message} (code: ${data.error.code})`);
    }

    return data;
}

/**
 * Lists all available tools from Stripe MCP server
 * @returns {Promise<Array>} Array of MCP tool definitions
 */
async function listStripeMCPTools() {
    const response = await callStripeMCP('tools/list');
    return response.result?.tools || [];
}

/**
 * Calls a specific tool on Stripe MCP server
 * @param {string} name - Tool name (e.g., 'create_customer', 'retrieve_balance')
 * @param {Record<string, any>} arguments_ - Tool arguments
 * @returns {Promise<any>} Tool execution result
 */
async function callStripeMCPTool(name, arguments_) {
    const response = await callStripeMCP('tools/call', {
        name,
        arguments: arguments_,
    });

    return response.result;
}

module.exports = {
    listStripeMCPTools,
    callStripeMCPTool,
};

