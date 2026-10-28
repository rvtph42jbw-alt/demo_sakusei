"""Build offline, printable flowchart documentation from the existing route registry."""
from pathlib import Path
from html import escape as h
from collections import defaultdict
import subprocess, json, csv, io, runpy
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
flows=runpy.run_path(str(OUT/'spec.py'))['flows']
data=json.loads(subprocess.check_output(['node','--input-type=module','-e','import {groups,routes} from "./src/routes.js"; console.log(JSON.stringify({groups,routes}));'],cwd=ROOT))
routes=data['routes']; known={r['path'] for r in routes}
assert len(flows)>=50 and len({f[0] for f in flows})==len(flows)
assert known.issubset({f[1] for f in flows})
alias={'@admin':'/admin.html','@login-dialog':'/admin.html｜ログインダイアログ','@dialog':'/admin.html｜地点入力ダイアログ','@history-dialog':'/admin.html｜操作履歴ダイアログ','@reports-dialog':'/admin.html｜通報一覧ダイアログ','@browser-confirm':'ブラウザーの確認ダイアログ','@confirm-dialog':'端末データ削除の確認ダイアログ','@permission':'ブラウザーの位置情報許可','@download':'ファイルのダウンロード','@tel':'端末の通話機能'}
def ref(p):
 if p.startswith('@'):return alias[p]
 assert p in known,p
 return '/#/'+p
for f in flows:
 assert len(f)==9
 for p in (f[3],f[5],f[7]):ref(p)

def wrap(s,limit):
 result=[];line='';n=0
 for c in s:
  width=.55 if ord(c)<128 else 1
  if n+width>limit and line:result.append(line);line='';n=0
  line+=c;n+=width
 if line:result.append(line)
 return result

def triple_svg(f):
 title,focus,a,ar,b,br,c,cr,note=f
 nodes=[]
 for i,(phase,label,path,color) in enumerate(zip(['選択','確認','終了'],[a,b,c],[ar,br,cr],['#eaf1f9','#f5efe4','#eaf3eb'])):
  x=10+i*340
  lines=wrap(label,23)
  assert len(lines)<=2,(title,label)
  labels=''.join(f'<text x="{x+145}" y="{69+18*j-(7 if len(lines)>1 else 0)}" text-anchor="middle" font-size="14" fill="#27384a">{h(t)}</text>' for j,t in enumerate(lines))
  nodes.append(f'<rect x="{x}" y="10" width="290" height="119" rx="{24 if i==2 else 7}" fill="{color}" stroke="#c5d0da"/><text x="{x+145}" y="33" text-anchor="middle" font-size="11" font-weight="600" fill="#5f7387">{phase}</text>{labels}<text x="{x+145}" y="110" text-anchor="middle" font-size="9" fill="#6d7a87">{h(ref(path))}</text>')
  if i<2:nodes.append(f'<path d="M{x+302} 70h24" fill="none" stroke="#74899e" stroke-width="2" marker-end="url(#arrow)"/>')
 return f'<svg class="triple" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 140" role="img" aria-label="{h(title)}：選択、確認、終了"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="m0 0 10 5-10 5" fill="#74899e"/></marker></defs>'+''.join(nodes)+'</svg>'

