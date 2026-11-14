/*
 * Almanac kitchen screen: the GNOME Shell side of the launcher helper.
 *
 * On Ubuntu's Wayland desktop an ordinary program can't float above other
 * windows, pick which window comes to the front, or switch the monitor off.
 * The desktop itself (GNOME Shell) can, so this small extension does those
 * three things when the helper asks over D-Bus (the desktop's message bus):
 *
 *   ShowPill(corner)  show the "Almanac" pill in a corner, above everything
 *   HidePill()        hide it
 *   Raise(match)      bring Almanac's window to the front (by window class,
 *                     app id or title); answers whether it found one
 *   Screen(on)        monitor on (true) or asleep (false)
 *   HomeTapped        a signal sent when someone taps the pill
 *
 * Only programs signed in as the same user on this PC can reach the bus.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const BUS_NAME = 'org.almanac.Shell';
const OBJECT_PATH = '/org/almanac/Shell';
const MARGIN = 32;

const INTERFACE = `
<node>
  <interface name="org.almanac.Shell">
    <method name="ShowPill"><arg type="s" direction="in" name="corner"/></method>
    <method name="HidePill"/>
    <method name="Raise">
      <arg type="s" direction="in" name="match"/>
      <arg type="b" direction="out" name="found"/>
    </method>
    <method name="Screen"><arg type="b" direction="in" name="on"/></method>
    <signal name="HomeTapped"/>
  </interface>
</node>`;

// Mutter's own display settings: PowerSaveMode 0 = on, 3 = off.
const DISPLAY_CONFIG = {
    name: 'org.gnome.Mutter.DisplayConfig',
    path: '/org/gnome/Mutter/DisplayConfig',
};

export default class AlmanacShell extends Extension {
    enable() {
        this._corner = 'bottom-left';
        this._unredirectOff = false;

        const box = new St.BoxLayout({style_class: 'almanac-pill-box'});
        box.add_child(new St.Icon({icon_name: 'go-home-symbolic', style_class: 'almanac-pill-icon'}));
        box.add_child(new St.Label({
            text: 'Almanac',
            style_class: 'almanac-pill-label',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._pill = new St.Button({
            style_class: 'almanac-pill',
            child: box,
            reactive: true,
            can_focus: false,
            visible: false,
        });
        this._pill.connect('clicked', () => this._tapped());
        // Top chrome sits above every window. trackFullscreen: false keeps it
        // showing over full-screen games and videos too.
        Main.layoutManager.addTopChrome(this._pill, {affectsInputRegion: true, trackFullscreen: false});

        this._dbus = Gio.DBusExportedObject.wrapJSObject(INTERFACE, this);
        this._dbus.export(Gio.DBus.session, OBJECT_PATH);
        this._nameId = Gio.bus_own_name_on_connection(Gio.DBus.session, BUS_NAME,
            Gio.BusNameOwnerFlags.REPLACE, null, null);
    }

    disable() {
        if (this._nameId) Gio.bus_unown_name(this._nameId);
        this._nameId = 0;
        this._dbus?.unexport();
        this._dbus = null;
        this._allowUnredirect();
        this._pill?.destroy();
        this._pill = null;
    }

    // --- D-Bus methods -----------------------------------------------------

    ShowPill(corner) {
        if (['bottom-left', 'bottom-right', 'top-left', 'top-right'].includes(corner))
            this._corner = corner;
        // Games and videos in full screen skip the desktop's drawing to run
        // faster ("unredirect"), which would hide the pill. Switch that off
        // while the pill is showing.
        this._stopUnredirect();
        this._pill.show();
        this._place();
        Main.layoutManager.uiGroup.set_child_above_sibling(this._pill, null);
    }

    HidePill() {
        this._pill.hide();
        this._allowUnredirect();
    }

    Raise(match) {
        const want = String(match).toLowerCase();
        const windows = global.get_window_actors().map(a => a.get_meta_window()).filter(Boolean);
        const byId = w => [w.get_wm_class(), w.get_wm_class_instance(), w.get_gtk_application_id(), w.get_sandboxed_app_id()]
            .some(v => v && v.toLowerCase() === want);
        const byTitle = w => (w.get_title() ?? '').toLowerCase().includes(want);
        const win = windows.find(byId) ?? windows.find(byTitle);
        if (!win) return false;
        Main.activateWindow(win);
        return true;
    }

    Screen(on) {
        Gio.DBus.session.call(DISPLAY_CONFIG.name, DISPLAY_CONFIG.path,
            'org.freedesktop.DBus.Properties', 'Set',
            new GLib.Variant('(ssv)', [DISPLAY_CONFIG.name, 'PowerSaveMode', new GLib.Variant('i', on ? 0 : 3)]),
            null, Gio.DBusCallFlags.NONE, -1, null,
            (conn, result) => {
                try {
                    conn.call_finish(result);
                } catch (e) {
                    console.warn(`Almanac: couldn't turn the screen ${on ? 'on' : 'off'}: ${e.message}`);
                }
            });
    }

    // --- Helpers -------------------------------------------------------------

    _tapped() {
        this.HidePill();
        this._dbus?.emit_signal('HomeTapped', null);
    }

    _place() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const [, natWidth] = this._pill.get_preferred_width(-1);
        const [, natHeight] = this._pill.get_preferred_height(natWidth);
        const left = this._corner.endsWith('left');
        const top = this._corner.startsWith('top');
        this._pill.set_position(
            Math.round(left ? monitor.x + MARGIN : monitor.x + monitor.width - natWidth - MARGIN),
            Math.round(top ? monitor.y + MARGIN : monitor.y + monitor.height - natHeight - MARGIN));
    }

    _stopUnredirect() {
        if (this._unredirectOff) return;
        if (global.compositor?.disable_unredirect) global.compositor.disable_unredirect();
        else Meta.disable_unredirect_for_display?.(global.display);
        this._unredirectOff = true;
    }

    _allowUnredirect() {
        if (!this._unredirectOff) return;
        if (global.compositor?.enable_unredirect) global.compositor.enable_unredirect();
        else Meta.enable_unredirect_for_display?.(global.display);
        this._unredirectOff = false;
    }
}
