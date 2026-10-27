# サーバーに公開する

## 用意するもの

- Docker EngineとDocker Compose v2が導入されたLinuxサーバー1台（目安：メモリー1GB以上）
- サーバーの固定IPと、自分で管理するドメインまたはサブドメイン
- DNSのAレコードをサーバーIPへ設定。AAAAレコードも設定する場合はIPv6経路を有効にする
- 外部からTCP 80/443へ接続可能にする。3000番ポートやデータベースは公開しない

サーバー契約・ドメイン取得には外部サービスでの操作が必要です。このリポジトリの作成やクラウド開発環境の公開だけでは、Webサイトは一般公開されません。

## 初回の配置

このプロジェクトの全ファイル（`.env.example`も含む）をサーバーの作業ディレクトリへコピーします。`node_modules/`、`dist/`、`data/`、`.git/`はコピー不要です。以降はそのディレクトリで実行します。

```sh
cp .env.example .env
```

`.env` の `DOMAIN=safety.example.jp` を自分のドメインに変更します。URLの `https://` や末尾の `/` は付けません。

```sh
docker compose config --quiet
docker compose build
# 初回に管理者パスワードを入力（非表示）。ターミナルで実行してください。
docker compose run --rm --no-deps app npm run admin:create
docker compose up -d
docker compose ps
docker compose logs --tail=100 app caddy
```

CaddyがDNSと80/443番ポートを使って証明書を取得し、HTTPSを設定します。DNS反映や証明書取得に失敗している間は公開完了ではありません。

## 公開後の確認

1. 自分の `https://ドメイン/api/health` が `{"ok":true,"adminConfigured":true}` を返すこと
2. トップページが表示され、地図が読み込めること
3. 管理者ログイン→地点登録→別の端末またはシークレットウィンドウで同じ地点が見えること
4. 未ログインでは登録・編集・削除できないこと
5. 管理者が更新した状況を別端末で「最新情報に更新」して取得できること
6. `docker compose restart app` 後にも地点が残ること

実在する危険情報を公開する前に、テスト用地点は削除してください。

## 更新

```sh
# 先にバックアップ（下記）を取得し、ファイルを更新
docker compose build
docker compose up -d
```

`docker compose down` はデータを保持します。`docker compose down -v` はデータと証明書を消すため実行しないでください。

## バックアップ

稼働中でもSQLiteのバックアップAPIで整合性のあるコピーを作成できます。バックアップからセッションは除外します。

```sh
docker compose exec app npm run backup
mkdir -p ./server-backups
chmod 700 ./server-backups
docker compose cp app:/app/backups/. ./server-backups/
```

日付ディレクトリに `safety.sqlite` と `admin.json` が入ります。サーバー故障に備え、定期的に別の安全な場所へコピーしてください。バックアップには地点情報と管理者パスワードのハッシュが含まれます。Web上には配置しないでください。

## 復元

コピー先のバックアップが正しいことを確認してから実行します。以下の `日時` を実際のディレクトリ名に置き換えてください。現在のデータも事前に退避します。

```sh
docker compose stop app
docker compose run --rm --no-deps --user root \
  -v "$PWD/server-backups/日時:/restore:ro" app sh -c \
  'rm -f /app/data/safety.sqlite-wal /app/data/safety.sqlite-shm && cp /restore/safety.sqlite /app/data/safety.sqlite && cp /restore/admin.json /app/data/admin.json && chown node:node /app/data/safety.sqlite /app/data/admin.json && chmod 600 /app/data/safety.sqlite /app/data/admin.json'
docker compose up -d
```

起動後に地図の内容とログインを確認します。古いバックアップに戻すと、その後の登録・更新は失われます。

## 管理者パスワード変更

```sh
docker compose stop app
docker compose run --rm --no-deps app npm run admin:create -- --reset
docker compose up -d
```

すべての既存セッションを無効化します。初回と同じくパスワードは画面に表示されません。

## 環境変数

| 変数          | 用途                                                        |
| ------------- | ----------------------------------------------------------- |
| DOMAIN        | Composeの公開ドメイン。CaddyとPUBLIC_ORIGINに反映           |
| PUBLIC_ORIGIN | Nodeサーバーの公開元URL。本番では `https://ドメイン` が必須 |
| DATA_DIR      | SQLiteと管理者設定の保存先。Dockerでは `/app/data`          |
| BACKUP_DIR    | バックアップ先。Dockerでは `/app/backups`                   |
| PORT          | Nodeサーバーのポート。標準3000                              |
| NODE_ENV      | 本番は `production`。HTTPS用Cookieと設定検証を有効化        |

管理者パスワードを `.env` やコマンド引数に書く必要はありません。
