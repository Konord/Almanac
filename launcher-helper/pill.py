#!/usr/bin/env python3
"""The "Almanac" pill: a small rounded button in a corner of the screen.

The launcher helper (almanac-launcher.ts) starts this and tells it what to
do, one word per line on its input: "show" or "hide". When the pill is
tapped it prints "home", and the helper closes the open app and brings
Almanac back.

It's a GTK window because a web page can't float above other programs.
GTK and its Python bindings come with Ubuntu's desktop, so nothing extra
needs installing. The window bypasses the window manager (a "popup"), so
it shows above full-screen games and videos. That needs the Xorg session
("Ubuntu on Xorg" on the sign-in screen); see README.md.
"""

import math
import sys
import threading

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Gdk, GLib, Gtk  # noqa: E402

WIDTH, HEIGHT, MARGIN = 236, 84, 32
INK = (0x23 / 255, 0x26 / 255, 0x2B / 255)


class Pill(Gtk.Window):
    def __init__(self, corner: str):
        super().__init__(type=Gtk.WindowType.POPUP)
        self.corner = corner
        self.set_app_paintable(True)
        visual = self.get_screen().get_rgba_visual()
        if visual is not None:
            self.set_visual(visual)  # see-through corners
        self.set_default_size(WIDTH, HEIGHT)
        self.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.TOUCH_MASK)
        self.connect("draw", self.on_draw)
        self.connect("button-press-event", lambda *_: self.tapped())
        self.connect("touch-event", self.on_touch)

    def place(self):
        display = Gdk.Display.get_default()
        monitor = display.get_primary_monitor() or display.get_monitor(0)
        area = monitor.get_geometry()
        x = area.x + MARGIN if "left" in self.corner else area.x + area.width - WIDTH - MARGIN
        y = area.y + MARGIN if "top" in self.corner else area.y + area.height - HEIGHT - MARGIN
        self.move(x, y)

    def show_pill(self):
        self.place()
        self.show_all()
        window = self.get_window()
        if window is not None:
            window.raise_()

    def on_touch(self, _widget, event):
        if event.type == Gdk.EventType.TOUCH_BEGIN:
            self.tapped()
        return True

    def tapped(self):
        print("home", flush=True)
        self.hide()
        return True

    def on_draw(self, _widget, cr):
        cr.set_operator(0)  # clear
        cr.paint()
        cr.set_operator(2)  # over
        r = HEIGHT / 2 - 6
        x0, y0, x1, y1 = 6, 6, WIDTH - 6, HEIGHT - 6
        # A soft shadow, then the white pill.
        for grow, alpha in ((5, 0.06), (3, 0.08), (1, 0.10)):
            self.rounded(cr, x0 - grow, y0 - grow + 2, x1 + grow, y1 + grow + 2, r + grow)
            cr.set_source_rgba(0, 0, 0, alpha)
            cr.fill()
        self.rounded(cr, x0, y0, x1, y1, r)
        cr.set_source_rgba(1, 1, 1, 0.96)
        cr.fill()
        # The house (like the Phosphor icon used in Almanac).
        cr.set_source_rgb(*INK)
        cr.set_line_width(3)
        cr.set_line_join(1)
        cr.set_line_cap(1)
        hx, hy, s = 30, 22, 1.6
        points = [(4, 10.5), (12, 4), (20, 10.5), (20, 20), (14.5, 20), (14.5, 14.5), (9.5, 14.5), (9.5, 20), (4, 20)]
        cr.move_to(hx + points[0][0] * s, hy + points[0][1] * s)
        for px, py in points[1:]:
            cr.line_to(hx + px * s, hy + py * s)
        cr.close_path()
        cr.stroke()
        # The word.
        cr.select_font_face("Sans", 0, 1)
        cr.set_font_size(26)
        cr.move_to(80, HEIGHT / 2 + 9)
        cr.show_text("Almanac")
        return False

    @staticmethod
    def rounded(cr, x0, y0, x1, y1, r):
        cr.new_sub_path()
        cr.arc(x1 - r, y0 + r, r, -math.pi / 2, 0)
        cr.arc(x1 - r, y1 - r, r, 0, math.pi / 2)
        cr.arc(x0 + r, y1 - r, r, math.pi / 2, math.pi)
        cr.arc(x0 + r, y0 + r, r, math.pi, 3 * math.pi / 2)
        cr.close_path()


def main():
    corner = sys.argv[1] if len(sys.argv) > 1 else "bottom-left"
    pill = Pill(corner)

    def listen():
        for line in sys.stdin:
            word = line.strip()
            if word == "show":
                GLib.idle_add(pill.show_pill)
            elif word == "hide":
                GLib.idle_add(pill.hide)
        GLib.idle_add(Gtk.main_quit)  # the helper went away

    threading.Thread(target=listen, daemon=True).start()
    Gtk.main()


if __name__ == "__main__":
    main()
