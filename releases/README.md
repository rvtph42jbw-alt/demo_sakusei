# ダウンロード（v1.1.0 / ZIP第2版）

[60画面の導線を見直した修正版ZIPをダウンロード](https://github.com/rvtph42jbw-alt/demo_sakusei/raw/refs/heads/codex/safety-map-60screens/releases/machi-safety-map-60screens-v2.zip)

展開した `demo_sakusei` フォルダーの `START-WINDOWS.cmd` をダブルクリックすると、必要な依存関係を導入してサーバーを起動します。Node.js 24が必要です。起動後に以下をブラウザーで開いてください。

```text
http://localhost:3000/#/sitemap
```

メニューの「画面一覧 60」からも同じ画面が開きます。60枚のカードを押して画面へ移動でき、各画面の「前の画面」「次の画面」で順番にも移動できます。地図・検索・防災・設定などは用途別のレイアウトです。

手動で起動する場合は、`demo_sakusei` フォルダーで次を実行します。

```powershell
npm.cmd ci
npm.cmd start
```

ビルド済みファイル、ソース、画面一覧、検証記録を同梱しています。依存パッケージ、データベース、管理者設定、Git履歴、実際の環境変数は含まれていません。