parts=[]
parts.append('''<section class="sheet cover"><p class="eyebrow">GRADUATION PROJECT / DESIGN DOCUMENT</p><h1>まちの安全マップ<br>画面遷移・操作フローチャート</h1><p class="lead">選択 → 確認 → 終了</p><div class="metrics"><div><strong>60</strong><span>利用者向けのURL画面</span></div><div><strong>70</strong><span>3段階の操作フロー</span></div></div><h2>この資料の読み方</h2><p>「終了」はその操作の目的を達成した状態です。サイト全体を閉じることではありません。「確認」は内容の閲覧・反映結果の確認も含み、実装に確認ページがない場合は独立ページとして数えません。</p><p><b>70組 × 3段階を、210個の独立画面と数える資料ではありません。</b>同じURLで完結する入力・保存・通知、管理者ダイアログ、外部サイト・電話アプリは区別して記載しています。</p><h2>構成</h2><ol><li>全体構成図：利用者向け60画面を8カテゴリーで掲載</li><li>共通導線とエラー・取消・外部遷移の扱い</li><li>操作別フロー：利用者向け60組と管理者向け10組</li></ol><p class="source">確認元：src/routes.js、src/main.js、src/admin.js、server/app.js。作成日：2026年10月28日（日本時間）。この資料は提出用で、利用者向けサイトに画面数を表示するものではありません。</p></section>''')
# The overview includes every registered URL; arrows show each category's entry and child pages.
ids={r['path']:f'S{i+1:02d}' for i,r in enumerate(routes)}
for start in (0,4):
 groups=data['groups'][start:start+4];cards=[]
 for title,icon,items in groups:
  height=62+len(items)*29
  root=items[0][0]
  ns=[]
  for j,(path,name,desc) in enumerate(items):
   y=37+j*29
   if j:ns.append(f'<path d="M14 48V{y+11}h12" fill="none" stroke="#c1cdda"/>')
   ns.append(f'<rect x="26" y="{y}" width="443" height="24" rx="4" fill="{"#eaf0f7" if j==0 else "#f8fafc"}" stroke="#d6dee6"/><text x="35" y="{y+16}" fill="#4c6277" font-size="10">{ids[path]}　{h(name)}</text><text x="460" y="{y+16}" text-anchor="end" fill="#81909f" font-size="7">{h('/#/'+path)}</text>')
  svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 {height}"><text x="10" y="20" fill="#243c54" font-size="14" font-weight="600">{h(title)}</text>'+''.join(ns)+'</svg>'
  cards.append('<div class="overview-card">'+svg+'</div>')
 parts.append(f'<section class="sheet"><p class="eyebrow">SCREEN OVERVIEW {1 if start==0 else 2} / 2</p><h2>全画面の構成図</h2><p class="sub">カテゴリーの入口から、各画面へ移動します。同じカテゴリー内は実装済みのタブ・関連リンクからも移動できます。</p><div class="overview-grid">'+''.join(cards)+'</div></section>')
parts.append('''<section class="sheet"><p class="eyebrow">SHARED NAVIGATION / EXCEPTIONS</p><h2>共通導線と分岐</h2><div class="shared"><h3>共通の移動</h3><p>各画面 → ロゴ・地図メニュー → 地図トップ<br>各画面 → メインメニュー → 検索／通報／避難情報／お気に入り<br>各画面 → 利用者アイコン → 設定<br>設定・各画面のフッター → 使い方 → ヘルプ → サイトマップ → 各機能</p><p>PCではヘッダーから管理者ページへ移動できます。モバイルでは「設定 → このサービスについて → 管理者ページ」からも開けます。</p></div><h3>通報の入力不備・通信エラー</h3><div class="mini-flow">通報内容の確認 → 位置が未入力 → 場所選択へ戻る<br>通報内容の確認 → 名称・状況が未入力 → 詳細入力へ戻る<br>送信失敗 → 確認画面でエラー通知 → 内容を保持して再試行</div><h3>許可・取消・保存エラー</h3><div class="mini-flow">現在地を選択 → 許可できた → 現在地を表示<br>現在地を選択 → 拒否・取得失敗 → 同画面に通知<br>削除確認 → キャンセル → 変更せず元の画面<br>端末保存が失敗 → 保存できない旨を通知 → ブラウザー設定を確認</div><h3>管理者操作のエラー</h3><div class="mini-flow">認証失敗・試行制限 → ログイン画面で通知 → 再入力または待機<br>編集・削除の競合 → 409エラー → 再取得してやり直す<br>確認済み通報の再確認 → 競合エラー → 最新状態を再取得</div><h3>外部への移動</h3><p class="sub">気象庁・自治体・ハザードマップ・OpenStreetMapは外部サイトです。電話番号のリンクは端末の通話機能へ移り、JSON書き出しはファイルのダウンロードです。いずれも独立したアプリ内完了ページとして数えません。</p><p class="sub">オンライン地図が取得できないときは参考図を表示します。安全な避難経路の計算や避難所の開設状況の配信を行う画面はありません。</p></section>''')

mermaid=['# 画面遷移・操作フローチャート（編集用）\n\n70組の操作を「選択→確認→終了」で整理。3段階は独立した3画面を意味しません。画面のURLを各段階に併記し、同画面操作とダイアログを区別しています。\n\n## 全体構成\n\n```mermaid\nflowchart LR']
for g,(title,ic,items) in enumerate(data['groups']):
 mermaid.append(f'  subgraph G{g}["{title}"]')
 for path,title,desc in items:mermaid.append(f'    {ids[path]}["{title}<br/>/#/{path}"]')
 for path,title,desc in items[1:]:mermaid.append(f'    {ids[items[0][0]]} <--> {ids[path]}')
 mermaid.append('  end')
# Principal cross-category navigation and input wizard; global navigation is described separately.
connections=[('map','search'),('map','report'),('map','evacuation'),('map','favorites'),('map','places'),('search','search/results'),('search/results','places/detail'),('places/detail','report'),('report/location','report/category'),('report/category','report/details'),('report/details','report/review'),('report/review','report/complete'),('report/complete','report/status'),('report/history','report/status'),('report/status','places/detail'),('favorites/places','places/detail'),('evacuation/shelter-detail','evacuation/route'),('evacuation/route','map/disaster'),('help','sitemap'),('settings/about','help/sources')]
# The additional report link originates from the caution tab, not the detail tab.
connections=[(a,b) for a,b in connections if (a,b)!=('places/detail','report')]+[('places/caution','report')]
for a,b in connections:mermaid.append(f'  {ids[a]} --> {ids[b]}')
mermaid+=['```\n\n共通のメインナビは各画面から地図・検索・通報・避難情報・お気に入りへ、利用者アイコンは設定へ接続します。全ての組合せを図に重ねると読みにくいため、この共通規則を併記しています。外部サイト・電話・通知・ダイアログはURL画面とは別です。\n']

records=[]
for start in range(0,len(flows),4):
 blocks=[]
 for i,f in enumerate(flows[start:start+4],start):
  title,focus,a,ar,b,br,c,cr,note=f; fid=f'F{i+1:02d}'
  blocks.append(f'<article class="flow" id="{fid}" data-search="{h(title+" "+a+" "+b+" "+c)}"><h3><span>{fid}</span>{h(title)}<small>{"利用者" if i<60 else "管理者"}</small></h3>{triple_svg(f)}<p class="flow-note">{h(note)}</p></article>')
  mermaid += [f'## {fid} {title}\n\n```mermaid\nflowchart LR\n  {fid}A["選択<br/>{a}<br/>{ref(ar)}"] --> {fid}B["確認<br/>{b}<br/>{ref(br)}"] --> {fid}C(["終了<br/>{c}<br/>{ref(cr)}"])\n```\n\n補足：{note}\n']
  records.append(dict(id=fid,title=title,role='利用者' if i<60 else '管理者',selection=a,selection_ref=ref(ar),confirmation=b,confirmation_ref=ref(br),end=c,end_ref=ref(cr),note=note))
 parts.append(f'<section class="sheet detail-sheet"><p class="eyebrow">OPERATION FLOW / {start+1:02d}–{min(start+4,len(flows)):02d}</p><h2>選択・確認・終了の操作フロー</h2>'+''.join(blocks)+'</section>')
html='''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>まちの安全マップ｜画面遷移フローチャート</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef2f6;color:#263c51;font-family:"Noto Sans CJK JP","Noto Sans JP",Meiryo,sans-serif;font-size:12px;line-height:1.85}.toolbar{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #d9e1e8;padding:12px 20px;display:flex;align-items:center;gap:16px;box-shadow:0 2px 8px #253e5610}.toolbar strong{font-size:13px}.toolbar input{margin-left:auto;width:250px;max-width:40vw;border:1px solid #ccd6df;border-radius:6px;padding:9px;font:inherit}.toolbar button{background:#2d5577;color:#fff;border:0;border-radius:6px;padding:10px 15px;cursor:pointer}.sheet{width:210mm;min-height:273mm;padding:14mm;margin:20px auto;background:white;box-shadow:0 5px 24px #28445d0d;break-after:page}.eyebrow{font-size:9px;letter-spacing:1.8px;color:#8797a7;font-weight:600;margin:0 0 16px}h1{font-size:31px;line-height:1.65;letter-spacing:1px;margin:35px 0 20px}h2{font-size:20px;font-weight:600;margin:0 0 18px}h3{font-weight:600;font-size:13px;margin:12px 0}.lead{font-size:23px;letter-spacing:3px;color:#55758e;margin-bottom:28px}.metrics{display:flex;gap:55px;margin:25px 0 35px;padding:22px 0;border-block:1px solid #e2e7ed}.metrics strong{font-size:42px;display:block;font-weight:400;line-height:1.4}.metrics span{font-size:11px;color:#7e8fa0}.cover h2{font-size:16px;margin-top:24px}.cover p,.cover li{font-size:12px;line-height:2.1}.source{color:#8a98a5;font-size:10px!important;margin-top:27px}.sub{font-size:11px;color:#76899a;margin:0 0 18px}.overview-grid{display:grid;grid-template-columns:1fr 1fr;gap:17px;align-items:start}.overview-card{border:1px solid #e0e6ed;border-radius:7px;padding:10px}.overview-card svg{width:100%;height:auto;display:block}.flow{border:1px solid #dae3eb;border-radius:8px;padding:12px 13px;margin:0 0 18px;break-inside:avoid}.flow h3{display:flex;align-items:center;gap:10px;font-size:13px;margin:0 0 9px}.flow h3>span{font-size:11px;background:#eaf0f6;color:#58758e;padding:3px 7px;border-radius:4px}.flow h3>small{font-size:9px;font-weight:400;color:#8397a9;margin-left:auto}.triple{display:block;width:100%;height:auto;font-family:inherit}.flow-note{font-size:9px;color:#8193a4;line-height:1.9;margin:7px 0 0}.shared{background:#f0f5fa;padding:17px;border-radius:7px;margin-bottom:23px}.shared p{font-size:11px;line-height:2.2;margin:0}.mini-flow{font-size:11px;line-height:2.3;padding:12px 15px;border-left:3px solid #bdcfe0;background:#fafbfd;margin-bottom:17px}[hidden]{display:none!important}
@media(max-width:800px){.sheet{width:calc(100% - 20px);min-height:0;padding:22px;margin:12px auto}.overview-grid{grid-template-columns:1fr}.toolbar strong{display:none}h1{font-size:25px}.flow{padding:10px}.toolbar input{margin-left:0;max-width:none;width:auto;flex:1}.flow h3{font-size:12px}}
@page{size:A4;margin:12mm}
@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}.sheet{width:100%;min-height:0;height:270mm;padding:0;margin:0;box-shadow:none;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}.overview-grid{grid-template-columns:1fr 1fr}.flow{margin-bottom:19px;padding:12px}.detail-sheet h2{margin-bottom:23px}.cover{padding-top:14mm}}
</style></head><body><div class="toolbar"><strong>画面遷移・操作フロー資料</strong><input id="filter" type="search" aria-label="操作フローを検索" placeholder="操作名で検索"><button onclick="window.print()">印刷・PDF保存</button></div>'''+''.join(parts)+'''<script>document.getElementById('filter').addEventListener('input',e=>{const q=e.target.value.trim();document.querySelectorAll('.flow').forEach(el=>el.hidden=q&&!el.dataset.search.includes(q));document.querySelectorAll('.detail-sheet').forEach(el=>el.hidden=!!q&&![...el.querySelectorAll('.flow')].some(a=>!a.hidden));});</script></body></html>'''
(OUT/'flowcharts.html').write_text(html)
(OUT/'flowcharts.md').write_text('\n'.join(mermaid))
(OUT/'flows.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
with (OUT/'flows.csv').open('w',encoding='utf-8-sig',newline='')as file:
 w=csv.DictWriter(file,fieldnames=records[0].keys(),lineterminator='\n');w.writeheader();w.writerows(records)
(OUT/'README.md').write_text('''# 画面遷移フローチャート資料

- `flowcharts.pdf`：印刷・提出用。
- `flowcharts.html`：ダブルクリックで開ける、通信不要の図。操作名検索と印刷に対応。
- `flowcharts.md`：Mermaid形式の編集用図。全60画面の構成図と70操作フロー。
- `flows.csv`：Excel等で確認・編集できる一覧（UTF-8 BOM）。
- `flows.json`：構造化されたフロー定義。
- `spec.py` / `build.py`：実装を確認して作成した定義と資料生成用スクリプト。

70操作フローは利用者60組・管理者10組で、各組を選択→確認→終了の3段階で示しています。3段階すべてが独立したページという意味ではありません。同画面の操作・結果通知・ダイアログ・外部遷移を区別しています。利用者の60ルートをすべて網羅していることを生成時に検証しています。

再生成：リポジトリのルートで `python docs/flowcharts/build.py`。PDFは生成されたHTMLをブラウザーで印刷して保存します。アプリ本体の画面・動作は変更しません。
''')
print(json.dumps({'flows':len(records),'triplet_nodes':3*len(records),'covered_routes':len(known),'registered_routes':len(routes),'html_bytes':len(html.encode())},ensure_ascii=False))
