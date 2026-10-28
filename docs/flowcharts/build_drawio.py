"""Convert the proposal diagrams to editable, uncompressed diagrams.net XML."""
from __future__ import annotations

from pathlib import Path
from datetime import datetime, timezone
import json
import math
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DESIGN = json.loads((HERE / 'proposal-design.json').read_text())
LAYOUT = json.loads((HERE / 'proposal-layout.json').read_text())
SCREENS = {row['id']: row for row in DESIGN['screens']}
OUTPUT = ROOT / 'outputs/machi-drawio/machi-safety-transition-proposal.drawio'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)


def number(value):
    return f'{value:.3f}'.rstrip('0').rstrip('.') if isinstance(value, float) else str(value)


def wrapped_lines(text, width, font=12):
    capacity = max(4, width / (font * .96))
    total = 0
    for line in str(text).split('\n'):
        weight = sum(.57 if ord(char) < 128 else 1 for char in line)
        total += max(1, math.ceil(weight / capacity))
    return total


BASE = 'whiteSpace=wrap;html=0;fontFamily=Arial;fontColor=#000000;'
TEXT = BASE + 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacing=3;'
BOX = BASE + 'rounded=0;strokeColor=#000000;fillColor=#FFFFFF;align=center;verticalAlign=middle;spacing=6;strokeWidth=1;'
ARROW = BASE + 'edgeStyle=segmentEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;strokeColor=#000000;strokeWidth=1;endArrow=classic;endFill=1;fontSize=11;labelBackgroundColor=#FFFFFF;'


class Page:
    def __init__(self, index, name, height=1040):
        self.name = name
        self.index = index
        self.count = 0
        self.diagram = ET.Element('diagram', id=f'page-{index:02}', name=name)
        self.model = ET.SubElement(self.diagram, 'mxGraphModel', {
            'dx': '1422', 'dy': '900', 'grid': '1', 'gridSize': '10',
            'guides': '1', 'tooltips': '1', 'connect': '1', 'arrows': '1',
            'fold': '1', 'page': '1', 'pageScale': '1', 'pageWidth': '1280',
            'pageHeight': str(height), 'math': '0', 'shadow': '0',
        })
        self.root = ET.SubElement(self.model, 'root')
        ET.SubElement(self.root, 'mxCell', id='0')
        ET.SubElement(self.root, 'mxCell', id='1', parent='0')
        self.geometry = {}

    def uid(self, prefix='cell'):
        self.count += 1
        return f'p{self.index:02}-{prefix}-{self.count:04}'

    def vertex(self, text, x, y, width, height, style=TEXT, parent='1', uid=None):
        uid = uid or self.uid('vertex')
        cell = ET.SubElement(self.root, 'mxCell', {
            'id': uid, 'value': str(text), 'style': style,
            'vertex': '1', 'parent': parent,
        })
        ET.SubElement(cell, 'mxGeometry', {
            'x': number(x), 'y': number(y), 'width': number(width),
            'height': number(height), 'as': 'geometry',
        })
        self.geometry[uid] = (x, y, width, height)
        return uid

    def edge(self, source, target, points=None, label='', bounds=None, parent='1'):
        uid = self.uid('edge')
        style = ARROW
        if points:
            sx, sy, sw, sh = self.geometry[source]
            tx, ty, tw, th = self.geometry[target]
            x1, y1 = points[0]
            x2, y2 = points[-1]
            style += f'exitX={number((x1-sx)/sw)};exitY={number((y1-sy)/sh)};exitDx=0;exitDy=0;entryX={number((x2-tx)/tw)};entryY={number((y2-ty)/th)};entryDx=0;entryDy=0;'
        cell = ET.SubElement(self.root, 'mxCell', {
            'id': uid, 'value': label, 'style': style, 'edge': '1',
            'parent': parent, 'source': source, 'target': target,
        })
        geometry = ET.SubElement(cell, 'mxGeometry', {'relative': '1', 'as': 'geometry'})
        if points and len(points) > 2:
            array = ET.SubElement(geometry, 'Array', {'as': 'points'})
            for x, y in points[1:-1]:
                ET.SubElement(array, 'mxPoint', x=number(x), y=number(y))
        if label and bounds and points:
            # Keep captions on their original connector, while preserving their layout.
            lengths = [math.dist(a, b) for a, b in zip(points, points[1:])]
            middle = sum(lengths) / 2
            mx, my = points[0]
            for a, b, length in zip(points, points[1:], lengths):
                if middle <= length:
                    ratio = middle / length if length else 0
                    mx = a[0] + ratio * (b[0] - a[0])
                    my = a[1] + ratio * (b[1] - a[1])
                    break
                middle -= length
            cx = (bounds['col'] + bounds['width'] / 2) * 21
            cy = (bounds['row'] + bounds.get('height', 3) / 2) * 18
            ET.SubElement(geometry, 'mxPoint', x=number(cx-mx), y=number(cy-my), attrib={'as': 'offset'})
            cell.set('style', style + f'labelWidth={bounds["width"]*21};')
        return uid

    def header(self, subtitle):
        self.vertex('画面遷移図', 20, 12, 330, 32, TEXT+'fontSize=21;fontStyle=1;')
        self.vertex('地域危険箇所マップ・安全管理システム', 20, 47, 850, 24, TEXT+'fontSize=13;')
        self.vertex('作成日：2026年10月28日', 990, 15, 250, 24, TEXT+'fontSize=12;align=right;')
        self.vertex('設計案：追加企画書に基づく未実装機能を含む。現行の補助機能は別図に併記。', 20, 74, 1215, 24, TEXT+'fontSize=11;')
        self.vertex('【'+subtitle+'】', 20, 108, 1215, 32, TEXT+'fontSize=15;fontStyle=1;')


