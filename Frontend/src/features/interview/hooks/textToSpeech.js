export const useTextToSpeech = () => {

    const speak = (text) => {

        if (!text) return

        speechSynthesis.cancel()

        const utterance =
            new SpeechSynthesisUtterance(text)

        utterance.rate = 1
        utterance.pitch = 1
        utterance.volume = 1

        speechSynthesis.speak(utterance)
    }

    const stopSpeaking = () => {
        speechSynthesis.cancel()
    }

    return {
        speak,
        stopSpeaking
    }
}