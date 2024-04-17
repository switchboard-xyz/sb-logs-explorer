### History lookup

```
ts-node main.ts \
--account qQcShWi6opRSuFcTfrjUePcjR6XzhPftztddhb5K7G5 \
--startTime $START_UNIX_TIME_IN_SECONDS \
--endTime $END_UNIX_TIME_IN_SECONDS \
--filter "A" \
--url "https://switchboard.rpcpool.com/XXX"
```

# to publish

before running npm publish, run yarn && yarn build

then edit dist/main.js and prepend the following line:

#!/usr/bin/env node
