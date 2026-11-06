/**
 * Tooltip descriptions for the control labels in the sound panels.
 *
 * Keys are `PANEL.Label`, where PANEL matches the panel name passed to
 * togglePanel() in App.tsx and Label is the visible label text.
 * Edit the sentences freely - the UI picks them up automatically.
 */

const LFO_HELP = (what: string) => ({
  Type: `Shape of the ${what} modulation: smooth sine wave or random steps.`,
  Cycle: `How long one full ${what} cycle takes, from a fraction of a second up to an hour.`,
  Phase: `Where in its cycle the ${what} LFO starts, so different tracks can be offset from each other.`,
});

export const CONTROL_HELP: Record<string, string> = {
  // FM synth
  'FM_SYNTH.Ratio / Harm': 'Frequency of the modulating oscillator relative to the note; whole numbers sound harmonic, others sound bell-like or metallic.',
  'FM_SYNTH.Index': 'How strongly the modulator bends the tone; higher values give a brighter, harsher sound.',

  // Metal synth
  'METAL.Harmonicity': 'Spacing between the partial tones; changes how clangy or bell-like the sound is.',
  'METAL.Resonance': 'Brightness of the metallic overtones.',

  // Pluck
  'PLUCK.Attack': 'Length of the noise burst that excites the string at the start of each note.',
  'PLUCK.Resonance': 'How long the string keeps ringing after being plucked.',
  'PLUCK.Dampen': 'Cutoff of the filter that darkens the string as it decays; lower is more muted.',

  // Kick
  'KICK.Pitch Decay': 'How quickly the kick drops from its starting pitch to its base note.',
  'KICK.Octaves': 'How far above the base note the kick starts before dropping.',

  // Sequencer
  'SEQUENCER.Ratios': 'Relative duration of each step in the sequence. A 2 plays twice as long as a 1.',
  'SEQUENCER.Length': 'Total time taken to play through all the steps once. From 100hz to 1hr.',
  'SEQUENCER.Jitter': 'Adds random variation to the timing of each step for a looser feel.',
  'SEQUENCER.Play': 'Play every note in a step at the same time, or pick one at random each step.',

  // Tones
  'TONES.Step': 'Choose which step of the sequence you are editing.',
  'TONES.Octave': 'Octave that the selected step plays in.',
  'TONES.Chord': 'Notes played by the selected step, e.g. "C E G" or "Am7".',

  // Envelope
  'ENVELOPE.Attack': 'Time for each note to fade in from silence.',
  'ENVELOPE.Decay': 'Time for the note to fall from its peak to the sustain level.',
  'ENVELOPE.Sustain': 'Level the note holds at while it is playing.',
  'ENVELOPE.Release': 'Time for the note to fade out after it ends.',
  'ENVELOPE.Length': 'What proportion of its step each note lasts for before being released.',

  // LFOs
  'VOLUME_LFO.Type': LFO_HELP('volume').Type,
  'VOLUME_LFO.Cycle': LFO_HELP('volume').Cycle,
  'VOLUME_LFO.Depth': 'How much the volume rises and falls.',
  'VOLUME_LFO.Phase': LFO_HELP('volume').Phase,

  'PAN_LFO.Type': LFO_HELP('pan').Type,
  'PAN_LFO.Cycle': LFO_HELP('pan').Cycle,
  'PAN_LFO.Depth': 'How far the sound swings between the left and right speakers.',
  'PAN_LFO.Phase': LFO_HELP('pan').Phase,

  'FILTER_LFO.Type': LFO_HELP('filter').Type,
  'FILTER_LFO.Cycle': LFO_HELP('filter').Cycle,
  'FILTER_LFO.Depth': 'How far the filter sweeps up and down, making the sound brighter and darker.',
  'FILTER_LFO.Phase': LFO_HELP('filter').Phase,

  'DETUNE_LFO.Type': LFO_HELP('detune').Type,
  'DETUNE_LFO.Cycle': LFO_HELP('detune').Cycle,
  'DETUNE_LFO.Depth': 'How far the pitch drifts sharp and flat.',
  'DETUNE_LFO.Phase': LFO_HELP('detune').Phase,

  // Effects
  'EFFECTS.Reverb': 'Amount of simulated room or hall ambience.',
  'EFFECTS.Distortion': 'Adds crunch and grit by clipping the signal.',
  'EFFECTS.Chorus': 'Thickens the sound by layering slightly detuned, delayed copies.',
  'EFFECTS.Chebyshev': 'Adds harmonics to the sound for a richer, more buzzy tone.',

  // Delay
  'DELAY.Amount': 'How loud the echoes are compared with the original sound.',
  'DELAY.Time': 'Gap between each echo.',
  'DELAY.Feedback': 'How many times the echoes repeat before fading away.',

  // Pitch
  'PITCH.Detune': 'Shifts the pitch up or down by a fixed amount.',

  // Mix settings
  'MIX.Length': 'Total running time of the mix.',
  'MIX.Jitter': 'Randomly varies how long each track plays for.',
  'MIX.Shuffle': 'Play the tracks in a random order.',
  'MIX.Repeat': 'Start the mix again from the beginning when it finishes.',
  'MIX.Fade in': 'Time for the mix to fade in at the start. Up to 10 minutes',
  'MIX.Fade out': 'Time for the mix to fade out at the end. Up to 10 minutes',
  'MIX.Author': 'Who made this mix.',
  'MIX.Notes': 'Any notes about the mix, such as how it was made or when to listen to it.',
  'MIX.X fade': 'Overlap time where one track fades out as the next fades in. Up to 10 minutes',
};

