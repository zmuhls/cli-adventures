#!/usr/bin/env bash
# Builds the Linux image the real terminal boots in v86 (static/vm/bzImage and initrd.gz).
# Needs Linux, root (for chroot and bind mounts), python3, git and network access.
# Everything is pinned: the Docker images by digest and the kernel by tag.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${WORK:-$HERE/.work}
OUT=$HERE/../static/vm
KERNEL_TAG=v6.12
USERLAND=library/bash@sha256:1eff5f304f0381d93c29fadd9f6774e6a44713d4f7fb5418f0fdf99a5fc85dac   # bash 5.2 on Alpine 3.22, 386
BUILDER=tuxmake/i386_gcc-13@sha256:5c491ddf7f555837d36990093e468f524d7636b5258cc700166cef53eddbfd2d # Linaro's i386 kernel toolchain, amd64

mkdir -p "$WORK"
cd "$WORK"

# 1. Userland (32-bit Alpine with bash and busybox) and the build toolchain, from Docker Hub
[ -d rootfs ] || python3 "$HERE/pull-image.py" "${USERLAND%@*}" "${USERLAND#*@}" 386 rootfs
[ -d builder ] || python3 "$HERE/pull-image.py" "${BUILDER%@*}" "${BUILDER#*@}" amd64 builder

# 2. Kernel: our saved config on top of the source, built inside the toolchain chroot
[ -d linux ] || git clone --depth 1 --branch "$KERNEL_TAG" https://github.com/torvalds/linux linux
cp "$HERE/kernel.config" linux/.config
mkdir -p builder/src builder/rootfs builder/out
mount --bind linux builder/src
trap 'umount -l builder/src builder/rootfs builder/out 2>/dev/null || true' EXIT
chroot builder /bin/sh -c 'cd /src && make ARCH=i386 olddefconfig && make ARCH=i386 -j"$(nproc)" bzImage'
cp linux/arch/x86/boot/bzImage "$OUT/bzImage"

# 3. Root filesystem: the game's runner, init and tools, a player account, no package manager
cp -r "$HERE/overlay/." rootfs/
chmod 755 rootfs/usr/local/bin/* rootfs/etc/rc.cliadv
ln -sf /sbin/init rootfs/init
grep -q /usr/local/bin/bash rootfs/etc/shells || echo /usr/local/bin/bash >> rootfs/etc/shells
id -u fsociety >/dev/null 2>&1 || chroot rootfs /bin/sh -c 'adduser -D -h /home/fsociety -s /usr/local/bin/bash fsociety' || true
objcopy --strip-all rootfs/usr/local/bin/bash
rm -rf rootfs/var/cache/apk rootfs/lib/apk

# 4. Pack it (cpio comes from the toolchain image)
mount --bind rootfs builder/rootfs
mount --bind "$OUT" builder/out
chroot builder /bin/sh -c 'cd /rootfs && find . | cpio -o -H newc -R 0:0 | gzip -9 > /out/initrd.gz'
ls -la "$OUT/bzImage" "$OUT/initrd.gz"
