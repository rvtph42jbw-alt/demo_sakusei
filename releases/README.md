# ダウンロード（v1.2.0 / 第3版）

[改修版ZIPをダウンロード](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/releases/machi-safety-map-v3.zip)

利用者向けサイトから制作要件の画面数・番号・巡回用ナビを撤去し、地図・検索・分類レイヤー・通報を中心にしたUIへ変更しました。必要な画面数は提出用の `docs/SCREENS.md` と自動テストで管理しています。

Feltのサイトは実行環境のネットワーク制限で取得できず、実画面との直接照合は未完了です。参照元と精密に一致させたとするものではありません。

前の版が動いている場合はコマンド画面でCtrl+Cを押し、新しいZIPを別のフォルダーに展開してください。`demo_sakusei/START-WINDOWS.cmd` をダブルクリックすると起動できます。Node.js 24が必要です。

起動後、ブラウザーで次を開きます。

```text
http://localhost:3000
```

既存のデータがある場合は旧フォルダーの `data/` を保管してください。データを引き継ぐには、サーバーを停止してから新しいフォルダーにコピーします。別の既存データを上書きしないでください。

ZIPにはソース、ビルド済みファイル、起動手順、画面一覧、検証記録、確認用の画面画像を同梱しています。データベース・管理者設定・認証情報・依存パッケージは含みません。

## 卒業制作の画面遷移・操作フロー資料

- [PDFを開く／保存する（22ページ）](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/docs/flowcharts/flowcharts.pdf)
- [資料一式のZIPをダウンロード](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/releases/machi-safety-flowcharts.zip)

利用者60画面の全体構成と、利用者60組・管理者10組の計70操作フローを「選択→確認→終了」で整理しています。同じ画面での操作・通知・ダイアログ・外部サイトの移動も明記しています。PDF、通信不要のHTML、編集用Mermaid、CSV、JSONを同梱しています。アプリのUIには追加していません。

## 参考Excelの形式に合わせた画面遷移図

- [編集用Excelをダウンロード（15シート）](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/releases/machi-safety-transition-reference.xlsx)
- [印刷用PDFを開く（31ページ）](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/releases/machi-safety-transition-reference.pdf)
- [ExcelとPDFのZIPをダウンロード](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/releases/machi-safety-transition-reference.zip)

白い画面枠と黒い矢印、操作名、戻る経路、入力エラーを機能別に配置しています。利用者60画面と70組の選択・確認・終了を収録。資料なのでファイルを直接開いてください。サイトの起動操作は不要です。

## 最新の画面遷移図：追加企画書反映版（設計案）

- [Excelをダウンロード（31シート）](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/releases/machi-safety-transition-proposal.xlsx)
- [PDFを開く（48ページ）](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/releases/machi-safety-transition-proposal.pdf)
- [Excel・PDF一式のZIP](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/releases/machi-safety-transition-proposal.zip)

3利用区分、写真付き報告、提出先振り分け、自治会の要望取りまとめ、点検、優先度、修繕、再点検、避難経路、私有地・所有者連絡、組織・権限等を反映。70組の選択・確認・終了、企画書全20項目の対応表と現行実装との差分、未確定事項を収録しています。追加企画書に基づく設計資料で、未実装の機能を含みます。資料を開く際にPowerShell・npmでの操作は不要です。
