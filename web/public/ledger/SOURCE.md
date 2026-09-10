# Ledger device animations

Taken from Ledger Live Desktop, which is MIT licensed and copyright Ledger:

    https://github.com/LedgerHQ/ledger-live
    apps/ledger-live-desktop/src/renderer/animations/

| file | source |
|---|---|
| `nano-plug-and-pin.json` | `nanoS/1PlugAndPinCode/dark.json` |
| `nano-pairing.json` | `nanoX/dark/pairing.json` |
| `nano-paired.json` | `nanoX/dark/paired.json` |

These are the animations Ledger Live itself shows during onboarding, so the
device on screen is the device in the user's hand — drawn by the people who
make it, rather than approximated by us. All three are self-contained vector:
no external image assets to fetch or lose.
