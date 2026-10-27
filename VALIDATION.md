# 検証結果

2026-10-27 / Node.js 24 / npm 11

## 確認済み

- `npm test`：3テスト合格。認証、CSRF、入力検証、競合更新拒否、ログアウト、試行回数制限、再起動時の保存、管理者初期化・変更、バックアップ・復元
- `npm run build`：本番用ビルド成功
- `npm audit`：検出0件（検証時点）
- Chromiumで一般閲覧／管理者を別コンテキストで起動：地点登録、別ブラウザーへの共有、編集、対応状況の同期、検索・絞り込み、JSONダウンロード内容、履歴、セッション維持、390px幅、削除、ログアウトを確認。JavaScript例外なし
- Dockerイメージのビルド、本番モードでの非root起動、管理者CLI、静的ファイルとAPI、Secure属性付きCookie、コンテナー再起動後のデータ保持、稼働中バックアップのSQLite整合性を確認
- `docker compose config --quiet` と Caddyの設定検証が成功

テストに使った管理者資格情報・地点・Dockerボリュームはすべて一時生成し、終了時に削除しています。本番用のアカウントや初期地点は含めていません。

## 公開先で確認が必要

- 公開URLとDNS、実際のHTTPS証明書発行：公開先が未契約・未接続のため未実施
- 地図背景：このクラウドのChromiumでは配信先の証明書を検証できず、背景タイル表示は未確認です。検証を無効にしていません。既存の環境CAを使うcurlのTLS通信は成立しましたが、配信元からアクセス拒否を示す `x-blocked` ヘッダーも返りました。公開先では一般利用者のブラウザーから背景の道路・地名が表示されることを確認してください。表示できない場合は、地域・アクセス規模に適した地図配信サービスの選定が必要です
- ブラウザー全体へCAを追加する操作は自動承認レビューに拒否されたため、実行していません。広い信頼設定を変える必要のない方法で本番URLを確認してください
- 管理者パスワードは実際の運営担当者が初期設定する必要があります

## このクラウドでDockerビルドを再実行する場合

この環境ではBuildKit内で `proxy` の名前解決が必要でした。既存のプロキシ設定と公開CA証明書を使い、TLS検証を保持して以下でビルドできました（一般のサーバーでは通常の `docker compose build` を使用）。値や資格情報は出力・保存しないでください。

```sh
cd /workspace/demo_sakusei
safety_proxy_ip=$(getent ahostsv4 proxy | awk 'NR==1 {print $1}')
docker --config /tmp/safety-docker-config build \
  --network=host --add-host "proxy:$safety_proxy_ip" \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY \
  --build-arg http_proxy --build-arg https_proxy --build-arg no_proxy \
  --secret id=npm_ca,src="$NODE_EXTRA_CA_CERTS" \
  -t community-safety:test .
```

BuildKit secretはビルド時の証明書信頼にのみ使用し、完成した実行イメージに証明書やプロキシ設定をコピーしていません。
