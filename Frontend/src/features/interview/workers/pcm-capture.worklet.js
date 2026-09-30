class PcmCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.pending = new Float32Array(2048)
        this.used = 0
        this.port.onmessage = () => {
            if (this.used > 0) {
                const copy = new Float32Array(this.pending.subarray(0, this.used))
                this.used = 0
                this.port.postMessage(copy)
            }
            this.port.postMessage({ type: "flushed" })
        }
    }

    process(inputs) {
        const channel = inputs[0]?.[0]
        if (!channel?.length) return true

        let offset = 0
        while (offset < channel.length) {
            const space = this.pending.length - this.used
            const take = Math.min(space, channel.length - offset)
            this.pending.set(channel.subarray(offset, offset + take), this.used)
            this.used += take
            offset += take
            if (this.used === this.pending.length) {
                this.port.postMessage(this.pending)
                this.pending = new Float32Array(2048)
                this.used = 0
            }
        }
        return true
    }
}

registerProcessor("hirevia-pcm-capture", PcmCaptureProcessor)
