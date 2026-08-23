from __future__ import annotations

import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'bilibili-subtitle-helper.zip'
SKIP_DIRS = {'.git', 'node_modules', '__pycache__', 'test', 'docs', 'scripts', '.vscode'}
SKIP_FILES = {'.gitignore', 'package.json', 'bilibili-subtitle-helper.zip'}


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
            zf.write(path, path.relative_to(ROOT).as_posix())
    print(f'OK {OUT}  files={len(files)}  time={datetime.now().isoformat(timespec="seconds")}')


if __name__ == '__main__':
    main()
