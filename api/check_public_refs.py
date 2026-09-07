from pathlib import Path
import re

root = Path('public')
missing = []
for page in sorted(root.glob('*.html')):
    text = page.read_text(errors='ignore')
    refs = re.findall(r'<(?:script|link|img)[^>]+(?:src|href)=["\']([^"\']+)', text, re.I)
    refs += re.findall(r'url\(["\']?([^"\')\s]+)', text, re.I)
    for ref in refs:
        if not ref.startswith('/') or ref.startswith('//') or ref.startswith('/api/'):
            continue
        target = root / ref.lstrip('/')
        if not target.exists():
            missing.append((page.name, ref))
if missing:
    for page, ref in missing:
        print(f'MISSING\t{page}\t{ref}')
    raise SystemExit(1)
print('All local public asset references resolve.')
