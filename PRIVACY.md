# KeyGlow privacy policy

Last updated: 11 November 2026

KeyGlow has two parts: a browser extension and a companion app that runs on your own computer. Neither collects, sells or shares personal data.

## What the extension reads

On Wordle pages (`https://www.nytimes.com/games/wordle/*`) only, the extension reads the colour state of the 26 letter keys on the game's on-screen keyboard (correct, present, absent, or not yet used) and whether the game is in progress, won or lost.

It does not read your guesses as words, your account, your statistics, or any other page.

## Where that data goes

The extension sends the key states to the KeyGlow companion app at `http://127.0.0.1` (your own computer). Nothing is sent to any other server. The companion uses the data only to set your keyboard's lights and keeps it in memory only.

The extension stores two small items in your browser:

- the companion's port number, if you change it;
- the most recent key states, so the popup can show what is being displayed. These are cleared when the browser closes.

The companion stores one file in your system's temporary folder: a copy of your keyboard's own lighting settings. It uses this to put your lighting back if the companion is stopped mid-game. Nothing about the game is written to disk.

## Third parties

There are no analytics, trackers, advertising or remote servers.

## Contact

Questions or concerns: open an issue at https://github.com/aadilshaikh123/keyglow/issues