pages = []
flow_count = 0
for spec in LAYOUT:
    details = spec.get('details', [])
    page = Page(len(pages)+1, spec['name'], max(1040, 940+len(details)*230))
    page.header(spec['title'])
    mapping = {}
    for node in spec['nodes']:
        if node['r'] >= 50:
            continue
        uid = page.vertex(
            node['label'], node['c']*21, node['r']*18,
            node['w']*21, node['h']*18,
            BOX+'fontSize=12;'+('dashed=1;dashPattern=5 4;' if node['dashed'] else ''),
        )
        mapping[node['id']] = uid
    for edge in spec['links']:
        page.edge(mapping[edge['from']], mapping[edge['to']], edge['points'], edge.get('label', ''), edge.get('labelBounds'))
    for annotation in spec.get('annotations', []):
        page.vertex(annotation['text'], annotation['c']*21, annotation['r']*18, annotation['w']*21, annotation['h']*18, TEXT+'fontSize=11;fillColor=#FFFFFF;')
    page.vertex('実線：画面　破線：同画面内の結果・判定・状態等。同じ画面IDは同じ画面を表す。', 20, 842, 1215, 30, TEXT+'fontSize=11;')
    if spec['name'].startswith('画面遷移図_既存補助'):
        page.vertex('既存補助機能：追加企画書の主対象外として保持。新しい組織認証への接続は見直し対象。', 20, 878, 1215, 30, TEXT+'fontSize=11;')
    for index, flow in enumerate(details):
        group = page.vertex('', 20, 920+index*230, 1215, 215, 'group;', uid=f'p{page.index:02}-flow-{flow["id"]}')
        page.vertex(f'【{flow["id"]} {flow["title"]}／{flow["role"]}】', 0, 0, 1210, 32, TEXT+'fontSize=14;fontStyle=1;', parent=group)
        stages = [('選択', flow['selection'], flow['selection_ref']), ('確認', flow['confirmation'], flow['confirmation_ref']), ('終了', flow['end'], flow['end_ref'])]
        stage_ids = []
        for i, (phase, action, ref) in enumerate(stages):
            same = i > 0 and ref == stages[i-1][2]
            page.vertex(action, i*400, 35, 300, 42, TEXT+'fontSize=12;align=center;', parent=group)
            stage_ids.append(page.vertex(f'{ref} {SCREENS[ref]["title"]}\n（{phase}{"・同画面" if same else ""}）', i*400, 82, 300, 76, BOX+'fontSize=13;'+('dashed=1;dashPattern=5 4;' if same else ''), parent=group))
        page.edge(stage_ids[0], stage_ids[1], parent=group)
        page.edge(stage_ids[1], stage_ids[2], parent=group)
        page.vertex('出典：企画書 第'+'・'.join(map(str, flow['requirements']))+'項。'+flow['note'], 0, 166, 1210, 45, TEXT+'fontSize=11;', parent=group)
        flow_count += 1
    pages.append(page)


def table_page(name, title, headings, widths, rows):
    heights = [max(42, max(wrapped_lines(value, width-16, 12) for value, width in zip(row, widths))*18+18) for row in rows]
    page = Page(len(pages)+1, name, max(1040, 230+sum(heights)))
    page.header(title)
    y = 165
    x = 20
    for heading, width in zip(headings, widths):
        page.vertex(heading, x, y, width, 42, BOX+'fontSize=12;fontStyle=1;align=left;spacingLeft=8;')
        x += width
    y += 42
    for row, height in zip(rows, heights):
        x = 20
        for value, width in zip(row, widths):
            page.vertex(value, x, y, width, height, BOX+'fontSize=12;align=left;spacingLeft=8;')
            x += width
        y += height
    pages.append(page)


