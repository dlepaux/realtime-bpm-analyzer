#!/usr/bin/env python3
"""RBA-59 blind tempo confirmation: a listening page, and the score once a batch is done.

serve  Serves confirmation.md's rows one at a time on 127.0.0.1, reached through an SSH tunnel.
       The browser sees a row number and the audio, never the id, title, label or key.
       Answers are appended to confirmation-answers.jsonl, so a restart resumes where it stopped.
score  Compares the answers with confirmation-key.jsonl, apart for the random and disagreement rows.
       Run it only after listening: serve never opens the key.

Standard library only, so it runs on the box's own python3 with nothing installed.
"""

import argparse
import datetime
import json
import math
import mimetypes
import os
import re
import sys
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
STATIC = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/page.mjs': ('page.mjs', 'text/javascript; charset=utf-8'),
    '/tap-tempo.mjs': ('tap-tempo.mjs', 'text/javascript; charset=utf-8'),
}
# confirmation.md names paths inside the job's container; the same files sit under --root on the host
CONTAINER_ROOT = '/data/rba-tempo/free-data/'
ANSWERS = 'confirmation-answers.jsonl'
KEY = 'confirmation-key.jsonl'
LOCAL_HOSTS = {'127.0.0.1', 'localhost'}
MOST_BODY_BYTES = 4096
MOST_NOTE_CHARS = 500
CHUNK = 64 * 1024
AGREE_WITHIN = 0.02


def parse_list(text):
    """Rows of confirmation.md as (id, container path), in the list's order."""
    rows = []
    for line in text.splitlines():
        match = re.match(r'^\| (.+?) \| \S+ \| `([^`]+)` \|', line)
        if match:
            rows.append((match.group(1), match.group(2)))
    return rows


def host_path(root, container_path):
    """The host file for a listed path, refused if it would leave the audio folder."""
    if not container_path.startswith(CONTAINER_ROOT):
        raise ValueError('path outside the free-data volume')
    audio = (root / 'audio').resolve()
    path = (root / container_path[len(CONTAINER_ROOT):]).resolve()
    if audio not in path.parents:
        raise ValueError('path outside the audio folder')
    return path


def read_answers(path):
    """Answer rows, oldest first. A torn last line from a crash is dropped, not fatal."""
    if not path.exists():
        return []
    answers = []
    for line in path.read_text(encoding='utf-8').splitlines():
        try:
            answers.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return answers


def append_answer(path, answer):
    """One whole line per answer, flushed to disk before the page moves on."""
    with open(path, 'a+b') as handle:
        handle.seek(0, os.SEEK_END)
        prefix = b''
        if handle.tell() > 0:
            handle.seek(-1, os.SEEK_END)
            if handle.read(1) != b'\n':
                prefix = b'\n'
        handle.write(prefix + json.dumps(answer, sort_keys=True).encode('utf-8') + b'\n')
        handle.flush()
        os.fsync(handle.fileno())


def bpm_or_none(value, low, high):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'tempo must be a number from {low} to {high}')
    return round(float(value), 1)


def make_answer(body, rows, first, last, now):
    """Validates a posted answer and adds what only the server may know: the id and the time."""
    kind = body.get('kind')
    row = body.get('row')
    if kind not in ('save', 'unsure', 'broken'):
        raise ValueError('kind must be save, unsure or broken')
    if isinstance(row, bool) or not isinstance(row, int) or not first <= row <= last:
        raise ValueError(f'row must be from {first} to {last}')
    tapped = bpm_or_none(body.get('tappedBpm'), 30, 400)
    final = bpm_or_none(body.get('finalBpm'), 15, 800)
    taps = body.get('taps')
    if isinstance(taps, bool) or not isinstance(taps, int) or not 0 <= taps <= 10_000:
        raise ValueError('taps must be a count')
    note = body.get('note', '')
    if not isinstance(note, str) or len(note) > MOST_NOTE_CHARS:
        raise ValueError(f'note must be text of at most {MOST_NOTE_CHARS} characters')
    if (tapped is None) != (final is None):
        raise ValueError('tapped and final tempo come together')
    if tapped is not None:
        octaves = math.log2(final / tapped)
        if abs(octaves - round(octaves)) > 0.01 or abs(round(octaves)) > 3:
            raise ValueError('final tempo must be the tapped one halved or doubled')
    if kind == 'save' and (tapped is None or taps < 8):
        raise ValueError('save needs at least 8 taps')
    if kind == 'broken' and tapped is not None:
        raise ValueError('a broken track has no tempo')
    return {
        'row': row,
        'id': rows[row - 1][0],
        'tappedBpm': tapped,
        'finalBpm': final,
        'taps': taps,
        'unsure': kind == 'unsure',
        'broken': kind == 'broken',
        'note': note.strip(),
        'at': now.isoformat(timespec='seconds'),
    }


