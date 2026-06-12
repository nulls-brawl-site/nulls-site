import os, json, re, ast
from pathlib import Path
from flask import Flask, request, jsonify
import pandas as pd

app = Flask(__name__)
CSV_DIR = Path('/var/www/nulls-site/csv')
CSV_CACHE: dict = {}

# ──────────────────────────────────────────────
def csv_path(filename: str):
    name = Path(str(filename or '')).name
    if not name.endswith('.csv') or name != filename:
        return None
    path = CSV_DIR / name
    if not path.is_file():
        return None
    return path

def read_csv(filename: str):
    path = csv_path(filename)
    if path is None:
        return None
    mtime = path.stat().st_mtime
    cached = CSV_CACHE.get(filename)
    if cached and cached.get('mtime') == mtime:
        return cached
    try:
        df = pd.read_csv(path, header=0, encoding='utf-8', dtype=str)
        if df.empty:
            return None
        pk = df.columns[0]
        # Build friendly UI keys (handle empty/duplicate rows)
        ui_keys, last, count = [], 'UNKNOWN', 0
        for val in df[pk]:
            if pd.isna(val) or str(val).strip() == '':
                count += 1
                ui_keys.append(f'{last} [{count}]')
            else:
                last, count = str(val).strip(), 0
                ui_keys.append(last)
        df['_ui_key'] = ui_keys
        # Types row (first data row, index 0)
        types = df.iloc[0].to_dict() if len(df) > 0 else {}
        # Boolean columns (type == 'Boolean' or 'boolean')
        bool_cols = [c for c, v in types.items()
                     if str(v).strip().lower() == 'boolean' and c not in ('_ui_key',)]
        result = {'df': df, 'types': types, 'pk': pk, 'bool_cols': bool_cols, 'mtime': mtime}
        CSV_CACHE[filename] = result
        return result
    except Exception as e:
        print(f'CSV read error {filename}: {e}')
        return None

# ──────────────────────────────────────────────
@app.route('/health')
def health():
    return jsonify({'ok': True})

@app.route('/list')
def list_csv():
    files = [
        {'name': p.name, 'size': p.stat().st_size}
        for p in sorted(CSV_DIR.glob('*.csv'), key=lambda x: x.name)
        if p.is_file()
    ]
    return jsonify({'success': True, 'files': files})

@app.route('/keys', methods=['POST'])
def get_keys():
    d = request.json or {}
    info = read_csv(d.get('filename', ''))
    if info is None:
        return jsonify({'success': False, 'error': 'not found'})
    keys = info['df'].iloc[1:]['_ui_key'].tolist()
    return jsonify({'success': True, 'keys': keys, 'bool_cols': info['bool_cols']})

@app.route('/row', methods=['POST'])
def get_row():
    d = request.json or {}
    info = read_csv(d.get('filename', ''))
    if info is None:
        return jsonify({'success': False})
    df = info['df']
    types = info['types']
    pk = info['pk']
    row_key = str(d.get('row_key', ''))
    sub = df.iloc[1:].reset_index(drop=True)
    row = sub[sub['_ui_key'] == row_key]
    if row.empty:
        return jsonify({'success': False, 'error': 'row not found'})
    row_data = row.iloc[0].to_dict()
    fields = []
    for col, val in row_data.items():
        if col in ('_ui_key', pk):
            continue
        fields.append({
            'name': col,
            'value': '' if pd.isna(val) else str(val),
            'type': str(types.get(col, 'String'))
        })
    return jsonify({'success': True, 'fields': fields})

@app.route('/bool_row', methods=['POST'])
def get_bool_row():
    """Return representative fields for a boolean filter (first data row)."""
    d = request.json or {}
    info = read_csv(d.get('filename', ''))
    if info is None:
        return jsonify({'success': False})
    df = info['df']
    types = info['types']
    pk = info['pk']
    if len(df) < 2:
        return jsonify({'success': False})
    row_data = df.iloc[1].to_dict()
    fields = []
    for col, val in row_data.items():
        if col in ('_ui_key', pk):
            continue
        fields.append({
            'name': col,
            'value': '' if pd.isna(val) else str(val),
            'type': str(types.get(col, 'String'))
        })
    return jsonify({'success': True, 'fields': fields})

@app.route('/fix', methods=['POST'])
def fix_json():
    d = request.json or {}
    content = d.get('json_content', '')
    data = None
    try:
        data = json.loads(content)
    except Exception:
        try:
            text = re.sub(r'//.*', '', content)
            text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
            text = re.sub(r'(["\]\}0-9]|true|false|null)\s+(?=["\{])', r'\1, ', text)
            text = text.replace('true','True').replace('false','False').replace('null','None')
            oc = text.count('{') - text.count('}')
            os_ = text.count('[') - text.count(']')
            if oc > 0: text += '}' * oc
            if os_ > 0: text += ']' * os_
            data = ast.literal_eval(text)
            if isinstance(data, tuple):
                data = next((x for x in data if isinstance(x, dict)), {})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)})
    if not isinstance(data, dict):
        return jsonify({'success': False, 'message': 'not a dict'})
    # Fill missing required fields
    if '@author' not in data and 'Author' not in data:
        data['@author'] = 'User'
    if '@title' not in data and 'Title' not in data:
        data['@title'] = {'RU': 'Auto Fixed', 'EN': 'Auto Fixed'}
    if '@description' not in data and 'Description' not in data:
        data['@description'] = {'RU': 'Fixed', 'EN': 'Fixed'}
    if '@gv' not in data:
        data['@gv'] = 65
    return jsonify({'success': True, 'fixed_json': data})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, debug=False)
