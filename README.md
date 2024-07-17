### it sends any found document to telegram chat

1. set telegram data in `.env` file
2. find your VpNum and secret
3. run script 
```
node --env-file=.env ./main.js -n 123 -s 123
```
where `-n` is your *VpNum*
and `-s` your secret number


add it to cron as
```
*/20 * * * * /opt/minust.cron.sh
```



`$ cat /opt/minust.cron.sh`
```shell
#!/usr/bin/env bash

SCRIPT_PATH='/Users/user/projects/asvpweb.minjust'
NODE_PATH='/Users/user/.nvm/versions/node/v20.6.1/bin/node'

cd "${SCRIPT_PATH}"
"${NODE_PATH}" ./main.js -n 68****29 -s 70ВВ8****0Е5
```

