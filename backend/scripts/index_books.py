"""Build a private page-aware SQLite book index. Run from the repository root."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import unicodedata

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.book_knowledge import ROOT, DEFAULT_INDEX, normalize, source_snapshot


def metadata_for(path, reader):
    filename = path.stem
    if filename == 'An_Unquiet_Mind':
        return ('Giới thiệu An Unquiet Mind (bản Wikipedia)', 'Wikipedia contributors', 'en', 'book_overview')
    if filename.startswith('D.1-ADHD'):
        return ('Rối loạn tăng động giảm chú ý — IACAPAP, phiên bản 2020', 'Anthony de Freitas de Sousa và cộng sự', 'vi', 'professional_pediatric')
    if filename == 'dung-de-tram-cam-tan-cong-ban':
        return ('Đừng để trầm cảm tấn công bạn', 'David D. Burns', 'vi', 'psychoeducation')
    if filename.startswith('Tim-minh-trong'):
        return ('Tìm mình trong thế giới hậu tuổi thơ', 'Đặng Hoàng Giang', 'vi', 'narrative')
    if filename.startswith('Đại Dương Đen'):
        return ('Đại dương đen', 'Đặng Hoàng Giang', 'vi', 'narrative')
    match = re.fullmatch(r'Hat giong tam hon (\d+)', filename)
    if match:
        return (f'Hạt giống tâm hồn — tập {int(match[1])}', 'Nhiều tác giả', 'vi', 'inspirational_stories')
    # Unknown future documents retain their filename; do not infer authorship.
    return (filename, '', 'unknown', 'unclassified')


def clean_text(text):
    text = unicodedata.normalize('NFC', text).replace('\x00', '').replace('\u00ad', '')
    text = re.sub(r'(?<=\w)-\s*\n\s*(?=\w)', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def page_chunks(text, size=1100, overlap=140):
    start = 0
    while start < len(text):
        end = min(start+size, len(text))
        if end < len(text):
            boundary = text.rfind(' ', start+size//2, end)
            if boundary > start:
                end = boundary
        chunk = text[start:end].strip()
        if len(chunk) >= 100:
            yield chunk
        if end >= len(text):
            break
        start = max(start+1, end-overlap)
        next_space = text.find(' ', start)
        if next_space != -1 and next_space < end:
            start = next_space+1


def build(folder: Path, output: Path):
    from pypdf import PdfReader
    files = sorted(folder.rglob('*.pdf'))
    if not files:
        raise ValueError('Không tìm thấy PDF trong thư mục book.')
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix('.building.sqlite')
    if temp.exists():
        temp.unlink()
    reports = []
    try:
        connection = sqlite3.connect(temp)
        connection.executescript('''
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE chunks (id INTEGER PRIMARY KEY, book_id TEXT, title TEXT, author TEXT,
                page INTEGER, language TEXT, kind TEXT, text TEXT, terms TEXT);
            CREATE VIRTUAL TABLE search USING fts5(terms, tokenize='unicode61 remove_diacritics 2');
        ''')
        snapshot = source_snapshot(folder)
        for path in files:
            relative = path.relative_to(folder).as_posix()
            report = {'file': relative, 'pages': 0, 'readable_pages': 0, 'chunks': 0, 'warnings': []}
            try:
                reader = PdfReader(path)
                title, author, language, kind = metadata_for(path, reader)
                report.update(title=title, author=author, language=language, kind=kind, pages=len(reader.pages))
                book_id = hashlib.sha256(relative.encode()).hexdigest()[:16]
                if kind == 'book_overview':
                    report['warnings'].append('Bản giới thiệu Wikipedia, không phải toàn văn sách.')
                if kind == 'professional_pediatric':
                    report['warnings'].append('Tài liệu chuyên môn trẻ em; không dùng để chẩn đoán hoặc hướng dẫn thuốc cho sinh viên.')
                if kind == 'unclassified':
                    report['warnings'].append('Chưa phân loại; cần kiểm tra trước khi dùng.')
                for number, page in enumerate(reader.pages, 1):
                    text = clean_text(page.extract_text() or '')
                    if len(text) < 100:
                        continue
                    report['readable_pages'] += 1
                    # Exclude contents / credits pages; these are poor grounding passages.
                    if kind == 'unclassified' or (len(text) < 150) or ('muc luc' in normalize(text[:80])):
                        continue
                    for chunk in page_chunks(text):
                        terms = normalize(chunk)
                        cursor = connection.execute('INSERT INTO chunks (book_id,title,author,page,language,kind,text,terms) VALUES (?,?,?,?,?,?,?,?)',
                            (book_id,title,author,number,language,kind,chunk,terms))
                        connection.execute('INSERT INTO search (rowid,terms) VALUES (?,?)',(cursor.lastrowid,terms))
                        report['chunks'] += 1
                if report['readable_pages'] < report['pages']*.3:
                    report['warnings'].append('Ít trang trích được văn bản; có thể cần OCR. Không tự nhận đã đọc hết.')
            except Exception as error:
                report['warnings'].append('Không đọc được tài liệu: '+type(error).__name__)
            reports.append(report)
            print(f"{relative}: {report['readable_pages']}/{report['pages']} trang đọc được, {report['chunks']} đoạn", flush=True)
        if not sum(r['chunks'] for r in reports):
            raise ValueError('Không có văn bản đủ chất lượng; giữ nguyên chỉ mục cũ.')
        if snapshot != source_snapshot(folder):
            raise ValueError('Sách đã thay đổi trong lúc lập chỉ mục. Hãy chạy lại.')
        connection.execute('INSERT INTO metadata VALUES (?,?)', ('snapshot',json.dumps(snapshot,ensure_ascii=False)))
        connection.execute('INSERT INTO metadata VALUES (?,?)', ('schema_version','1'))
        connection.execute('INSERT INTO search(search) VALUES (?)',('optimize',))
        connection.commit()
        connection.close()
        os.replace(temp,output)
        report_path=output.parent/'report.json'
        report_path.write_text(json.dumps({'documents':reports,'total_chunks':sum(r['chunks'] for r in reports),'page_numbering':'Trang PDF tính từ 1, có thể khác số trang in trong sách.'},ensure_ascii=False,indent=2),encoding='utf-8')
        print('Chỉ mục riêng tư:',output,flush=True)
        return reports
    finally:
        if 'connection' in locals():
            connection.close()
        if temp.exists():
            temp.unlink()


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description='Lập chỉ mục sách cục bộ, không gọi API trả phí.')
    parser.add_argument('--books',type=Path,default=ROOT/'book')
    parser.add_argument('--output',type=Path,default=DEFAULT_INDEX)
    args=parser.parse_args()
    build(args.books.resolve(),args.output.resolve())
