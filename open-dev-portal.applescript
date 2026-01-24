on run
    set dir to POSIX path of (path to me)
    set dir to do shell script "dirname " & quoted form of dir
    set filePath to dir & "/dev.html"

    if not (do shell script "test -f " & quoted form of filePath & " && echo ok || echo missing") is "ok" then
        display dialog "dev.html לא נמצא ליד האפליקציה." buttons {"OK"}
        return
    end if

    set port to do shell script "
for p in $(seq 8080 8199); do
  if ! lsof -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then
    echo $p
    exit 0
  fi
done
exit 1
"

    if port is "" then
        display dialog "לא נמצא פורט פנוי בטווח 8080-8199" buttons {"OK"}
        return
    end if

    do shell script "
cd " & quoted form of dir & " &&
python3 -m http.server " & port & " --bind 127.0.0.1 >/dev/null 2>&1 & echo $!
" with administrator privileges false

    do shell script "open http://127.0.0.1:" & port & "/dev.html"
end run
