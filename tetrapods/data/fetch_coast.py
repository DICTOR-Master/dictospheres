# The coast for "Drop us a tetrapod" (DICTO, 2026-10-14): GSI 5 m elevation tiles (dem5a, falling back to dem10b) for the southern
# Osaka Bay shore around Misaki and Tannowa, merged into one height grid. Source: 国土地理院 (GSI Japan), elevation tiles,
# https://maps.gsi.go.jp/development/ichiran.html (credit required). Writes coast.npz. DICTO · dictospheres.com
import math, os, sys, time, urllib.request
import numpy as np
LAT0, LAT1, LON0, LON1, Z = 34.300, 34.345, 135.110, 135.200, 15
def tile(lat, lon, z=Z):
    n = 2 ** z; x = (lon + 180) / 360 * n; r = math.radians(lat); y = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n
    return x, y
x0, y1 = tile(LAT0, LON0); x1, y0 = tile(LAT1, LON1)
tx = range(int(x0), int(x1) + 1); ty = range(int(y0), int(y1) + 1)
H = np.full((len(ty) * 256, len(tx) * 256), np.nan, np.float32)
def get(kind, x, y):
    url = f'https://cyberjapandata.gsi.go.jp/xyz/{kind}/{Z}/{x}/{y}.txt'
    try:
        with urllib.request.urlopen(url, timeout=60) as r: txt = r.read().decode()
    except Exception as e: return None
    return np.array([[float(v) if v != 'e' else np.nan for v in row.split(',')] for row in txt.strip().split('\n')], np.float32)
for j, y in enumerate(ty):
    for i, x in enumerate(tx):
        a = get('dem5a', x, y); b = get('dem10b', x, y)
        t = a if a is not None else b
        if t is not None and b is not None: t = np.where(np.isnan(t), b, t)
        if t is not None: H[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = t
        time.sleep(0.2)
# crop to the box
fx0, fx1 = (x0 - tx[0]) * 256, (x1 - tx[0]) * 256; fy0, fy1 = (y0 - ty[0]) * 256, (y1 - ty[0]) * 256
H = H[int(fy0):int(fy1), int(fx0):int(fx1)]
lat_mid = math.radians((LAT0 + LAT1) / 2); px = 40075016.686 * math.cos(lat_mid) / (2 ** Z * 256)   # metres per pixel
np.savez_compressed(os.path.join(os.path.dirname(__file__), 'coast.npz'), h=H, px=px, box=np.array([LAT0, LAT1, LON0, LON1]))
print('grid', H.shape, 'metres/px', round(px, 2), 'land px', int(np.isfinite(H).sum()), 'max', float(np.nanmax(H)))
