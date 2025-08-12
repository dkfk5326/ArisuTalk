class ApiClient {
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.model = model;
        this.API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    }

    async callGeminiAPI(contents, character, user, imageToSend = null) {
        if (!this.apiKey) {
            throw new Error("API Key is not set. Please set it in the settings.");
        }

        const requestBody = {
            contents: contents,
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ],
        };

        if (character.prompts?.main) {
            requestBody.systemInstruction = { parts: [{ text: character.prompts.main }] };
        }

        if (imageToSend) {
            const imagePart = {
                inlineData: {
                    mimeType: imageToSend.mimeType,
                    data: imageToSend.dataUrl.split(",")[1],
                },
            };
            requestBody.contents[requestBody.contents.length - 1].parts.unshift(imagePart);
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/models/${this.model}:generateContent?key=${this.apiKey}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(requestBody),
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                console.error("API Error:", errorData);
                throw new Error(
                    `API request failed: ${errorData.error?.message || response.statusText}`
                );
            }

            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            throw error;
        }
    }
}

export default ApiClient;


