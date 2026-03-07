import { audioManager } from './AudioManager';
import type { MixState, TrackState, MixItem } from '../types';

export interface MixScheduleItem {
    mixItemId: string;
    trackId: string;
    startTime: number; // in seconds
    endTime: number; // in seconds
    fadeInDuration: number; // in seconds
    fadeOutDuration: number; // in seconds
    fadeState: 'idle' | 'starting' | 'fadingIn' | 'playing' | 'fadingOut' | 'done';
}

export class MixPlayer {
    private static instance: MixPlayer;

    private mix: MixState | null = null;
    private tracks: Map<string, TrackState> = new Map();
    private schedule: MixScheduleItem[] = [];
    private shuffledItems: MixItem[] = [];

    private isPlaying = false;
    private lastTickTime = 0;
    private _currentTime = 0; // in seconds
    private timerId: number | null = null;
    private ignoredOverlapItems = new Set<string>();

    private constructor() { }

    public static getInstance(): MixPlayer {
        if (!MixPlayer.instance) {
            MixPlayer.instance = new MixPlayer();
        }
        return MixPlayer.instance;
    }

    public get currentTime(): number {
        return this._currentTime;
    }

    public get currentMixId(): string | null {
        return this.mix?.id || null;
    }

    public loadMix(mix: MixState, tracks: TrackState[]) {
        this.stop();
        this.mix = mix;
        if (mix.shuffle) {
            this.shuffledItems = [...mix.items].sort(() => Math.random() - 0.5);
        } else {
            this.shuffledItems = [...mix.items];
        }
        this._currentTime = 0;
        this.tracks.clear();
        for (const t of tracks) {
            this.tracks.set(t.id, t);
        }
        this.calculateSchedule();
    }

    public updateMix(mix: MixState, tracks: TrackState[]) {
        if (!this.mix || this.mix.id !== mix.id) {
            this.loadMix(mix, tracks);
            return;
        }

        const oldSchedule = new Map<string, MixScheduleItem>();
        let targetFollowItem: MixScheduleItem | null = null;
        for (const item of this.schedule) {
            oldSchedule.set(item.mixItemId, item);
            if (this._currentTime >= item.startTime && this._currentTime < item.endTime) {
                if (!targetFollowItem || item.startTime > targetFollowItem.startTime) {
                    targetFollowItem = item;
                }
            }
        }
        const oldTimeInItem = targetFollowItem ? this._currentTime - targetFollowItem.startTime : 0;

        const shuffleTurnedOn = mix.shuffle && !this.mix.shuffle;
        const shuffleTurnedOff = !mix.shuffle && this.mix.shuffle;

        this.mix = mix;
        this.tracks.clear();
        for (const t of tracks) {
            this.tracks.set(t.id, t);
        }

        if (shuffleTurnedOff) {
            this.shuffledItems = [...this.mix.items];
        } else if (shuffleTurnedOn) {
            this.shuffledItems = [...this.mix.items].sort(() => Math.random() - 0.5);
        } else if (this.mix.shuffle) {
            // Keep existing shuffled order, minus removed, plus added randomly
            const newIds = new Set(this.mix.items.map(i => i.id));
            let newShuffled = this.shuffledItems.filter(i => newIds.has(i.id));

            const currentIds = new Set(this.shuffledItems.map(i => i.id));
            const addedItems = this.mix.items.filter(i => !currentIds.has(i.id));

            for (const item of addedItems) {
                const insertIdx = Math.floor(Math.random() * (newShuffled.length + 1));
                newShuffled.splice(insertIdx, 0, item);
            }
            this.shuffledItems = newShuffled;
        } else {
            this.shuffledItems = [...this.mix.items];
        }

        this.calculateSchedule();

        if (targetFollowItem) {
            const newItem = this.schedule.find(i => i.mixItemId === targetFollowItem!.mixItemId);
            if (newItem) {
                // Warp global time to maintain exact position inside the followed track
                this._currentTime = newItem.startTime + oldTimeInItem;
            }
        }

        const currentItemIds = new Set(this.schedule.map(i => i.mixItemId));
        for (const [id, oldItem] of oldSchedule.entries()) {
            if (!currentItemIds.has(id)) {
                if (oldItem.fadeState !== 'idle' && oldItem.fadeState !== 'done') {
                    this.stopTrackSync(oldItem);
                }
            }
        }

        this.ignoredOverlapItems.clear();

        for (const item of this.schedule) {
            const oldItem = oldSchedule.get(item.mixItemId);
            if (oldItem && oldItem.fadeState !== 'idle' && oldItem.fadeState !== 'done') {
                // By marking it 'starting', the next tick will recalculate 
                // the crossfade ramps without calling startTrackSync() again.
                item.fadeState = 'starting';
            }
        }
    }

