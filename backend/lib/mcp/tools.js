/**
 * MCP Tools - Tool Definitions and Conversion
 *
 * Fetches tool definitions from Stripe MCP server and converts them
 * to OpenAI-compatible format for use with dat1 API.
 */

const { listStripeMCPTools } = require('./stripe-mcp');

// ============================================================================
// TOOL CACHE
// ============================================================================

let cachedTools = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ============================================================================
// TOOL CONVERSION
// ============================================================================

/**
 * Converts MCP tool schema to OpenAI tool format
 * @param {any} mcpTool - MCP tool definition
 * @returns {any} OpenAI-compatible tool definition
 */
function convertMCPToolToOpenAI(mcpTool) {
    return {
        type: 'function',
        function: {
            name: mcpTool.name,
            description: mcpTool.description || `Execute ${mcpTool.name} on Stripe`,
            parameters: (mcpTool.inputSchema && typeof mcpTool.inputSchema === 'object')
                ? {
                    type: mcpTool.inputSchema.type || 'object',
                    properties: (mcpTool.inputSchema.properties) || {},
                    required: mcpTool.inputSchema.required,
                }
                : {
                    type: 'object',
                    properties: {},
                },
        },
    };
}

/**
 * Fetches tools from Stripe MCP server and converts to OpenAI format
 * Uses caching to avoid repeated API calls
 * @param {boolean} forceRefresh - Force refresh of cached tools
 * @returns {Promise<Array>} Array of OpenAI-compatible tool definitions
 */
async function getStripeTools(forceRefresh = false) {
    const now = Date.now();

    // Return cached tools if still valid
    if (
        !forceRefresh &&
        cachedTools !== null &&
        now - cacheTimestamp < CACHE_TTL
    ) {
        return cachedTools;
    }

    try {
        const mcpTools = await listStripeMCPTools();
        cachedTools = mcpTools.map(convertMCPToolToOpenAI);
        cacheTimestamp = now;
        return cachedTools;
    } catch (error) {
        // If fetch fails and we have cached tools, return cache
        if (cachedTools !== null) {
            console.warn('Failed to fetch tools from MCP, using cache:', error);
            return cachedTools;
        }
        throw error;
    }
}

/**
 * Clears the tool cache
 */
function clearToolCache() {
    cachedTools = null;
    cacheTimestamp = 0;
}

module.exports = {
    getStripeTools,
    clearToolCache,
};

