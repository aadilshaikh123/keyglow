# Edge Add-ons listing text

Copy each block into the matching Partner Center field.

## Package

Upload `keyglow-extension-0.1.0.zip` from https://github.com/aadilshaikh123/keyglow/releases/tag/v0.1.0

## Properties

- **Category:** Productivity
- **Privacy policy:** Yes, URL: https://github.com/aadilshaikh123/keyglow/blob/main/PRIVACY.md
- **Website:** https://github.com/aadilshaikh123/keyglow
- **Support contact:** https://github.com/aadilshaikh123/keyglow/issues
- **Mature content:** No

## Store listing (English)

**Display name:** KeyGlow

**Short description:**

```
See your Wordle progress on your real RGB keyboard: green, yellow and red letter keys.
```

**Description:**

```
KeyGlow lights up the letter keys on your physical RGB keyboard to match Wordle's on-screen keyboard, so you can see which letters you have used without looking away from your keys.

- Green: right letter, right spot
- Yellow: in the word, wrong spot
- Red: not in the word
- Dim white: not tried yet

When you close the game, your keyboard goes back to its normal lighting.

HOW TO SET IT UP
1. Install Node.js 20 or later (nodejs.org).
2. Run "npx keyglow" in a terminal and keep it open while you play. This small free companion app talks to your keyboard.
3. Open Wordle and play. Click the KeyGlow icon to check that everything is connected.

SUPPORTED KEYBOARDS
- URX Core65 (direct USB, nothing else to install)
- Keyboards with per-key lighting supported by OpenRGB (start OpenRGB and its SDK Server first)

PRIVACY
KeyGlow only reads the on-screen keyboard on the Wordle page and sends it to the companion app on your own computer (127.0.0.1). Nothing is sent anywhere else. No analytics, no tracking.

KeyGlow is free and open source: github.com/aadilshaikh123/keyglow

KeyGlow is not affiliated with The New York Times. Wordle is a trademark of The New York Times Company.
```

**Store logo:** `store/edge/logo-300.png`

**Screenshots:** your keyboard photos, resized to 1280x800.

## Notes for certification

```
KeyGlow needs a companion app running on the same computer, and normally a per-key RGB keyboard. To test without special hardware, use the built-in simulator:

1. Install Node.js 20+ and run:  npx keyglow --backend mock
   The terminal prints a coloured keyboard instead of driving real hardware.
2. Open https://www.nytimes.com/games/wordle/index.html and make a guess.
3. After each guess, the terminal shows the letters in the same colours as the game's on-screen keyboard (green, yellow, red). The extension popup shows "Companion running" and "Keyboard connected (mock)".

Permissions:
- Host access to http://127.0.0.1/*: sends the letter colours to the companion app on the user's own computer. No other network requests are made.
- Content script on nytimes.com/games/wordle: reads the colour state of the on-screen keyboard only.
- storage: remembers the companion's port and the last state shown, for the popup.

Source code: https://github.com/aadilshaikh123/keyglow
```