def progress(rows, answers, first, last):
    """Where the listener stands: the first unanswered row of the batch, or None when it is done."""
    done = {answer.get('id') for answer in answers}
    batch = range(first, last + 1)
    pending = [row for row in batch if rows[row - 1][0] not in done]
    return {
        'first': first,
        'last': last,
        'total': len(batch),
        'answered': len(batch) - len(pending),
        'row': pending[0] if pending else None,
    }


def parse_range(header, size):
    """(start, end) inclusive for a single 'bytes=' range, or None to send the whole file."""
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', header or '')
    if not match or (match.group(1) == '' and match.group(2) == ''):
        return None
    if match.group(1) == '':
        length = int(match.group(2))
        return (max(size - length, 0), size - 1) if length > 0 else None
    start = int(match.group(1))
    end = min(int(match.group(2)), size - 1) if match.group(2) else size - 1
    if start > end:
        raise ValueError('unsatisfiable range')
    return start, end


def make_handler(root, rows, first, last):
    answers_path = root / ANSWERS
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        server_version = 'rba-listen'
        sys_version = ''

        def log_message(self, *args):
            pass

        def local_only(self):
            """Refuses a request that did not come through the tunnel by name, the guard against DNS rebinding."""
            host = urlsplit(f'//{self.headers.get("Host", "")}').hostname
            origin = self.headers.get('Origin')
            if host not in LOCAL_HOSTS or (origin is not None and urlsplit(origin).hostname not in LOCAL_HOSTS):
                self.send_text(HTTPStatus.FORBIDDEN, 'local only')
                return False
            return True

        def common_headers(self):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'")

        def send_bytes(self, status, body, content_type):
            self.send_response(status)
            self.common_headers()
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def send_text(self, status, text):
            self.send_bytes(status, text.encode('utf-8'), 'text/plain; charset=utf-8')

        def send_json(self, status, value):
            self.send_bytes(status, json.dumps(value).encode('utf-8'), 'application/json')

        def do_GET(self):
            if not self.local_only():
                return
            path = urlsplit(self.path).path
            if path in STATIC:
                name, content_type = STATIC[path]
                self.send_bytes(HTTPStatus.OK, (HERE / name).read_bytes(), content_type)
            elif path == '/api/state':
                with lock:
                    self.send_json(HTTPStatus.OK, progress(rows, read_answers(answers_path), first, last))
            elif re.fullmatch(r'/audio/\d{1,4}', path):
                self.send_audio(int(path.rsplit('/', 1)[1]))
            else:
                self.send_text(HTTPStatus.NOT_FOUND, 'not found')

        def send_audio(self, row):
            if not first <= row <= last:
                self.send_text(HTTPStatus.NOT_FOUND, 'not in this batch')
                return
            try:
                path = host_path(root, rows[row - 1][1])
                size = path.stat().st_size
            except ValueError as error:
                self.send_text(HTTPStatus.FORBIDDEN, str(error))
                return
            except FileNotFoundError:
                self.send_text(HTTPStatus.NOT_FOUND, 'audio file missing')
                return
            try:
                wanted = parse_range(self.headers.get('Range'), size)
            except ValueError as error:
                self.send_text(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE, str(error))
                return
            start, end = wanted if wanted else (0, size - 1)
            self.send_response(HTTPStatus.PARTIAL_CONTENT if wanted else HTTPStatus.OK)
            self.common_headers()
            # The type comes from the extension alone, and no filename goes out: the name would unblind the row
            self.send_header('Content-Type', mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(end - start + 1))
            if wanted:
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.end_headers()
            try:
                with open(path, 'rb') as handle:
                    handle.seek(start)
                    left = end - start + 1
                    while left > 0:
                        chunk = handle.read(min(CHUNK, left))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass  # The browser seeks by dropping a request and opening another

        def do_POST(self):
            if not self.local_only():
                return
            if urlsplit(self.path).path != '/api/answer':
                self.send_text(HTTPStatus.NOT_FOUND, 'not found')
                return
            # JSON only: a cross-site form can't send it without a preflight this server never grants
            if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
                self.send_text(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, 'JSON only')
                return
            length = int(self.headers.get('Content-Length') or 0)
            if not 0 < length <= MOST_BODY_BYTES:
                self.send_text(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, 'body too large or empty')
                return
            try:
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError('body must be an object')
                answer = make_answer(body, rows, first, last, datetime.datetime.now(datetime.timezone.utc))
            except ValueError as error:
                self.send_text(HTTPStatus.BAD_REQUEST, str(error))
                return
            with lock:
                append_answer(answers_path, answer)
                state = progress(rows, read_answers(answers_path), first, last)
            self.send_json(HTTPStatus.OK, state)

    return Handler


