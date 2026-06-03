# Hoard — Mobile Testing Guide

How to review and debug the mobile shell, and how to give Claude (in Cowork) eyes on mobile rendering. Written 2026-06-03 after the standalone-PWA tab-bar gap bug, which desktop tooling couldn't reproduce.

There are **two distinct layers** of "mobile", and they need different tools:

| Layer | What it covers | Reproducible in desktop Chrome? | Tool |
|---|---|---|---|
| **Layout** | Mobile component tree, tab bar, mobile header, screen parity, spacing, copy | Yes, with the `?bp=` flag | The dev flag below (Claude can do this) |
| **iOS standalone** | `env(safe-area-inset-*)`, `100dvh`/`svh`, home-indicator clearance, notch, status-bar style, PWA install behaviour | **No** | iOS Simulator or BrowserStack (you drive; feed Claude screenshots) |

The tab-bar gap was a *standalone* bug — which is exactly why it survived a desktop-only audit.

---

## 1. The `?bp=` dev flag (layout layer — Claude can use this)

`useBreakpoint()` (`apps/web/src/hooks/useBreakpoint.ts`) accepts a manual override so the layout can be pinned to a breakpoint regardless of window width.

- `https://gamehoardr.com/?bp=mobile` — force the mobile shell (tab bar, mobile header, mobile screens) at any window width.
- `https://gamehoardr.com/?bp=desktop` — force the desktop shell.
- `https://gamehoardr.com/?bp=auto` — clear the override, back to width-based.

The choice **persists in `localStorage` (`hoard:bp`)** so it survives in-app navigation — set it once, browse normally, clear with `?bp=auto`. With no override the hook is width-based exactly as before, so real users are unaffected unless they type the param by hand.

**What this is good for:** Claude (or you) can load `?bp=mobile` in a normal desktop browser and screenshot every mobile screen — tab bar, mobile headers, mobile Game Detail, Deals/Library/Releases mobile layouts, copy, spacing, parity with desktop. This unblocks ~90% of mobile UI review without a device.

**What it is NOT:** it renders the mobile React branch in a desktop browser, so it has **no safe-area insets, no `dvh` quirks, no standalone display mode**. The shell will look stretched at wide widths (resize the window narrower for a truer feel). It will *not* surface iOS-specific bugs — use the tools below for those.

---

## 2. iOS Simulator (free, macOS only) — best for standalone PWA + safe-area

The Simulator runs the real iOS WebKit, so it reproduces safe-area insets, `dvh`, the home indicator, and standalone PWA behaviour. Free with Xcode.

**One-time setup**

1. Install **Xcode** from the Mac App Store (large — several GB).
2. Open Xcode once, accept the license, let it install components.
3. Launch the Simulator: Xcode → menu **Xcode › Open Developer Tool › Simulator**. (Or Spotlight → "Simulator".)
4. Pick a device with a home indicator + notch/Dynamic Island so you exercise the safe areas: **File › Open Simulator › iOS 18 › iPhone 15 Pro** (or 16 Pro). The model matters — older home-button devices won't show the bug class you care about.

**Testing Hoard**

1. In the Simulator, open **Safari** and go to `https://gamehoardr.com` (or your local dev: run `npm run dev:web`, then in the Simulator open `http://localhost:5173` — localhost maps to your Mac).
2. **Browser test:** check layout/scroll in Safari first.
3. **Standalone PWA test (this is the one that catches the real bugs):** in Simulator Safari, tap the **Share** icon → **Add to Home Screen** → open it from the home screen. Now you're in standalone mode with real safe-area insets and the home indicator — this is where the tab-bar gap, `dvh` issues, and status-bar styling actually show.
4. **Capture:** `Cmd+S` saves a screenshot to your Desktop (or Simulator → File › Save Screen). Drag those into a Cowork chat and Claude can diagnose against the source.

**Tips**
- After a deploy, the Simulator's PWA caches just like a real device — delete the home-screen icon and re-add to force the newest build (or rely on the new in-app update toast once it's deployed).
- Rotate (`Cmd+→`) to check landscape safe areas.
- Simulator → Features › toggle the appearance/size if you want to spot-check other devices.

**Limitation:** the Simulator is iOS WebKit but on your Mac's hardware — extremely close to a real iPhone for web/PWA work, but not a substitute for a physical device for things like real haptics or performance.

---

## 3. BrowserStack (paid, real devices, any OS) — best when you don't have a Mac handy or want real hardware

BrowserStack **Live** gives you a real, remote iOS device in the browser — no Xcode, works from any machine.

**Setup**

1. Sign up at `browserstack.com` (there's a limited free trial; real iOS device-cloud is a paid plan).
2. Go to **Live** (interactive manual testing — this is the product you want for a web PWA; "App Live" is for native `.ipa` builds, which Hoard isn't).
3. Pick **iOS → a recent iPhone (e.g. iPhone 15 Pro) → Safari**.
4. Navigate to `https://gamehoardr.com`. You're now driving a real device remotely.

**Standalone PWA on BrowserStack**
- You can **Add to Home Screen** from the remote Safari and launch the PWA standalone, same as a real phone — so safe-area / `dvh` / standalone bugs reproduce faithfully on real hardware.
- Sessions are ephemeral (the device resets between sessions), which is actually handy: every session is a clean cache, so you always test the latest deploy without the stale-PWA dance.

**Capture & share:** BrowserStack Live has a screenshot button in its toolbar; screenshots download locally. Drag them into a Cowork chat for Claude to analyse.

**Note on local dev:** to test a `localhost` build on BrowserStack you need their **Local Testing** tunnel (a small binary / browser extension that proxies your machine). For Hoard it's simpler to just test the deployed `gamehoardr.com`.

---

## 4. Giving Claude eyes on a mobile bug

Claude (Cowork) **can**: drive the live site via the Chrome connector at the desktop breakpoint, and — with `?bp=mobile` — render and screenshot the mobile *layout*.

Claude **cannot**: render iOS-standalone behaviour (no safe-area/`dvh`/standalone in desktop Chrome), and the Chrome connector can't reliably shrink the viewport below 1024px.

So the fast loop for an iOS-standalone bug is:
1. You reproduce it in the **Simulator** or **BrowserStack** and screenshot it.
2. Drop the screenshot in chat — Claude diagnoses against the source and ships a reasoned fix.
3. With the in-app update toast now live, the fix reaches your device on the next launch (tap "reload") — no delete-and-re-add.

---

## 5. Which tool for which bug

- **"This mobile screen's layout/copy/spacing looks off"** → `?bp=mobile` (Claude can review directly).
- **"Something's wrong with the tab bar / safe area / full-height / notch / home indicator"** → iOS Simulator or BrowserStack (standalone PWA mode), screenshot, hand to Claude.
- **"Does the PWA install / update / offline behave right?"** → Simulator or BrowserStack, Add to Home Screen, exercise it.
- **"Is it fast / do haptics fire?"** → real physical device (Simulator approximates, doesn't guarantee).
