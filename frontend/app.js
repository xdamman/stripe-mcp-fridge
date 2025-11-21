// Configuration
const API_BASE_URL = 'http://localhost:3000';

// State management
const state = {
    messages: []
};

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');

// Event Listeners
sendButton.addEventListener('click', handleSendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
});

// Initialize chat
window.addEventListener('load', () => {
    addBotMessage("👋 Welcome! I can help you with Stripe operations using MCP tools.\n\nTry asking me to:\n• Check your Stripe balance\n• Create a customer\n• List products\n• Or any other Stripe operation!");
});

// Message handling
function handleSendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    addUserMessage(message);
    userInput.value = '';
    sendButton.disabled = true;

    // Show typing indicator
    const typingId = showTypingIndicator();

    // Process message
    processMessage(message, typingId);
}

async function processMessage(message, typingId) {
    // Add user message to history
    const userMessage = { role: 'user', content: message };
    state.messages.push(userMessage);

    try {
        const response = await fetch(`${API_BASE_URL}/api/chat-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: state.messages })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        removeTypingIndicator(typingId);

        // Create assistant message element
        const assistantMessageId = 'msg-' + Date.now();
        const assistantMessageDiv = createAssistantMessage(assistantMessageId);
        chatMessages.appendChild(assistantMessageDiv);
        scrollToBottom();

        // Read streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            throw new Error('Response body is not readable');
        }

        let accumulatedContent = '';
        let finalData = null;

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            // Decode the chunk and parse SSE format
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);

                    // Check for stream end marker
                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;

                        if (content) {
                            accumulatedContent += content;
                            // Update the assistant message with accumulated content
                            updateAssistantMessage(assistantMessageId, accumulatedContent);
                        }

                        // Capture final data chunk that may contain timing info
                        if (parsed.usage || parsed.timings) {
                            finalData = parsed;
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }

        // Add timing info if available
        if (finalData) {
            const timings = finalData.timings;
            const usage = finalData.usage;
            let metaInfo = '';

            if (timings) {
                const promptTime = timings.prompt_ms?.toFixed(0) || '0';
                const predictTime = timings.predicted_ms?.toFixed(0) || '0';
                const tokensPerSec = timings.predicted_per_second?.toFixed(1) || '0';
                metaInfo = `Prompt: ${promptTime}ms | Generation: ${predictTime}ms | Speed: ${tokensPerSec} tok/s`;

                if (usage) {
                    metaInfo += ` | Tokens: ${usage.total_tokens}`;
                }
            }

            if (metaInfo) {
                updateAssistantMessageMeta(assistantMessageId, metaInfo);
            }
        }

        // Add assistant message to history
        state.messages.push({ role: 'assistant', content: accumulatedContent });

    } catch (error) {
        console.error('Chat error:', error);
        removeTypingIndicator(typingId);
        addBotMessage("❌ Sorry, I'm having trouble connecting to the server. Make sure the backend is running on port 3000.");
    } finally {
        sendButton.disabled = false;
        userInput.focus();
    }
}

// UI Helper Functions
function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-user';
    messageDiv.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function addBotMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-bot';
    
    // Parse markdown if marked library is available
    let content;
    if (typeof marked !== 'undefined') {
        content = marked.parse(text);
    } else {
        // Fallback: escape HTML and convert newlines to <br>
        content = escapeHtml(text).replace(/\n/g, '<br>');
    }
    
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function createAssistantMessage(id) {
    const messageDiv = document.createElement('div');
    messageDiv.id = id;
    messageDiv.className = 'message message-bot';
    messageDiv.innerHTML = '<div class="message-content"></div>';
    return messageDiv;
}

function updateAssistantMessage(id, content) {
    const messageDiv = document.getElementById(id);
    if (!messageDiv) return;

    // Parse markdown if marked library is available
    let formattedContent;
    if (typeof marked !== 'undefined') {
        formattedContent = marked.parse(content);
    } else {
        // Fallback: escape HTML and convert newlines to <br>
        formattedContent = escapeHtml(content).replace(/\n/g, '<br>');
    }

    const contentDiv = messageDiv.querySelector('.message-content');
    if (contentDiv) {
        contentDiv.innerHTML = formattedContent;
    }
    scrollToBottom();
}

function updateAssistantMessageMeta(id, metaInfo) {
    const messageDiv = document.getElementById(id);
    if (!messageDiv) return;

    let metaDiv = messageDiv.querySelector('.message-meta');
    if (!metaDiv) {
        metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';
        messageDiv.appendChild(metaDiv);
    }
    metaDiv.textContent = metaInfo;
}

function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.id = id;
    typingDiv.className = 'message message-bot';
    typingDiv.innerHTML = `
        <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