table_page('設計画面一覧', '画面定義と現行実装の区別', ['画面ID','利用区分','画面名','設計区分','対応要件'], [95,165,410,325,220], [[s['id'],s['role'],s['title'],s['status'],'第'+'・'.join(map(str,s['requirements']))+'項' if s['requirements'] else '既存補助機能'] for s in DESIGN['screens']])
table_page('操作一覧', '選択・確認・終了の操作一覧', ['操作ID','操作名','選択','確認','終了'], [90,255,290,290,290], [[f['id'],f['title'],f['selection'],f['confirmation'],f['end']] for f in DESIGN['flows']])
table_page('要件対応・実装差分', '追加企画書の全20項目と設計・実装差分', ['項','機能','必須内容','対応する図','現行実装との差'], [60,200,335,260,360], [[r['no'],r['title'],r['required'],r['module'],r['gap']] for r in DESIGN['requirements']])
definitions = []
definitions += [['危険箇所カテゴリ',v,'複数のカテゴリを設定可能。担当部署・災害種別・表示色順序を管理。'] for v in DESIGN['categories']]
definitions += [['報告種別',v,'修繕は自治体、新設・防災改善は自治会経由。点検・緊急確認のルールは要確認。'] for v in ['修繕報告','新設要望','防災改善要望','点検依頼','緊急確認依頼']]
definitions += [['写真区分',v,'危険箇所・登録者・撮影日時・登録日時に関連付ける。'] for v in ['住民報告時','点検時','対応前','対応後','再点検時']]
definitions += [['対応状況',v,'変更前後・変更者・内容・日時を保持。許可遷移は要確認。'] for v in DESIGN['statuses']]
definitions += [['マーカー表示',v,'文字・アイコンも併記。表示競合時の優先順位は要確認。'] for v in ['危険度：高＝赤','危険度：中＝オレンジ','危険度：低＝黄色','管理者確認中＝青','対応完了＝緑']]
definitions += [['点検優先度の判断項目',v,'配点・重み・閾値は未確定。AI APIを用いず候補を算出し、自治体が最終確定。'] for v in ['現在の危険度','避難経路上の有無','避難所への近さ','通学路上の有無','過去の災害・事故','住民からの報告件数','最終点検からの経過日数','通行への影響','代替経路の有無','私有地・公有地']]
table_page('入力・状態の定義', 'カテゴリ・報告種別・写真・状態・優先度項目', ['区分','値・項目','意味と扱い'], [250,390,575], definitions)
table_page('権限一覧', '利用者区分・所属組織・個人情報の制限', ['利用区分','閲覧・更新の範囲','認めない操作','登録・認証条件'], [220,345,345,305], DESIGN['roles'])
table_page('確認事項', '企画書で未確定の内容', ['項目','未確定の内容','図面での扱い'], [240,475,500], DESIGN['issues'])
table_page('改訂履歴', '改訂履歴・出典', ['項目','内容'], [230,985], [
    ['版','2.0（追加企画書反映版・設計案）'],
    ['作成日','2026年10月28日'],
    ['内容','3利用区分、組織権限、写真、振り分け、点検、修繕、再点検、私有地管理等の設計を追加。'],
    ['出典','＜追加＞企画書_地域危険箇所マップ・安全管理システム_Dチーム.xlsx：企画書!A10 第1〜20項。書式は画面遷移図 (1).xlsxを参考。'],
    ['実装との区別','85件の新設計の画面定義と既存補助32画面を区別。新機能の実装完了を示すものではない。'],
    ['画面ID','本設計版で再採番。C：共通、U：一般、O：組織、S：システム、E：既存補助。旧版と同一IDでも対応しない。'],
    ['編集','画面枠・矢印・ラベル・一覧はすべて編集可能なdraw.ioオブジェクト。図を画像として貼り付けたものではない。'],
])

assert len(pages) == 31
assert flow_count == 70
mxfile = ET.Element('mxfile', host='app.diagrams.net', agent='Codex', type='device', compressed='false', modified=datetime.now(timezone.utc).isoformat())
for page in pages:
    ids = [cell.attrib['id'] for cell in page.root.findall('mxCell')]
    assert len(ids) == len(set(ids))
    known = set(ids)
    for cell in page.root.findall('mxCell'):
        if cell.attrib.get('edge') == '1':
            assert cell.attrib['source'] in known and cell.attrib['target'] in known
        if cell.attrib.get('parent'):
            assert cell.attrib['parent'] in known
    mxfile.append(page.diagram)
ET.indent(mxfile, space='  ')
ET.ElementTree(mxfile).write(OUTPUT, encoding='utf-8', xml_declaration=True)
print(json.dumps({'file':str(OUTPUT),'pages':len(pages),'operation_groups':flow_count,'editable_vertices':sum(len(p.root.findall("mxCell[@vertex='1']")) for p in pages),'connectors':sum(len(p.root.findall("mxCell[@edge='1']")) for p in pages),'bytes':OUTPUT.stat().st_size},ensure_ascii=False))
