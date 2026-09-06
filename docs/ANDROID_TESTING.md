# Testing on Android

The voice feature (hold-to-record, shake-to-talk, Whisper transcription) cannot
be tested on a laptop. Recording uses `expo-audio` with a native cache-directory
workaround, and shake detection uses the accelerometer — neither exists in the
web build. It also cannot currently be tested on iOS: the App Store only ships
the newest Expo Go (SDK 57) while this project is on SDK 54, and Apple does not
allow installing older versions.

**Android is the cheap way in.** Two options, easiest first.

---

## Option 1 — Expo Go with an SDK 54 build (try this first)

Unlike iOS, Android lets you install older Expo Go APKs. No account, no build,
no waiting.

1. Download the Expo Go APK for **SDK 54** from
   <https://expo.dev/go?sdkVersion=54&platform=android&device=true>
2. Install it (allow "install from unknown sources" when prompted).
3. On the laptop running the backend, start everything: `.\start.bat`
4. Scan the QR from the Expo terminal.

### Will voice actually work in Expo Go?

Probably yes. The packages the feature depends on are official Expo SDK modules
bundled into Expo Go:

| Package | In Expo Go? | Used by |
|---|---|---|
| `expo-audio` | yes | recording (`hooks/useVoiceRecording.js`) |
| `expo-sensors` | yes | shake-to-talk (`hooks/useShakeTrigger.js`) |
| `expo-file-system` | yes | the recorder's cache-file workaround |
| `expo-speech-recognition` | **no** — third-party native module | **nothing — never imported** |

`expo-speech-recognition` is the one package Expo Go cannot load, and it is
declared in `app.json` `plugins` but never imported anywhere in the app. Verify
before assuming it stays that way:

```powershell
Select-String -Path LLM-Mobile\app\*.jsx, LLM-Mobile\hooks\*.js, LLM-Mobile\components\*.jsx `
  -Pattern "expo-speech-recognition"
```

If that returns nothing, Expo Go is enough. The moment someone imports it,
Option 2 becomes mandatory.

---

## Option 2 — Development build via EAS

Needed if Expo Go fails, or as soon as any native module outside the Expo SDK is
actually imported. Free for Android: no developer account, no signing fees.

`eas.json` is committed with a `development` profile that produces an installable
APK.

```powershell
cd LLM-Mobile
npm install -g eas-cli
eas login                 # free Expo account
eas init                  # links the project, writes extra.eas.projectId to app.json
eas build --profile development --platform android
```

The build runs on Expo's servers and returns a download link — typically 10–20
minutes on the free queue. Install the APK, then start Metro:

```powershell
npx expo start --dev-client
```

Scan the QR with the **dev build**, not Expo Go.

### Things worth knowing before starting

- `eas init` writes a project ID into `app.json`. Commit that change — it is not
  a secret, and everyone needs the same one.
- A dev build only needs rebuilding when **native** dependencies change. Ordinary
  JavaScript edits reload over Metro as usual.
- `distribution: "internal"` means the APK installs directly. No Play Store.
- The `production` profile builds an app bundle and is not needed for testing.

---

## Pointing the app at the backend

Whichever option, the phone reaches the laptop by LAN IP.

1. On the laptop: `ipconfig`, take the IPv4 of the active adapter.
2. Set it in **`LLM-Mobile/.env.local`** (not the repo-root `.env`, which Expo
   does not read):
   ```ini
   EXPO_PUBLIC_API_URL=http://<that-ip>:8000/api
   ```
3. **Restart Expo.** `EXPO_PUBLIC_*` values are baked in when the bundle is
   built; reloading the app is not enough.

### If the phone cannot reach the laptop

Check these in order — all three have bitten us:

1. **Firewall profile.** Windows allows inbound per network profile. Confirm the
   active profile is covered:
   ```powershell
   Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory
   ```
   If Node's inbound rules only cover `Public` but the network is `Private`, the
   phone is blocked. Fix in an **Administrator** PowerShell:
   ```powershell
   New-NetFirewallRule -DisplayName "Maintenance Copilot - Expo Metro 8081" `
     -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private,Domain
   New-NetFirewallRule -DisplayName "Maintenance Copilot - Node backend 8000" `
     -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private,Domain
   ```
2. **University Wi-Fi client isolation.** SUTS/eduroam commonly block
   device-to-device traffic at the access point, which no local firewall rule can
   defeat. A phone hotspot avoids it entirely — the phone is then the router.
3. **Stale IP.** It changes with every network. Re-run step 1 above.

---

## Testing the server half without a phone

The whole backend voice path can be exercised from the laptop, which is worth
doing first so a failure on the phone is unambiguous.

```powershell
# generate real speech
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile("$PWD\voice-test.wav")
$s.Speak("How do I clean the air filter on this unit")
$s.Dispose()

# push it through the same endpoint the app calls
curl -X POST http://localhost:8000/api/transcribe -F "audio=@voice-test.wav;filename=audio.m4a"
```

Expected:

```json
{"text":"How do I clean the air filter on this unit?"}
```

Feed that text to `POST /api/query` and you should get a manual-grounded answer
with page citations. If both work, anything failing on the phone is a client or
network problem, not the pipeline.

---

## What to actually test on the device

- Hold the mic button, speak, release — transcript appears and is sent.
- Shake the phone — recording starts (`useShakeTrigger`).
- Deny microphone permission — a clear message, no crash.
- Record silence — a sensible response rather than a hang.
- Lose Wi-Fi mid-recording — the error surfaces and the app stays usable.
- Confirm an `audit_logs` entry is written for a voice-originated query.
