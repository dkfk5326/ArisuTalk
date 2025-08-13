export const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

export const resizeImage = (file, maxWidth, maxHeight) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8)); // Use JPEG for smaller size
        };
        img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
});

export const encodeTextInImage = (imageData, text) => {
    const data = imageData.data;
    const textBytes = new TextEncoder().encode(text);
    const textLength = textBytes.length;
    const headerSizeInPixels = 8;

    const availableDataPixels = (data.length / 4) - headerSizeInPixels;

    if (textLength > availableDataPixels) {
        console.error(`Image is too small. Required: ${textLength}, Available: ${availableDataPixels}`);
        // showInfoModal(language.modal.imageTooSmallOrCharacterInfoTooLong.title,
        //     language.modal.imageTooSmallOrCharacterInfoTooLong.message);
        return null;
    }

    data[3] = 0x50; data[7] = 0x43; data[11] = 0x41; data[15] = 0x52;
    data[19] = (textLength >> 24) & 0xFF;
    data[23] = (textLength >> 16) & 0xFF;
    data[27] = (textLength >> 8) & 0xFF;
    data[31] = textLength & 0xFF;

    for (let i = 0; i < textLength; i++) {
        data[(headerSizeInPixels + i) * 4 + 3] = textBytes[i];
    }
    return imageData;
};

export const decodeTextFromImage = (imageData) => {
    const data = imageData.data;
    const headerSizeInPixels = 8;

    if (data[3] !== 0x50 || data[7] !== 0x43 || data[11] !== 0x41 || data[15] !== 0x52) {
        return null;
    }

    const textLength = (data[19] << 24) | (data[23] << 16) | (data[27] << 8) | data[31];

    if (textLength <= 0 || textLength > (data.length / 4) - headerSizeInPixels) {
        return null;
    }

    const textBytes = new Uint8Array(textLength);
    for (let i = 0; i < textLength; i++) {
        textBytes[i] = data[(headerSizeInPixels + i) * 4 + 3];
    }

    try {
        return new TextDecoder().decode(textBytes);
    } catch (e) {
        return null;
    }
};

export const handleSaveCharacterToImage = async (setState, editingCharacter, language, encodeTextInImage) => {
    const name = document.getElementById('character-name').value.trim();
    if (!name) {
        showInfoModal(setState, language.modal.characterCardNoNameError.title, language.modal.characterCardNoNameError.message);
        return;
    }
    const currentAvatar = editingCharacter?.avatar;
    if (!currentAvatar) {
        showInfoModal(setState, language.modal.characterCardNoAvatarImageError.title, language.modal.characterCardNoAvatarImageError.message);
        return;
    }

    const memoryNodes = document.querySelectorAll('.memory-input');
    const memories = Array.from(memoryNodes).map(input => input.value.trim()).filter(Boolean);

    const proactiveToggle = document.getElementById('character-proactive-toggle');
    const proactiveEnabled = proactiveToggle ? proactiveToggle.checked : editingCharacter?.proactiveEnabled !== false;

    const characterData = {
        name: name,
        prompt: document.getElementById('character-prompt').value.trim(),
        responseTime: document.getElementById('character-responseTime').value,
        thinkingTime: document.getElementById('character-thinkingTime').value,
        reactivity: document.getElementById('character-reactivity').value,
        tone: document.getElementById('character-tone').value,
        source: 'PersonaChatAppCharacterCard',
        memories: memories,
        proactiveEnabled: proactiveEnabled,
    };

    const image = new Image();
    image.crossOrigin = "Anonymous";
    image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const jsonString = JSON.stringify(characterData);

        const newImageData = encodeTextInImage(imageData, jsonString);

        if (newImageData) {
            ctx.putImageData(newImageData, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${characterData.name}_card.png`;
            link.click();
        }
    };
    image.onerror = () => showInfoModal(setState, language.modal.avatarImageLoadError.title, language.modal.avatarImageLoadError.message);
    image.src = currentAvatar;
};

export const loadCharacterFromImage = async (setState, editingCharacter, language, decodeTextFromImage, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageSrc = e.target.result;
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            try {
                const jsonString = decodeTextFromImage(imageData);
                if (jsonString) {
                    const data = JSON.parse(jsonString);
                    if (data.source === 'PersonaChatAppCharacterCard') {
                        setState({
                            editingCharacter: { ...editingCharacter, ...data, avatar: imageSrc }
                        });
                        showInfoModal(setState, language.modal.avatarLoadSuccess.title, language.modal.avatarLoadSuccess.message);
                        return;
                    }
                }
            } catch (err) {
                console.error("Failed to parse character data from image:", err);
            }

            showInfoModal(setState, language.modal.characterCardNoAvatarImageInfo.title, language.modal.characterCardNoAvatarImageInfo.message);

            setState({ editingCharacter: { ...(editingCharacter || {}), avatar: imageSrc } });
        };
        image.src = imageSrc;
    };
    reader.readAsDataURL(file);
};