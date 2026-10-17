# The real terminal's Linux image

The real terminal boots a small 32-bit Linux inside the browser with [v86](https://github.com/copy/v86). Nothing runs on a server: the emulator, kernel and files are static assets in `static/vm/`.

| File | What it is | From | License |
|---|---|---|---|
| `bzImage` | Linux 6.12, 32-bit, serial console, no modules (`kernel.config`) | kernel.org source, tag `v6.12` | GPL-2.0 |
| `initrd.gz` | Alpine Linux 3.22 userland (busybox, musl) with bash 5.2, plus `overlay/` | Docker Hub `library/bash` (386), digest in `build.sh` | GPL-2.0 (busybox, Linux), GPL-3.0 (bash), MIT (musl, Alpine scripts) |
| `seabios.bin`, `vgabios.bin` | PC BIOS | the v86 repository | LGPL-3.0 (`LICENSE-seabios.txt`) |
| `libv86.js`, `v86.wasm` | The emulator | npm `v86@0.5.471` | BSD-2-Clause (`LICENSE-v86.txt`) |

Source for every GPL component is available from the upstream projects at the pinned versions above; `build.sh` fetches exactly those.

## How it works

- `overlay/etc/inittab` starts `crond` and then `cliadv-runner` as the player, `fsociety`, on the serial port.
- The runner reads one request per line: `X` plus a base64 command runs it as the player (their working directory and exported variables are restored first and saved after), and `P` plus a base64 script runs as-is (game setup and challenge checks). It answers `\036R <exit> <cwd> <stdout> <stderr>`, the last three base64-encoded. Each command gets 20 seconds.
- `overlay/usr/local/bin/file` is a small `file` that reads a file's first bytes, since Alpine's `file` is not in the base image.

## Rebuilding

On Linux, as root, with network access:

```sh
sudo vm/build.sh
```

It writes `static/vm/bzImage` and `static/vm/initrd.gz`. Edit `overlay/` to change what is in the image, and `kernel.config` for the kernel (it started from `i386_defconfig` with graphics, sound, USB, networking hardware, modules and debugging removed, and timers kept: an earlier `tinyconfig` build broke `sleep`).
