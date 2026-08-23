from __future__ import annotations

import re
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'bilibili-subtitle-helper.zip'
SKIP_DIRS = {'.git', 'node_modules', '__pycache__', 'test', 'docs', 'scripts', '.vscode'}
SKIP_FILES = {'.gitignore', 'package.json', 'bilibili-subtitle-helper.zip'}
DEBUG_FLAG = re.compile(
    r'(SHOW_DEBUG\s*=\s*)(?:true|false)(\s*;\s*//\s*@pack:debug)'
)


def include(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in SKIP_DIRS for part in rel.parts):
        return False
    if rel.name in SKIP_FILES or rel.name.endswith('.pyc'):
        return False
    return True


def main() -> None:
    files = [p for p in ROOT.rglob('*') if p.is_file() and include(p)]
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            rel = path.relative_to(ROOT).as_posix()
            raw = path.read_bytes()
            if rel == 'src/shared/debug-flag.js':
                text, count = DEBUG_FLAG.subn(r'\1false\2', raw.decode('utf-8'), count=1)
                raw = text.encode('utf-8')
                print(f'PATCH debug-flag SHOW_DEBUG -> false ({count})')
            zf.writestr(rel, raw)
    print(f'OK {OUT}  files={len(files)}  time={datetime.now().isoformat(timespec="seconds")}')


if __name__ == '__main__':
    main()
