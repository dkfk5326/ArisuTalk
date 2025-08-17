const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiClient {
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.model = model;
    }

    async generateContent({ userName, userDescription, character, history, prompts, isProactive = false, forceSummary = false }) {
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

        const masterPrompt = `
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

        const payload = {
            contents: contents,
            systemInstruction: {
                parts: [{ text: masterPrompt }]
            },
            generationConfig: {
                temperature: 1.25,
                topK: 40,
                topP: 0.95,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "reactionDelay": { "type": "INTEGER" },
                        "messages": {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    "delay": { "type": "INTEGER" },
                                    "content": { "type": "STRING" },
                                    "sticker": { "type": "STRING" }
                                },
                                required: ["delay"]
                            }
                        },
                        "newMemory": { "type": "STRING" }
                    },
                    required: ["reactionDelay", "messages"]
                }
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
        };

        try {
            const response = await fetch(`${API_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("API Error:", data);
                const errorMessage = data?.error?.message || `API 요청 실패: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts[0]?.text) {
                const rawResponseText = data.candidates[0].content.parts[0].text;
                const parsed = JSON.parse(rawResponseText);
                parsed.reactionDelay = Math.max(0, parsed.reactionDelay || 0);
                return parsed;
            } else {
                const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || '알 수 없는 이유';
                console.warn("API 응답에 유효한 content가 없습니다.", data);
                throw new Error(`답변이 생성되지 않았습니다. (이유: ${reason})`);
            }

        } catch (error) {
            console.error("Gemini API 호출 중 오류 발생:", error);
            if (error.message.includes("User location is not supported")) {
                return { error: `죄송합니다. 현재 계신 국가에서는 Gemini API 사용이 지원되지 않습니다.` };
            }
            return { error: `응답 처리 중 오류가 발생했습니다: ${error.message}` };
        }
    }

    async generateProfile({ userName, userDescription, profileCreationPrompt }) {
        const profilePrompt = profileCreationPrompt
            .replace('{userName}', userName)
            .replace('{userDescription}', userDescription);


        const payload = {
            contents: [{
                parts: [{ text: "Please generate a character profile based on the instructions." }]
            }],
            systemInstruction: {
                parts: [{ text: profilePrompt }]
            },
            generationConfig: {
                temperature: 1.2,
                topP: 0.95,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "name": { "type": "STRING" },
                        "prompt": { "type": "STRING" }
                    },
                    required: ["name", "prompt"]
                }
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
        };

        try {
            const response = await fetch(`${API_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("Profile Gen API Error:", data);
                const errorMessage = data?.error?.message || `API 요청 실패: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts[0]?.text) {
                return JSON.parse(data.candidates[0].content.parts[0].text);
            } else {
                const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || '알 수 없는 이유';
                console.warn("Profile Gen API 응답에 유효한 content가 없습니다.", data);
                throw new Error(`프로필이 생성되지 않았습니다. (이유: ${reason})`);
            }
        } catch (error) {
            console.error("프로필 생성 API 호출 중 오류 발생:", error);
            return { error: error.message };
        }
    }
}