/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const ICON_SIZE = 18;
const TOOLTIP_OFFSET = 8;
const TOOLTIP_ANIMATION_TIME = 150;
const MAX_SHORTCUT_NUMBER = 9;

function sortWindowsByStableSequence(windowA, windowB) {
    return windowA.get_stable_sequence() - windowB.get_stable_sequence();
}

const WindowsInPanelTaskbar = GObject.registerClass(
class WindowsInPanelTaskbar extends St.Widget {
    _init() {
        super._init({
            style_class: 'windows-in-panel-container',
            reactive: false,
            can_focus: false,
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true,
            layout_manager: new Clutter.BinLayout(),
        });

        this._appSystem = Shell.AppSystem.get_default();
        this._windowTracker = Shell.WindowTracker.get_default();
        this._signalIds = [];
        this._windowSignalIds = new Map();
        this._tooltip = new St.Label({
            style_class: 'dash-label windows-in-panel-tooltip',
            visible: false,
        });
        Main.uiGroup.add_child(this._tooltip);

        this._box = new St.BoxLayout({
            style_class: 'windows-in-panel-box',
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true,
        });
        this.add_child(this._box);

        this.connect('destroy', this._onDestroy.bind(this));

        this._connectSignals();
        this._sync();
    }

    _connectSignals() {
        this._signalIds.push([
            global.display,
            global.display.connect('window-created', () => this._sync()),
        ]);
        this._signalIds.push([
            global.display,
            global.display.connect('restacked', () => this._sync()),
        ]);
        this._signalIds.push([
            global.display,
            global.display.connect('notify::focus-window', () => this._sync()),
        ]);
        this._signalIds.push([
            global.settings,
            global.settings.connect('changed::favorite-apps', () => this._sync()),
        ]);
        this._signalIds.push([
            this._appSystem,
            this._appSystem.connect('app-state-changed', () => this._sync()),
        ]);
        this._signalIds.push([
            this._appSystem,
            this._appSystem.connect('installed-changed', () => this._sync()),
        ]);
    }

    _getFavoriteApps() {
        return global.settings.get_strv('favorite-apps')
            .map(appId => this._appSystem.lookup_app(appId))
            .filter(app => app !== null);
    }

    _getTrackedWindows() {
        return global.get_window_actors()
            .map(actor => actor.metaWindow)
            .filter(window => window && !window.skip_taskbar)
            .sort(sortWindowsByStableSequence);
    }

    _syncWindowSignals(windows) {
        const visibleWindows = new Set(windows);

        for (const [window, signalIds] of this._windowSignalIds) {
            if (visibleWindows.has(window))
                continue;

            signalIds.forEach(signalId => window.disconnect(signalId));
            this._windowSignalIds.delete(window);
        }

        for (const window of windows) {
            if (this._windowSignalIds.has(window))
                continue;

            const signalIds = [
                window.connect('unmanaged', () => this._sync()),
                window.connect('notify::skip-taskbar', () => this._sync()),
                window.connect('workspace-changed', () => this._sync()),
            ];

            this._windowSignalIds.set(window, signalIds);
        }
    }

    _buildEntries(windows) {
        const favoriteApps = this._getFavoriteApps();
        const favoriteIds = new Set(favoriteApps.map(app => app.get_id()));
        const windowsByAppId = new Map();

        for (const window of windows) {
            const app = this._windowTracker.get_window_app(window);
            const appId = app?.get_id();

            if (!appId)
                continue;

            if (!windowsByAppId.has(appId))
                windowsByAppId.set(appId, []);

            windowsByAppId.get(appId).push(window);
        }

        const entries = [];

        favoriteApps.forEach((app, index) => {
            const appWindows = windowsByAppId.get(app.get_id()) ?? [];
            const shortcutNumber = index + 1;

            if (appWindows.length === 0) {
                entries.push({
                    type: 'launcher',
                    app,
                    shortcutNumber,
                });
                return;
            }

            appWindows.forEach(window => {
                entries.push({
                    type: 'window',
                    app,
                    window,
                    shortcutNumber,
                });
            });
        });

        for (const window of windows) {
            const app = this._windowTracker.get_window_app(window);

            if (app && favoriteIds.has(app.get_id()))
                continue;

            entries.push({
                type: 'window',
                app,
                window,
                shortcutNumber: null,
            });
        }

        return entries;
    }

    _createIcon(entry) {
        if (entry.app)
            return entry.app.create_icon_texture(ICON_SIZE);

        return new St.Icon({
            icon_name: 'application-x-executable-symbolic',
            icon_size: ICON_SIZE,
            style_class: 'windows-in-panel-fallback-icon',
        });
    }

    _getEntryLabels(entry) {
        const appName = entry.app?.get_name() ?? 'App';
        if (entry.type === 'launcher')
            return {
                accessibleName: appName,
                tooltipText: appName,
            };

        const windowTitle = entry.window.get_title();
        if (!windowTitle || windowTitle === appName)
            return {
                accessibleName: appName,
                tooltipText: appName,
            };

        return {
            accessibleName: windowTitle,
            tooltipText: `${appName} — ${windowTitle}`,
        };
    }

    _createShortcutBadge(entry) {
        if (!entry.shortcutNumber || entry.shortcutNumber > MAX_SHORTCUT_NUMBER)
            return null;

        const badge = new St.Label({
            style_class: 'windows-in-panel-shortcut',
            text: `${entry.shortcutNumber}`,
        });

        return new St.Bin({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            child: badge,
        });
    }

    _createRunningIndicator(entry, focusedWindow) {
        if (entry.type !== 'window' || entry.window === focusedWindow)
            return null;

        const indicator = new St.Widget({
            style_class: 'windows-in-panel-running-indicator',
            width: 12,
            height: 2,
        });

        return new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true,
            child: indicator,
        });
    }

    _syncTooltip(button, text) {
        if (!button.hover || !text) {
            this._tooltip.ease({
                opacity: 0,
                duration: TOOLTIP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => (this._tooltip.visible = false),
            });
            return;
        }

        this._tooltip.remove_all_transitions();
        this._tooltip.set({
            text,
            visible: true,
            opacity: 0,
        });

        const [stageX, stageY] = button.get_transformed_position();
        const [buttonWidth, buttonHeight] = button.get_transformed_size();
        const [tipWidth, tipHeight] = this._tooltip.get_size();
        const xOffset = Math.floor((buttonWidth - tipWidth) / 2);
        const monitor = Main.layoutManager.findMonitorForActor(button);
        const x = Math.clamp(
            stageX + xOffset,
            monitor.x,
            monitor.x + monitor.width - tipWidth);
        const y = stageY - monitor.y > tipHeight + TOOLTIP_OFFSET
            ? stageY - tipHeight - TOOLTIP_OFFSET
            : stageY + buttonHeight + TOOLTIP_OFFSET;

        this._tooltip.set_position(x, y);
        this._tooltip.ease({
            opacity: 255,
            duration: TOOLTIP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _createButton(entry, focusedWindow) {
        const button = new St.Button({
            style_class: 'panel-button windows-in-panel-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
        });

        const content = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });

        const iconBin = new St.Bin({
            style_class: 'windows-in-panel-icon',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            child: this._createIcon(entry),
        });
        content.add_child(iconBin);

        const shortcutBadge = this._createShortcutBadge(entry);
        if (shortcutBadge)
            content.add_child(shortcutBadge);

        const runningIndicator = this._createRunningIndicator(entry, focusedWindow);
        if (runningIndicator)
            content.add_child(runningIndicator);

        button.set_child(content);

        if (entry.type === 'window' && entry.window === focusedWindow)
            button.add_style_class_name('active');

        if (entry.type === 'window' && entry.window.minimized)
            button.add_style_class_name('minimized');

        const {accessibleName, tooltipText} = this._getEntryLabels(entry);
        button.accessible_name = accessibleName;
        button.connect('notify::hover',
            () => this._syncTooltip(button, tooltipText));

        button.connect('clicked', () => {
            this._syncTooltip(button, null);
            if (entry.type === 'launcher')
                entry.app.open_new_window(-1);
            else
                entry.window.activate(global.get_current_time());
        });

        return button;
    }

    _sync() {
        const windows = this._getTrackedWindows();
        this._syncWindowSignals(windows);

        const focusedWindow = global.display.focus_window;
        const entries = this._buildEntries(windows);

        this._syncTooltip(this, null);
        this._box.destroy_all_children();

        for (const entry of entries)
            this._box.add_child(this._createButton(entry, focusedWindow));
    }

    _onDestroy() {
        this._signalIds.forEach(([object, signalId]) => {
            object.disconnect(signalId);
        });
        this._signalIds = [];

        for (const [window, signalIds] of this._windowSignalIds) {
            signalIds.forEach(signalId => window.disconnect(signalId));
        }
        this._windowSignalIds.clear();
        this._tooltip.destroy();
    }
});

export default class WindowsInPanelExtension extends Extension {
    enable() {
        this._taskbar = new WindowsInPanelTaskbar();

        const leftBox = Main.panel._leftBox;
        const activityIndex = Main.sessionMode.panel.left.indexOf('activities');
        const insertIndex = activityIndex >= 0 ? activityIndex + 1 : 0;

        leftBox.insert_child_at_index(this._taskbar, insertIndex);
    }

    disable() {
        this._taskbar?.destroy();
        this._taskbar = null;
    }
}
