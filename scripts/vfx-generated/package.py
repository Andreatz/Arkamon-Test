#!/usr/bin/env python3
"""Recreate a portable final-VFX delivery under Git-ignored dist/.

Run from any directory: python scripts/vfx-generated/package.py
Python standard library only. Copies the 276 final PNG bytes; it never generates
images or changes the repository's catalog, assignments, prompts or provenance.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
import zipfile

REPO = Path(__file__).resolve().parents[2]
DOCS = REPO / 'docs/vfx-generated-moves'
RUNTIME = REPO / 'public/vfx/moves/ai-generated'
LEDGER = REPO / 'vfx-source/ai-generated/provenance/generation-manifest.json'


def digest_file(path: Path) -> str:
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def safe_repo_path(relative: str) -> Path:
    path = PurePosixPath(relative)
    if path.is_absolute() or ':' in relative or '\\' in relative or '..' in path.parts:
        raise ValueError(f'Unsafe repository path: {relative!r}')
    resolved = (REPO / relative).resolve(strict=True)
    if REPO.resolve() not in resolved.parents:
        raise ValueError(f'Path outside repository: {relative!r}')
    return resolved


def package_readme(manifest: dict) -> str:
    rows = ['# Arkamon — 276 sprite sheet VFX', '',
            f'Snapshot degli asset: {manifest["generated_at"]}.', '',
            '**276 PNG distinti per 276 mosse; 0 VFX mancanti.**', '',
            '1. Estrai tutto lo ZIP conservando la cartella `asset/`.',
            '2. Apri `Anteprima_VFX.html` e seleziona la mossa da confrontare.',
            '3. Usa riproduzione, avanzamento per frame, zoom e sfondi per controllare il risultato.', '',
            'Ogni PNG è RGBA 2048×2048: 16 celle 512×512 in griglia 4×4, '
            'primo e ultimo frame vuoti, pivot locale (256,256).', '',
            'Gli asset e la revisione statica sono documentati nel manifest. Le associazioni '
            'nel gioco sono proposte: QA tecnica e controllo statico non equivalgono a conferma '
            'utente né a calibrazione in battaglia. Il metodo di revisione può essere foglio '
            'intero, culmine o campioni; consultare le note individuali.', '',
            f'{manifest["counts"]["with_warnings"]} PNG conservano note tecniche. '
            'Timing, posizione e fluidità nel motore richiedono verifica.', '',
            'Questo pacchetto conserva i PNG finali byte per byte. Tutti gli originali e i '
            'rapporti dettagliati restano in vfx-source/ai-generated e docs/vfx-generated-moves '
            'del repository. I riferimenti ai disegni Arkamon nel catalogo dei prompt richiedono '
            'la copia completa del repository.', '',
            'Il lettore offline ha verifiche del codice e simulazione DOM. La verifica automatica '
            'in un browser reale tramite file:// non è stata completata. La prova HTTP del VFX Lab '
            'è una verifica distinta.', '',
            '| ID | Mossa | PNG |', '|---:|---|---|']
    for move in manifest['moves']:
        label = move['name'].replace('|', '\\|')
        rows.append(f'| {move["id"]:03d} | {label} | [Apri PNG]({move["asset"]}) |')
    return '\n'.join(rows) + '\n'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=REPO / 'dist/vfx-generated/Arkamon_VFX_276.zip')
    args = parser.parse_args()
    output = args.output.resolve()
    ignored_root = (REPO / 'dist').resolve()
    if ignored_root not in output.parents or output.suffix.lower() != '.zip':
        raise ValueError('Output must be a ZIP inside the repository dist/ directory.')
    manifest = json.loads((DOCS / 'asset-manifest.json').read_text('utf-8'))
    ledger = json.loads(LEDGER.read_text('utf-8'))
    catalog = json.loads((RUNTIME / 'catalog.json').read_text('utf-8'))
    moves = manifest['moves']
    expected_ids = set(range(1, 277))
    if len(moves) != 276 or {m['id'] for m in moves} != expected_ids:
        raise ValueError('Manifest must contain all 276 moves exactly once.')
    jobs = {j['id']: j for j in ledger['jobs']}
    assets = {a['sourceMoveId']: a for a in catalog['assets']}
    if len(jobs) != 276 or set(jobs) != expected_ids or len(assets) != 276 or set(assets) != expected_ids:
        raise ValueError('Catalog or provenance IDs do not match the moveset.')
    sources = {}
    for move in moves:
        ident = move['id']
        job = jobs[ident]
        asset = assets[ident]
        source = safe_repo_path(move['asset'])
        if source.parent != RUNTIME.resolve() or source.name != move['filename']:
            raise ValueError(f'Unexpected PNG location for move {ident}.')
        if asset['id'] != f'moveset:{ident:03d}' or asset['src'] != 'vfx/moves/ai-generated/' + move['filename']:
            raise ValueError(f'Catalog identity mismatch for move {ident}.')
        if not move['ready'] or not move['technical_passed'] or move['visual_review'] != 'pass' or job['status'] != 'complete':
            raise ValueError(f'Move {ident} is not complete and reviewed.')
        expected = move['output_sha256']
        if expected != job['qa']['output_sha256'] or expected != asset['sha256'] or digest_file(source) != expected:
            raise ValueError(f'PNG hash mismatch for move {ident}.')
        sources[ident] = source
    if len({m['output_sha256'] for m in moves}) != 276:
        raise ValueError('Final PNG hashes are not unique.')

    packed = copy.deepcopy(manifest)
    packed['path_base'] = 'ZIP root'
    for move in packed['moves']:
        move['asset'] = 'asset/' + move['filename']
        if 'original' in move:
            move['repository_original'] = move.pop('original')
    payload = json.dumps(packed, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    html = (DOCS / 'Anteprima_VFX.html').read_text('utf-8')
    html, prefix_changes = re.subn(r'const assetPrefix="[^"]*";', 'const assetPrefix="asset/";', html)
    html, data_changes = re.subn(r'(<script id="vfx-data" type="application/json">).*?(</script>)',
                                lambda m: m.group(1) + payload + m.group(2), html, flags=re.S)
    if prefix_changes != 1 or data_changes != 1:
        raise ValueError('Viewer template has an unexpected asset prefix or metadata block.')
    docs = {'README.md': package_readme(packed), 'Anteprima_VFX.html': html,
            'asset-manifest.json': json.dumps(packed, ensure_ascii=False, indent=2) + '\n',
            'Prompt_VFX_276_mosse_Arkamon.md': (DOCS / 'prompts/Prompt_VFX_276_mosse_Arkamon.md').read_text('utf-8-sig')}
    output.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(dir=output.parent, prefix='.Arkamon_VFX_276-', suffix='.zip', delete=False)
    temporary = Path(handle.name)
    handle.close()
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=4, allowZip64=True) as archive:
            for name, content in docs.items():
                archive.writestr(name, content)
            for move in packed['moves']:
                archive.write(sources[move['id']], move['asset'])
        with zipfile.ZipFile(temporary) as archive:
            expected_entries = set(docs) | {m['asset'] for m in packed['moves']}
            names = archive.namelist()
            if len(names) != 280 or set(names) != expected_entries:
                raise ValueError('ZIP entries do not match the final 276-PNG snapshot.')
            bad = archive.testzip()
            if bad is not None:
                raise ValueError(f'ZIP CRC failed: {bad}')
            for move in packed['moves']:
                if hashlib.sha256(archive.read(move['asset'])).hexdigest() != move['output_sha256']:
                    raise ValueError(f'Stored PNG hash mismatch: {move["id"]}')
            stored_manifest = json.loads(archive.read('asset-manifest.json'))
            if stored_manifest != packed:
                raise ValueError('Stored metadata differs from the verified snapshot.')
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)

    report = {'schemaVersion': 1, 'checkedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
              'sourceSnapshot': manifest['generated_at'], 'zip': str(output.relative_to(REPO)),
              'bytes': output.stat().st_size, 'sha256': digest_file(output),
              'assets': 276, 'entries': 280, 'crcPassed': True, 'allPngHashesPassed': True,
              'provenanceAndCatalogHashesPassed': True, 'viewerBrowserVerification': 'not-performed',
              'generationManifestSha256': digest_file(LEDGER)}
    report_path = output.with_suffix('.verification.json')
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
