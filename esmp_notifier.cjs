const { exec } = require("child_process");
const notifier = require("node-notifier");
const fs = require("fs");
const path = require("path");

// 로그 파일 경로 설정
const logFilePath = path.join(__dirname, "esmp_output.log");

// Node.js 스크립트 실행
exec(
  "/opt/homebrew/bin/node /Users/aeonapsychelovelace/Documents/ESMP_VSC/ESMP_upload/esmp_js/esmp_js.js",
  (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }

    // 실행 결과를 알림으로 표시
    notifier.notify({
      title: "ESMP Script Output",
      message: stdout, // stdout에 포함된 결과
      sound: true, // 알림 소리
      wait: false, // 알림 창 대기 여부
    });

    // 로그 파일에 결과 저장
    fs.appendFile(
      logFilePath,
      `${new Date().toISOString()}\n${stdout}\n\n`,
      (err) => {
        if (err) {
          console.error(`Failed to write to log file: ${err.message}`);
        } else {
          console.log(`Output logged to: ${logFilePath}`);
        }
      }
    );
  }
);
