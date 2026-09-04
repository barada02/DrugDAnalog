# Brand sources

The originals. Nothing here is served — `public/` holds only the downscaled
versions the app actually loads, because the sources are ~1.2 MB between them
and the app needs a 30px wordmark and a 16px tab icon.

| Source | Used for | Generated into |
| --- | --- | --- |
| `symbol.png` (1312×1199) | app icon | `public/icon-192.png`, `public/icon-512.png` |
| `wordmark.png` (2172×724) | top bar | `public/wordmark.png` |

To regenerate after replacing a source:

```py
from PIL import Image
sym = Image.open('brand/symbol.png').convert('RGBA')
side = max(sym.size)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(sym, ((side - sym.width) // 2, (side - sym.height) // 2))
for s in (192, 512):
    sq.resize((s, s), Image.LANCZOS).save(f'public/icon-{s}.png', optimize=True)

m = Image.open('brand/wordmark.png').convert('RGBA')
m.resize((round(m.width * 96 / m.height), 96), Image.LANCZOS).save(
    'public/wordmark.png', optimize=True)
```
