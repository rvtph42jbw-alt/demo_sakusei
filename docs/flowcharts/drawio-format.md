# draw.io版

追加企画書反映版の31シートを31ページに変換。全体構成・状態・提出先・組織境界と機能別20ページ、一覧7ページを収録します。機能別ページの下部に70組の「選択→確認→終了」を配置しています。

85件の新設計と既存補助32件を区別した設計資料です。アプリに117画面が実装されたことを示しません。

## 再生成

リポジトリのルートで `python docs/flowcharts/build_drawio.py` を実行します。Python標準ライブラリのみを使用し、`proposal-design.json` と `proposal-layout.json` から `outputs/machi-drawio/machi-safety-transition-proposal.drawio` を出力します。

非圧縮mxfile形式。図形、テキスト、表セル、接続線はネイティブmxCellです。画像は使用していません。ページ内のID一意性と接続先を生成時に検証します。

## 検証

mxGraph 4.2.2のXML codecをChromiumで使用し、全31ページの読み込み、2,232個の編集可能な頂点、286本の接続線の端点を確認しました。全体構成を描画し、表示も確認しています。ZIPは整合性検査済みです。アプリ本体の変更はありません。