    private calculateSchedule() {
        if (!this.mix || this.mix.items.length === 0) {
            this.schedule = [];
            return;
        }

        const N = this.shuffledItems.length;
        const totalLengthSec = this.mix.lengthMinutes * 60;
        const crossfadeSec = this.mix.crossFadeMinutes * 60;

        let itemLengthSec = totalLengthSec;
        if (N > 1) {
            itemLengthSec = (totalLengthSec + (N - 1) * crossfadeSec) / N;
        }

        this.schedule = this.shuffledItems.map((item, index) => {
            const startTime = index * (itemLengthSec - crossfadeSec);
            const endTime = startTime + itemLengthSec;

            // First item fade in = mix fade in, otherwise crossfade
            const fadeInDuration = index === 0 ? this.mix!.fadeInMinutes * 60 : crossfadeSec;

            // Last item fade out = mix fade out, otherwise crossfade
            const fadeOutDuration = index === N - 1 ? this.mix!.fadeOutMinutes * 60 : crossfadeSec;

            return {
                mixItemId: item.id,
                trackId: item.trackId,
                startTime: startTime,
                endTime: endTime,
                fadeInDuration: Math.min(itemLengthSec / 2, fadeInDuration),
                fadeOutDuration: Math.min(itemLengthSec / 2, fadeOutDuration),
                fadeState: 'idle'
            };
        });
    }

    public play() {
        if (this.isPlaying || !this.mix) return;
        this.isPlaying = true;
        this.lastTickTime = performance.now();
        this.tick();
    }

    public pause() {
        this.isPlaying = false;
        if (this.timerId !== null) {
            cancelAnimationFrame(this.timerId);
            this.timerId = null;
        }

        // Stop all currently playing items to pause audio
        for (const item of this.schedule) {
            if (item.fadeState !== 'idle' && item.fadeState !== 'done') {
                this.stopTrackSync(item);
                item.fadeState = 'idle'; // force it to re-evaluate on resume
            }
        }
    }

    public stop() {
        this.pause();
        this._currentTime = 0;
        this.schedule.forEach(item => item.fadeState = 'idle');
    }

    public seekToItem(mixItemId: string) {
        if (!this.mix) return;
        const targetIndex = this.schedule.findIndex(i => i.mixItemId === mixItemId);
        if (targetIndex !== -1) {
            const item = this.schedule[targetIndex];

            this.ignoredOverlapItems.clear();

            this.schedule.forEach((i) => {
                if (i.fadeState !== 'idle' && i.fadeState !== 'done') {
                    this.stopTrackSync(i);
                    i.fadeState = 'idle';
                }

                // We no longer need this block, we will handle suppression in tick() dynamically.
            });
            this._currentTime = item.startTime;
            // Also flag the sought track so it doesn't fade-in artificially
            item.fadeState = 'playing';
            this.startTrackSync(item);
            audioManager.setTrackVolume(item.mixItemId, 1);

            // Next tick will continue the audio sync natively
        }
    }

    public isTrackPlaying(mixItemId: string): boolean {
        if (!this.isPlaying) return false;
        const item = this.schedule.find(i => i.mixItemId === mixItemId);
        if (!item) return false;

        return item.fadeState !== 'idle' && item.fadeState !== 'done';
    }

