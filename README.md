# History lookup

```shell
git clone https://github.com/switchboard-xyz/sb-logs-explorer

cd sb-logs-explorer


cd /app && ./init.sh
```

# Examples

## print help
```shell
solana-logs-lookup --help
```

## print all results from 10 minutes ago to stdout
```shell
solana-logs-lookup                                       \
  --account G6dMsEkMdgjX6Lsd1hMtgq79JivHpSsraDr9MD4XNiAt
```

## store all results from 5 minutes ago in a file called logs.txt
```shell
solana-logs-lookup
  --account G6dMsEkMdgjX6Lsd1hMtgq79JivHpSsraDr9MD4XNiAt                \
  --startTime $(echo $(($(date +"%s%N" --date='5 minutes ago')/1000)))  \
  --output logs.txt
```

## specify a filter and a chain URL to avoid being rate limited
```shell
solana-logs-lookup                                       \
  --account G6dMsEkMdgjX6Lsd1hMtgq79JivHpSsraDr9MD4XNiAt \
  --filter 'A5o8'                                        \
  --url https://switchboard.rpcpool.com/XXX
```
