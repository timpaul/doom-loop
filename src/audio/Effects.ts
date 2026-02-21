export class Effects {
    private context: AudioContext;

    // Bandpass
    public filterNode: BiquadFilterNode;

    // LFO
    private lfoOscillator: OscillatorNode | null = null;
    private lfoGainToFilter: GainNode;
    private lfoGainToVolume: GainNode;
    private lfoVolumeTarget: GainNode;

    // Panner
    public pannerNode: StereoPannerNode | null = null;

    // Delay
    public delayNode: DelayNode;
    public delayFeedback: GainNode;
    public delayWet: GainNode;

    // Chorus
    public chorusDelay: DelayNode;
    public chorusLFO: OscillatorNode;
    public chorusLFOGain: GainNode;
    public chorusWet: GainNode;


    // Reverb
    public convolverNode: ConvolverNode;
    private reverbWetGain: GainNode;
    private reverbDryGain: GainNode;
    public reverbOutput: GainNode; // the final output sum

    constructor(context: AudioContext) {
        this.context = context;

        // Filters
        this.filterNode = this.context.createBiquadFilter();
        this.filterNode.type = 'bandpass';
        this.filterNode.frequency.value = 1000;
        this.filterNode.Q.value = 1; // gentle bandpass

        // LFO targets
        this.lfoGainToFilter = this.context.createGain();
        this.lfoGainToVolume = this.context.createGain();
        this.lfoGainToFilter.gain.value = 0; // Mod depth = 0
        this.lfoGainToVolume.gain.value = 0; // Mod depth = 0

        // We need a specific volume node that the LFO modules, separate from the master volume
        this.lfoVolumeTarget = this.context.createGain();
        this.lfoVolumeTarget.gain.value = 1;

        // Reverb structures
        this.convolverNode = this.context.createConvolver();
        this.reverbWetGain = this.context.createGain();
        this.reverbDryGain = this.context.createGain();
        this.reverbOutput = this.context.createGain();

        // Delay setup
        this.delayNode = this.context.createDelay(5.0);
        this.delayNode.delayTime.value = 0.4; // 400ms delay
        this.delayFeedback = this.context.createGain();
        this.delayFeedback.gain.value = 0.4; // 40% feedback
        this.delayWet = this.context.createGain();
        this.delayWet.gain.value = 0;

        // Connect internal delay feedback loop
        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayNode);
        this.delayNode.connect(this.delayWet);

        // Chorus setup
        this.chorusDelay = this.context.createDelay(1.0);
        this.chorusDelay.delayTime.value = 0.03; // 30ms base delay

        this.chorusLFO = this.context.createOscillator();
        this.chorusLFO.type = 'sine';
        this.chorusLFO.frequency.value = 1.5; // 1.5Hz rate

        this.chorusLFOGain = this.context.createGain();
        this.chorusLFOGain.gain.value = 0.005; // 5ms depth

        this.chorusWet = this.context.createGain();
        this.chorusWet.gain.value = 0;

        // Connect internal chorus LFO
        this.chorusLFO.connect(this.chorusLFOGain);
        this.chorusLFOGain.connect(this.chorusDelay.delayTime);
        this.chorusDelay.connect(this.chorusWet);
        this.chorusLFO.start();

        // Panner
        if (typeof this.context.createStereoPanner === 'function') {
            this.pannerNode = this.context.createStereoPanner();
            this.pannerNode.pan.value = 0;
        }

        this.reverbWetGain.gain.value = 0; // off by default
        this.reverbDryGain.gain.value = 1;

        // Connect Reverb parallel path
        this.convolverNode.connect(this.reverbWetGain);
        this.reverbWetGain.connect(this.reverbOutput);
        this.reverbDryGain.connect(this.reverbOutput);

        this.generateReverbImpulseResponse();
    }

    // Routing: Input -> Bandpass Filter -> LFO Volume Target -> (Panner) -> Reverb (Dry/Wet) -> Output
    public connectPath(inputNode: AudioNode, destination: AudioNode) {
        inputNode.connect(this.filterNode);
        this.filterNode.connect(this.lfoVolumeTarget);

        let preReverbSource: AudioNode = this.lfoVolumeTarget;
        if (this.pannerNode) {
            this.lfoVolumeTarget.connect(this.pannerNode);
            preReverbSource = this.pannerNode;
        }

        // Route to reverb
        preReverbSource.connect(this.convolverNode);
        preReverbSource.connect(this.reverbDryGain);

        // Route to Delay and Chorus
        preReverbSource.connect(this.delayNode);
        this.delayWet.connect(this.reverbOutput);

        preReverbSource.connect(this.chorusDelay);
        this.chorusWet.connect(this.reverbOutput);

        this.reverbOutput.connect(destination);
    }

    public setBandpass(frequency: number, q: number = 1) {
        this.filterNode.frequency.setTargetAtTime(frequency, this.context.currentTime, 0.05);
        this.filterNode.Q.setTargetAtTime(q, this.context.currentTime, 0.05);
    }

    public setLFO(rate: number, depth: number) {
        if (!this.lfoOscillator && depth > 0) {
            this.lfoOscillator = this.context.createOscillator();
            this.lfoOscillator.type = 'sine';

            this.lfoOscillator.connect(this.lfoGainToFilter);
            this.lfoGainToFilter.connect(this.filterNode.frequency);

            this.lfoOscillator.connect(this.lfoGainToVolume);
            this.lfoGainToVolume.connect(this.lfoVolumeTarget.gain);

            this.lfoOscillator.start();
        }

        if (this.lfoOscillator) {
            this.lfoOscillator.frequency.setTargetAtTime(rate, this.context.currentTime, 0.05);

            // Filter frequency mod: depth ranges up to sweeping +/- 500Hz
            this.lfoGainToFilter.gain.setTargetAtTime(depth * 500, this.context.currentTime, 0.05);
            // Volume mod: base gain is 1. We modulate it down to 0.5 and up to 1.5 depending on depth
            this.lfoGainToVolume.gain.setTargetAtTime(depth * 0.5, this.context.currentTime, 0.05);

            if (depth <= 0) {
                this.lfoOscillator.stop();
                this.lfoOscillator.disconnect();
                this.lfoOscillator = null;
                this.lfoGainToFilter.gain.value = 0;
                this.lfoGainToVolume.gain.value = 0;
                this.lfoVolumeTarget.gain.setTargetAtTime(1, this.context.currentTime, 0.05);
            }
        }
    }

    public setReverb(amount: number) {
        // 0.0 to 1.0 (wet ratio)
        this.reverbWetGain.gain.setTargetAtTime(amount, this.context.currentTime, 0.05);
        // Equal power crossfade roughly
        const dry = Math.cos(amount * 0.5 * Math.PI);
        this.reverbDryGain.gain.setTargetAtTime(dry, this.context.currentTime, 0.05);
    }

    public setDelay(amount: number) {
        this.delayWet.gain.setTargetAtTime(amount, this.context.currentTime, 0.05);
    }

    public setChorus(amount: number) {
        this.chorusWet.gain.setTargetAtTime(amount, this.context.currentTime, 0.05);
    }

    public setPan(pan: number) {
        if (this.pannerNode) {
            this.pannerNode.pan.setTargetAtTime(pan, this.context.currentTime, 0.05);
        }
    }

    // Synthesize a simple impulse response for soothing ambient reverb
    private generateReverbImpulseResponse() {
        const sampleRate = this.context.sampleRate;
        const length = sampleRate * 3; // 3 seconds decay
        const impulse = this.context.createBuffer(2, length, sampleRate);

        for (let c = 0; c < 2; c++) {
            const channelData = impulse.getChannelData(c);
            for (let i = 0; i < length; i++) {
                // Exponential decay of white noise
                const noise = Math.random() * 2 - 1;
                channelData[i] = noise * Math.exp(-i / (sampleRate * 0.5));
            }
        }

        this.convolverNode.buffer = impulse;
    }
}
