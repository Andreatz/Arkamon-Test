"""Index audio and propose a listening shortlist; never claim auditory review."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import unicodedata

EXTENSIONS = {'.mp3', '.wav', '.wma', '.ogg', '.m4a', '.flac', '.aac'}
RULES = {
    'fire': r'fire|flame|burn|explosion',
    'water': r'water|splash|bubble|liquid|flood',
    'electric': r'electric|lightning|thunder|\bzap\b|\bshock\b',
    'earth': r'earth|stone|rock|debris|crack|rumbl',
    'plant': r'root|leaf|leaves|plant|grass|vine',
    'dark': r'dark|creepy|ghost|demon|evil|ominous',
    'psychic': r'psychic|teleport|spirit|slowmo|dream|vortex',
    'heal': r'heal|prayer|recovery',
    'status': r'shield|freeze|charge|power up|activate',
    'slash': r'slash|slice|sword|blade|swing|whip',
    'impact': r'impact|punch|block|fist|crush|\bhit\b',
    'whoosh': r'whoosh|swoosh|whizz|swish',
    'ui': r'click|blip|\bpop\b|button|ding|chime|tone|bell',
    'success': r'victory|jackpot|\bwin\b|success|ascending|sparkle|sparkly|chime',
    'ko': r'fail|\blose\b|death|\bdie\b|defeat|downer|descending|falling',
    'magic': r'magic|magical|gleam|crystal',
}
def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value.lower()) if not unicodedata.combining(c))

def probe(path, ffmpeg):
    run = subprocess.run([ffmpeg, '-hide_banner', '-i', str(path)], capture_output=True, timeout=20,
                         creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    text = run.stderr.decode('utf-8', errors='replace')
    duration = re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)', text)
    stream = re.search(r'Audio:\s*([^,]+),\s*(\d+) Hz', text)
    return {
        'duration': round(int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3]), 3) if duration else None,
        'codec': stream[1] if stream else None,
        'sampleRate': int(stream[2]) if stream else None,
        'error': None if duration and stream else 'Metadati audio non leggibili',
    }

def signal(path, ffmpeg):
    import numpy as np
    run = subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(path),
                          '-t', '12', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'],
                         capture_output=True, timeout=30, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if run.returncode or not run.stdout:
        return {'error': 'Decodifica non riuscita'}
    samples = np.frombuffer(run.stdout, dtype='<f4')
    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(samples.astype(np.float64) ** 2)))
    active = np.flatnonzero(np.abs(samples) > max(0.001, peak * 0.015))
    return {'peakDb': round(20 * math.log10(max(peak, 1e-6)), 1),
            'rmsDb': round(20 * math.log10(max(rms, 1e-6)), 1),
            'leadingSilenceMs': round(int(active[0]) / 16) if len(active) else None,
            'analyzedSeconds': round(len(samples) / 16000, 3)}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='public/sounds')
    parser.add_argument('--output', default='public/audio-lab/catalog.json')
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--cache', required=True)
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()
    source = Path(args.input).resolve()
    cache_path = Path(args.cache)
    cache = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}
    files = sorted(p for p in source.rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONS)
    print(f'Audio files: {len(files)}; bytes: {sum(p.stat().st_size for p in files)}', flush=True)
    def inspect(path):
        relative = path.relative_to(source).as_posix()
        stamp = f'{path.stat().st_size}:{path.stat().st_mtime_ns}'
        old = cache.get(relative)
        try:
            info = old['info'] if old and old['stamp'] == stamp else probe(path, args.ffmpeg)
        except (OSError, subprocess.TimeoutExpired) as error:
            info = {'duration': None, 'codec': None, 'sampleRate': None, 'error': type(error).__name__}
        cache[relative] = {'stamp': stamp, 'info': info}
        name = normalize(path.stem)
        # Numeric MapleStory IDs have no trustworthy elemental meaning.
        tags = [] if re.match(r'^\d+\.', path.name) else [tag for tag, pattern in RULES.items() if re.search(pattern, name)]
        return {'id': hashlib.sha256(relative.encode()).hexdigest()[:16], 'name': path.stem,
                'src': 'sounds/' + relative, 'pack': path.parent.relative_to(source).as_posix(),
                'format': path.suffix[1:].lower(), 'bytes': path.stat().st_size,
                'tags': tags, 'shortlist': False, 'reviewed': False, **info}
    entries = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for index, entry in enumerate(pool.map(inspect, files), 1):
            entries.append(entry)
            if index % 500 == 0:
                print(f'Metadata: {index}/{len(files)}', flush=True)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache), encoding='utf-8')
    selected = set()
    for tag in RULES:
        candidates = [entry for entry in entries if tag in entry['tags'] and entry['duration'] is not None
                      and 0.07 <= entry['duration'] <= 5 and entry['format'] != 'wma' and not entry['error']
                      and not re.search(r'ambien|footstep|dialog|voice|loop|ringtone', normalize(entry['name']))]
        candidates.sort(key=lambda entry: (0 if 'SP_SFX_magic' in entry['pack'] else 1,
                                            len(entry['name'].split()), abs(entry['duration'] - 0.8), entry['src']))
        selected.update(entry['id'] for entry in candidates[:5])
    for entry in entries:
        if entry['id'] in selected:
            entry['shortlist'] = True
            entry['signal'] = signal(source / entry['src'].removeprefix('sounds/'), args.ffmpeg)
            if entry['signal'].get('error') or entry['signal'].get('peakDb', -120) < -55:
                entry['shortlist'] = False
    data = {'version': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
            'basis': 'filename-and-signal-only', 'auditoryReview': False,
            'total': len(entries), 'shortlistCount': sum(entry['shortlist'] for entry in entries),
            'metadataErrors': sum(bool(entry['error']) for entry in entries), 'files': entries}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({key: data[key] for key in ['total', 'shortlistCount', 'metadataErrors']}), flush=True)

if __name__ == '__main__':
    main()
