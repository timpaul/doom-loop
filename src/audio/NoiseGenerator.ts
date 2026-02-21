export type NoiseColor = 'white' | 'pink' | 'brown' | 'blue' | 'purple' | 'green';

export class NoiseGenerator {
    private context: AudioContext;
    private bufferSize: number;
    private buffers: Map<NoiseColor, AudioBuffer> = new Map();
    private source: AudioBufferSourceNode | null = null;
    private gainNode: GainNode;

    constructor(context: AudioContext) {
        this.context = context;
        // 5 seconds buffer
        this.bufferSize = this.context.sampleRate * 5;
        this.gainNode = this.context.createGain();

        // Pre-generate buffers to avoid blocking the main thread during playback switching.
        this.generateAllBuffers();
    }

    public getOutputNode(): GainNode {
        return this.gainNode;
    }

    public setVolume(volume: number) {
        // 0.0 to 1.0
        this.gainNode.gain.setValueAtTime(volume, this.context.currentTime);
    }

    public play(color: NoiseColor = 'brown') {
        this.stop();

        this.source = this.context.createBufferSource();
        this.source.buffer = this.buffers.get(color) || this.buffers.get('white')!;
        this.source.loop = true;
        this.source.connect(this.gainNode);
        this.source.start(0);
    }

    public stop() {
        if (this.source) {
            try {
                this.source.stop();
            } catch (e) {
                // Source already stopped
            }
            this.source.disconnect();
            this.source = null;
        }
    }

    private generateAllBuffers() {
        this.buffers.set('white', this.generateWhiteNoise());
        this.buffers.set('pink', this.generatePinkNoise());
        this.buffers.set('brown', this.generateBrownNoise());
        this.buffers.set('blue', this.generateBlueNoise());
        this.buffers.set('purple', this.generatePurpleNoise());
        this.buffers.set('green', this.generateGreenNoise());
    }

    private generateWhiteNoise(): AudioBuffer {
        const buffer = this.context.createBuffer(1, this.bufferSize, this.context.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < this.bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    private generatePinkNoise(): AudioBuffer {
        const buffer = this.context.createBuffer(1, this.bufferSize, this.context.sampleRate);
        const output = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < this.bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }
        return buffer;
    }

    private generateBrownNoise(): AudioBuffer {
        const buffer = this.context.createBuffer(1, this.bufferSize, this.context.sampleRate);
        const output = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < this.bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            let out = (lastOut + (0.02 * white)) / 1.02;
            lastOut = out;
            output[i] = out * 3.5;
        }
        return buffer;
    }

    private generateBlueNoise(): AudioBuffer {
        const buffer = this.context.createBuffer(1, this.bufferSize, this.context.sampleRate);
        const output = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < this.bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            output[i] = (white - lastOut) * 0.5; // Differencing produces roughly +6dB/oct. True blue is +3dB, but difference is close.
            lastOut = white;
        }
        return buffer;
    }

    private generatePurpleNoise(): AudioBuffer {
        const buffer = this.context.createBuffer(1, this.bufferSize, this.context.sampleRate);
        const output = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < this.bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            output[i] = (white - lastOut) * 1.5;
            // Using direct derivation for steep +6dB slope.
            lastOut = white;
        }
        return buffer;
    }

    private generateGreenNoise(): AudioBuffer {
        const buffer = this.context.createBuffer(1, this.bufferSize, this.context.sampleRate);
        const output = buffer.getChannelData(0);
        // Green noise: mid frequencies approx 500 Hz. Pseudo band-pass.
        // Extremely simplistic placeholder using low/high state logic.
        let l_in = 0, l_out = 0;
        for (let i = 0; i < this.bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            // Simple IIR low and high filtering approximation
            l_in = 0.99 * l_in + 0.01 * white; // LP
            l_out = white - l_in; // HP
            output[i] = (l_in * 3.0) * (l_out * 0.5); // Crude approach
        }
        return buffer;
    }
}
