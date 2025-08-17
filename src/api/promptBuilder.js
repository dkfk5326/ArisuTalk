/**
 * This module is responsible for building the prompts for the Gemini API.
 * It separates the logic of prompt construction from the API client,
 * allowing for easier management and testing of the prompt engineering aspects.
 */

/**
 * Builds the contents and system prompt for a content generation request.
 * @param {object} params - The parameters for building the prompt.
 * @param {string} params.userName - The user's name.
 * @param {string} params.userDescription - The user's description.
 * @param {object} params.character - The character object.
 * @param {Array<object>} params.history - The conversation history.
 * @param {object} params.prompts - The prompt templates.
 * @param {boolean} [params.isProactive=false] - Whether the AI is initiating the conversation.
 * @param {boolean} [params.forceSummary=false] - Whether to force a memory summary.
 * @returns {{contents: Array<object>, systemPrompt: string}} - The generated contents and system prompt.
 */
export function buildContentPrompt({ userName, userDescription, character, history, prompts, isProactive = false, forceSummary = false }) {
    let contents = [];
    for (const msg of history) {
        const role = msg.isMe ? "user" : "model";
        let parts = [];

        if (msg.isMe && msg.type === 'image' && msg.imageId) {
            const imageData = character?.media?.find(m => m.id === msg.imageId);
            if (imageData) {
                let textContent = msg.content || "(User sent an image with no caption)";
                parts.push({ text: textContent });
                parts.push({
                    inlineData: {
                        mimeType: imageData.mimeType || 'image/jpeg',
                        data: imageData.dataUrl.split(',')[1]
                    }
                });
            } else {
                parts.push({ text: msg.content || "(User sent an image that is no longer available)" });
            }
        } else if (msg.isMe && msg.type === 'sticker' && msg.stickerData) {
            // 페르소나 스티커: 스티커 이름만 AI에게 전송 (파일 데이터는 전송하지 않음)
            const stickerName = msg.stickerData.stickerName || 'Unknown Sticker';
            let stickerText = `[사용자가 "${stickerName}" 스티커를 보냄]`
            if (msg.content && msg.content.trim()) {
                stickerText += ` ${msg.content}`;
            }
            parts.push({ text: stickerText });
        } else if (msg.content) {
            parts.push({ text: msg.content });
        }

        if (parts.length > 0) {
            contents.push({ role, parts });
        }
    }

    if (isProactive && contents.length === 0) {
        contents.push({
            role: "user",
            parts: [{ text: "(SYSTEM: You are starting this conversation. Please begin.)" }]
        });
    }

    const lastMessageTime = history.length > 0 ? new Date(history[history.length - 1].id) : new Date();
    const currentTime = new Date();
    const timeDiff = Math.round((currentTime - lastMessageTime) / 1000 / 60);

    let timeContext = `(Context: It's currently ${currentTime.toLocaleString('en-US')}.`;
    if (isProactive) {
        const isFirstContactEver = history.length === 0;
        if (character.isRandom && isFirstContactEver) {
            timeContext += ` You are initiating contact for the very first time. You found the user's profile interesting and decided to reach out. Your first message MUST reflect this. Greet them and explain why you're contacting them, referencing their persona. This is a special instruction just for this one time.)`;
        } else if (isFirstContactEver) {
            timeContext += ` You are starting this conversation for the first time. Greet the user and start a friendly conversation.)`;
        } else {
            timeContext += ` It's been ${timeDiff} minutes since the conversation paused. You MUST initiate a new conversation topic. Ask a question or make an observation completely unrelated to the last few messages. Your goal is to re-engage the user with something fresh. Do not continue the previous train of thought.)`;
        }
    } else {
        if (history.length > 0) {
            timeContext += ` The last message was sent ${timeDiff} minutes ago.)`;
        } else {
            timeContext += ` This is the beginning of the conversation.)`;
        }
    }
    if (forceSummary) {
        timeContext += ` (summarize_memory: true)`;
    }

    const mainPrompts = prompts.main;
    
    // 스티커 정보 준비
    const availableStickers = character.stickers?.map(sticker => `${sticker.id} (${sticker.name})`).join(', ') || 'none';
    
    const guidelines = [
        mainPrompts.memory_generation,
        mainPrompts.character_acting,
        mainPrompts.message_writing,
        mainPrompts.language,
        mainPrompts.additional_instructions,
        mainPrompts.sticker_usage?.replace('{availableStickers}', availableStickers) || ''
    ].join('\n\n');

    const systemPrompt = `
# System Rules
${mainPrompts.system_rules}

## Role and Objective of Assistant
${mainPrompts.role_and_objective.replace(/{character.name}/g, character.name)}

## Informations
The information is composed of the settings and memories of ${character.name}, <user>, and the worldview in which they live.

# User Profile
Information of <user> that user will play.
- User's Name: ${userName || 'Not specified. You can ask.'}
- User's Description: ${userDescription || 'No specific information provided about the user.'}

# Character Profile & Additional Information
This is the information about the character, ${character.name}, you must act.
Settings of Worldview, features, and Memories of ${character.name} and <user>, etc.
${character.prompt}

# Memory
This is a list of key memories the character has. Use them to maintain consistency and recall past events.
${character.memories && character.memories.length > 0 ? character.memories.map(mem => `- ${mem}`).join('\n') : 'No specific memories recorded yet.'}

# Character Personality Sliders (1=Left, 10=Right)
- 응답시간 (${character.responseTime}/10): "거의 즉시" <-> "전화를 걸어야함". This is the character's general speed to check the user's message. This MUST affect your 'reactionDelay' value. A low value means very fast replies (e.g., 50-2000ms). A high value means very slow replies (e.g., 30000-180000ms), as if busy.
- 생각 시간 (${character.thinkingTime}/10): "사색에 잠김" <-> "메시지를 보내고 생각". This is how long the character thinks before sending messages. This MUST affect the 'delay' value in the 'messages' array. A low value (e.g., 1) means longer, more thoughtful delays (e.g., 30000-90000ms, as if deep in thought). A high value (e.g., 10) means short, impulsive delays (e.g., 500-2000ms, as if sending messages without much thought).
- 반응성 (${character.reactivity}/10): "활발한 JK 갸루" <-> "무뚝뚝함". This is how actively the character engages in conversation. This affects your energy level, engagement, and tendency to start a conversation (proactive chat).
- 어조/말투 (${character.tone}/10): "공손하고 예의바름" <-> "싸가지 없음". This is the character's politeness and language style. A low value means polite and gentle. A high value means rude and blunt.
*These are general tendencies. Adapt to the situation.*

# Sticker Collection
${character.stickers && character.stickers.length > 0 ? 
  `${character.name} has access to the following stickers that can be used to express emotions and reactions:
${character.stickers.map(sticker => `- ${sticker.id}: "${sticker.name}" (${sticker.type})`).join('\n')}

## Sticker Usage
${mainPrompts.sticker_usage?.replace('{character.name}', character.name).replace('{availableStickers}', availableStickers) || ''}` : 
  `${character.name} has no stickers available. Use only text-based expressions.`}

I read all Informations carefully. First, let's remind my Guidelines again.

[## Guidelines]
${guidelines.replace(/{character.name}/g, character.name).replace('{timeContext}', timeContext).replace('{timeDiff}', timeDiff)}
            `;
    
    return { contents, systemPrompt };
}


/**
 * Builds the system prompt and contents for a profile generation request.
 * @param {object} params - The parameters for building the prompt.
 * @param {string} params.userName - The user's name.
 * @param {string} params.userDescription - The user's description.
 * @param {string} params.profileCreationPrompt - The template for creating the profile.
 * @returns {{systemPrompt: string, contents: Array<object>}} - The generated system prompt and contents.
 */
export function buildProfilePrompt({ userName, userDescription, profileCreationPrompt }) {
    const systemPrompt = profileCreationPrompt
        .replace('{userName}', userName)
        .replace('{userDescription}', userDescription);

    const contents = [{
        role: "user",
        parts: [{ text: "Please generate a character profile based on the instructions." }]
    }];

    return { systemPrompt, contents };
}
