import { showInfoModal } from './modalManager.js';

/**
 * Converts a File object to a Base64-encoded string.
 *
 * @param {File} file - The file to convert.
 * @returns {Promise<string>} A promise that resolves with the Base64-encoded string representation of the file.
 */
export async function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

/**
 * Resizes an image file to fit within the specified maximum width and height, preserving aspect ratio.
 * Returns a Promise that resolves to a JPEG data URL of the resized image.
 *
 * @param {File} file - The image file to resize.
 * @param {number} maxWidth - The maximum width of the resized image.
 * @param {number} maxHeight - The maximum height of the resized image.
 * @returns {Promise<string>} A Promise that resolves to a data URL (JPEG format) of the resized image.
 */
export async function resizeImage(file, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
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
}

/**
 * Encodes a given text string into the alpha channel of an image's pixel data.
 * The function reserves the first 8 pixels for a header containing a magic number and the length of the text.
 * Each subsequent pixel's alpha channel stores one byte of the encoded text.
 *
 * @param {ImageData} imageData - The ImageData object whose pixel data will be modified.
 * @param {string} text - The text string to encode into the image.
 * @returns {ImageData?} The modified ImageData with the encoded text, or null if the image is too small.
 */
export function encodeTextInImage(imageData, text) {
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
}

/**
 * Decodes embedded text from image pixel data.
 *
 * This function expects the image data to contain a specific header signature
 * and a length field, followed by the text bytes stored in the alpha channel
 * of each pixel. If the header or length is invalid, it returns null.
 *
 * @param {ImageData} imageData - The ImageData object containing pixel data.
 * @returns {string?} The decoded text if successful, or null if decoding fails.
 */
export function decodeTextFromImage(imageData) {
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
}

/**
 * Saves a character's data encoded into an avatar image as a PNG file.
 * Displays modal dialogs for error handling (missing name, missing avatar, image load failure).
 *
 * @param {Function} setState - Function to update application state, typically for showing modals.
 * @param {Object} characterData - The character data to encode into the image.
 * @param {Object} language - Localization object containing modal dialog texts.
 * @param {Function} encodeTextInImage - Function that encodes a string into ImageData and returns new ImageData.
 *
 * @returns {void} Resolves when the image is saved or an error modal is shown.
 */
export function handleSaveCharacterToImage(setState, characterData, language, encodeTextInImage) {
    if (!characterData.name) {
        showInfoModal(setState, language.modal.characterCardNoNameError.title, language.modal.characterCardNoNameError.message);
        return;
    }
    const currentAvatar = characterData.avatar;
    if (!currentAvatar) {
        showInfoModal(setState, language.modal.characterCardNoAvatarImageError.title, language.modal.characterCardNoAvatarImageError.message);
        return;
    }

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
}

export async function loadCharacterFromImage(setState, editingCharacter, language, decodeTextFromImage, file) {
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
                    if (data.source === SourceTypes.CHARACTER_CARD) {
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
}