def batch_bounds(text, count):
    match = re.fullmatch(r'(\d+)-(\d+)', text)
    if not match:
        raise SystemExit('--rows takes FIRST-LAST, for example 1-60')
    first, last = int(match.group(1)), int(match.group(2))
    if not 1 <= first <= last <= count:
        raise SystemExit(f'--rows must lie within 1-{count}')
    return first, last


def serve(args):
    root = Path(args.root).resolve()
    rows = parse_list((root / 'confirmation.md').read_text(encoding='utf-8'))
    if not rows:
        raise SystemExit('confirmation.md lists no rows')
    first, last = batch_bounds(args.rows, len(rows))
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(root, rows, first, last))
    server.daemon_threads = True
    state = progress(rows, read_answers(root / ANSWERS), first, last)
    print(f'listening on http://127.0.0.1:{server.server_address[1]} rows {first}-{last}, {state["answered"]} of {state["total"]} answered. Ctrl-C stops.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def classify(heard, reference):
    """agree within 2%, octave when half or double the reference within 2%, otherwise other."""
    def near(a, b):
        return abs(a - b) <= AGREE_WITHIN * b
    if near(heard, reference):
        return 'agree'
    if near(heard, reference * 2) or near(heard, reference / 2):
        return 'octave'
    return 'other'


def score_rows(answers, key):
    """Counts per group. The latest answer for a row wins, so a re-listen replaces the first try."""
    latest = {answer['id']: answer for answer in answers if 'id' in answer}
    groups = {}
    for answer in latest.values():
        entry = key.get(answer['id'])
        why = entry['why'] if entry else 'not in key'
        for name in (why, 'all'):
            counts = groups.setdefault(name, {'answered': 0, 'broken': 0, 'unsure': 0, 'no reference': 0, 'scored': 0, 'agree': 0, 'octave': 0, 'other': 0, 'from candidate': 0})
            counts['answered'] += 1
            if answer.get('broken'):
                counts['broken'] += 1
                continue
            if answer.get('unsure') or answer.get('finalBpm') is None:
                counts['unsure'] += 1
                continue
            label = entry.get('label') if entry else None
            reference = label if label is not None else (entry.get('candidate') if entry else None)
            if reference is None:
                counts['no reference'] += 1
                continue
            counts['scored'] += 1
            counts['from candidate'] += label is None
            counts[classify(answer['finalBpm'], reference)] += 1
    return groups


def score_table(groups):
    names = [name for name in ('random', 'disagreement', 'not in key', 'all') if name in groups]
    lines = ['| rows | answered | broken | unsure | no reference | scored | agree (2%) | octave | other | corrected | ref from candidate |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for name in names:
        c = groups[name]
        corrected = f'{100 * (c["octave"] + c["other"]) / c["scored"]:.1f}%' if c['scored'] else 'n/a'
        lines.append(f'| {name} | {c["answered"]} | {c["broken"]} | {c["unsure"]} | {c["no reference"]} | {c["scored"]} | {c["agree"]} | {c["octave"]} | {c["other"]} | {corrected} | {c["from candidate"]} |')
    return '\n'.join(lines)


def score(args):
    root = Path(args.root).resolve()
    answers = read_answers(root / ANSWERS)
    if not answers:
        raise SystemExit('no answers yet: score after listening')
    key = {}
    for line in (root / KEY).read_text(encoding='utf-8').splitlines():
        if line.strip():
            entry = json.loads(line)
            key[entry['id']] = entry
    groups = score_rows(answers, key)
    print(json.dumps(groups, indent=2) if args.json else score_table(groups))


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    serving = commands.add_parser('serve', help='serve the listening page on 127.0.0.1')
    serving.add_argument('--root', default='/srv/data/rba-tempo/free-data')
    serving.add_argument('--port', type=int, default=8459)
    serving.add_argument('--rows', default='1-60', help='the batch, FIRST-LAST in list order')
    scoring = commands.add_parser('score', help='compare the answers with the key, after listening')
    scoring.add_argument('--root', default='/srv/data/rba-tempo/free-data')
    scoring.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)
    (serve if args.command == 'serve' else score)(args)


if __name__ == '__main__':
    main(sys.argv[1:])
