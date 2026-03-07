export const aboutMarkdown = `
# What _is_ this?

Doom Loop is a browser-based audio environment for creating, sequencing, and mixing generative music and soundscapes.

It's a cross between a synth, and sequencer and a music player, and it's designed specifically for making ambient, drone and experimental electronic music. It's built on top on the Tone.js JavaScript library by me, Tim Paul (with a LOT of help from Google Antigravity). 

A few notes on how it works...

## Tracks 

Tracks are where you create your individual musical and sonic ideas. They're comprised of different sounds sources layered on top of each other, with optional effects and automation applied to them. There's also a bit of sequencing available too. 

Tracks have no fixed length - they're designed to continue indefinitely whilst you tweak their parameters, or just let them run on their own. Many parameters have automation LFOs with cycles that you can set to anything between 1 millisecond and 1 hour - perfect for very slowly evolving sounds.


## Mixes

You can combine multiple tracks into Mixes, which work a lot like playlists in other music apps; you can shuffle and repeat and add and remove tracks. 

Unlike standard playlists though, a Doom Loop mix has you define the overall mix length, and that is then split evenly across all the tracks in the mix. You can also set mixes to fade in and out and crossfade between tracks. Fades can last up to 10 minutes - great for creating sleep mixes or slowly evolving ambient suites.

If you delete a track from a mix it will NOT remove the track from your library. But if you delete a track from your library it will also be removed from any mixes that it's in.


## Importing and exporting tracks and mixes

Doomloop stores all your track and mix data on your device, which means there's no need for accounts and cloud storage. But it does make it harder to work on tracks and mixes across multiple devices.

To help with this, you can export tracks and mixes as JSON files from one device, and then import them into another device. And of course, you can also then share tracks and mixes with other people! When you import a mix, Doomloop will also add any tracks from it that you don't already have.

## Contributing

If you'd like to contribute to Doom Loop, please feel free to fork the repository and submit a pull request at [github.com/timpaul/doom-loop](https://github.com/timpaul/doom-loop).

And if you send me tracks and mixes, I can create a community section :-)

*Enjoy the noise.*
`;
