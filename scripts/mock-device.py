#!/usr/bin/env python3
"""RD6006 Modbus RTU 模拟器（仅 Linux/macOS）。创建一个伪终端，打印其路径，供无真机时测试多设备。

用法: python3 scripts/mock-device.py [负载电阻Ω，默认 8]
在“添加设备”里手动填入打印出的路径即可连接。
"""
import argparse, os, pty, random, select, struct, time, tty

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('load', nargs='?', type=float, default=8.0)
parser.add_argument('--battery', type=float, help='模拟电池的初始电压（HR33）')
parser.add_argument('--taper-seconds', type=float, default=2.0, help='模拟充电后多久进入 0.05 A 恒压阶段')
args = parser.parse_args()
LOAD = args.load


def crc(data):
    c = 0xFFFF
    for b in data:
        c ^= b
        for _ in range(8):
            c = (c >> 1) ^ 0xA001 if c & 1 else c >> 1
    return c


reg = [0] * 121
reg[0], reg[1], reg[2], reg[3] = 60067, 0, 4242, 115
reg[5], reg[8], reg[9], reg[14], reg[18], reg[72] = 32, 500, 2000, 2400, 0, 3
if args.battery is not None:
    reg[32], reg[33] = 1, round(args.battery * 100)
for k in range(10):
    reg[80 + k * 4: 84 + k * 4] = [500 + k * 100, 2000, 6200, 6200]


live_protection = reg[82:84].copy()
output_started = None

def update():
    v_set, i_set = reg[8] / 100, reg[9] / 1000
    if not reg[18]:
        v = i = 0.0
        cc = 0
    else:
        if args.battery is not None:
            cc = int(time.monotonic() - (output_started or time.monotonic()) < args.taper_seconds)
            i = i_set if cc else min(0.05, i_set)
            v = args.battery if cc else v_set
            reg[33] = round(v * 100)
        else:
            i = v_set / LOAD
            cc = int(i > i_set)
            i = min(i, i_set)
            v = i * LOAD if cc else v_set
        v += random.uniform(-0.004, 0.004)
        i = max(0.0, i + random.uniform(-0.0015, 0.0015))
    if reg[18] and (v * 100 > live_protection[0] or i * 1000 > live_protection[1]):
        reg[16] = 1 if v * 100 > live_protection[0] else 2
        reg[18] = 0
        v = i = 0.0
    p = round(v * i * 100)
    reg[10], reg[11] = max(0, round(v * 100)), max(0, round(i * 1000))
    reg[12], reg[13], reg[17] = p >> 16, p & 0xFFFF, cc
    reg[5] = 32 + int(v * i / 4)


def write_register(address, value):
    global output_started
    if address == 15:  # 与真机一致：通信期间面板保持锁定
        return
    reg[address] = value
    if address == 19 and 1 <= value <= 9:
        reg[8:10] = reg[80 + value * 4:82 + value * 4]
        live_protection[:] = reg[82 + value * 4:84 + value * 4]
    elif address in (82, 83):
        live_protection[address - 82] = value
    elif address == 18 and value == 1:
        reg[16] = 0
        output_started = time.monotonic()


master, slave = pty.openpty()
tty.setraw(slave)
print(os.ttyname(slave), flush=True)
buf = b''
while True:
    if not select.select([master], [], [], 0.1)[0]:
        continue
    buf += os.read(master, 4096)
    while len(buf) >= 8:
        fn = buf[1]
        n = 9 + buf[6] if fn == 16 and len(buf) >= 7 else 8
        if len(buf) < n:
            break
        req, buf = buf[:n], buf[n:]
        if crc(req[:-2]) != int.from_bytes(req[-2:], 'little'):
            buf = b''
            break
        addr, fn, start, value = struct.unpack('>BBHH', req[:6])
        update()
        time.sleep(0.03)
        if fn == 3:
            resp = bytes([addr, 3, value * 2]) + struct.pack(f'>{value}H', *reg[start:start + value])
        elif fn == 6:
            write_register(start, value)
            resp = req[:6]
        elif fn == 16:
            for field, raw in enumerate(struct.unpack(f'>{value}H', req[7:-2])):
                write_register(start + field, raw)
            resp = req[:6]
        else:
            resp = bytes([addr, fn | 0x80, 1])
        os.write(master, resp + struct.pack('<H', crc(resp)))
