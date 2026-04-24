# Windows in Panel

`Windows in Panel` is a GNOME Shell extension that places a compact taskbar directly in the top panel.

Supported GNOME Shell versions: `49` and `50`.

It shows:

- favorite applications from the GNOME dash
- currently open windows
- favorite apps first, then non-favorite running apps

The extension is designed to make open windows easier to reach without leaving the panel or opening the overview.
It also hides the GNOME overview after shell startup so the normal desktop is shown immediately.

## How it works

The taskbar is inserted into the left side of the top panel, right after the Activities button.
The clock and calendar menu (`dateMenu`) are moved from the center section of the panel to the right side while the extension is enabled.
After GNOME Shell startup completes, the extension hides the overview so the session opens on the desktop instead of overview mode.

Each panel item is represented by the application icon:

- Favorite apps are always shown.
- If a favorite app has no open windows, it appears as a launcher.
- If a favorite app has open windows, each window is shown as its own item.
- Open windows from non-favorite apps are added after favorites.

Windows are tracked dynamically, so the taskbar updates when:

- windows are opened or closed
- focus changes
- windows are restacked
- a window changes workspace
- favorite apps change
- installed application state changes

## Interaction

- Click a launcher item to open a new window for that application.
- Click a window item to activate that window.
- Hover an item to see a tooltip.
- Favorite apps in positions `1` through `9` show a numeric shortcut badge.

Tooltip behavior:

- App launchers show the app name.
- Window items show the app name and window title when they differ.

## Visual states

- Focused window: highlighted as the active item
- Minimized window: shown with reduced opacity
- Running non-focused window: small indicator line at the bottom
- Apps without a known icon: fallback symbolic app icon