    private tick = () => {
        if (!this.isPlaying || !this.mix) return;

        const now = performance.now();
        const deltaSec = (now - this.lastTickTime) / 1000;
        this.lastTickTime = now;

        this._currentTime += deltaSec;

        // Loop repeat logic
        const totalLengthSec = this.mix.lengthMinutes * 60;
        if (this._currentTime >= totalLengthSec) {
            if (this.mix.repeat) {
                this._currentTime = 0;
                this.ignoredOverlapItems.clear();
                this.schedule.forEach(item => item.fadeState = 'idle');
            } else {
                this.stop();
                return;
            }
        }

        // Evaluate schedule
        for (const item of this.schedule) {
            if (this._currentTime >= item.startTime && this._currentTime < item.endTime) {
                if (this.ignoredOverlapItems.has(item.mixItemId)) {
                    continue; // Skip playing this item because it was suppressed by a seek
                }

                // It should be playing
                const timeInItem = this._currentTime - item.startTime;

                if (item.fadeState === 'idle' || item.fadeState === 'done') {
                    // Start it
                    this.startTrackSync(item);

                    // CRITICAL FIX: If we are starting playback and we land smack in the middle 
                    // of a track's fade-out window, but we *didn't* play the track before this, 
                    // we should NOT play it at all. It's a dead overlap.
                    if (timeInItem > item.fadeInDuration && (item.endTime - this._currentTime <= item.fadeOutDuration)) {
                        this.stopTrackSync(item);
                        item.fadeState = 'done';
                        continue;
                    }

                    // If we just jumped into the middle of a track's normal playtime, 
                    // skip the fade-in and go straight to full volume.
                    if (timeInItem >= item.fadeInDuration && (item.endTime - this._currentTime > item.fadeOutDuration)) {
                        audioManager.setTrackVolume(item.mixItemId, 1);
                        item.fadeState = 'playing';
                    } else {
                        item.fadeState = 'starting';
                    }
                }

                if (timeInItem < item.fadeInDuration && item.fadeState === 'starting') {
                    // Apply fade in over the required duration
                    const remainingFadeIn = item.fadeInDuration - timeInItem;
                    audioManager.fadeTrack(item.mixItemId, 1, remainingFadeIn);
                    item.fadeState = 'fadingIn';
                } else if (item.endTime - this._currentTime <= item.fadeOutDuration && item.fadeState !== 'fadingOut') {
                    // Start fade out over the required duration
                    const remainingFadeOut = item.endTime - this._currentTime;
                    audioManager.fadeTrack(item.mixItemId, 0, remainingFadeOut);
                    item.fadeState = 'fadingOut';
                } else if (timeInItem >= item.fadeInDuration && (item.endTime - this._currentTime > item.fadeOutDuration) && item.fadeState === 'starting') {
                    // Make sure it's full volume if we are past fade in
                    audioManager.fadeTrack(item.mixItemId, 1, 0.1);
                    item.fadeState = 'playing';
                }
            } else {
                // Should not be playing
                if (item.fadeState !== 'idle' && item.fadeState !== 'done') {
                    this.stopTrackSync(item);
                    item.fadeState = 'done';
                }
            }
        }

        this.timerId = requestAnimationFrame(this.tick);
    }

    private startTrackSync(item: MixScheduleItem) {
        const track = this.tracks.get(item.trackId);
        if (!track) return;
        track.sounds.forEach(sound => {
            audioManager.syncSoundState(sound, true, item.mixItemId);
        });
        // Reset track channel volume if we are about to fade it
        audioManager.setTrackVolume(item.mixItemId, 0);
    }

    private stopTrackSync(item: MixScheduleItem) {
        const track = this.tracks.get(item.trackId);
        if (!track) return;
        track.sounds.forEach(sound => {
            audioManager.syncSoundState(sound, false, item.mixItemId);
        });
    }
}

export const mixPlayer = MixPlayer.getInstance();
