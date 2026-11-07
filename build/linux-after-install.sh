#!/bin/bash
# Used for both post_install and post_upgrade by the pacman package.
ln -sfn '/opt/RIDEN Desktop/riden-desktop' /usr/bin/riden-desktop
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chmod 4755 '/opt/RIDEN Desktop/chrome-sandbox' || true
else
    chmod 0755 '/opt/RIDEN Desktop/chrome-sandbox' || true
fi
# Package archive extraction can preserve old directory mtimes. Force a rebuild
# so newly added icon names are visible even when a theme cache already exists.
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
fi
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi
