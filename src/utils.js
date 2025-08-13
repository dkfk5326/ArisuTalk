/**
 * Pauses execution for a specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to sleep.
 * @returns {Promise<void>} A promise that resolves after the specified time.
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formats a given Date object into a string with year, month, day, and weekday in Korean locale.
 *
 * @param {Date} date - The date to format.
 * @returns {string} The formatted date string in 'ko-KR' locale.
 */
export function formatDateSeparator(date) {
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    }).format(date);
}

/**
 * @typedef {Object} MessageGroup
 * @property {number} startIndex - The starting index of the message group.
 * @property {number} endIndex - The ending index of the message group.
 * @property {string} firstMessageId - The ID of the first message in the group.
 * @property {string} lastMessageId - The ID of the last message in the group.
 */

/**
 * Finds the group of consecutive messages sent by the same user within a 1-minute interval,
 * starting from the specified index in the messages array.
 *
 * @param {Array<{id: string, isMe: boolean}>} messages - The array of message objects.
 * @param {number} index - The index of the message to start grouping from.
 * @returns {MessageGroup?} An object containing the start and end indices of the group, and the IDs of the first and last messages in the group, or null if the message at the given index does not exist.
 */
export function findMessageGroup(messages, index) {
    const message = messages[index];
    if (!message) return null;

    let startIndex = index;
    for (let i = index - 1; i >= 0; i--) {
        if (messages[i].isMe === message.isMe && (new Date(messages[i + 1].id) - new Date(messages[i].id) < 60000)) {
            startIndex = i;
        } else {
            break;
        }
    }

    let endIndex = index;
    for (let i = index + 1; i < messages.length; i++) {
        if (messages[i].isMe === message.isMe && (new Date(messages[i].id) - new Date(messages[i - 1].id) < 60000)) {
            endIndex = i;
        } else {
            break;
        }
    }

    return {
        startIndex: startIndex,
        endIndex: endIndex,
        firstMessageId: messages[startIndex].id,
        lastMessageId: messages[endIndex].id
    };
}
